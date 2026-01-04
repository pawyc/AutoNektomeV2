// ==UserScript==
// @name         PawycMe (AutoNektome Refactored)
// @namespace    http://tampermonkey.net/
// @version      5.1
// @description  Автоматический переход, настройки звука, голосовое управление, улучшенный UI и адаптивность для nekto.me audiochat
// @author       @pawyc (Refactored)
// @match        https://nekto.me/audiochat
// @grant        none
// @license      MIT
// @downloadURL  https://update.greasyfork.org/scripts/498724/AutoNektome.user.js
// @updateURL    https://update.greasyfork.org/scripts/498724/AutoNektome.meta.js
// ==/UserScript==

(function () {
    "use strict";

    const VERSION = "5.1";
    const STORAGE_KEY = "AutoNektomeSettings_v3";

    // SVG Иконки (минималистичные)
    const ICONS = {
        mic: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
        micOff: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
        headphones: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`,
        headphonesOff: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 12v6M3 18v-6a9 9 0 0 1 14.5-7.1"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`,
        skip: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>`,
        search: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
        chat: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
        clock: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
        chevron: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`
    };

    const SOUNDS = {
        start: "https://zvukogram.com/mp3/22/skype-sound-message-received-message-received.mp3",
        end: "https://www.myinstants.com/media/sounds/teleport1_Cw1ot9l.mp3",
        startVol: 0.4, endVol: 0.3
    };

    const THEMES = {
        Original: null,
        "GitHub Dark": "https://raw.githubusercontent.com/pawyc/AutoNektomeV2/main/githubdark.css"
    };

    const VOICE_COMMANDS = {
        skip: ["скип", "skip", "скиф", "далее", "некст", "next"],
        stop: ["завершить", "остановить", "закончить", "стоп", "stop"],
        start: ["чат", "старт", "поехали", "начни", "начать", "поиск", "start"]
    };

    const SELECTORS = {
        searchBtn: ["button#searchCompanyBtn", "button.callScreen__findBtn", "button.go-scan-button", ".scan-button", "[class*='findBtn']"],
        stopBtn: ["button.callScreen__cancelCallBtn", "button.stop-talk-button", ".active-button-icon"],
        confirmBtn: ["button.swal2-confirm", ".swal2-confirm"],
        timer: [".callScreen__time", ".timer-label", "[class*='timer']"],
        audioElement: "audio#audioStream"
    };

    // ==========================================
    // УТИЛИТЫ
    // ==========================================
    const Utils = {
        getEl(key) {
            const selectors = SELECTORS[key];
            if (Array.isArray(selectors)) {
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el) return el;
                }
                return null;
            }
            return document.querySelector(selectors);
        },
        debounce(fn, ms) {
            let timer;
            return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
        },
        formatTime(seconds) {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = seconds % 60;
            if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        },
        log(msg, type = 'info') {
            const styles = { info: 'color:#58a6ff', warn: 'color:#d29922', error: 'color:#f85149', success: 'color:#238636' };
            console.log(`%c[AutoNektome v${VERSION}] ${msg}`, styles[type] || styles.info);
        }
    };

    // ==========================================
    // НАСТРОЙКИ
    // ==========================================
    const defaultSettings = {
        enableLoopback: false, gainValue: 1.0, voicePitch: false, pitchLevel: 0.5,
        voiceEnhance: false, noiseSuppression: true, voiceControl: false,
        conversationCount: 0, totalTalkTime: 0, selectedTheme: "Original",
        particlesEnabled: true, isCollapsed: false, soundsEnabled: true, hotkeysEnabled: true
    };

    let settings = { ...defaultSettings };

    const Settings = {
        load() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) settings = { ...defaultSettings, ...JSON.parse(saved) };
            } catch (e) { Utils.log('Ошибка загрузки настроек', 'error'); }
        },
        save() {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
            catch (e) { Utils.log('Ошибка сохранения', 'error'); }
        },
        reset() { settings = { ...defaultSettings }; this.save(); Toast.show('Настройки сброшены', 'info'); }
    };

    // ==========================================
    // TOAST УВЕДОМЛЕНИЯ
    // ==========================================
    const Toast = {
        container: null,
        init() {
            this.container = document.createElement('div');
            this.container.id = 'an-toast-container';
            this.container.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:10001;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
            document.body.appendChild(this.container);
        },
        show(message, type = 'info', duration = 2500) {
            if (!this.container) this.init();
            const colors = { info: '#1f6feb', success: '#238636', warning: '#d29922', error: '#f85149' };
            const toast = document.createElement('div');
            toast.style.cssText = `background:${colors[type] || colors.info};color:white;padding:10px 18px;border-radius:8px;font-size:13px;font-family:-apple-system,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);animation:anToastIn 0.3s ease;`;
            toast.textContent = message;
            this.container.appendChild(toast);
            setTimeout(() => { toast.style.animation = 'anToastOut 0.3s ease forwards'; setTimeout(() => toast.remove(), 300); }, duration);
        }
    };

    // ==========================================
    // АУДИО ДВИЖОК (ИСПРАВЛЕННЫЙ v2)
    // ==========================================
    const AudioEngine = {
        ctx: null,
        workletLoaded: false,
        sourceNode: null,
        destNode: null,
        gainNode: null,
        nodes: { pitch: null, comp: null, filter: null, loopGain: null },
        previewStream: null,
        activeStream: null,
        rawStream: null,
        isProcessing: false,
        callId: 0, // Уникальный ID звонка для отслеживания

        async getContext() {
            if (!this.ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (AC) this.ctx = new AC({ latencyHint: 'interactive' });
            }
            if (this.ctx?.state === "suspended") {
                try { await this.ctx.resume(); } catch (e) { }
            }
            return this.ctx;
        },

        async initWorklet() {
            if (this.workletLoaded) return true;
            const ctx = await this.getContext();
            if (!ctx) return false;

            const workletCode = `
                class PitchShiftProcessor extends AudioWorkletProcessor {
                    constructor() { super(); this.size=2048; this.buffer=new Float32Array(this.size); this.w=0; this.r=0; this.pitch=1.0; this.port.onmessage=e=>{this.pitch=Math.max(0.5,Math.min(2.0,e.data));}; }
                    process(I,O) { const i=I[0]?.[0],o=O[0]?.[0]; if(!i||!o)return true; const L=this.buffer.length; for(let j=0;j<i.length;j++){this.buffer[this.w]=i[j];o[j]=this.buffer[Math.floor(this.r)%L];this.w=(this.w+1)%L;this.r=(this.r+this.pitch)%L;} return true; }
                }
                registerProcessor('pitch-shift-processor', PitchShiftProcessor);
            `;
            try {
                const blob = new Blob([workletCode], { type: "application/javascript" });
                const url = URL.createObjectURL(blob);
                await ctx.audioWorklet.addModule(url);
                URL.revokeObjectURL(url);
                this.workletLoaded = true;
                return true;
            } catch (e) { Utils.log('AudioWorklet error: ' + e.message, 'warn'); return false; }
        },

        // Полная очистка перед новым звонком
        cleanup() {
            const safeDisconnect = (node) => { if (node) try { node.disconnect(); } catch (e) { } };

            safeDisconnect(this.sourceNode);
            safeDisconnect(this.gainNode);
            safeDisconnect(this.destNode);
            Object.values(this.nodes).forEach(safeDisconnect);

            // Обнуляем узлы (кроме эффектов, их можно переиспользовать)
            this.sourceNode = null;
            this.destNode = null;
            this.gainNode = null;
            this.nodes.pitch = null; // Pitch нужно пересоздавать
            this.nodes.loopGain = null;

            this.rawStream = null;
            this.activeStream = null;

            Utils.log('Audio cleanup done', 'info');
        },

        async setInputStream(stream) {
            const ctx = await this.getContext();
            if (!ctx) return stream;

            // Увеличиваем ID звонка
            this.callId++;
            const currentCallId = this.callId;

            Utils.log(`New call #${currentCallId}, setting up audio...`, 'info');

            // Полная очистка старых узлов
            this.cleanup();

            this.rawStream = stream;
            this.activeStream = stream;

            // ВСЕГДА создаём новый destination для каждого звонка
            this.destNode = ctx.createMediaStreamDestination();

            // Новый gain node
            this.gainNode = ctx.createGain();
            this.gainNode.gain.value = 1.0;

            // Новый source
            this.sourceNode = ctx.createMediaStreamSource(stream);

            await this.rebuildChain(currentCallId);

            Utils.log(`Call #${currentCallId} audio ready, output tracks: ${this.destNode.stream.getAudioTracks().length}`, 'success');

            return this.destNode.stream;
        },

        async rebuildChain(forCallId = null) {
            // Если указан callId, проверяем актуальность
            if (forCallId !== null && forCallId !== this.callId) {
                Utils.log(`Skipping rebuild for old call #${forCallId}`, 'warn');
                return;
            }

            if (this.isProcessing) return;
            this.isProcessing = true;

            const ctx = await this.getContext();
            if (!ctx || !this.sourceNode || !this.destNode) {
                this.isProcessing = false;
                return;
            }

            // Безопасное отключение
            const safeDisconnect = (node) => { if (node) try { node.disconnect(); } catch (e) { } };

            safeDisconnect(this.sourceNode);
            safeDisconnect(this.gainNode);
            if (this.nodes.pitch) safeDisconnect(this.nodes.pitch);
            if (this.nodes.filter) safeDisconnect(this.nodes.filter);
            if (this.nodes.comp) safeDisconnect(this.nodes.comp);
            if (this.nodes.loopGain) safeDisconnect(this.nodes.loopGain);

            let currentNode = this.sourceNode;

            // Студийный звук
            if (settings.voiceEnhance) {
                if (!this.nodes.filter) {
                    this.nodes.filter = ctx.createBiquadFilter();
                    this.nodes.filter.type = "highpass";
                    this.nodes.filter.frequency.value = 80;
                }
                if (!this.nodes.comp) {
                    this.nodes.comp = ctx.createDynamicsCompressor();
                    this.nodes.comp.threshold.value = -24;
                    this.nodes.comp.knee.value = 30;
                    this.nodes.comp.ratio.value = 12;
                    this.nodes.comp.attack.value = 0.003;
                    this.nodes.comp.release.value = 0.25;
                }
                currentNode.connect(this.nodes.filter);
                this.nodes.filter.connect(this.nodes.comp);
                currentNode = this.nodes.comp;
            }

            // Изменение голоса
            if (settings.voicePitch && this.workletLoaded) {
                try {
                    this.nodes.pitch = new AudioWorkletNode(ctx, "pitch-shift-processor");
                    this.nodes.pitch.port.postMessage(settings.pitchLevel + 0.5);
                    currentNode.connect(this.nodes.pitch);
                    currentNode = this.nodes.pitch;
                } catch (e) { Utils.log('Pitch error: ' + e.message, 'error'); }
            }

            // Финальное подключение к destination
            currentNode.connect(this.gainNode);
            this.gainNode.connect(this.destNode);

            // Самопрослушивание
            if (settings.enableLoopback) {
                if (!this.nodes.loopGain) this.nodes.loopGain = ctx.createGain();
                this.nodes.loopGain.gain.value = settings.gainValue;
                currentNode.connect(this.nodes.loopGain);
                this.nodes.loopGain.connect(ctx.destination);
            }

            this.isProcessing = false;
            Utils.log(`Audio chain rebuilt for call #${this.callId}`, 'success');
        },

        async startPreview() {
            this.stopPreview();
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: settings.noiseSuppression } });
                this.previewStream = stream;
                await this.initWorklet();
                await this.setInputStream(stream);
            } catch (e) { Toast.show('Ошибка микрофона', 'error'); }
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
    // СОСТОЯНИЕ И ТАЙМЕР
    // ==========================================
    const State = {
        isAutoMode: false,
        isMicMuted: false,
        isHeadphonesMuted: false,
        isInConversation: false,
        isSearching: false,
        conversationStartTime: null,
        currentSessionTime: 0,
        timerInterval: null,
        recognition: null,

        setAutoMode(enabled) {
            this.isAutoMode = enabled;
            UI.updateToggle('autoMode', enabled);
            Toast.show(enabled ? 'Авторежим вкл' : 'Авторежим выкл', enabled ? 'success' : 'info');
            if (enabled && !this.isInConversation) Actions.clickSearch();
        },

        setMicMuted(muted) {
            this.isMicMuted = muted;
            // Мьютим оригинальный поток
            if (AudioEngine.rawStream) {
                AudioEngine.rawStream.getAudioTracks().forEach(t => t.enabled = !muted);
            }
            if (AudioEngine.activeStream) {
                AudioEngine.activeStream.getAudioTracks().forEach(t => t.enabled = !muted);
            }
            UI.updateButtons();
        },

        setHeadphonesMuted(muted) {
            this.isHeadphonesMuted = muted;
            const el = Utils.getEl("audioElement");
            if (el) el.muted = muted;
            UI.updateButtons();
        },

        startConversation() {
            if (this.isInConversation) return;
            this.isInConversation = true;
            this.isSearching = false;
            this.conversationStartTime = Date.now();
            this.currentSessionTime = 0;

            // Запуск таймера реального времени
            this.timerInterval = setInterval(() => {
                this.currentSessionTime = Math.floor((Date.now() - this.conversationStartTime) / 1000);
                UI.updateLiveTimer();
            }, 1000);

            UI.updateStatus('talking');
            UI.updateLiveTimer();
            if (settings.soundsEnabled) Sounds.playStart();
            Toast.show('Собеседник найден!', 'success');
        },

        endConversation() {
            if (!this.isInConversation) return;

            // Остановка таймера
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }

            if (this.conversationStartTime) {
                const duration = Math.floor((Date.now() - this.conversationStartTime) / 1000);
                settings.totalTalkTime += duration;
                settings.conversationCount++;
                Settings.save();
                Toast.show(`Разговор: ${Utils.formatTime(duration)}`, 'info');
            }

            this.isInConversation = false;
            this.conversationStartTime = null;
            this.currentSessionTime = 0;
            UI.updateStatus('idle');
            UI.updateStats();
            if (settings.soundsEnabled) Sounds.playEnd();
        }
    };

    // ==========================================
    // ДЕЙСТВИЯ
    // ==========================================
    const Actions = {
        clickSearch() {
            const btn = Utils.getEl("searchBtn");
            if (btn) { btn.click(); State.isSearching = true; UI.updateStatus('searching'); }
        },
        skip() {
            const stop = Utils.getEl("stopBtn");
            if (stop) { stop.click(); setTimeout(() => { const c = Utils.getEl("confirmBtn"); if (c) c.click(); }, 300); }
        }
    };

    // ==========================================
    // ЗВУКИ
    // ==========================================
    const Sounds = {
        start: null, end: null,
        init() {
            this.start = new Audio(SOUNDS.start); this.start.volume = SOUNDS.startVol;
            this.end = new Audio(SOUNDS.end); this.end.volume = SOUNDS.endVol;
        },
        playStart() { this.start?.play().catch(() => { }); },
        playEnd() { this.end?.play().catch(() => { }); }
    };

    // ==========================================
    // ГОЛОСОВОЕ УПРАВЛЕНИЕ
    // ==========================================
    const VoiceControl = {
        init() {
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SR) { settings.voiceControl = false; return false; }
            State.recognition = new SR();
            State.recognition.continuous = true;
            State.recognition.lang = "ru-RU";
            State.recognition.onresult = (e) => {
                const t = e.results[e.results.length - 1][0].transcript.toLowerCase().trim();
                if (VOICE_COMMANDS.skip.some(w => t.includes(w))) Actions.skip();
                if (VOICE_COMMANDS.stop.some(w => t.includes(w))) { State.setAutoMode(false); Actions.skip(); }
                if (VOICE_COMMANDS.start.some(w => t.includes(w))) State.setAutoMode(true);
            };
            State.recognition.onend = () => { if (settings.voiceControl) setTimeout(() => { try { State.recognition?.start(); } catch (e) { } }, 100); };
            State.recognition.onerror = () => { };
            return true;
        },
        toggle(enable) {
            if (enable) { if (!State.recognition && !this.init()) return; try { State.recognition.start(); } catch (e) { } }
            else { try { State.recognition?.stop(); } catch (e) { } }
        }
    };

    // ==========================================
    // ГОРЯЧИЕ КЛАВИШИ
    // ==========================================
    const Hotkeys = {
        init() {
            document.addEventListener('keydown', (e) => {
                if (!settings.hotkeysEnabled || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                switch (e.code) {
                    case 'KeyM': State.setMicMuted(!State.isMicMuted); break;
                    case 'KeyH': State.setHeadphonesMuted(!State.isHeadphonesMuted); break;
                    case 'KeyS': Actions.skip(); break;
                    case 'KeyA': State.setAutoMode(!State.isAutoMode); break;
                    case 'Space': if (!State.isInConversation && !State.isSearching) { e.preventDefault(); Actions.clickSearch(); } break;
                }
            });
        }
    };

    // ==========================================
    // НАБЛЮДАТЕЛЬ DOM
    // ==========================================
    const Observer = {
        observer: null, lastTimerState: false,
        init() {
            const check = Utils.debounce(() => {
                if (State.isAutoMode && !State.isInConversation && !State.isSearching) {
                    const btn = Utils.getEl("searchBtn");
                    if (btn && btn.offsetParent !== null) setTimeout(() => Actions.clickSearch(), 500);
                }
                const timerEl = Utils.getEl("timer");
                const hasTimer = !!timerEl && timerEl.textContent && timerEl.textContent !== "";
                if (hasTimer && !this.lastTimerState) State.startConversation();
                else if (!hasTimer && this.lastTimerState) State.endConversation();
                this.lastTimerState = hasTimer;

                const audio = Utils.getEl("audioElement");
                if (audio && !audio.dataset.anInited) {
                    audio.dataset.anInited = "true";
                    audio.onplay = () => { if (State.isHeadphonesMuted) audio.muted = true; };
                }
            }, 100);
            this.observer = new MutationObserver(check);
            this.observer.observe(document.body, { childList: true, subtree: true });
        }
    };

    // ==========================================
    // ПЕРЕХВАТ getUserMedia
    // ==========================================
    const MediaHook = {
        original: null,
        init() {
            this.original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
            navigator.mediaDevices.getUserMedia = async (constraints) => {
                AudioEngine.stopPreview();
                if (constraints?.audio) {
                    const defaults = { autoGainControl: false, noiseSuppression: settings.noiseSuppression, echoCancellation: false };
                    constraints.audio = typeof constraints.audio === 'object' ? { ...constraints.audio, ...defaults } : defaults;
                }
                try {
                    const rawStream = await this.original(constraints);
                    if (settings.voicePitch) await AudioEngine.initWorklet();
                    const outputStream = await AudioEngine.setInputStream(rawStream);
                    if (State.isMicMuted) rawStream.getAudioTracks().forEach(t => t.enabled = false);
                    return outputStream;
                } catch (e) { Utils.log('getUserMedia error: ' + e.message, 'error'); throw e; }
            };
        }
    };

    // ==========================================
    // ТЕМЫ
    // ==========================================
    const Themes = {
        styleEl: null,
        apply(name) {
            settings.selectedTheme = name; Settings.save();
            if (this.styleEl) { this.styleEl.remove(); this.styleEl = null; }
            document.body.classList.remove("night_theme");
            document.documentElement.style.background = "";
            document.body.style.background = "";
            if (name === "GitHub Dark" && THEMES[name]) {
                document.body.classList.add("night_theme");
                document.documentElement.style.background = "#0d1117";
                document.body.style.background = "#0d1117";
                this.styleEl = document.createElement("style");
                fetch(THEMES[name]).then(r => r.text()).then(css => { if (this.styleEl) { this.styleEl.textContent = css; document.head.append(this.styleEl); } }).catch(() => { });
            }
        }
    };

    // ==========================================
    // ЧАСТИЦЫ
    // ==========================================
    const Particles = {
        canvas: null, ctx: null, rafId: null, parts: [], enabled: false,
        init() {
            this.canvas = document.createElement("canvas");
            this.canvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;pointer-events:none;opacity:0;transition:opacity 1s;";
            document.body.prepend(this.canvas);
            this.ctx = this.canvas.getContext("2d");
            window.addEventListener('resize', () => this.resize());
            this.resize();
            if (settings.particlesEnabled) this.toggle(true);
        },
        resize() { if (this.canvas) { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; if (this.enabled) this.createParticles(); } },
        toggle(enable) {
            this.enabled = enable;
            if (this.canvas) this.canvas.style.opacity = enable ? "1" : "0";
            if (enable) { if (!this.rafId) { this.createParticles(); this.loop(); } }
            else { if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; } }
        },
        createParticles() {
            this.parts = [];
            const count = window.innerWidth < 600 ? 20 : 40;
            for (let i = 0; i < count; i++) this.parts.push({ x: Math.random() * this.canvas.width, y: Math.random() * this.canvas.height, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3 });
        },
        loop() {
            if (!this.enabled) return;
            const w = this.canvas.width, h = this.canvas.height;
            this.ctx.clearRect(0, 0, w, h);
            this.ctx.fillStyle = "rgba(88,166,255,0.4)";
            for (let i = 0; i < this.parts.length; i++) {
                const p = this.parts[i];
                p.x += p.vx; p.y += p.vy;
                if (p.x < 0 || p.x > w) p.vx *= -1;
                if (p.y < 0 || p.y > h) p.vy *= -1;
                this.ctx.beginPath(); this.ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2); this.ctx.fill();
                for (let j = i + 1; j < this.parts.length; j++) {
                    const p2 = this.parts[j], dx = p.x - p2.x, dy = p.y - p2.y, d = dx * dx + dy * dy;
                    if (d < 10000) { this.ctx.strokeStyle = `rgba(88,166,255,${0.12 * (1 - d / 10000)})`; this.ctx.beginPath(); this.ctx.moveTo(p.x, p.y); this.ctx.lineTo(p2.x, p2.y); this.ctx.stroke(); }
                }
            }
            this.rafId = requestAnimationFrame(() => this.loop());
        }
    };

    // ==========================================
    // UI
    // ==========================================
    const UI = {
        root: null, btnMic: null, btnHead: null, statusEl: null, statsEl: null, liveTimerEl: null,

        create() {
            if (document.getElementById("an-root")) return;
            this.injectStyles();

            this.root = document.createElement("div");
            this.root.id = "an-root";
            if (settings.isCollapsed) this.root.classList.add("an-minimized");

            // Header
            const head = document.createElement("div");
            head.className = "an-head";
            head.innerHTML = `
                <div class="an-head-left">
                    <span class="an-title">AutoNektome</span>
                    <span class="an-version">v${VERSION}</span>
                </div>
                <div class="an-head-right">
                    <span class="an-status" id="an-status"></span>
                    <span class="an-arrow">${ICONS.chevron}</span>
                </div>
            `;
            head.onclick = (e) => {
                if (e.target.closest('.an-status')) return;
                this.root.classList.toggle("an-minimized");
                settings.isCollapsed = this.root.classList.contains("an-minimized");
                Settings.save();
            };
            this.statusEl = head.querySelector('#an-status');

            const body = document.createElement("div");
            body.className = "an-body";

            // Статистика с live таймером
            this.statsEl = document.createElement("div");
            this.statsEl.className = "an-stats";
            body.appendChild(this.statsEl);
            this.updateStats();

            // Кнопки
            const controls = document.createElement("div");
            controls.className = "an-controls";
            this.btnMic = this.createButton(ICONS.mic, 'Мик', () => State.setMicMuted(!State.isMicMuted), 'mic');
            this.btnHead = this.createButton(ICONS.headphones, 'Звук', () => State.setHeadphonesMuted(!State.isHeadphonesMuted), 'head');
            const btnSkip = this.createButton(ICONS.skip, 'Скип', () => Actions.skip());
            const btnSearch = this.createButton(ICONS.search, 'Поиск', () => Actions.clickSearch());
            controls.append(this.btnMic, this.btnHead, btnSkip, btnSearch);
            body.appendChild(controls);

            body.appendChild(this.createDivider('Основное'));
            this.renderToggle(body, "Авторежим", "autoMode", State.isAutoMode, (v) => State.setAutoMode(v));
            this.renderToggle(body, "Звуки", "soundsEnabled", settings.soundsEnabled, (v) => { settings.soundsEnabled = v; Settings.save(); });
            this.renderToggle(body, "Горячие клавиши", "hotkeysEnabled", settings.hotkeysEnabled, (v) => { settings.hotkeysEnabled = v; Settings.save(); });

            body.appendChild(this.createDivider('Аудио'));
            this.renderToggle(body, "Самопрослушивание", "enableLoopback", settings.enableLoopback, (v) => {
                settings.enableLoopback = v; Settings.save();
                document.getElementById("sub-loopback")?.classList.toggle("open", v);
                if (v && !AudioEngine.activeStream) AudioEngine.startPreview();
                else { AudioEngine.rebuildChain(); if (!v && !AudioEngine.activeStream) AudioEngine.stopPreview(); }
            });
            const loopSub = this.createSubPanel("sub-loopback", settings.enableLoopback, "Громкость");
            loopSub.appendChild(this.createRange(0, 2, 0.1, settings.gainValue, (v) => { settings.gainValue = v; Settings.save(); AudioEngine.updateLiveParams(); }));
            body.appendChild(loopSub);

            this.renderToggle(body, "Студийный звук", "voiceEnhance", settings.voiceEnhance, (v) => { settings.voiceEnhance = v; Settings.save(); AudioEngine.rebuildChain(); });
            this.renderToggle(body, "Изменение голоса", "voicePitch", settings.voicePitch, (v) => {
                settings.voicePitch = v; Settings.save();
                document.getElementById("sub-pitch")?.classList.toggle("open", v);
                if (v) AudioEngine.initWorklet();
                AudioEngine.rebuildChain();
            });
            const pitchSub = this.createSubPanel("sub-pitch", settings.voicePitch, "Тональность");
            pitchSub.appendChild(this.createRange(0, 1, 0.05, settings.pitchLevel, (v) => { settings.pitchLevel = v; Settings.save(); AudioEngine.updateLiveParams(); }));
            body.appendChild(pitchSub);

            this.renderToggle(body, "Шумоподавление", "noiseSuppression", settings.noiseSuppression, (v) => { settings.noiseSuppression = v; Settings.save(); });
            this.renderToggle(body, "Голос. управление", "voiceControl", settings.voiceControl, (v) => { settings.voiceControl = v; Settings.save(); VoiceControl.toggle(v); });

            body.appendChild(this.createDivider('Вид'));
            this.renderToggle(body, "Анимация фона", "particlesEnabled", settings.particlesEnabled, (v) => { settings.particlesEnabled = v; Settings.save(); Particles.toggle(v); });

            const themeRow = document.createElement("div");
            themeRow.className = "an-row";
            themeRow.innerHTML = '<span>Тема</span>';
            const themeSel = document.createElement("select");
            themeSel.className = "an-select";
            Object.keys(THEMES).forEach(k => { const o = document.createElement("option"); o.value = k; o.textContent = k; if (k === settings.selectedTheme) o.selected = true; themeSel.appendChild(o); });
            themeSel.onchange = (e) => Themes.apply(e.target.value);
            themeRow.appendChild(themeSel);
            body.appendChild(themeRow);

            const resetBtn = document.createElement("button");
            resetBtn.className = "an-reset-btn";
            resetBtn.textContent = "Сбросить";
            resetBtn.onclick = () => { if (confirm('Сбросить настройки?')) { Settings.reset(); location.reload(); } };
            body.appendChild(resetBtn);

            this.root.append(head, body);
            document.body.appendChild(this.root);
            this.updateButtons();
            this.updateStatus('idle');
        },

        injectStyles() {
            const css = `
                @keyframes anToastIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
                @keyframes anToastOut{from{opacity:1}to{opacity:0;transform:translateY(-10px)}}
                @keyframes anPulse{0%,100%{opacity:1}50%{opacity:0.4}}
                @keyframes anBlink{0%,100%{opacity:1}50%{opacity:0.3}}

                #an-root{position:fixed;top:20px;right:20px;z-index:10000;width:280px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:rgba(17,20,24,0.96);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:14px;color:#e6edf3;box-shadow:0 8px 32px rgba(0,0,0,0.4);font-size:13px;overflow:hidden}
                @media(max-width:600px){#an-root{top:auto;bottom:0;right:0;left:0;width:100%;border-radius:14px 14px 0 0;max-height:85vh}}
                .an-head{padding:12px 14px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none;border-bottom:1px solid rgba(255,255,255,0.06)}
                .an-head-left{display:flex;align-items:center;gap:8px}
                .an-head-right{display:flex;align-items:center;gap:8px}
                .an-title{font-weight:600;color:#58a6ff;font-size:14px}
                .an-version{font-size:10px;color:#7d8590;background:rgba(255,255,255,0.04);padding:2px 6px;border-radius:4px}
                .an-status{width:8px;height:8px;border-radius:50%;transition:all 0.3s}
                .an-status.idle{background:#484f58}
                .an-status.searching{background:#d29922;animation:anPulse 1.2s infinite}
                .an-status.talking{background:#3fb950;box-shadow:0 0 8px rgba(63,185,80,0.5)}
                .an-arrow{transition:transform 0.3s;color:#7d8590;display:flex}
                .an-minimized .an-arrow{transform:rotate(-90deg)}
                .an-minimized .an-body{display:none}
                .an-body{padding:14px;overflow-y:auto;max-height:70vh}

                .an-stats{background:rgba(56,139,253,0.08);border:1px solid rgba(56,139,253,0.15);border-radius:10px;padding:12px;margin-bottom:12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center}
                .an-stat-item{display:flex;flex-direction:column;gap:2px}
                .an-stat-value{font-size:16px;font-weight:600;color:#58a6ff;display:flex;align-items:center;justify-content:center;gap:4px}
                .an-stat-value svg{opacity:0.6}
                .an-stat-label{font-size:9px;color:#7d8590;text-transform:uppercase;letter-spacing:0.5px}
                .an-stat-live{color:#3fb950!important;animation:anBlink 1s infinite}

                .an-controls{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px}
                .an-btn{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#e6edf3;border-radius:10px;padding:10px 4px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;transition:all 0.15s;font-size:10px}
                .an-btn:hover{background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.12)}
                .an-btn:active{transform:scale(0.96)}
                .an-btn.danger{background:rgba(248,81,73,0.12);border-color:rgba(248,81,73,0.3);color:#f85149}
                .an-btn-icon{display:flex}

                .an-divider{display:flex;align-items:center;gap:8px;margin:12px 0 8px;color:#7d8590;font-size:10px;text-transform:uppercase;letter-spacing:0.5px}
                .an-divider::before,.an-divider::after{content:'';flex:1;height:1px;background:rgba(255,255,255,0.06)}

                .an-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
                .an-switch{position:relative;width:36px;height:20px;flex-shrink:0}
                .an-switch input{opacity:0;width:0;height:0}
                .an-slider{position:absolute;cursor:pointer;inset:0;background:rgba(255,255,255,0.1);transition:0.2s;border-radius:20px}
                .an-slider:before{position:absolute;content:"";height:16px;width:16px;left:2px;bottom:2px;background:#fff;transition:0.2s;border-radius:50%}
                input:checked+.an-slider{background:#238636}
                input:checked+.an-slider:before{transform:translateX(16px)}

                .an-sub{background:rgba(0,0,0,0.2);padding:10px;border-radius:8px;margin:-4px 0 8px;display:none}
                .an-sub.open{display:block}
                .an-sub-label{font-size:10px;color:#7d8590;margin-bottom:6px}

                input[type=range]{width:100%;height:4px;-webkit-appearance:none;background:rgba(255,255,255,0.1);border-radius:4px;outline:none}
                input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;background:#58a6ff;border-radius:50%;cursor:pointer}

                .an-select{background:rgba(0,0,0,0.3);color:#e6edf3;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);font-size:12px;cursor:pointer;min-width:100px}
                .an-reset-btn{width:100%;margin-top:12px;padding:8px;background:transparent;border:1px solid rgba(255,255,255,0.08);color:#7d8590;border-radius:8px;cursor:pointer;font-size:11px;transition:all 0.2s}
                .an-reset-btn:hover{border-color:#f85149;color:#f85149}
            `;
            const style = document.createElement("style");
            style.id = "an-styles";
            style.textContent = css;
            document.head.appendChild(style);
        },

        createButton(icon, label, onClick, id) {
            const btn = document.createElement("button");
            btn.className = "an-btn";
            if (id) btn.dataset.id = id;
            btn.innerHTML = `<span class="an-btn-icon">${icon}</span><span>${label}</span>`;
            btn.onclick = onClick;
            return btn;
        },

        createDivider(text) { const d = document.createElement("div"); d.className = "an-divider"; d.textContent = text; return d; },

        createSubPanel(id, isOpen, label) {
            const sub = document.createElement("div");
            sub.id = id;
            sub.className = `an-sub ${isOpen ? 'open' : ''}`;
            if (label) { const l = document.createElement("div"); l.className = "an-sub-label"; l.textContent = label; sub.appendChild(l); }
            return sub;
        },

        createRange(min, max, step, value, onChange) {
            const r = document.createElement("input");
            r.type = "range"; r.min = min; r.max = max; r.step = step; r.value = value;
            r.oninput = (e) => onChange(parseFloat(e.target.value));
            return r;
        },

        renderToggle(container, label, key, initial, onChange) {
            const row = document.createElement("div");
            row.className = "an-row";
            row.innerHTML = `<span>${label}</span>`;
            const lbl = document.createElement("label");
            lbl.className = "an-switch";
            const inp = document.createElement("input");
            inp.type = "checkbox"; inp.checked = initial; inp.id = `an-tog-${key}`;
            inp.onchange = (e) => onChange(e.target.checked);
            const sl = document.createElement("span");
            sl.className = "an-slider";
            lbl.append(inp, sl);
            row.appendChild(lbl);
            container.appendChild(row);
        },

        updateButtons() {
            if (this.btnMic) {
                this.btnMic.className = `an-btn ${State.isMicMuted ? 'danger' : ''}`;
                this.btnMic.querySelector('.an-btn-icon').innerHTML = State.isMicMuted ? ICONS.micOff : ICONS.mic;
                this.btnMic.querySelector('span:last-child').textContent = State.isMicMuted ? "Выкл" : "Мик";
            }
            if (this.btnHead) {
                this.btnHead.className = `an-btn ${State.isHeadphonesMuted ? 'danger' : ''}`;
                this.btnHead.querySelector('.an-btn-icon').innerHTML = State.isHeadphonesMuted ? ICONS.headphonesOff : ICONS.headphones;
                this.btnHead.querySelector('span:last-child').textContent = State.isHeadphonesMuted ? "Выкл" : "Звук";
            }
        },

        updateToggle(key, val) { const el = document.getElementById(`an-tog-${key}`); if (el) el.checked = val; },

        updateStatus(status) {
            if (this.statusEl) {
                this.statusEl.className = `an-status ${status}`;
                this.statusEl.title = { idle: 'Ожидание', searching: 'Поиск...', talking: 'Разговор' }[status] || '';
            }
        },

        updateStats() {
            if (!this.statsEl) return;
            const liveTime = State.isInConversation ? State.currentSessionTime : 0;
            this.statsEl.innerHTML = `
                <div class="an-stat-item">
                    <span class="an-stat-value">${ICONS.chat} ${settings.conversationCount}</span>
                    <span class="an-stat-label">Разговоров</span>
                </div>
                <div class="an-stat-item">
                    <span class="an-stat-value ${State.isInConversation ? 'an-stat-live' : ''}" id="an-live-timer">${Utils.formatTime(liveTime)}</span>
                    <span class="an-stat-label">${State.isInConversation ? 'Сейчас' : 'Текущий'}</span>
                </div>
                <div class="an-stat-item">
                    <span class="an-stat-value">${ICONS.clock} ${Utils.formatTime(settings.totalTalkTime)}</span>
                    <span class="an-stat-label">Всего</span>
                </div>
            `;
            this.liveTimerEl = document.getElementById('an-live-timer');
        },

        updateLiveTimer() {
            if (this.liveTimerEl && State.isInConversation) {
                this.liveTimerEl.textContent = Utils.formatTime(State.currentSessionTime);
                this.liveTimerEl.className = 'an-stat-value an-stat-live';
            }
        }
    };

    // ==========================================
    // ИНИЦИАЛИЗАЦИЯ
    // ==========================================
    function init() {
        Utils.log('Запуск...', 'info');
        Settings.load();
        Sounds.init();
        MediaHook.init();
        Hotkeys.init();

        const unlock = () => { AudioEngine.getContext(); document.removeEventListener('click', unlock, true); };
        document.addEventListener('click', unlock, true);

        UI.create();
        Themes.apply(settings.selectedTheme);
        Particles.init();
        Observer.init();

        if (settings.voiceControl) VoiceControl.toggle(true);

        Utils.log('Готов!', 'success');
        Toast.show(`AutoNektome v${VERSION}`, 'success');
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

})();
