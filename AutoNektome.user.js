// ==UserScript==
// @name         PawycMe (AutoNektome Refactored)
// @namespace    http://tampermonkey.net/
// @version      4.16
// @description  Автоматический переход, настройки звука, голосовое управление, улучшенный UI и адаптивность для nekto.me audiochat
// @author       @pawyc (Refactored by Assistant)
// @match        https://nekto.me/audiochat
// @grant        none
// @license      MIT
// @downloadURL  https://update.greasyfork.org/scripts/498724/AutoNektome.user.js
// @updateURL    https://update.greasyfork.org/scripts/498724/AutoNektome.meta.js
// ==/UserScript==

(function () {
    "use strict";

    // ==========================================
    // КОНСТАНТЫ И СЕЛЕКТОРЫ
    // ==========================================
    const CONSTANTS = {
        STORAGE_KEY: "AutoNektomeSettings_v2",
        SOUNDS: {
            start: "https://zvukogram.com/mp3/22/skype-sound-message-received-message-received.mp3",
            end: "https://www.myinstants.com/media/sounds/teleport1_Cw1ot9l.mp3",
            startVol: 0.4,
            endVol: 0.3,
        },
        THEMES: {
            Original: null,
            "GitHub Dark": "https://raw.githubusercontent.com/pawyc/AutoNektomeV2/main/githubdark.css",
        },
        COMMANDS: {
            skip: ["скип", "skip", "скиф", "далее", "некст", "next"],
            stop: ["завершить", "остановить", "закончить", "стоп", "stop"],
            start: ["чат", "старт", "поехали", "начни", "начать", "поиск", "start"],
        }
    };

    // Надежные селекторы с фоллбэками
    const DOM_SELECTORS = {
        searchBtn: [
            "button#searchCompanyBtn",
            "button.callScreen__findBtn",
            "button.go-scan-button",
            ".scan-button",
            "[class*='findBtn']"
        ],
        stopBtn: [
            "button.callScreen__cancelCallBtn",
            "button.stop-talk-button",
            ".active-button-icon"
        ],
        confirmBtn: [
            "button.swal2-confirm",
            ".swal2-confirm"
        ],
        timer: [
            ".callScreen__time",
            ".timer-label",
            "[class*='timer']"
        ],
        audioElement: "audio#audioStream"
    };

    const getEl = (key) => {
        const selectors = DOM_SELECTORS[key];
        if (Array.isArray(selectors)) {
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) return el;
            }
            return null;
        }
        return document.querySelector(selectors);
    };

    // ==========================================
    // НАСТРОЙКИ
    // ==========================================
    const defaultSettings = {
        enableLoopback: false,
        gainValue: 1.0,
        voicePitch: false,
        pitchLevel: 0.5,
        voiceEnhance: false,
        noiseSuppression: true,
        autoVolume: true,
        voiceControl: false,
        conversationCount: 0,
        selectedTheme: "Original",
        particlesEnabled: true, // Новая настройка
        isCollapsed: false
    };

    let settings = { ...defaultSettings, ...JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEY) || "{}") };

    const saveSettings = () => {
        localStorage.setItem(CONSTANTS.STORAGE_KEY, JSON.stringify(settings));
    };

    // ==========================================
    // АУДИО ДВИЖОК (REFACTORED V2 - ALWAYS PROXY)
    // ==========================================
    const AudioEngine = {
        ctx: null,
        workletLoaded: false,
        
        // Постоянные узлы
        sourceNode: null,
        destNode: null,
        
        // Временные узлы эффектов
        nodes: {
            pitch: null,
            comp: null,
            filter: null,
            loopGain: null
        },
        
        previewStream: null,
        activeStream: null, // Ссылка на текущий активный MediaStream (от микрофона)

        async getContext() {
            if (!this.ctx) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (AudioContextClass) {
                    this.ctx = new AudioContextClass({ latencyHint: 'interactive' });
                }
            }
            // Пытаемся разбудить контекст, если он спит
            if (this.ctx && this.ctx.state === "suspended") {
                try { await this.ctx.resume(); } catch(e) {}
            }
            return this.ctx;
        },

        async initWorklet() {
            if (this.workletLoaded) return true;
            const ctx = await this.getContext();
            if (!ctx) return false;

            const workletCode = `
                class PitchShiftProcessor extends AudioWorkletProcessor {
                    constructor() {
                        super();
                        this.size = 2048;
                        this.buffer = new Float32Array(this.size);
                        this.w=0; this.r=0; this.pitch=1.0;
                        this.port.onmessage = e => this.pitch = e.data;
                    }
                    process(I, O) {
                        const i=I[0][0], o=O[0][0]; if(!i||!o) return true;
                        const L=this.buffer.length;
                        for(let j=0; j<i.length; j++) {
                            this.buffer[this.w]=i[j];
                            o[j]=this.buffer[Math.floor(this.r)%L];
                            this.w=(this.w+1)%L; this.r=(this.r+this.pitch)%L;
                        }
                        return true;
                    }
                }
                registerProcessor('pitch-shift-processor', PitchShiftProcessor);
            `;

            try {
                const blob = new Blob([workletCode], { type: "application/javascript" });
                await ctx.audioWorklet.addModule(URL.createObjectURL(blob));
                this.workletLoaded = true;
                return true;
            } catch (e) {
                console.warn("AutoNektome: AudioWorklet failed", e);
                return false;
            }
        },

        // Инициализация входного потока (вызывается из getUserMedia)
        async setInputStream(stream) {
            const ctx = await this.getContext();
            if (!ctx) return stream;

            // 1. Создаем постоянный DestinationNode, если его нет
            if (!this.destNode) {
                this.destNode = ctx.createMediaStreamDestination();
            }

            // 2. Обновляем SourceNode
            if (this.sourceNode) {
                try { this.sourceNode.disconnect(); } catch(e){}
            }
            this.sourceNode = ctx.createMediaStreamSource(stream);
            this.activeStream = stream;

            // 3. Строим цепь обработки
            await this.rebuildChain();

            // 4. Возвращаем поток от DestinationNode
            // Это КЛЮЧЕВОЙ момент: сайт всегда получает этот поток,
            // а мы внутри меняем маршрутизацию (bypass или эффекты).
            return this.destNode.stream;
        },

        async rebuildChain() {
            const ctx = await this.getContext();
            if (!ctx || !this.sourceNode || !this.destNode) return;

            // Отключаем всё
            this.sourceNode.disconnect();
            if (this.nodes.pitch) { try { this.nodes.pitch.disconnect(); } catch(e){} }
            if (this.nodes.comp) { try { this.nodes.comp.disconnect(); } catch(e){} }
            if (this.nodes.filter) { try { this.nodes.filter.disconnect(); } catch(e){} }
            if (this.nodes.loopGain) { try { this.nodes.loopGain.disconnect(); } catch(e){} }

            let currentHead = this.sourceNode;

            // --- ЭФФЕКТЫ ---

            // 1. Студийный звук
            if (settings.voiceEnhance) {
                if (!this.nodes.filter) {
                    this.nodes.filter = ctx.createBiquadFilter();
                    this.nodes.filter.type = "highpass";
                    this.nodes.filter.frequency.value = 85;
                }
                if (!this.nodes.comp) {
                    this.nodes.comp = ctx.createDynamicsCompressor();
                    this.nodes.comp.threshold.value = -24;
                    this.nodes.comp.knee.value = 30;
                    this.nodes.comp.ratio.value = 12;
                    this.nodes.comp.attack.value = 0.003;
                    this.nodes.comp.release.value = 0.25;
                }
                currentHead.connect(this.nodes.filter);
                this.nodes.filter.connect(this.nodes.comp);
                currentHead = this.nodes.comp;
            }

            // 2. Питч (только если загружен)
            if (settings.voicePitch && this.workletLoaded) {
                // Создаем новый узел при каждом изменении, чтобы избежать глюков состояния
                this.nodes.pitch = new AudioWorkletNode(ctx, "pitch-shift-processor");
                this.nodes.pitch.port.postMessage(settings.pitchLevel + 0.5);
                currentHead.connect(this.nodes.pitch);
                currentHead = this.nodes.pitch;
            } else if (settings.voicePitch && !this.workletLoaded) {
                 // Пытаемся загрузить на будущее, но сейчас пропускаем
                 this.initWorklet(); 
            }

            // 3. Вывод на сайт (Destination)
            currentHead.connect(this.destNode);

            // 4. Самопрослушивание
            if (settings.enableLoopback) {
                if (!this.nodes.loopGain) this.nodes.loopGain = ctx.createGain();
                this.nodes.loopGain.gain.value = settings.gainValue;
                currentHead.connect(this.nodes.loopGain);
                this.nodes.loopGain.connect(ctx.destination);
            }
        },

        async startPreview() {
            this.stopPreview();
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: settings.noiseSuppression
                    }
                });
                this.previewStream = stream;
                // Инициализируем ворклет заранее для превью
                await this.initWorklet();
                await this.setInputStream(stream);
            } catch (e) {
                console.error("Preview error:", e);
            }
        },

        stopPreview() {
            if (this.previewStream) {
                this.previewStream.getTracks().forEach(t => t.stop());
                this.previewStream = null;
            }
        },

        updateLiveParams() {
            if (this.nodes.pitch) this.nodes.pitch.port.postMessage(settings.pitchLevel + 0.5);
            if (this.nodes.loopGain) this.nodes.loopGain.gain.value = settings.gainValue;
        }
    };

    // ==========================================
    // ЛОГИКА (Голос, События)
    // ==========================================
    let isAutoModeEnabled = false;
    let recognition = null;
    let isMicMuted = false;
    let isHeadphonesMuted = false;

    // Звуки
    const soundStart = new Audio(CONSTANTS.SOUNDS.start);
    soundStart.volume = CONSTANTS.SOUNDS.startVol;
    const soundEnd = new Audio(CONSTANTS.SOUNDS.end);
    soundEnd.volume = CONSTANTS.SOUNDS.endVol;

    // Перехват микрофона
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
        // Останавливаем превью перед реальным звонком
        AudioEngine.stopPreview();

        if (constraints?.audio) {
            const defaults = {
                autoGainControl: false,
                noiseSuppression: settings.noiseSuppression,
                echoCancellation: false
            };
            if (typeof constraints.audio === 'object') {
                Object.assign(constraints.audio, defaults);
            } else {
                constraints.audio = defaults;
            }
        }

        try {
            const rawStream = await originalGetUserMedia(constraints);
            
            // ГАРАНТИРУЕМ загрузку ворклета, если нужно
            if (settings.voicePitch) await AudioEngine.initWorklet();
            
            // ВСЕГДА проксируем через AudioContext
            // Это решает проблему "меня не слышно при переключении настроек"
            const outputStream = await AudioEngine.setInputStream(rawStream);
            
            // Синхронизация Mute
            if (isMicMuted) {
                rawStream.getAudioTracks().forEach(t => t.enabled = false);
            }

            return outputStream;
        } catch (e) {
            console.error("AutoNektome: getUserMedia error", e);
            throw e;
        }
    };

    // При обновлении настроек просто перестраиваем цепь
    const refreshAudioChain = () => {
        if (AudioEngine.activeStream) AudioEngine.rebuildChain();
    };

    function setMicMuteState(mute) {
        isMicMuted = mute;
        // Мьютим исходный поток
        if (AudioEngine.activeStream) {
            AudioEngine.activeStream.getAudioTracks().forEach(t => t.enabled = !mute);
        }
        UI.updateButtons();
    }

    function setHeadphoneMuteState(mute) {
        isHeadphonesMuted = mute;
        const el = getEl("audioElement");
        if (el) el.muted = mute;
        
        // Если выключили звук, логично выключить и микрофон (опционально, но часто удобно)
        // В данном случае оставим независимое управление, но обновим UI
        UI.updateButtons();
    }

    function clickSearch() {
        const btn = getEl("searchBtn");
        if (btn) btn.click();
    }

    function skip() {
        const stop = getEl("stopBtn");
        if (stop) {
            stop.click();
            // Ждем модалку подтверждения
            setTimeout(() => {
                const confirm = getEl("confirmBtn");
                if (confirm) confirm.click();
            }, 300);
        }
    }

    // Голосовое управление
    function initSpeech() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn("SpeechRecognition not supported");
            settings.voiceControl = false; // Force disable
            return;
        }

        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.lang = "ru-RU";
        
        recognition.onresult = (event) => {
            const last = event.results.length - 1;
            const transcript = event.results[last][0].transcript.toLowerCase().trim();
            
            if (CONSTANTS.COMMANDS.skip.some(w => transcript.includes(w))) {
                skip();
            }
            if (CONSTANTS.COMMANDS.stop.some(w => transcript.includes(w))) {
                isAutoModeEnabled = false;
                UI.updateToggle("autoMode", false);
                skip();
            }
            if (CONSTANTS.COMMANDS.start.some(w => transcript.includes(w))) {
                isAutoModeEnabled = true;
                UI.updateToggle("autoMode", true);
                clickSearch();
            }
        };

        recognition.onend = () => {
            if (settings.voiceControl) {
                try { recognition.start(); } catch(e){}
            }
        };
        
        recognition.onerror = (e) => {
             // Игнорируем ошибки 'no-speech', перезапускаем при других
             if (e.error !== 'no-speech' && settings.voiceControl) {
                 setTimeout(() => {
                     try { recognition.start(); } catch(e){}
                 }, 1000);
             }
        };
    }

    function toggleVoiceControl(enable) {
        if (enable) {
            if (!recognition) initSpeech();
            try { recognition && recognition.start(); } catch(e){}
        } else {
            try { recognition && recognition.stop(); } catch(e){}
        }
    }

    // Наблюдатель за состоянием чата
    let conversationState = false; // false = поиск/меню, true = разговор
    
    const mainObserver = new MutationObserver(() => {
        // 1. Авторежим: если мы не в разговоре и кнопка поиска доступна
        if (isAutoModeEnabled && !conversationState) {
            // Простая задержка, чтобы не спамить
            if (getEl("searchBtn")) {
                setTimeout(clickSearch, 500); 
            }
        }

        // 2. Отслеживание таймера
        const timerEl = getEl("timer");
        const hasTimer = !!timerEl;
        
        if (hasTimer && !conversationState) {
             // Начался разговор
             conversationState = true;
             if (timerEl.textContent === "00:00") {
                 soundStart.play().catch(()=>{});
             }
        } else if (!hasTimer && conversationState) {
            // Разговор закончился
            conversationState = false;
            soundEnd.play().catch(()=>{});
            settings.conversationCount++;
            saveSettings();
        }

        // 3. Автогромкость (инициализация на лету)
        const audio = getEl("audioElement");
        if (audio && !audio.dataset.anInited) {
            audio.dataset.anInited = "true";
            // Хак для принудительного включения звука если политика браузера блокирует
            audio.onplay = () => { if(isHeadphonesMuted) audio.muted = true; };
        }
    });

    // ==========================================
    // UI (ИНТЕРФЕЙС)
    // ==========================================
    const UI = {
        root: null,
        
        create() {
            if (document.getElementById("an-root")) return;

            // Адаптивный CSS
            const css = `
                #an-root {
                    position: fixed; top: 20px; right: 20px; z-index: 10000;
                    width: 280px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    background: rgba(22, 27, 34, 0.95); backdrop-filter: blur(10px);
                    border: 1px solid #30363d; border-radius: 12px;
                    color: #c9d1d9; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                    transition: transform 0.3s ease, height 0.3s ease;
                    font-size: 14px;
                }
                @media (max-width: 600px) {
                    #an-root {
                        top: auto; bottom: 0; right: 0; left: 0;
                        width: 100%; border-radius: 12px 12px 0 0;
                        border-bottom: none;
                        max-height: 80vh;
                    }
                }
                .an-head {
                    padding: 12px 16px; background: rgba(255,255,255,0.03);
                    display: flex; justify-content: space-between; align-items: center;
                    cursor: pointer; user-select: none; border-bottom: 1px solid #30363d;
                }
                .an-title { font-weight: 700; color: #58a6ff; }
                .an-body { padding: 16px; overflow-y: auto; max-height: 70vh; }
                .an-minimized .an-body { display: none; }
                .an-arrow { transition: transform 0.3s; }
                .an-minimized .an-arrow { transform: rotate(-90deg); }
                
                /* Controls */
                .an-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
                .an-btn {
                    background: #21262d; border: 1px solid #30363d; color: #c9d1d9;
                    border-radius: 8px; padding: 10px; cursor: pointer;
                    display: flex; align-items: center; justify-content: center; gap: 8px;
                    transition: all 0.2s; font-size: 16px;
                }
                .an-btn:hover { background: #30363d; }
                .an-btn.active { background: #1f6feb; border-color: #1f6feb; color: white; }
                .an-btn.danger { background: rgba(248,81,73,0.15); border-color: #f85149; color: #f85149; }

                /* Toggles */
                .an-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
                .an-switch { position: relative; width: 36px; height: 20px; }
                .an-switch input { opacity: 0; width: 0; height: 0; }
                .an-slider { position: absolute; cursor: pointer; top:0; left:0; right:0; bottom:0; background-color: #30363d; transition: .4s; border-radius: 20px; }
                .an-slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .4s; border-radius: 50%; }
                input:checked + .an-slider { background-color: #238636; }
                input:checked + .an-slider:before { transform: translateX(16px); }

                /* Sub-settings */
                .an-sub { background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; margin-bottom: 12px; display: none; }
                .an-sub.open { display: block; }
                input[type=range] { width: 100%; margin: 8px 0; accent-color: #58a6ff; }
                select { width: 100%; background: #0d1117; color: white; padding: 8px; border-radius: 6px; border: 1px solid #30363d; }
            `;

            const style = document.createElement("style");
            style.textContent = css;
            document.head.appendChild(style);

            this.root = document.createElement("div");
            this.root.id = "an-root";
            if (settings.isCollapsed) this.root.classList.add("an-minimized");

            const head = document.createElement("div");
            head.className = "an-head";
            head.innerHTML = `<span class="an-title">AutoNektome v4.16</span><span class="an-arrow">▼</span>`;
            head.onclick = () => {
                this.root.classList.toggle("an-minimized");
                settings.isCollapsed = this.root.classList.contains("an-minimized");
                saveSettings();
            };

            const body = document.createElement("div");
            body.className = "an-body";

            // Control Buttons
            const controls = document.createElement("div");
            controls.className = "an-controls";
            
            this.btnMic = document.createElement("button");
            this.btnMic.className = "an-btn";
            this.btnMic.innerHTML = `🎤 <span>Мик</span>`;
            this.btnMic.onclick = () => setMicMuteState(!isMicMuted);

            this.btnHead = document.createElement("button");
            this.btnHead.className = "an-btn";
            this.btnHead.innerHTML = `🎧 <span>Звук</span>`;
            this.btnHead.onclick = () => setHeadphoneMuteState(!isHeadphonesMuted);

            controls.append(this.btnMic, this.btnHead);
            body.append(controls);

            // Toggles
            this.renderToggle(body, "Авторежим", "autoMode", isAutoModeEnabled, (v) => {
                isAutoModeEnabled = v;
                if(v && !conversationState) clickSearch(); // Сразу запускаем
            });
            
            this.renderToggle(body, "Самопрослушивание", "enableLoopback", settings.enableLoopback, (v) => {
                settings.enableLoopback = v;
                saveSettings();
                
                // Logic
                const sub = document.getElementById("sub-loopback");
                if (v) {
                    sub.classList.add("open");
                    if (!globalMicStream) AudioEngine.startPreview(); // Только если нет звонка
                    else AudioEngine.buildChain(globalMicStream);
                } else {
                    sub.classList.remove("open");
                    // Если звонка нет, стопаем превью
                    if (!globalMicStream) AudioEngine.stopPreview();
                    else AudioEngine.buildChain(globalMicStream); // Пересобираем цепь без лупа
                }
            });
            
            // Sub-control for Loopback
            const loopSub = document.createElement("div");
            loopSub.id = "sub-loopback";
            loopSub.className = `an-sub ${settings.enableLoopback ? 'open' : ''}`;
            loopSub.innerHTML = `<div style="font-size:12px;opacity:0.7">Громкость себя</div>`;
            const loopRange = document.createElement("input");
            loopRange.type = "range";
            loopRange.min = 0; loopRange.max = 2; loopRange.step = 0.1;
            loopRange.value = settings.gainValue;
            loopRange.oninput = (e) => {
                settings.gainValue = parseFloat(e.target.value);
                saveSettings();
                AudioEngine.updateLiveParams();
            };
            loopSub.append(loopRange);
            body.append(loopSub);

            this.renderToggle(body, "Студийный звук", "voiceEnhance", settings.voiceEnhance, (v) => {
                settings.voiceEnhance = v;
                saveSettings();
                if(globalMicStream) AudioEngine.buildChain(globalMicStream);
            });

            this.renderToggle(body, "Изменение голоса", "voicePitch", settings.voicePitch, (v) => {
                settings.voicePitch = v;
                saveSettings();
                const sub = document.getElementById("sub-pitch");
                sub.classList.toggle("open", v);
                if(globalMicStream) AudioEngine.buildChain(globalMicStream);
            });

            // Sub-control for Pitch
            const pitchSub = document.createElement("div");
            pitchSub.id = "sub-pitch";
            pitchSub.className = `an-sub ${settings.voicePitch ? 'open' : ''}`;
            pitchSub.innerHTML = `<div style="font-size:12px;opacity:0.7">Тональность (Низкий <-> Высокий)</div>`;
            const pitchRange = document.createElement("input");
            pitchRange.type = "range";
            pitchRange.min = 0; pitchRange.max = 1; pitchRange.step = 0.05;
            pitchRange.value = settings.pitchLevel;
            pitchRange.oninput = (e) => {
                settings.pitchLevel = parseFloat(e.target.value);
                saveSettings();
                AudioEngine.updateLiveParams();
            };
            pitchSub.append(pitchRange);
            body.append(pitchSub);

            this.renderToggle(body, "Шумоподавление", "noiseSuppression", settings.noiseSuppression, (v) => {
                settings.noiseSuppression = v;
                saveSettings();
                // Требует перезапроса микрофона при следующем звонке или обновлении
            });

            this.renderToggle(body, "Голосовое управление", "voiceControl", settings.voiceControl, (v) => {
                settings.voiceControl = v;
                saveSettings();
                toggleVoiceControl(v);
            });

            this.renderToggle(body, "Анимация фона", "particlesEnabled", settings.particlesEnabled, (v) => {
                settings.particlesEnabled = v;
                saveSettings();
                Particles.toggle(v);
            });

            // Theme Selector
            const themeRow = document.createElement("div");
            themeRow.className = "an-row";
            const themeSel = document.createElement("select");
            Object.keys(CONSTANTS.THEMES).forEach(k => {
                const opt = document.createElement("option");
                opt.value = k;
                opt.textContent = k;
                if(k === settings.selectedTheme) opt.selected = true;
                themeSel.append(opt);
            });
            themeSel.onchange = (e) => Themes.apply(e.target.value);
            themeRow.append(themeSel);
            body.append(themeRow);

            this.root.append(head, body);
            document.body.append(this.root);
            
            this.updateButtons();
        },

        renderToggle(container, label, key, initial, onChange) {
            const row = document.createElement("div");
            row.className = "an-row";
            row.innerHTML = `<span>${label}</span>`;
            
            const labelEl = document.createElement("label");
            labelEl.className = "an-switch";
            
            const inp = document.createElement("input");
            inp.type = "checkbox";
            inp.checked = initial;
            inp.id = `an-tog-${key}`;
            inp.onchange = (e) => onChange(e.target.checked);
            
            const sl = document.createElement("span");
            sl.className = "an-slider";
            
            labelEl.append(inp, sl);
            row.append(labelEl);
            container.append(row);
        },

        updateButtons() {
            if (this.btnMic) {
                this.btnMic.className = `an-btn ${isMicMuted ? 'danger' : ''}`;
                this.btnMic.querySelector('span').textContent = isMicMuted ? "Выкл" : "Вкл";
            }
            if (this.btnHead) {
                this.btnHead.className = `an-btn ${isHeadphonesMuted ? 'danger' : ''}`;
                this.btnHead.querySelector('span').textContent = isHeadphonesMuted ? "Выкл" : "Вкл";
            }
        },
        
        updateToggle(key, val) {
            const el = document.getElementById(`an-tog-${key}`);
            if (el) el.checked = val;
        }
    };

    // ==========================================
    // ТЕМЫ
    // ==========================================
    const Themes = {
        styleEl: null,
        apply(name) {
            settings.selectedTheme = name;
            saveSettings();
            
            // Reset
            if (this.styleEl) {
                this.styleEl.remove();
                this.styleEl = null;
            }
            document.body.classList.remove("night_theme");
            document.documentElement.style.background = "";
            document.body.style.background = "";

            if (name === "GitHub Dark" && CONSTANTS.THEMES[name]) {
                document.body.classList.add("night_theme");
                // Pre-set background to avoid flash
                document.documentElement.style.background = "#0d1117";
                document.body.style.background = "#0d1117";
                
                this.styleEl = document.createElement("style");
                fetch(CONSTANTS.THEMES[name])
                    .then(r => r.text())
                    .then(css => { if(this.styleEl) this.styleEl.textContent = css; document.head.append(this.styleEl); })
                    .catch(() => {});
            }
        }
    };

    // ==========================================
    // ЧАСТИЦЫ (Оптимизированные)
    // ==========================================
    const Particles = {
        canvas: null,
        ctx: null,
        rafId: null,
        parts: [],
        enabled: false,
        
        init() {
            this.canvas = document.createElement("canvas");
            this.canvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;pointer-events:none;opacity:0;transition:opacity 1s;";
            document.body.prepend(this.canvas);
            this.ctx = this.canvas.getContext("2d");
            
            window.addEventListener('resize', () => this.resize());
            this.resize();
            
            if (settings.particlesEnabled) this.toggle(true);
        },
        
        resize() {
            if(this.canvas) {
                this.canvas.width = window.innerWidth;
                this.canvas.height = window.innerHeight;
            }
        },
        
        toggle(enable) {
            this.enabled = enable;
            if (this.canvas) this.canvas.style.opacity = enable ? "1" : "0";
            
            if (enable) {
                if (!this.rafId) {
                    this.createParticles();
                    this.loop();
                }
            } else {
                if (this.rafId) {
                    cancelAnimationFrame(this.rafId);
                    this.rafId = null;
                }
            }
        },
        
        createParticles() {
            this.parts = [];
            const count = window.innerWidth < 600 ? 30 : 60; // Меньше частиц на мобилках
            for(let i=0; i<count; i++) {
                this.parts.push({
                    x: Math.random() * this.canvas.width,
                    y: Math.random() * this.canvas.height,
                    vx: (Math.random() - 0.5) * 0.3,
                    vy: (Math.random() - 0.5) * 0.3
                });
            }
        },
        
        loop() {
            if (!this.enabled) return;
            const w = this.canvas.width; 
            const h = this.canvas.height;
            this.ctx.clearRect(0, 0, w, h);
            
            this.ctx.fillStyle = "rgba(88,166,255,0.4)";
            
            for(let i=0; i<this.parts.length; i++) {
                let p = this.parts[i];
                p.x += p.vx; p.y += p.vy;
                if(p.x < 0 || p.x > w) p.vx *= -1;
                if(p.y < 0 || p.y > h) p.vy *= -1;
                
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, 1.5, 0, Math.PI*2);
                this.ctx.fill();
                
                // Draw lines only for close neighbors (optimization)
                for(let j=i+1; j<this.parts.length; j++) {
                    let p2 = this.parts[j];
                    let dx = p.x - p2.x;
                    let dy = p.y - p2.y;
                    let distSq = dx*dx + dy*dy;
                    if(distSq < 15000) { // ~120px
                        this.ctx.strokeStyle = `rgba(88,166,255,${0.15 * (1 - distSq/15000)})`;
                        this.ctx.beginPath();
                        this.ctx.moveTo(p.x, p.y);
                        this.ctx.lineTo(p2.x, p2.y);
                        this.ctx.stroke();
                    }
                }
            }
            this.rafId = requestAnimationFrame(() => this.loop());
        }
    };

    // ==========================================
    // ИНИЦИАЛИЗАЦИЯ
    // ==========================================
    function init() {
        console.log("AutoNektome v4.16 starting...");
        
        // Разблокировка AudioContext при первом клике
        const unlock = () => {
            AudioEngine.getContext();
            document.removeEventListener('click', unlock, true);
        };
        document.addEventListener('click', unlock, true);

        UI.create();
        Themes.apply(settings.selectedTheme);
        Particles.init();
        
        mainObserver.observe(document.body, { childList: true, subtree: true });
        
        if (settings.voiceControl) toggleVoiceControl(true);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();