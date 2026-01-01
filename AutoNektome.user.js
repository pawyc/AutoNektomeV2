// ==UserScript==
// @name         AutoNektome
// @namespace    http://tampermonkey.net/
// @version      4.6
// @description  Автоматический переход с настройками звука, голосовым управлением, улучшенной автогромкостью, изменением голоса и выбором тем для nekto.me audiochat
// @author       @paracosm17
// @match        https://nekto.me/audiochat
// @grant        none
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/498724/AutoNektome.user.js
// @updateURL https://update.greasyfork.org/scripts/498724/AutoNektome.meta.js
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // КОНФИГУРАЦИЯ
    // ==========================================
    const CONFIG = {
        sounds: {
            start: 'https://zvukogram.com/mp3/22/skype-sound-message-received-message-received.mp3',
            end: 'https://www.myinstants.com/media/sounds/teleport1_Cw1ot9l.mp3',
            startVol: 0.4,
            endVol: 0.3
        },
        autoVol: {
            target: 50,
            interval: 200,
            smoothing: 0.8
        },
        themes: {
            'Original': null,
            'GitHub Dark': 'https://raw.githubusercontent.com/pawyc/AutoNektomeV2/main/githubdark.css'
        },
        voiceCommands: {
            skip: ['скип', 'skip', 'скиф', 'далее', 'некст'],
            stop: ['завершить', 'остановить', 'закончить', 'стоп'],
            start: ['чат', 'старт', 'поехали', 'начни', 'начать', 'поиск', 'ищи', 'найди']
        }
    };

    const settings = {
        enableLoopback: false,
        gainValue: 1.5,
        voicePitch: false,
        pitchLevel: 0,
        voiceEnhance: true,      // "Студийный звук" (Компрессор)
        noiseSuppression: true,  // Шумоподавление
        echoCancellation: true,  // Эхоподавление
        autoVolume: true,
        voiceControl: false,
        conversationCount: 0,
        selectedTheme: 'Original',
        isCollapsed: false,
        ...JSON.parse(localStorage.getItem('AutoNektomeSettings') || '{}')
    };

    function saveSettings() {
        localStorage.setItem('AutoNektomeSettings', JSON.stringify(settings));
    }


    // ==========================================
    // AUDIO ENGINE
    // ==========================================
    const AudioEngine = {
        ctx: null,
        workletLoaded: false,
        pitchNode: null,
        gainNode: null,
        compressor: null,
        highPass: null,
        micSource: null,
        
        async getContext() {
            if (!this.ctx) {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.ctx.state === 'suspended') await this.ctx.resume();
            return this.ctx;
        },

        async initWorklet() {
            if (this.workletLoaded) return;
            const ctx = await this.getContext();
            const workletCode = `
                class PitchShiftProcessor extends AudioWorkletProcessor {
                    constructor() { super(); this.buffer = new Float32Array(4096); this.w=0; this.r=0; this.pitch=1.0; this.port.onmessage=e=>this.pitch=e.data; }
                    process(I, O) {
                        const i=I[0][0], o=O[0][0]; if(!i||!o) return true;
                        const L=this.buffer.length;
                        for(let j=0; j<i.length; j++) { this.buffer[this.w]=i[j]; this.w=(this.w+1)%L; }
                        for(let j=0; j<o.length; j++) {
                            const idx = Math.floor(this.r);
                            const frac = this.r - idx;
                            const s1 = this.buffer[idx % L];
                            const s2 = this.buffer[(idx+1) % L];
                            o[j] = s1 + (s2-s1)*frac;
                            this.r = (this.r+this.pitch)%L;
                        }
                        return true;
                    }
                }
                registerProcessor('pitch-shift-processor', PitchShiftProcessor);
            `;
            const blob = new Blob([workletCode], { type: 'application/javascript' });
            await ctx.audioWorklet.addModule(URL.createObjectURL(blob));
            this.workletLoaded = true;
        },

        async processMicrophone(stream) {
            const ctx = await this.getContext();
            
            if (this.micSource) this.micSource.disconnect();
            this.micSource = ctx.createMediaStreamSource(stream);
            let currentNode = this.micSource;

            // 1. Улучшение голоса (Студийный эффект)
            if (settings.voiceEnhance) {
                // High-Pass (убираем гул)
                if (!this.highPass) {
                    this.highPass = ctx.createBiquadFilter();
                    this.highPass.type = 'highpass';
                    this.highPass.frequency.value = 85;
                }
                currentNode.connect(this.highPass);
                currentNode = this.highPass;

                // Compressor (выравниваем громкость)
                if (!this.compressor) {
                    this.compressor = ctx.createDynamicsCompressor();
                    this.compressor.threshold.value = -24;
                    this.compressor.knee.value = 30;
                    this.compressor.ratio.value = 12;
                    this.compressor.attack.value = 0.003;
                    this.compressor.release.value = 0.25;
                }
                currentNode.connect(this.compressor);
                currentNode = this.compressor;
            }

            // 2. Изменение тона (Pitch)
            if (settings.voicePitch && settings.pitchLevel > 0) {
                await this.initWorklet();
                this.pitchNode = new AudioWorkletNode(ctx, 'pitch-shift-processor');
                this.pitchNode.port.postMessage(1.0 - settings.pitchLevel);
                
                // Bass Boost для низкого голоса
                const bassBoost = ctx.createBiquadFilter();
                bassBoost.type = 'lowshelf';
                bassBoost.frequency.value = 200;
                bassBoost.gain.value = 3; 

                currentNode.connect(this.pitchNode);
                this.pitchNode.connect(bassBoost);
                currentNode = bassBoost;
            }

            // 3. Самопрослушивание
            if (settings.enableLoopback) {
                if (this.gainNode) this.gainNode.disconnect();
                this.gainNode = ctx.createGain();
                this.gainNode.gain.value = settings.gainValue;
                currentNode.connect(this.gainNode);
                this.gainNode.connect(ctx.destination);
            } else if (this.gainNode) {
                this.gainNode.disconnect();
            }

            // 4. Вывод
            const destination = ctx.createMediaStreamDestination();
            currentNode.connect(destination);
            return destination.stream;
        },

        updateParams() {
            if (this.gainNode) this.gainNode.gain.value = settings.gainValue;
            if (this.pitchNode) this.pitchNode.port.postMessage(1.0 - settings.pitchLevel);
        }
    };


    // ==========================================
    // AUTO VOLUME (RX)
    // ==========================================
    let autoVolInterval = null;
    function startAutoVolume(stream) {
        if (!settings.autoVolume || !stream) return;
        
        AudioEngine.getContext().then(ctx => {
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            
            const data = new Uint8Array(analyser.frequencyBinCount);
            const audioEl = document.querySelector('audio#audioStream');
            let smoothVol = CONFIG.autoVol.target;

            if (autoVolInterval) clearInterval(autoVolInterval);
            
            autoVolInterval = setInterval(() => {
                if (!settings.autoVolume || !audioEl) return;
                analyser.getByteTimeDomainData(data);
                let sum = 0;
                for(let i=0; i<data.length; i++) {
                    const v = (data[i] - 128) / 128;
                    sum += v*v;
                }
                const rms = Math.sqrt(sum/data.length);
                const currentVol = Math.min(1, rms*10) * 100;
                smoothVol = (smoothVol * CONFIG.autoVol.smoothing) + (currentVol * (1 - CONFIG.autoVol.smoothing));

                if (smoothVol > CONFIG.autoVol.target + 15) {
                    if (audioEl.volume > 0.2) audioEl.volume -= 0.02;
                }
            }, CONFIG.autoVol.interval);
        });
    }


    // ==========================================
    // UI
    // ==========================================
    function createUI() {
        if (document.getElementById('an-ui')) return;

        const css = `
            #an-ui {
                position: fixed; top: 20px; right: 20px; z-index: 999999;
                background: rgba(13, 17, 23, 0.85); /* Более плотный фон */
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                border: 1px solid rgba(88, 166, 255, 0.2);
                border-radius: 12px;
                width: 270px; color: #c9d1d9; font-family: -apple-system, system-ui, sans-serif;
                transition: height 0.3s ease;
                overflow: hidden;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            }
            .an-header {
                padding: 12px 15px;
                background: rgba(255,255,255,0.05);
                display: flex; justify-content: space-between; align-items: center;
                cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05);
            }
            .an-title { font-size: 13px; font-weight: 700; color: #58a6ff; text-transform: uppercase; letter-spacing: 1px; }
            .an-arrow { transition: transform 0.3s; font-size: 12px; color: #8b949e; }
            .an-minimized .an-arrow { transform: rotate(-90deg); }
            
            .an-content {
                padding: 15px;
                max-height: 80vh; overflow-y: auto;
                transition: opacity 0.3s;
            }
            .an-minimized .an-content { display: none; }

            .an-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
            .an-btn-group { display: flex; gap: 10px; justify-content: center; margin-bottom: 15px; }
            
            .an-icon-btn {
                width: 44px; height: 44px; border-radius: 12px;
                border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05);
                color: #c9d1d9; cursor: pointer; font-size: 20px; display: flex; justify-content: center; align-items: center;
                transition: all 0.2s;
            }
            .an-icon-btn:hover { background: rgba(88, 166, 255, 0.2); border-color: #58a6ff; }
            .an-icon-btn.muted { background: rgba(248, 81, 73, 0.2); border-color: #f85149; color: #fff; }
            
            .an-toggle { position: relative; width: 32px; height: 18px; }
            .an-toggle input { opacity: 0; width: 0; height: 0; }
            .an-slider { position: absolute; cursor: pointer; top:0; left:0; right:0; bottom:0; background: #30363d; border-radius: 18px; transition: .3s; }
            .an-slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 2px; bottom: 2px; background: white; border-radius: 50%; transition: .3s; }
            input:checked + .an-slider { background: #238636; }
            input:checked + .an-slider:before { transform: translateX(14px); }
            
            .an-label { font-size: 13px; font-weight: 500; }
            .an-sub { background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; margin-bottom: 10px; border: 1px solid rgba(255,255,255,0.05); }
            .an-range { width: 100%; height: 4px; background: #30363d; border-radius: 2px; appearance: none; outline: none; display: block; }
            .an-range::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; background: #58a6ff; border-radius: 50%; cursor: pointer; border: 2px solid #0d1117; }
            .an-select { width: 100%; background: #161b22; color: #c9d1d9; border: 1px solid #30363d; padding: 6px; border-radius: 6px; outline: none; font-size: 13px; }
        `;

        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);

        const ui = document.createElement('div');
        ui.id = 'an-ui';
        if (settings.isCollapsed) ui.classList.add('an-minimized');

        // Header
        const header = document.createElement('div');
        header.className = 'an-header';
        header.innerHTML = `<span class="an-title">AutoNektome v4.6</span><span class="an-arrow">▼</span>`;
        header.onclick = () => {
            ui.classList.toggle('an-minimized');
            settings.isCollapsed = ui.classList.contains('an-minimized');
            saveSettings();
        };
        ui.append(header);

        // Content
        const content = document.createElement('div');
        content.className = 'an-content';

        // Buttons
        const btnGroup = document.createElement('div');
        btnGroup.className = 'an-btn-group';
        const micBtn = document.createElement('button');
        micBtn.className = 'an-icon-btn'; micBtn.innerHTML = '🎤';
        micBtn.onclick = () => { isMicMuted = !isMicMuted; updateBtns(); toggleMicState(); };
        const headBtn = document.createElement('button');
        headBtn.className = 'an-icon-btn'; headBtn.innerHTML = '🎧';
        headBtn.onclick = () => { isHeadphonesMuted = !isHeadphonesMuted; updateBtns(); toggleHeadState(); };
        function updateBtns() {
            micBtn.className = `an-icon-btn ${isMicMuted ? 'muted' : ''}`;
            headBtn.className = `an-icon-btn ${isHeadphonesMuted ? 'muted' : ''}`;
        }
        btnGroup.append(micBtn, headBtn);
        content.append(btnGroup);

        function addToggle(label, key, cb) {
            const row = document.createElement('div');
            row.className = 'an-row';
            row.innerHTML = `<span class="an-label">${label}</span>`;
            const tog = document.createElement('label');
            tog.className = 'an-toggle';
            const inp = document.createElement('input');
            inp.type = 'checkbox';
            inp.checked = key === 'autoMode' ? isAutoModeEnabled : settings[key];
            inp.onchange = (e) => {
                if(key === 'autoMode') isAutoModeEnabled = e.target.checked;
                else { settings[key] = e.target.checked; saveSettings(); }
                if(cb) cb(e.target.checked);
            };
            tog.append(inp, document.createElement('span'));
            tog.lastChild.className = 'an-slider';
            row.append(tog);
            content.append(row);
            return row;
        }

        addToggle('Авторежим', 'autoMode');
        
        // Loopback
        addToggle('Самопрослушивание', 'enableLoopback', (v) => {
            refreshAudio(); lbSub.style.display = v ? 'block' : 'none';
        });
        const lbSub = document.createElement('div');
        lbSub.className = 'an-sub';
        lbSub.style.display = settings.enableLoopback ? 'block' : 'none';
        lbSub.innerHTML = `<div style="font-size:11px; margin-bottom:5px; color:#8b949e;">Громкость</div>`;
        const lbRange = document.createElement('input');
        lbRange.type = 'range'; lbRange.className = 'an-range';
        lbRange.min=0.1; lbRange.max=3.0; lbRange.step=0.1; lbRange.value=settings.gainValue;
        lbRange.oninput = (e) => { settings.gainValue = parseFloat(e.target.value); saveSettings(); AudioEngine.updateParams(); };
        lbSub.append(lbRange);
        content.append(lbSub);

        // Enhance
        addToggle('Студийный звук', 'voiceEnhance', () => refreshAudio());
        
        // Pitch
        addToggle('Изменение голоса', 'voicePitch', (v) => {
            refreshAudio(); pSub.style.display = v ? 'block' : 'none';
        });
        const pSub = document.createElement('div');
        pSub.className = 'an-sub';
        pSub.style.display = settings.voicePitch ? 'block' : 'none';
        pSub.innerHTML = `<div style="font-size:11px; margin-bottom:5px; color:#8b949e;">Тон (ниже - влево)</div>`;
        const pRange = document.createElement('input');
        pRange.type = 'range'; pRange.className = 'an-range';
        pRange.min=0; pRange.max=0.4; pRange.step=0.01; pRange.value=settings.pitchLevel;
        pRange.oninput = (e) => { settings.pitchLevel = parseFloat(e.target.value); saveSettings(); AudioEngine.updateParams(); };
        pSub.append(pRange);
        content.append(pSub);

        // Others
        addToggle('Шумоподавление', 'noiseSuppression', () => refreshAudio(true)); // Requires stream restart
        addToggle('Эхоподавление', 'echoCancellation', () => refreshAudio(true));
        addToggle('Автогромкость собеседника', 'autoVolume');
        addToggle('Голосовое управление', 'voiceControl', (v) => {
            if(v) { if(!recognition) initSpeech(); recognition.start(); } else if(recognition) recognition.stop();
        });

        // Theme
        const tRow = document.createElement('div');
        tRow.className = 'an-row';
        tRow.style.marginTop = '10px';
        const sel = document.createElement('select');
        sel.className = 'an-select';
        for(let k in CONFIG.themes) {
            let o = document.createElement('option');
            o.value = k; o.textContent = k;
            if(k===settings.selectedTheme) o.selected = true;
            sel.append(o);
        }
        sel.onchange = (e) => applyTheme(e.target.value);
        tRow.append(sel);
        content.append(tRow);

        ui.append(content);
        document.body.append(ui);
    }
    
    function refreshAudio(restartStream = false) {
        if (restartStream) {
            // Чтобы применить шумодав/эхо, нужно перезапросить микрофон у браузера
            // Это сложно сделать бесшовно, лучше уведомить пользователя или ждать следующего звонка.
            // Но мы можем попытаться обновить текущий граф обработки:
        }
        if(globalMicStreamOrig) AudioEngine.processMicrophone(globalMicStreamOrig).then(s => globalStream = s);
    }


    // ==========================================
    // SYSTEM
    // ==========================================
    let isAutoModeEnabled = true;
    let isMicMuted = false;
    let isHeadphonesMuted = false;
    let globalStream = null;
    let globalMicStreamOrig = null;
    let recognition = null;
    let conversationTimer = null;
    let currentThemeStyle = null;
    
    const soundStart = new Audio(CONFIG.sounds.start); soundStart.volume = CONFIG.sounds.startVol;
    const soundEnd = new Audio(CONFIG.sounds.end); soundEnd.volume = CONFIG.sounds.endVol;

    function applyTheme(name) {
        // FORCE DARK BACKGROUND
        document.documentElement.style.background = '#0d1117';
        document.body.style.background = '#0d1117';
        
        if (currentThemeStyle) currentThemeStyle.remove();
        if (name !== 'Original' && CONFIG.themes[name]) {
            const link = document.createElement('style');
            fetch(CONFIG.themes[name]).then(r=>r.text()).then(css=>{
                link.textContent = css;
                document.head.append(link);
                currentThemeStyle = link;
                document.body.classList.add('night_theme');
            }).catch(() => {
                // Fallback if load fails
                document.body.style.background = '#0d1117';
            });
        } else {
             document.body.classList.remove('night_theme');
             // Reset background if Original is actually light? 
             // Nekto is usually light by default. If 'Original', we might want to unset manual bg
             if(name === 'Original') {
                 document.body.style.background = '';
                 document.documentElement.style.background = '';
             }
        }
        settings.selectedTheme = name;
        saveSettings();
    }

    const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
        if (constraints?.audio) {
            constraints.audio = {
                ...constraints.audio,
                autoGainControl: false, // Мы сами контролируем гейн
                noiseSuppression: settings.noiseSuppression,
                echoCancellation: settings.echoCancellation
            };
        }
        try {
            const stream = await origGUM(constraints);
            globalMicStreamOrig = stream;
            const processed = await AudioEngine.processMicrophone(stream);
            globalStream = processed;
            if(isMicMuted) toggleMicState();
            return processed;
        } catch (e) { console.error(e); throw e; }
    };

    function toggleMicState() {
        if(globalStream) globalStream.getAudioTracks().forEach(t => t.enabled = !isMicMuted);
    }
    
    function toggleHeadState() {
        const audio = document.querySelector('audio#audioStream');
        if(audio) audio.muted = isHeadphonesMuted;
        if(isHeadphonesMuted && !isMicMuted) { isMicMuted=true; toggleMicState(); }
    }

    let obsTimer;
    const observer = new MutationObserver(() => {
        if (obsTimer) clearTimeout(obsTimer);
        obsTimer = setTimeout(() => {
            if (isAutoModeEnabled) clickSearch();

            const audio = document.querySelector('audio#audioStream');
            if (audio && !audio.dataset.inited) {
                audio.dataset.inited = 'true';
                if (audio.srcObject) startAutoVolume(audio.srcObject);
            }
            
            const timer = document.querySelector('.callScreen__time, .timer-label');
            if (timer && timer.textContent === '00:00' && !conversationTimer) {
                soundStart.play().catch(()=>{});
                conversationTimer = true;
            } else if (!timer && conversationTimer) {
                soundEnd.play().catch(()=>{});
                conversationTimer = null;
                settings.conversationCount++;
                saveSettings();
            }
        }, 150);
    });

    function clickSearch() {
        // PRECISE SELECTOR FOR VOICE CONTROL AND AUTO MODE
        const btn = document.getElementById('searchCompanyBtn') || 
                    document.querySelector('button.callScreen__findBtn, button.go-scan-button, .scan-button');
        if (btn && btn.offsetParent) btn.click();
    }

    function initSpeech() {
        if (!('webkitSpeechRecognition' in window)) return;
        recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.lang = 'ru-RU';
        recognition.onresult = (e) => {
            const t = e.results[e.results.length-1][0].transcript.toLowerCase();
            if (CONFIG.voiceCommands.skip.some(w=>t.includes(w))) skip();
            if (CONFIG.voiceCommands.stop.some(w=>t.includes(w))) { isAutoModeEnabled=false; skip(); }
            if (CONFIG.voiceCommands.start.some(w=>t.includes(w))) { 
                isAutoModeEnabled=true; 
                clickSearch(); // Explicit click trigger
            }
        };
        recognition.onend = () => { if(settings.voiceControl) recognition.start(); };
    }

    function skip() {
        const btn = document.querySelector('button.callScreen__cancelCallBtn, button.stop-talk-button');
        if(btn) {
            btn.click();
            setTimeout(() => {
                const confirm = document.querySelector('button.swal2-confirm');
                if(confirm) confirm.click();
            }, 300);
        }
    }
    
    function initParticles() {
        const c = document.createElement('canvas');
        c.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;pointer-events:none;opacity:0;transition:opacity 2s;';
        document.body.prepend(c);
        setTimeout(()=>c.style.opacity='1',100);
        const ctx = c.getContext('2d');
        let w, h, parts=[];
        const resize = () => { w=c.width=window.innerWidth; h=c.height=window.innerHeight; };
        window.onresize = resize; resize();
        
        class P {
            constructor() { this.x=Math.random()*w; this.y=Math.random()*h; this.vx=(Math.random()-.5)*.2; this.vy=(Math.random()-.5)*.2; }
            up() { this.x+=this.vx; this.y+=this.vy; if(this.x<0||this.x>w)this.vx*=-1; if(this.y<0||this.y>h)this.vy*=-1; }
            dr() { ctx.fillStyle='rgba(88,166,255,0.4)'; ctx.beginPath(); ctx.arc(this.x,this.y,1.5,0,Math.PI*2); ctx.fill(); }
        }
        for(let i=0;i<70;i++) parts.push(new P());
        
        function loop() {
            ctx.clearRect(0,0,w,h);
            parts.forEach((p,i) => {
                p.up(); p.dr();
                for(let j=i; j<parts.length; j++) {
                    let dx=p.x-parts[j].x, dy=p.y-parts[j].y, d=Math.sqrt(dx*dx+dy*dy);
                    if(d<130) {
                        ctx.strokeStyle=`rgba(88,166,255,${0.15*(1-d/130)})`;
                        ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(parts[j].x,parts[j].y); ctx.stroke();
                    }
                }
            });
            requestAnimationFrame(loop);
        }
        loop();
    }

    function init() {
        applyTheme(settings.selectedTheme);
        createUI();
        initParticles();
        observer.observe(document.body, {childList:true, subtree:true});
        if(settings.voiceControl) { initSpeech(); recognition.start(); }
        
        const origPlay = HTMLAudioElement.prototype.play;
        HTMLAudioElement.prototype.play = function() {
            if(this.src?.includes('connect.mp3')) return Promise.resolve();
            return origPlay.apply(this, arguments);
        };
    }

    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();