// ==UserScript==
// @name         PawycMe (AutoNektome Refactored)
// @namespace    http://tampermonkey.net/
// @version      6.3
// @description  Автоматический переход, настройки звука, голосовое управление, IP-чекер, авто-скип и улучшенный UI для nekto.me audiochat
// @author       @pawyc (Refactored)
// @match        https://nekto.me/audiochat
// @grant        none
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/pawyc/AutoNektomeV2/main/AutoNektome.user.js
// @updateURL    https://raw.githubusercontent.com/pawyc/AutoNektomeV2/main/AutoNektome.meta.js
// ==/UserScript==

(function () {
  "use strict";

  const VERSION = "6.3";
  const STORAGE_KEY = "AutoNektomeSettings_v4";
  const MIN_CONVERSATION_SECONDS = 3;
  const DRISNYA_PRANK_INTERVAL_MS = 2 * 60 * 1000;

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
    chevron: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`,
  };

  const SOUND_REPO_BASE =
    "https://raw.githubusercontent.com/pawyc/AutoNektomeV2/main/sound/";
  const DRISNYA_REPO_BASE =
    "https://raw.githubusercontent.com/pawyc/AutoNektomeV2/main/drisnya_mode/";
  const buildRepoAssetUrl = (baseUrl, fileName) =>
    `${baseUrl}${encodeURIComponent(fileName)}`;
  const buildRepoSoundUrl = (fileName) =>
    buildRepoAssetUrl(SOUND_REPO_BASE, fileName);
  const buildDrisnyaAssetUrl = (fileName) =>
    buildRepoAssetUrl(DRISNYA_REPO_BASE, fileName);
  const DRISNYA_ASSETS = {
    backgroundImage: buildDrisnyaAssetUrl("drisnya.jpg"),
    enableSound: buildDrisnyaAssetUrl("загрузка.mp3"),
    waitingLoop: buildDrisnyaAssetUrl("wait_mode.mp3"),
  };

  const SOUNDS = {
    conversationStart: {
      src: "https://zvukogram.com/mp3/22/skype-sound-message-received-message-received.mp3",
      volume: 0.4,
    },
    conversationEnd: {
      src: "https://www.myinstants.com/media/sounds/teleport1_Cw1ot9l.mp3",
      volume: 0.3,
    },
    startupSuccess: {
      src: buildRepoSoundUrl("запуск_успешный.wav"),
      volume: 0.75,
    },
    restoredConfig: {
      src: buildRepoSoundUrl("запуск_для_подставки_конфига.wav"),
      volume: 0.75,
    },
    drisnyaEnable: {
      src: DRISNYA_ASSETS.enableSound,
      volume: 0.85,
    },
    drisnyaWaiting: {
      src: DRISNYA_ASSETS.waitingLoop,
      volume: 0.45,
    },
    skipMilestone: {
      src: buildRepoSoundUrl("после_5_проскипанных_людей.wav"),
      volume: 0.8,
    },
    manualSkipVariants: [
      { src: buildRepoSoundUrl("yes (1).wav"), volume: 0.75 },
      { src: buildRepoSoundUrl("yes (2).wav"), volume: 0.75 },
    ],
  };

  const PRESETS = {
    custom: null,
    balanced: {
      enableLoopback: false,
      gainValue: 1.0,
      voicePitch: false,
      pitchLevel: 0.5,
      voiceEnhance: true,
      noiseSuppression: true,
      voiceControl: false,
      soundsEnabled: true,
      hotkeysEnabled: true,
      autoSkipAfter: 0,
      micGain: 1.0,
      lagEnabled: false,
      lagIntensity: 0.5,
      enableIpChecker: false,
    },
    fast: {
      enableLoopback: false,
      gainValue: 1.0,
      voicePitch: false,
      pitchLevel: 0.5,
      voiceEnhance: true,
      noiseSuppression: true,
      voiceControl: false,
      soundsEnabled: true,
      hotkeysEnabled: true,
      autoSkipAfter: 15,
      micGain: 1.1,
      lagEnabled: false,
      lagIntensity: 0.5,
      enableIpChecker: false,
    },
    softMic: {
      enableLoopback: true,
      gainValue: 0.7,
      voicePitch: false,
      pitchLevel: 0.5,
      voiceEnhance: true,
      noiseSuppression: true,
      voiceControl: false,
      soundsEnabled: true,
      hotkeysEnabled: true,
      autoSkipAfter: 0,
      micGain: 0.85,
      lagEnabled: false,
      lagIntensity: 0.5,
      enableIpChecker: false,
    },
    private: {
      enableLoopback: false,
      gainValue: 1.0,
      voicePitch: false,
      pitchLevel: 0.5,
      voiceEnhance: false,
      noiseSuppression: true,
      voiceControl: false,
      soundsEnabled: false,
      hotkeysEnabled: true,
      autoSkipAfter: 0,
      micGain: 1.0,
      lagEnabled: false,
      lagIntensity: 0.5,
      enableIpChecker: false,
    },
  };

  const AUDIO_SETTING_KEYS = [
    "enableLoopback",
    "gainValue",
    "voicePitch",
    "pitchLevel",
    "voiceEnhance",
    "noiseSuppression",
    "voiceControl",
    "autoSkipAfter",
    "micGain",
    "lagEnabled",
    "lagIntensity",
    "soundsEnabled",
  ];

  const STATUS_META = {
    idle: { title: "Ожидание", text: "Готов" },
    searching: { title: "Поиск...", text: "Ищу собеседника" },
    talking: { title: "Разговор", text: "В разговоре" },
    warning: { title: "Внимание", text: "Нужна проверка" },
    error: { title: "Ошибка", text: "Есть проблема" },
  };

  const THEMES = {
    Original: null,
    "GitHub Dark":
      "https://raw.githubusercontent.com/pawyc/AutoNektomeV2/main/githubdark.css",
  };

  const VOICE_COMMANDS = {
    skip: ["скип", "skip", "скиф", "далее", "некст", "next"],
    stop: ["завершить", "остановить", "закончить", "стоп", "stop"],
    start: ["чат", "старт", "поехали", "начни", "начать", "поиск", "start"],
  };

  const SELECTORS = {
    searchBtn: [
      "button#searchCompanyBtn",
      "button.callScreen__findBtn",
      "button.go-scan-button",
      ".scan-button",
      "[class*='findBtn']",
    ],
    stopBtn: [
      "button.callScreen__cancelCallBtn",
      "button.stop-talk-button",
      ".active-button-icon",
    ],
    confirmBtn: ["button.swal2-confirm", ".swal2-confirm"],
    timer: [".callScreen__time", ".timer-label", "[class*='timer']"],
    audioElement: "audio#audioStream",
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
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
      };
    },
    formatTime(seconds) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      if (h > 0)
        return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    },
    log(msg, type = "info") {
      const styles = {
        info: "color:#58a6ff",
        warn: "color:#d29922",
        error: "color:#f85149",
        success: "color:#238636",
      };
      console.log(
        `%c[AutoNektome v${VERSION}] ${msg}`,
        styles[type] || styles.info,
      );
      if (typeof EventLog !== "undefined") EventLog.add(msg, type);
    },
    normalizeCommandText(text) {
      return String(text || "")
        .toLowerCase()
        .replace(/[.,!?;:()[\]{}"'`~@#$%^&*_+=<>\\/|-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    },
    containsCommand(transcript, command) {
      const normalizedTranscript = this.normalizeCommandText(transcript);
      const normalizedCommand = this.normalizeCommandText(command);
      if (!normalizedTranscript || !normalizedCommand) return false;
      if (normalizedTranscript === normalizedCommand) return true;
      return (
        normalizedTranscript.includes(` ${normalizedCommand} `) ||
        normalizedTranscript.startsWith(`${normalizedCommand} `) ||
        normalizedTranscript.endsWith(` ${normalizedCommand}`)
      );
    },
  };

  const BrowserSupport = {
    getSpeechRecognitionCtor() {
      return (
        globalThis.SpeechRecognition ||
        globalThis.webkitSpeechRecognition ||
        globalThis.mozSpeechRecognition ||
        window.SpeechRecognition ||
        window.webkitSpeechRecognition ||
        window.mozSpeechRecognition ||
        null
      );
    },
    getBrowserName() {
      const ua = navigator.userAgent || "";
      if (/Firefox/i.test(ua)) return "Firefox";
      if (/Edg/i.test(ua)) return "Edge";
      if (/Chrome|Chromium/i.test(ua)) return "Chrome";
      if (/Safari/i.test(ua) && !/Chrome|Chromium|Edg/i.test(ua))
        return "Safari";
      return "browser";
    },
    getVoiceControlSupport() {
      const ctor = this.getSpeechRecognitionCtor();
      const isSecureContextAvailable =
        typeof window.isSecureContext === "boolean"
          ? window.isSecureContext
          : location.protocol === "https:";

      if (!isSecureContextAvailable) {
        return {
          supported: false,
          ctor: null,
          message:
            "Голосовое управление требует HTTPS-контекст и доступ к микрофону.",
        };
      }

      if (ctor) {
        return {
          supported: true,
          ctor,
          message: "",
        };
      }

      return {
        supported: false,
        ctor: null,
        message:
          "Браузер не предоставляет SpeechRecognition для голосового управления.",
      };
    },
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
    voiceControl: false,
    conversationCount: 0,
    totalTalkTime: 0,
    conversationHistory: [],
    selectedTheme: "Original",
    particlesEnabled: true,
    isCollapsed: false,
    soundsEnabled: true,
    hotkeysEnabled: true,
    autoSkipAfter: 0,
    micGain: 1.0,
    lagEnabled: false,
    lagIntensity: 0.5,
    enableIpChecker: false,
    drisnyaMode: false,
    panelPosition: null,
    selectedPreset: "custom",
    onboardingDone: false,
    stopWord: "",
  };

  let settings = { ...defaultSettings };

  const Profiles = {
    applyPreset(name) {
      const preset = PRESETS[name];
      if (!preset) return;
      Object.assign(settings, preset);
      settings.selectedPreset = name;
      Settings.save();
      Sounds.syncEnabledState();
    },
    resetAudio() {
      for (const key of AUDIO_SETTING_KEYS)
        settings[key] = defaultSettings[key];
      settings.selectedPreset = "custom";
      Settings.save();
      Sounds.syncEnabledState();
    },
    resetStats() {
      settings.conversationCount = 0;
      settings.totalTalkTime = 0;
      settings.conversationHistory = [];
      State.sessionCount = 0;
      State.sessionTalkTime = 0;
      Settings.save();
    },
  };

  const EventLog = {
    items: [],
    maxItems: 30,
    add(message, type = "info") {
      this.items.unshift({
        at: new Date().toLocaleTimeString(),
        message,
        type,
      });
      if (this.items.length > this.maxItems) this.items.pop();
      if (typeof UI !== "undefined" && UI.updateEventLog) UI.updateEventLog();
    },
    copy() {
      const text = this.items
        .map(
          (item) => `[${item.at}] ${item.type.toUpperCase()}: ${item.message}`,
        )
        .join("\n");
      navigator.clipboard?.writeText(text).then(
        () => Toast.show("Р›РѕРі СЃРєРѕРїРёСЂРѕРІР°РЅ", "success"),
        () =>
          Toast.show(
            "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ Р»РѕРі",
            "warning",
          ),
      );
    },
  };

  const Settings = {
    load() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return false;
        settings = { ...defaultSettings, ...JSON.parse(saved) };
        settings.stopWord =
          typeof settings.stopWord === "string"
            ? settings.stopWord
            : defaultSettings.stopWord;
        settings.drisnyaMode = Boolean(settings.drisnyaMode);
        return true;
      } catch (e) {
        Utils.log("Ошибка загрузки настроек", "error");
      }
      return false;
    },
    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch (e) {
        Utils.log("Ошибка сохранения", "error");
      }
    },
    reset() {
      settings = { ...defaultSettings };
      this.save();
      Sounds.syncEnabledState();
      Toast.show("Настройки сброшены", "info");
    },
  };

  // ==========================================
  // TOAST УВЕДОМЛЕНИЯ
  // ==========================================
  const Toast = {
    container: null,
    init() {
      this.container = document.createElement("div");
      this.container.id = "an-toast-container";
      this.container.style.cssText =
        "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:10001;display:flex;flex-direction:column;gap:8px;pointer-events:none;";
      document.body.appendChild(this.container);
    },
    show(message, type = "info", duration = 2500) {
      if (!this.container) this.init();
      const colors = {
        info: "#1f6feb",
        success: "#238636",
        warning: "#d29922",
        error: "#f85149",
      };
      const toast = document.createElement("div");
      toast.style.cssText = `background:${colors[type] || colors.info};color:white;padding:10px 18px;border-radius:8px;font-size:13px;font-family:-apple-system,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);animation:anToastIn 0.3s ease;`;
      toast.textContent = message;
      this.container.appendChild(toast);
      setTimeout(() => {
        toast.style.animation = "anToastOut 0.3s ease forwards";
        setTimeout(() => toast.remove(), 300);
      }, duration);
    },
  };

  const DrisnyaMode = {
    styleId: "an-drisnya-style",
    activeClass: "an-drisnya-active",
    ensureStyle() {
      if (document.getElementById(this.styleId)) return;
      const style = document.createElement("style");
      style.id = this.styleId;
      style.textContent = `
        body.${this.activeClass}::before{content:"";position:fixed;inset:0;z-index:-3;pointer-events:none;background-image:url("${DRISNYA_ASSETS.backgroundImage}");background-size:cover;background-position:center;background-repeat:no-repeat;opacity:0.3;filter:sepia(0.5) saturate(0.8) brightness(0.65)}
        body.${this.activeClass}::after{content:"";position:fixed;inset:0;z-index:-2;pointer-events:none;background:radial-gradient(circle at top, rgba(120,74,32,0.18), transparent 55%),linear-gradient(180deg, rgba(48,29,16,0.52), rgba(24,14,8,0.78));mix-blend-mode:screen}
        body.${this.activeClass}{background-color:#1a120d!important;background-image:linear-gradient(180deg, rgba(46,29,18,0.72), rgba(22,13,8,0.92))!important;background-attachment:fixed!important}
        body.${this.activeClass} #an-root{border-color:rgba(163,94,52,0.35);box-shadow:0 8px 32px rgba(39,20,8,0.5);background:rgba(28,17,11,0.94)}
        body.${this.activeClass} .an-title{color:#ff9a57}
        body.${this.activeClass} .an-stats{background:rgba(121,75,36,0.14);border-color:rgba(166,99,53,0.26)}
      `;
      document.head.appendChild(style);
    },
    apply() {
      this.ensureStyle();
      document.body.classList.toggle(
        this.activeClass,
        Boolean(settings.drisnyaMode),
      );
    },
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
    nodes: { pitch: null, comp: null, filter: null, loopGain: null, lag: null },
    previewStream: null,
    activeStream: null,
    rawStream: null,
    isProcessing: false,
    callId: 0, // Уникальный ID звонка для отслеживания

    async getContext() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC({ latencyHint: "interactive" });
      }
      if (this.ctx?.state === "suspended") {
        try {
          await this.ctx.resume();
        } catch (e) {}
      }
      return this.ctx;
    },

    async initWorklet() {
      if (this.workletLoaded) return true;
      const ctx = await this.getContext();
      if (!ctx) return false;

      // Firefox/Safari: проверяем поддержку AudioWorklet
      if (!ctx.audioWorklet) {
        Utils.log("AudioWorklet не поддерживается в этом браузере", "warn");
        Toast.show("Изменение голоса недоступно в этом браузере", "warning");
        return false;
      }

      const workletCode = `
                class PitchShiftProcessor extends AudioWorkletProcessor {
                    constructor() { super(); this.size=2048; this.buffer=new Float32Array(this.size); this.w=0; this.r=0; this.pitch=1.0; this.port.onmessage=e=>{this.pitch=Math.max(0.5,Math.min(2.0,e.data));}; }
                    process(I,O) { const i=I[0]?.[0],o=O[0]?.[0]; if(!i||!o)return true; const L=this.buffer.length; for(let j=0;j<i.length;j++){this.buffer[this.w]=i[j];o[j]=this.buffer[Math.floor(this.r)%L];this.w=(this.w+1)%L;this.r=(this.r+this.pitch)%L;} return true; }
                }
                registerProcessor('pitch-shift-processor', PitchShiftProcessor);

                class LagProcessor extends AudioWorkletProcessor {
                    constructor() {
                        super();
                        this.intensity = 0.5;
                        this.frozenFrame = new Float32Array(128);
                        this.freezeCount = 0;
                        this.silenceCount = 0;
                        this.port.onmessage = (e) => { this.intensity = Math.max(0, Math.min(1, e.data)); };
                    }
                    process(inputs, outputs) {
                        const inp = inputs[0]?.[0], out = outputs[0]?.[0];
                        if (!inp || !out) return true;
                        const k = this.intensity;
                        if (this.freezeCount > 0) {
                            for (let i = 0; i < out.length; i++) out[i] = this.frozenFrame[i % this.frozenFrame.length];
                            this.freezeCount--;
                        } else if (this.silenceCount > 0) {
                            out.fill(0);
                            this.silenceCount--;
                        } else if (Math.random() < k * 0.12) {
                            this.frozenFrame.set(inp.subarray(0, Math.min(128, inp.length)));
                            this.freezeCount = Math.floor(Math.random() * 60 * k + 8);
                            for (let i = 0; i < out.length; i++) out[i] = this.frozenFrame[i % this.frozenFrame.length];
                        } else if (Math.random() < k * 0.06) {
                            this.silenceCount = Math.floor(Math.random() * 30 * k + 4);
                            out.fill(0);
                        } else {
                            out.set(inp.subarray(0, out.length));
                        }
                        return true;
                    }
                }
                registerProcessor('lag-processor', LagProcessor);
            `;
      try {
        const blob = new Blob([workletCode.trim()], {
          type: "application/javascript",
        });
        const url = URL.createObjectURL(blob);
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        this.workletLoaded = true;
        Utils.log("AudioWorklet загружен", "success");
        return true;
      } catch (e) {
        Utils.log("AudioWorklet error: " + e.message, "warn");
        Toast.show("Ошибка инициализации изменения голоса", "warning");
        return false;
      }
    },

    // Полная очистка перед новым звонком
    cleanup() {
      const safeDisconnect = (node) => {
        if (node)
          try {
            node.disconnect();
          } catch (e) {}
      };

      safeDisconnect(this.sourceNode);
      safeDisconnect(this.gainNode);
      safeDisconnect(this.destNode);
      Object.values(this.nodes).forEach(safeDisconnect);

      // Обнуляем ВСЕ узлы — filter/comp пересоздаются для надёжности в Firefox
      this.sourceNode = null;
      this.destNode = null;
      this.gainNode = null;
      this.nodes = {
        pitch: null,
        comp: null,
        filter: null,
        loopGain: null,
        lag: null,
      };
      this.rawStream = null;
      this.activeStream = null;

      Utils.log("Audio cleanup done", "info");
    },

    async setInputStream(stream) {
      const ctx = await this.getContext();
      if (!ctx) return stream;

      // Увеличиваем ID звонка
      this.callId++;
      const currentCallId = this.callId;

      Utils.log(`New call #${currentCallId}, setting up audio...`, "info");

      // Полная очистка старых узлов
      this.cleanup();

      this.rawStream = stream;
      this.activeStream = stream;

      // ВСЕГДА создаём новый destination для каждого звонка
      this.destNode = ctx.createMediaStreamDestination();

      // Новый gain node
      this.gainNode = ctx.createGain();
      this.gainNode.gain.value = settings.micGain;

      // Новый source
      this.sourceNode = ctx.createMediaStreamSource(stream);

      await this.rebuildChain(currentCallId);

      Utils.log(
        `Call #${currentCallId} audio ready, output tracks: ${this.destNode.stream.getAudioTracks().length}`,
        "success",
      );

      return this.destNode.stream;
    },

    async rebuildChain(forCallId = null) {
      // Если указан callId, проверяем актуальность
      if (forCallId !== null && forCallId !== this.callId) {
        Utils.log(`Skipping rebuild for old call #${forCallId}`, "warn");
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
      const safeDisconnect = (node) => {
        if (node)
          try {
            node.disconnect();
          } catch (e) {}
      };

      safeDisconnect(this.sourceNode);
      safeDisconnect(this.gainNode);
      if (this.nodes.pitch) safeDisconnect(this.nodes.pitch);
      if (this.nodes.filter) safeDisconnect(this.nodes.filter);
      if (this.nodes.comp) safeDisconnect(this.nodes.comp);
      if (this.nodes.lag) safeDisconnect(this.nodes.lag);
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
        } catch (e) {
          Utils.log("Pitch error: " + e.message, "error");
        }
      }

      // Лаги голоса
      if (settings.lagEnabled && this.workletLoaded) {
        try {
          this.nodes.lag = new AudioWorkletNode(ctx, "lag-processor");
          this.nodes.lag.port.postMessage(settings.lagIntensity);
          currentNode.connect(this.nodes.lag);
          currentNode = this.nodes.lag;
        } catch (e) {
          Utils.log("Lag error: " + e.message, "error");
        }
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
      Utils.log(`Audio chain rebuilt for call #${this.callId}`, "success");
    },

    async startPreview() {
      // Не запускать preview если идёт реальный звонок
      if (this.activeStream && this.activeStream !== this.previewStream) return;
      this.stopPreview();
      try {
        if (settings.voicePitch || settings.lagEnabled)
          await this.initWorklet();
        // Используем ORIGINAL getUserMedia — мимо hook, чтобы избежать двойного setInputStream
        const fn =
          MediaHook.original ||
          navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        const constraints = {
          audio: {
            echoCancellation: { exact: false },
            autoGainControl: { exact: false },
            noiseSuppression: settings.noiseSuppression,
          },
        };
        const rawStream = await fn(constraints);
        this.previewStream = rawStream;
        await this.setInputStream(rawStream);
      } catch (e) {
        Utils.log("startPreview error: " + e.message, "error");
        Toast.show("Ошибка микрофона", "error");
      }
    },

    stopPreview() {
      if (this.previewStream) {
        this.previewStream.getTracks().forEach((t) => {
          t.stop();
        });
        this.previewStream = null;
      }
    },

    updateLiveParams() {
      if (this.nodes.pitch)
        this.nodes.pitch.port.postMessage(settings.pitchLevel + 0.5);
      if (this.nodes.lag)
        this.nodes.lag.port.postMessage(settings.lagIntensity);
      if (this.nodes.loopGain)
        this.nodes.loopGain.gain.value = settings.gainValue;
      if (this.gainNode) this.gainNode.gain.value = settings.micGain;
    },
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
    pendingSearchTimeout: null,
    conversationStartTime: null,
    currentSessionTime: 0,
    timerInterval: null,
    recognition: null,
    recognitionCtor: null,
    sessionCount: 0,
    sessionTalkTime: 0,
    skippedUsersCount: 0,
    wasHidden: false,
    didInitComplete: false,

    setAutoMode(enabled) {
      this.isAutoMode = enabled;
      UI.updateToggle("autoMode", enabled);
      if (!enabled) Sounds.syncDrisnyaLoop();
      Toast.show(
        enabled ? "Авторежим вкл" : "Авторежим выкл",
        enabled ? "success" : "info",
      );
      if (enabled && !this.isInConversation) Actions.clickSearch();
    },

    setMicMuted(muted) {
      this.isMicMuted = muted;
      // Мьютим оригинальный поток
      if (AudioEngine.rawStream) {
        AudioEngine.rawStream.getAudioTracks().forEach((t) => {
          t.enabled = !muted;
        });
      }
      if (AudioEngine.activeStream) {
        AudioEngine.activeStream.getAudioTracks().forEach((t) => {
          t.enabled = !muted;
        });
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
      Sounds.stopLoop();
      this.conversationStartTime = Date.now();
      this.currentSessionTime = 0;

      // Запуск таймера реального времени
      this._autoSkipFired = false;
      this.timerInterval = setInterval(() => {
        this.currentSessionTime = Math.floor(
          (Date.now() - this.conversationStartTime) / 1000,
        );
        UI.updateLiveTimer();
        if (
          !this._autoSkipFired &&
          settings.autoSkipAfter > 0 &&
          this.currentSessionTime >= settings.autoSkipAfter
        ) {
          this._autoSkipFired = true;
          Actions.skip("auto");
        }
      }, 1000);

      UI.updateStatus("talking");
      UI.updateLiveTimer();
      EventLog.add("Найден собеседник", "success");
      Sounds.playStart();
      DrisnyaPrank.sync();
      Toast.show("Собеседник найден!", "success");
    },

    endConversation() {
      if (!this.isInConversation) return;

      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }

      if (this.conversationStartTime) {
        const duration = Math.floor(
          (Date.now() - this.conversationStartTime) / 1000,
        );
        if (duration >= MIN_CONVERSATION_SECONDS) {
          settings.totalTalkTime += duration;
          settings.conversationCount++;
          this.sessionCount++;
          this.sessionTalkTime += duration;
          if (!Array.isArray(settings.conversationHistory))
            settings.conversationHistory = [];
          settings.conversationHistory.unshift({ date: Date.now(), duration });
          if (settings.conversationHistory.length > 50)
            settings.conversationHistory.pop();
          Settings.save();
          Toast.show(`Разговор: ${Utils.formatTime(duration)}`, "info");
        }
      }

      this.isInConversation = false;
      this.conversationStartTime = null;
      this.currentSessionTime = 0;
      DrisnyaPrank.stop();
      UI.refreshBasic();
      Sounds.playEnd();
      Sounds.syncDrisnyaLoop();
    },
  };

  // ==========================================
  // ДЕЙСТВИЯ
  // ==========================================
  const Actions = {
    clickSearch() {
      if (State.isSearching) return;
      const btn = Utils.getEl("searchBtn");
      if (btn) {
        State.isSearching = true;
        UI.updateStatus("searching");
        Sounds.syncDrisnyaLoop();
        btn.click();
      }
    },
    skip(source = "manual") {
      const stop = Utils.getEl("stopBtn");
      if (!stop) return;
      DrisnyaPrank.stop();
      Sounds.stopLoop();
      State.skippedUsersCount += 1;
      if (source === "manual") Sounds.playRandomManualSkip();
      if (State.skippedUsersCount % 5 === 0) Sounds.play("skipMilestone");
      stop.click();
      setTimeout(() => {
        const c = Utils.getEl("confirmBtn");
        if (c) c.click();
      }, 300);
    },
  };

  // ==========================================
  // ЗВУКИ
  // ==========================================
  const Sounds = {
    queue: [],
    currentAudio: null,
    isPlaying: false,
    isUnlocked: false,
    unlockHandler: null,
    loopAudio: null,
    loopKey: "",
    init() {
      this.queue = [];
      this.currentAudio = null;
      this.isPlaying = false;
      this.isUnlocked = false;
      this.stopLoop();
      if (this.unlockHandler) {
        document.removeEventListener("click", this.unlockHandler, true);
        document.removeEventListener("keydown", this.unlockHandler, true);
      }
      this.unlockHandler = () => {
        this.isUnlocked = true;
        document.removeEventListener("click", this.unlockHandler, true);
        document.removeEventListener("keydown", this.unlockHandler, true);
        this.flushQueue();
        this.syncDrisnyaLoop();
      };
      document.addEventListener("click", this.unlockHandler, true);
      document.addEventListener("keydown", this.unlockHandler, true);
    },
    clearQueue(stopCurrent = false) {
      this.queue = [];
      if (stopCurrent && this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio = null;
        this.isPlaying = false;
      }
    },
    syncEnabledState() {
      if (!settings.soundsEnabled) {
        this.clearQueue(true);
        this.stopLoop();
        DrisnyaPrank.stop();
        return;
      }
      this.syncDrisnyaLoop();
      DrisnyaPrank.sync();
    },
    isDrisnyaLocalSoundAllowed(key) {
      if (!settings.drisnyaMode) return true;
      return key === "drisnyaEnable" || key === "drisnyaWaiting";
    },
    play(key) {
      if (!settings.soundsEnabled) return;
      if (!this.isDrisnyaLocalSoundAllowed(key)) return;
      const sound = SOUNDS[key];
      if (!sound) return;
      this.enqueue(sound);
    },
    playRandomManualSkip() {
      if (settings.drisnyaMode) return;
      if (!settings.soundsEnabled || !SOUNDS.manualSkipVariants.length) return;
      const index = Math.floor(
        Math.random() * SOUNDS.manualSkipVariants.length,
      );
      this.enqueue(SOUNDS.manualSkipVariants[index]);
    },
    playStart() {
      this.play("conversationStart");
    },
    playEnd() {
      this.play("conversationEnd");
    },
    enqueue(sound) {
      if (!sound?.src) return;
      this.queue.push(sound);
      this.flushQueue();
    },
    playLoop(key) {
      if (!settings.soundsEnabled || !this.isUnlocked) return;
      const sound = SOUNDS[key];
      if (!sound?.src) return;
      if (this.loopAudio && this.loopKey === key) return;
      this.stopLoop();
      const audio = new Audio(sound.src);
      audio.volume = sound.volume ?? 1;
      audio.preload = "auto";
      audio.loop = true;
      this.loopAudio = audio;
      this.loopKey = key;
      audio.play().catch(() => {
        if (this.loopAudio === audio) {
          this.loopAudio = null;
          this.loopKey = "";
        }
      });
    },
    stopLoop() {
      if (!this.loopAudio) {
        this.loopKey = "";
        return;
      }
      this.loopAudio.pause();
      this.loopAudio.currentTime = 0;
      this.loopAudio = null;
      this.loopKey = "";
    },
    syncDrisnyaLoop() {
      const shouldPlay =
        settings.drisnyaMode &&
        settings.soundsEnabled &&
        this.isUnlocked &&
        State.isSearching &&
        !State.isInConversation;
      if (shouldPlay) this.playLoop("drisnyaWaiting");
      else this.stopLoop();
    },
    flushQueue() {
      if (this.isPlaying || !this.isUnlocked || !this.queue.length) return;
      const nextSound = this.queue.shift();
      const audio = new Audio(nextSound.src);
      audio.volume = nextSound.volume ?? 1;
      audio.preload = "auto";
      this.currentAudio = audio;
      this.isPlaying = true;

      let finished = false;
      const finalize = () => {
        if (finished) return;
        finished = true;
        audio.removeEventListener("ended", finalize);
        audio.removeEventListener("error", finalize);
        if (this.currentAudio === audio) this.currentAudio = null;
        this.isPlaying = false;
        this.flushQueue();
      };

      audio.addEventListener("ended", finalize, { once: true });
      audio.addEventListener("error", finalize, { once: true });
      audio.play().catch(finalize);
    },
  };

  const DrisnyaPrank = {
    intervalId: null,
    bufferPromise: null,
    shouldRun() {
      return (
        settings.drisnyaMode &&
        settings.soundsEnabled &&
        State.isInConversation &&
        !!AudioEngine.gainNode
      );
    },
    start() {
      if (this.intervalId || !this.shouldRun()) return;
      this.intervalId = setInterval(() => {
        this.playShot();
      }, DRISNYA_PRANK_INTERVAL_MS);
    },
    stop() {
      if (!this.intervalId) return;
      clearInterval(this.intervalId);
      this.intervalId = null;
    },
    sync() {
      if (this.shouldRun()) this.start();
      else this.stop();
    },
    async getBuffer() {
      if (!this.bufferPromise) {
        this.bufferPromise = (async () => {
          const ctx = await AudioEngine.getContext();
          if (!ctx) return null;
          const response = await fetch(DRISNYA_ASSETS.enableSound);
          if (!response.ok) {
            throw new Error(`Failed to load drisnya prank sound: ${response.status}`);
          }
          const audioData = await response.arrayBuffer();
          return await ctx.decodeAudioData(audioData.slice(0));
        })().catch((error) => {
          this.bufferPromise = null;
          Utils.log(error.message, "warn");
          return null;
        });
      }
      return await this.bufferPromise;
    },
    async playShot() {
      if (!this.shouldRun()) return;
      const ctx = await AudioEngine.getContext();
      const buffer = await this.getBuffer();
      if (!ctx || !buffer || !AudioEngine.gainNode) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const remoteGain = ctx.createGain();
      remoteGain.gain.value = 0.28;
      source.connect(remoteGain);
      remoteGain.connect(AudioEngine.gainNode);

      if (ctx.destination) {
        const localGain = ctx.createGain();
        localGain.gain.value = 0.12;
        source.connect(localGain);
        localGain.connect(ctx.destination);
      }

      source.start();
    },
  };

  // ==========================================
  // ГОЛОСОВОЕ УПРАВЛЕНИЕ
  // ==========================================
  const VoiceControl = {
    init() {
      const support = BrowserSupport.getVoiceControlSupport();
      if (!support.supported || !support.ctor) {
        settings.voiceControl = false;
        State.recognition = null;
        State.recognitionCtor = null;
        return false;
      }

      if (State.recognition && State.recognitionCtor === support.ctor)
        return true;

      try {
        State.recognition?.stop();
      } catch (e) {}

      State.recognition = new support.ctor();
      State.recognitionCtor = support.ctor;
      State.recognition.continuous = true;
      State.recognition.lang = "ru-RU";
      State.recognition.onresult = (e) => {
        const t = e.results[e.results.length - 1][0].transcript;
        const customStopWord = Utils.normalizeCommandText(settings.stopWord);
        const stopTriggers = customStopWord
          ? [...VOICE_COMMANDS.stop, customStopWord]
          : VOICE_COMMANDS.stop;
        if (stopTriggers.some((w) => Utils.containsCommand(t, w))) {
          State.setAutoMode(false);
          Actions.skip("voice-stop");
          return;
        }
        if (VOICE_COMMANDS.skip.some((w) => Utils.containsCommand(t, w))) {
          Actions.skip("voice-skip");
          return;
        }
        if (VOICE_COMMANDS.start.some((w) => Utils.containsCommand(t, w)))
          State.setAutoMode(true);
      };
      State.recognition.onend = () => {
        if (settings.voiceControl)
          setTimeout(() => {
            try {
              State.recognition?.start();
            } catch (e) {}
          }, 100);
      };
      State.recognition.onerror = (e) => {
        if (e.error === "not-allowed")
          Toast.show("Нет доступа к микрофону (голос. управление)", "error");
        else if (e.error === "network")
          Toast.show("Ошибка сети (голос. управление)", "warning");
        else if (e.error !== "aborted" && e.error !== "no-speech")
          Utils.log("SpeechRecognition error: " + e.error, "warn");
      };
      return true;
    },
    toggle(enable) {
      if (enable) {
        if (!this.init()) {
          const support = BrowserSupport.getVoiceControlSupport();
          settings.voiceControl = false;
          Settings.save();
          UI.updateToggle("voiceControl", false);
          Diagnostics.runSelfCheck();
          Toast.show(
            support.message || "Голосовое управление недоступно",
            "error",
          );
          return;
        }
        try {
          State.recognition.start();
        } catch (e) {}
      } else {
        try {
          State.recognition?.stop();
        } catch (e) {}
      }
    },
  };

  // ==========================================
  // ГОРЯЧИЕ КЛАВИШИ
  // ==========================================
  const Hotkeys = {
    init() {
      document.addEventListener("keydown", (e) => {
        if (
          !settings.hotkeysEnabled ||
          e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA"
        )
          return;
        switch (e.code) {
          case "KeyM":
            State.setMicMuted(!State.isMicMuted);
            break;
          case "KeyH":
            State.setHeadphonesMuted(!State.isHeadphonesMuted);
            break;
          case "KeyS":
            Actions.skip("manual");
            break;
          case "KeyA":
            State.setAutoMode(!State.isAutoMode);
            break;
          case "Space":
            if (!State.isInConversation && !State.isSearching) {
              e.preventDefault();
              Actions.clickSearch();
            }
            break;
        }
      });
    },
  };

  // ==========================================
  // НАБЛЮДАТЕЛЬ DOM
  // ==========================================
  const Observer = {
    observer: null,
    lastTimerState: false,
    init() {
      const check = Utils.debounce(() => {
        if (State.isAutoMode && !State.isInConversation && !State.isSearching) {
          const btn = Utils.getEl("searchBtn");
          if (btn && btn.offsetParent !== null && !State.pendingSearchTimeout) {
            State.pendingSearchTimeout = setTimeout(() => {
              State.pendingSearchTimeout = null;
              if (
                State.isAutoMode &&
                !State.isInConversation &&
                !State.isSearching
              ) {
                Actions.clickSearch();
              }
            }, 500);
          }
        }
        const timerEl = Utils.getEl("timer");
        // Более строгая проверка: элемент видим, содержит время (00:00), не пустой
        const timerText = timerEl?.textContent?.trim() || "";
        const hasTimer =
          !!timerEl &&
          timerEl.offsetParent !== null &&
          /^\d{1,2}:\d{2}/.test(timerText);
        if (hasTimer && !this.lastTimerState) State.startConversation();
        else if (!hasTimer && this.lastTimerState) State.endConversation();
        else if (!hasTimer && !State.isInConversation) {
          const searchBtn = Utils.getEl("searchBtn");
          const isSearchAvailable =
            !!searchBtn && searchBtn.offsetParent !== null;
          State.isSearching = State.isSearching && !isSearchAvailable;
          Sounds.syncDrisnyaLoop();
        }
        this.lastTimerState = hasTimer;

        const audio = Utils.getEl("audioElement");
        if (audio && !audio.dataset.anInited) {
          audio.dataset.anInited = "true";
          audio.onplay = () => {
            if (State.isHeadphonesMuted) audio.muted = true;
          };
        }
        Diagnostics.runSelfCheck();
      }, 100);
      this.observer = new MutationObserver(check);
      this.observer.observe(document.body, { childList: true, subtree: true });
      check();
    },
  };

  // ==========================================
  // IP CHECKER (WebRTC ICE)
  // ==========================================
  const IPChecker = {
    originalRTC: null,
    isHooked: false,
    isEnabled: false,
    lastIP: null,
    elId: "an-ip-display",

    // Перехватываем RTCPeerConnection для перехвата ICE-кандидатов
    init() {
      this.isEnabled = true;
      if (this.isHooked) return;
      const OrigRTC = window.RTCPeerConnection;
      if (!OrigRTC) return;
      this.originalRTC = OrigRTC;
      const self = this;
      window.RTCPeerConnection = function (...args) {
        const pc = new OrigRTC(...args);
        const origSetRemote = pc.setRemoteDescription.bind(pc);
        pc.setRemoteDescription = async function (desc) {
          const result = await origSetRemote(desc);
          if (!self.isEnabled) return result;
          // Извлекаем IP из SDP
          if (desc?.sdp) {
            const ips = self._extractIPsFromSDP(desc.sdp);
            if (ips.length > 0) self._onNewIP(ips[0], "SDP");
          }
          return result;
        };
        pc.addEventListener("icecandidate", (e) => {
          if (!self.isEnabled) return;
          if (e.candidate?.candidate) {
            const ip = self._extractIPFromCandidate(e.candidate.candidate);
            if (ip) self._onNewIP(ip, "ICE");
          }
        });
        return pc;
      };
      // Копируем прототип чтобы instanceof работал
      window.RTCPeerConnection.prototype = OrigRTC.prototype;
      this.isHooked = true;
      Utils.log("IPChecker: RTCPeerConnection hook active", "info");
    },

    disable() {
      this.isEnabled = false;
      this.reset();
    },

    reset() {
      this.lastIP = null;
      const el = document.getElementById(this.elId);
      if (el) el.innerHTML = '<span style="color:#484f58">—</span>';
    },

    _extractIPsFromSDP(sdp) {
      const ips = [];
      // c= линии SDP
      const cLines = sdp.match(/^c=IN IP4 (\d+\.\d+\.\d+\.\d+)/gm) || [];
      cLines.forEach((l) => {
        const ip = l.split(" ").pop();
        if (!this._isPrivateIP(ip) && !ips.includes(ip)) ips.push(ip);
      });
      return ips;
    },

    _extractIPFromCandidate(candidate) {
      // a=candidate:... UDP ... <ip> <port>
      const m = candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
      if (m) {
        const ip = m[1];
        return this._isPrivateIP(ip) ? null : ip;
      }
      return null;
    },

    _isPrivateIP(ip) {
      return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|0\.0\.0\.0|169\.254\.)/.test(
        ip,
      );
    },

    _onNewIP(ip, source) {
      if (!this.isEnabled) return;
      if (ip === this.lastIP) return;
      this.lastIP = ip;
      Utils.log(`Server IP (${source}): ${ip}`, "success");
      // Сразу показываем IP без гео, потом догружаем
      this._updateDisplay(ip, "🌐", "");
      this._fetchGeo(ip);
    },

    async _fetchGeo(ip) {
      if (!this.isEnabled) return;
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch(`https://ipapi.co/${ip}/json/`, {
          signal: ctrl.signal,
        });
        clearTimeout(tid);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (d.error) throw new Error(d.reason || "geo error");
        if (!this.isEnabled || this.lastIP !== ip) return;
        const flag = d.country_code
          ? this._countryToFlag(d.country_code)
          : "🌐";
        const city = d.city || "";
        const country = d.country_name || d.country_code || "";
        const geo = [city, country].filter(Boolean).join(", ");
        Utils.log(`Server geo: ${flag} ${ip} — ${geo}`, "success");
        Toast.show(`${flag} ${ip}  ${geo}`, "info", 5000);
        this._updateDisplay(ip, flag, geo);
      } catch (e) {
        if (!this.isEnabled || this.lastIP !== ip) return;
        if (e.name !== "AbortError")
          Utils.log("Geo lookup failed: " + e.message, "warn");
        Toast.show(`🌐 ${ip}`, "info", 3000);
      }
    },

    _countryToFlag(cc) {
      try {
        return [...cc.toUpperCase()]
          .map((c) => String.fromCodePoint(c.charCodeAt(0) + 127397))
          .join("");
      } catch {
        return "🌐";
      }
    },

    _updateDisplay(ip, flag, geo) {
      const el = document.getElementById(this.elId);
      if (!el) return;
      el.replaceChildren();
      if (flag) {
        const flagEl = document.createElement("span");
        flagEl.style.cssText = "font-size:16px;line-height:1";
        flagEl.textContent = flag;
        el.appendChild(flagEl);
      }
      const ipEl = document.createElement("span");
      ipEl.className = "an-ip-addr";
      ipEl.textContent = ip;
      el.appendChild(ipEl);
      if (geo) {
        const geoEl = document.createElement("span");
        geoEl.className = "an-ip-geo";
        geoEl.textContent = geo;
        el.appendChild(geoEl);
      }
    },
  };

  // ==========================================
  // ПЕРЕХВАТ getUserMedia
  // ==========================================
  const MediaHook = {
    original: null,
    init() {
      this.original = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        AudioEngine.stopPreview();
        IPChecker.reset(); // Сброс IP при каждом новом подключении
        if (constraints?.audio) {
          // exact: false — отключает нативную обработку в Firefox надёжнее
          const defaults = {
            autoGainControl: { exact: false },
            echoCancellation: { exact: false },
            noiseSuppression: settings.noiseSuppression,
          };
          constraints.audio =
            typeof constraints.audio === "object"
              ? { ...constraints.audio, ...defaults }
              : defaults;
        }
        try {
          const rawStream = await this.original(constraints);
          if (settings.voicePitch || settings.lagEnabled)
            await AudioEngine.initWorklet();
          const outputStream = await AudioEngine.setInputStream(rawStream);
          if (State.isMicMuted)
            rawStream.getAudioTracks().forEach((t) => {
              t.enabled = false;
            });
          return outputStream;
        } catch (e) {
          Utils.log("getUserMedia error: " + e.message, "error");
          throw e;
        }
      };
    },
  };

  // ==========================================
  // ТЕМЫ
  // ==========================================
  const Themes = {
    styleEl: null,
    _cache: {},
    apply(name) {
      const themeName =
        name || settings.selectedTheme || defaultSettings.selectedTheme;
      settings.selectedTheme = themeName;
      Settings.save();
      if (this.styleEl) {
        this.styleEl.remove();
        this.styleEl = null;
      }
      document.body.classList.remove("night_theme");
      document.documentElement.style.background = "";
      document.body.style.background = "";
      if (themeName === "GitHub Dark" && THEMES[themeName]) {
        document.body.classList.add("night_theme");
        document.documentElement.style.background = "#0d1117";
        document.body.style.background = "#0d1117";
        this.styleEl = document.createElement("style");
        document.head.append(this.styleEl);
        if (this._cache[themeName]) {
          this.styleEl.textContent = this._cache[themeName];
        } else {
          fetch(THEMES[themeName])
            .then((r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              return r.text();
            })
            .then((css) => {
              this._cache[themeName] = css;
              if (this.styleEl) this.styleEl.textContent = css;
            })
            .catch((e) => {
              Utils.log("Ошибка загрузки темы: " + e.message, "error");
              Toast.show("Ошибка загрузки темы", "error");
            });
        }
      }
      DrisnyaMode.apply();
    },
  };

  // ==========================================
  // ЧАСТИЦЫ
  // ==========================================
  const Particles = {
    canvas: null,
    ctx: null,
    rafId: null,
    parts: [],
    enabled: false,
    init() {
      this.canvas = document.createElement("canvas");
      this.canvas.style.cssText =
        "position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;pointer-events:none;opacity:0;transition:opacity 1s;";
      document.body.prepend(this.canvas);
      this.ctx = this.canvas.getContext("2d");
      this._resizeHandler = () => this.resize();
      window.addEventListener("resize", this._resizeHandler);
      this.resize();
      if (settings.particlesEnabled) this.toggle(true);
    },
    resize() {
      if (this.canvas) {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if (this.enabled) this.createParticles();
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
      const count = window.innerWidth < 600 ? 20 : 40;
      for (let i = 0; i < count; i++)
        this.parts.push({
          x: Math.random() * this.canvas.width,
          y: Math.random() * this.canvas.height,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
        });
    },
    loop() {
      if (!this.enabled) return;
      const w = this.canvas.width,
        h = this.canvas.height;
      this.ctx.clearRect(0, 0, w, h);
      if (settings.drisnyaMode) {
        this.ctx.font = "24px Arial";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
      } else {
        this.ctx.fillStyle = "rgba(88,166,255,0.4)";
      }
      for (let i = 0; i < this.parts.length; i++) {
        const p = this.parts[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        if (settings.drisnyaMode) {
          this.ctx.fillText("\uD83D\uDCA9", p.x, p.y);
        } else {
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
          this.ctx.fill();
          for (let j = i + 1; j < this.parts.length; j++) {
          const p2 = this.parts[j],
            dx = p.x - p2.x,
            dy = p.y - p2.y,
            d = dx * dx + dy * dy;
          if (d < 10000) {
            this.ctx.strokeStyle = `rgba(88,166,255,${0.12 * (1 - d / 10000)})`;
            this.ctx.beginPath();
            this.ctx.moveTo(p.x, p.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.stroke();
            }
          }
        }
      }
      this.rafId = requestAnimationFrame(() => this.loop());
    },
  };

  const Diagnostics = {
    issues: [],
    setIssue(id, message) {
      const idx = this.issues.findIndex((issue) => issue.id === id);
      if (message) {
        if (idx >= 0) this.issues[idx].message = message;
        else this.issues.push({ id, message });
      } else if (idx >= 0) {
        this.issues.splice(idx, 1);
      }
      UI.updateDiagnostics?.();
      UI.refreshStatusFromDiagnostics?.();
    },
    runSelfCheck() {
      this.setIssue(
        "searchBtn",
        Utils.getEl("searchBtn")
          ? ""
          : "Не найдена кнопка поиска. Возможно, сайт изменил верстку.",
      );
      this.setIssue(
        "audio",
        Utils.getEl("audioElement")
          ? ""
          : "Не найден аудио-элемент. Управление звуком может не сработать.",
      );
      const voiceSupport = BrowserSupport.getVoiceControlSupport();
      this.setIssue(
        "speech",
        !voiceSupport.supported ? voiceSupport.message : "",
      );
    },
    getSummary() {
      return this.issues.length
        ? this.issues[0].message
        : "Ошибок не обнаружено";
    },
  };

  const MicTester = {
    analyser: null,
    rafId: null,
    sourceNode: null,
    active: false,
    async start() {
      try {
        await AudioEngine.startPreview();
        const ctx = await AudioEngine.getContext();
        const stream = AudioEngine.rawStream || AudioEngine.previewStream;
        if (!ctx || !stream) throw new Error("Микрофон недоступен");
        this.stopMeter();
        this.sourceNode = ctx.createMediaStreamSource(stream);
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.sourceNode.connect(this.analyser);
        this.active = true;
        this.loop();
        Toast.show("Тест микрофона запущен", "success");
      } catch (e) {
        Diagnostics.setIssue("mic", "Не удалось получить доступ к микрофону.");
        UI.updateMicTest(0, false);
        Toast.show("Не удалось запустить тест микрофона", "error");
      }
    },
    stop() {
      this.active = false;
      this.stopMeter();
      if (!settings.enableLoopback && !State.isInConversation)
        AudioEngine.stopPreview();
      UI.updateMicTest(0, false);
    },
    stopMeter() {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = null;
      if (this.sourceNode)
        try {
          this.sourceNode.disconnect();
        } catch (e) {}
      if (this.analyser)
        try {
          this.analyser.disconnect();
        } catch (e) {}
      this.sourceNode = null;
      this.analyser = null;
    },
    loop() {
      if (!this.active || !this.analyser) return;
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);
      const avg =
        data.reduce((sum, value) => sum + value, 0) / (data.length || 1);
      UI.updateMicTest(Math.min(100, Math.round((avg / 128) * 100)), true);
      this.rafId = requestAnimationFrame(() => this.loop());
    },
  };

  const Onboarding = {
    maybeShow() {
      if (settings.onboardingDone) return;
      this.show();
    },
    show() {
      if (document.getElementById("an-onboarding")) return;
      const overlay = document.createElement("div");
      overlay.id = "an-onboarding";
      overlay.style.cssText =
        "position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10002;display:flex;align-items:center;justify-content:center;padding:20px;";
      overlay.innerHTML = `
                <div style="width:min(420px,100%);background:#111418;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:18px;color:#e6edf3;box-shadow:0 18px 40px rgba(0,0,0,0.4)">
                    <div style="font-size:18px;font-weight:700;margin-bottom:8px">Быстрая настройка</div>
                    <div style="font-size:13px;color:#9da7b3;line-height:1.5;margin-bottom:14px">Выберите стартовый профиль. Его можно потом изменить в панели.</div>
                    <div style="display:grid;gap:8px">
                        <button data-preset="balanced" class="an-reset-btn" style="margin-top:0">Обычный старт</button>
                        <button data-preset="softMic" class="an-reset-btn" style="margin-top:0">Мягкий микрофон</button>
                        <button data-preset="fast" class="an-reset-btn" style="margin-top:0">Быстрый авто-скип</button>
                        <button data-preset="private" class="an-reset-btn" style="margin-top:0">Приватный режим</button>
                        <button data-preset="skip" class="an-reset-btn" style="margin-top:0">Оставить как есть</button>
                    </div>
                </div>
            `;
      overlay.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-preset]");
        if (!btn) return;
        const preset = btn.dataset.preset;
        if (preset !== "skip") Profiles.applyPreset(preset);
        settings.onboardingDone = true;
        Settings.save();
        UI.refreshBasic?.();
        overlay.remove();
      });
      document.body.appendChild(overlay);
    },
  };

  const ConfirmDialog = {
    activeOverlay: null,
    showDanger({
      message,
      confirmText = "Да",
      cancelText = "Отмена",
      onConfirm,
      onCancel,
    }) {
      if (this.activeOverlay) this.activeOverlay.remove();
      const overlay = document.createElement("div");
      overlay.className = "an-confirm-overlay";
      overlay.innerHTML = `
        <div class="an-confirm-dialog an-confirm-dialog-danger" role="dialog" aria-modal="true" aria-labelledby="an-confirm-title">
          <div id="an-confirm-title" class="an-confirm-title">${message}</div>
          <div class="an-confirm-actions">
            <button type="button" class="an-reset-btn" data-action="cancel">${cancelText}</button>
            <button type="button" class="an-reset-btn danger" data-action="confirm">${confirmText}</button>
          </div>
        </div>
      `;
      const close = (confirmed) => {
        if (this.activeOverlay === overlay) this.activeOverlay = null;
        overlay.remove();
        if (confirmed) onConfirm?.();
        else onCancel?.();
      };
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close(false);
      });
      overlay
        .querySelector('[data-action="cancel"]')
        .addEventListener("click", () => close(false));
      overlay
        .querySelector('[data-action="confirm"]')
        .addEventListener("click", () => close(true));
      this.activeOverlay = overlay;
      document.body.appendChild(overlay);
    },
  };

  // ==========================================
  // UI
  // ==========================================
  const UI = {
    root: null,
    btnMic: null,
    btnHead: null,
    btnDrisnya: null,
    statusEl: null,
    statusTextEl: null,
    statsEl: null,
    liveTimerEl: null,
    diagnosticsEl: null,
    eventLogEl: null,
    micMeterEl: null,
    micMeterTextEl: null,
    presetSelect: null,

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
                    <span class="an-status-text" id="an-status-text">Готов</span>
                    <span class="an-arrow">${ICONS.chevron}</span>
                </div>
            `;
      head.onclick = (e) => {
        if (this._wasDragged || e.target.closest(".an-status")) return;
        this.root.classList.toggle("an-minimized");
        settings.isCollapsed = this.root.classList.contains("an-minimized");
        Settings.save();
      };
      // Draggable
      this._wasDragged = false;
      head.addEventListener("mousedown", (e) => {
        if (e.target.closest(".an-status")) return;
        this._wasDragged = false;
        const startX = e.clientX,
          startY = e.clientY;
        const rect = this.root.getBoundingClientRect();
        const origLeft = rect.left,
          origTop = rect.top;
        const onMove = (me) => {
          const dx = me.clientX - startX,
            dy = me.clientY - startY;
          if (!this._wasDragged && (Math.abs(dx) > 5 || Math.abs(dy) > 5))
            this._wasDragged = true;
          if (this._wasDragged) {
            const maxX = window.innerWidth - this.root.offsetWidth;
            const maxY = window.innerHeight - this.root.offsetHeight;
            this.root.style.left =
              Math.max(0, Math.min(maxX, origLeft + dx)) + "px";
            this.root.style.top =
              Math.max(0, Math.min(maxY, origTop + dy)) + "px";
            this.root.style.right = "auto";
          }
        };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          if (this._wasDragged) {
            const rect = this.root.getBoundingClientRect();
            settings.panelPosition = {
              left: Math.round(rect.left),
              top: Math.round(rect.top),
            };
            Settings.save();
          }
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
      this.statusEl = head.querySelector("#an-status");
      this.statusTextEl = head.querySelector("#an-status-text");

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
      this.btnMic = this.createButton(
        ICONS.mic,
        "Мик",
        () => State.setMicMuted(!State.isMicMuted),
        "mic",
      );
      this.btnHead = this.createButton(
        ICONS.headphones,
        "Звук",
        () => State.setHeadphonesMuted(!State.isHeadphonesMuted),
        "head",
      );
      const btnSkip = this.createButton(ICONS.skip, "Скип", () =>
        Actions.skip("manual"),
      );
      const btnSearch = this.createButton(ICONS.search, "Поиск", () =>
        Actions.clickSearch(),
      );
      controls.append(this.btnMic, this.btnHead, btnSkip, btnSearch);
      body.appendChild(controls);

      const presetRow = document.createElement("div");
      presetRow.className = "an-row";
      presetRow.title = "Готовые пресеты настроек";
      presetRow.innerHTML = "<span>Профиль</span>";
      this.presetSelect = document.createElement("select");
      this.presetSelect.className = "an-select";
      [
        ["custom", "Свои"],
        ["balanced", "Обычный"],
        ["softMic", "Мягкий микрофон"],
        ["fast", "Быстрый"],
        ["private", "Приватный"],
      ].forEach(([value, label]) => {
        const o = document.createElement("option");
        o.value = value;
        o.textContent = label;
        if ((settings.selectedPreset || "custom") === value) o.selected = true;
        this.presetSelect.appendChild(o);
      });
      this.presetSelect.onchange = (e) => {
        if (e.target.value !== "custom") {
          Profiles.applyPreset(e.target.value);
          this.refreshBasic();
          Toast.show(
            `Профиль: ${e.target.selectedOptions[0].textContent}`,
            "success",
          );
        }
      };
      presetRow.appendChild(this.presetSelect);
      body.appendChild(presetRow);
      const hotkeyHint = document.createElement("div");
      hotkeyHint.className = "an-help";
      hotkeyHint.textContent =
        "M микрофон, H звук, S скип, A авто-режим, Space поиск";
      body.appendChild(hotkeyHint);

      body.appendChild(this.createDivider("Основное"));
      this.renderToggle(body, "Авторежим", "autoMode", State.isAutoMode, (v) =>
        State.setAutoMode(v),
      );
      this.renderToggle(
        body,
        "Звуки",
        "soundsEnabled",
        settings.soundsEnabled,
        (v) => {
          settings.soundsEnabled = v;
          Settings.save();
          Sounds.syncEnabledState();
        },
      );
      this.renderToggle(
        body,
        "Горячие клавиши",
        "hotkeysEnabled",
        settings.hotkeysEnabled,
        (v) => {
          settings.hotkeysEnabled = v;
          Settings.save();
        },
      );
      // Авто-скип: скипает собеседника после N секунд разговора
      const asRow = document.createElement("div");
      asRow.className = "an-row";
      asRow.title =
        "Автоматически скипает собеседника через указанное количество времени разговора. 0 = выключено.";
      const fmtSkip = (v) =>
        v === 0
          ? "Выкл"
          : v >= 60
            ? Math.floor(v / 60) + "м" + (v % 60 ? " " + (v % 60) + "с" : "")
            : v + "с";
      asRow.innerHTML = `<span>Авто-скип <span style="font-size:10px;color:#484f58">→ скип через</span></span><span id="an-autoskip-val" style="font-size:11px;color:#58a6ff">${fmtSkip(settings.autoSkipAfter)}</span>`;
      body.appendChild(asRow);
      body.appendChild(
        this.createRange(0, 3600, 30, settings.autoSkipAfter, (v) => {
          settings.autoSkipAfter = v;
          Settings.save();
          document.getElementById("an-autoskip-val").textContent = fmtSkip(v);
        }),
      );
      const micTestBlock = document.createElement("div");
      micTestBlock.className = "an-panel";
      micTestBlock.innerHTML = `
                <div class="an-row" style="margin-bottom:6px">
                    <span>Проверка микрофона</span>
                    <button id="an-mic-test-btn" class="an-inline-btn">Старт</button>
                </div>
                <div class="an-meter"><div id="an-mic-meter-fill" class="an-meter-fill"></div></div>
                <div id="an-mic-meter-text" class="an-help">Сигнал не проверяется</div>
            `;
      body.appendChild(micTestBlock);
      this.micMeterEl = micTestBlock.querySelector("#an-mic-meter-fill");
      this.micMeterTextEl = micTestBlock.querySelector("#an-mic-meter-text");
      micTestBlock.querySelector("#an-mic-test-btn").onclick = () => {
        if (MicTester.active) MicTester.stop();
        else MicTester.start();
      };

      body.appendChild(this.createDivider("Аудио"));
      this.renderToggle(
        body,
        "Самопрослушивание",
        "enableLoopback",
        settings.enableLoopback,
        (v) => {
          settings.enableLoopback = v;
          Settings.save();
          document.getElementById("sub-loopback")?.classList.toggle("open", v);
          if (v && !AudioEngine.activeStream) AudioEngine.startPreview();
          else {
            AudioEngine.rebuildChain();
            if (!v && !AudioEngine.activeStream) AudioEngine.stopPreview();
          }
        },
      );
      const loopSub = this.createSubPanel(
        "sub-loopback",
        settings.enableLoopback,
        "🔊 Громкость в ухо",
      );
      loopSub.appendChild(
        this.createRange(0, 2, 0.1, settings.gainValue, (v) => {
          settings.gainValue = v;
          Settings.save();
          AudioEngine.updateLiveParams();
        }),
      );
      body.appendChild(loopSub);

      // Усиление исходящего сигнала (то, что слышит собеседник)
      const mgRow = document.createElement("div");
      mgRow.className = "an-row";
      mgRow.innerHTML = `<span>🎙️ Усиление микрофона <span style="font-size:10px;color:#484f58">→ собеседнику</span></span><span id="an-micgain-val" style="font-size:11px;color:#58a6ff">${Math.round(settings.micGain * 100)}%</span>`;
      body.appendChild(mgRow);
      body.appendChild(
        this.createRange(0, 2, 0.05, settings.micGain, (v) => {
          settings.micGain = v;
          Settings.save();
          AudioEngine.updateLiveParams();
          document.getElementById("an-micgain-val").textContent =
            Math.round(v * 100) + "%";
        }),
      );

      this.renderToggle(
        body,
        "Студийный звук",
        "voiceEnhance",
        settings.voiceEnhance,
        (v) => {
          settings.voiceEnhance = v;
          Settings.save();
          AudioEngine.rebuildChain();
        },
      );
      this.renderToggle(
        body,
        "Изменение голоса",
        "voicePitch",
        settings.voicePitch,
        (v) => {
          settings.voicePitch = v;
          Settings.save();
          document.getElementById("sub-pitch")?.classList.toggle("open", v);
          // initWorklet() — async! rebuildChain только ПОСЛЕ загрузки воркла
          if (v)
            AudioEngine.initWorklet().then(() => AudioEngine.rebuildChain());
          else AudioEngine.rebuildChain();
        },
      );
      const pitchSub = this.createSubPanel(
        "sub-pitch",
        settings.voicePitch,
        "Тональность",
      );
      pitchSub.appendChild(
        this.createRange(0, 1, 0.05, settings.pitchLevel, (v) => {
          settings.pitchLevel = v;
          Settings.save();
          AudioEngine.updateLiveParams();
        }),
      );
      body.appendChild(pitchSub);

      this.renderToggle(
        body,
        "Шумоподавление",
        "noiseSuppression",
        settings.noiseSuppression,
        (v) => {
          settings.noiseSuppression = v;
          Settings.save();
        },
      );
      this.renderToggle(
        body,
        "Голос. управление",
        "voiceControl",
        settings.voiceControl,
        (v) => {
          settings.voiceControl = v;
          Settings.save();
          VoiceControl.toggle(v);
        },
      );
      const stopWordPanel = document.createElement("div");
      stopWordPanel.className = "an-panel";
      stopWordPanel.innerHTML = `
                <div class="an-help">Свое стоп-слово для голосовой остановки и скипа. Работает вместе со стандартными командами.</div>
                <input id="an-stop-word" class="an-input" type="text" maxlength="40" placeholder="Например: домой" value="${(settings.stopWord || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">
            `;
      body.appendChild(stopWordPanel);
      stopWordPanel
        .querySelector("#an-stop-word")
        .addEventListener("input", (e) => {
          settings.stopWord = e.target.value.trim();
          Settings.save();
        });

      // Лаги голоса
      this.renderToggle(
        body,
        "⚡ Лаги голоса",
        "lagEnabled",
        settings.lagEnabled,
        (v) => {
          settings.lagEnabled = v;
          Settings.save();
          document.getElementById("sub-lag")?.classList.toggle("open", v);
          if (v)
            AudioEngine.initWorklet().then(() => AudioEngine.rebuildChain());
          else AudioEngine.rebuildChain();
        },
      );
      const lagSub = this.createSubPanel(
        "sub-lag",
        settings.lagEnabled,
        "Интенсивность лагов",
      );
      const lagValSpan = document.createElement("span");
      lagValSpan.id = "an-lag-val";
      lagValSpan.style.cssText =
        "font-size:10px;color:#58a6ff;display:block;text-align:right;margin-bottom:4px";
      lagValSpan.textContent = Math.round(settings.lagIntensity * 100) + "%";
      lagSub.appendChild(lagValSpan);
      lagSub.appendChild(
        this.createRange(0, 1, 0.05, settings.lagIntensity, (v) => {
          settings.lagIntensity = v;
          Settings.save();
          AudioEngine.updateLiveParams();
          document.getElementById("an-lag-val").textContent =
            Math.round(v * 100) + "%";
        }),
      );
      body.appendChild(lagSub);

      // IP-чекер панель
      const ipBlock = document.createElement("div");
      ipBlock.className = "an-ip-block";
      ipBlock.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;opacity:0.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <span style="flex-shrink:0;color:#7d8590">Сервер:</span>
                <span id="an-ip-display"><span style="color:#484f58">—</span></span>
            `;
      body.appendChild(ipBlock);
      this.renderToggle(
        body,
        "IP-чекер",
        "enableIpChecker",
        settings.enableIpChecker,
        (v) => {
          settings.enableIpChecker = v;
          Settings.save();
          if (v) IPChecker.init();
          else IPChecker.disable();
        },
      );

      body.appendChild(this.createDivider("Вид"));
      this.renderToggle(
        body,
        "Анимация фона",
        "particlesEnabled",
        settings.particlesEnabled,
        (v) => {
          settings.particlesEnabled = v;
          Settings.save();
          Particles.toggle(v);
        },
      );

      const themeRow = document.createElement("div");
      themeRow.className = "an-row";
      themeRow.innerHTML = "<span>Тема</span>";
      const themeSel = document.createElement("select");
      themeSel.className = "an-select";
      Object.keys(THEMES).forEach((k) => {
        const o = document.createElement("option");
        o.value = k;
        o.textContent = k;
        if (k === settings.selectedTheme) o.selected = true;
        themeSel.appendChild(o);
      });
      themeSel.onchange = (e) => Themes.apply(e.target.value);
      themeRow.appendChild(themeSel);
      body.appendChild(themeRow);

      body.appendChild(this.createDivider("Стабильность"));
      this.diagnosticsEl = document.createElement("div");
      this.diagnosticsEl.className = "an-panel";
      body.appendChild(this.diagnosticsEl);

      body.appendChild(this.createDivider("История"));
      this.eventLogEl = document.createElement("div");
      this.eventLogEl.className = "an-panel";
      body.appendChild(this.eventLogEl);

      const actionsGrid = document.createElement("div");
      actionsGrid.className = "an-actions-grid";
      const resetAudioBtn = document.createElement("button");
      resetAudioBtn.className = "an-reset-btn";
      resetAudioBtn.textContent = "Сбросить аудио";
      resetAudioBtn.onclick = () => {
        Profiles.resetAudio();
        this.refreshBasic();
        Toast.show("Аудио-настройки сброшены", "info");
      };
      const resetStatsBtn = document.createElement("button");
      resetStatsBtn.className = "an-reset-btn";
      resetStatsBtn.textContent = "Сбросить статистику";
      resetStatsBtn.onclick = () => {
        Profiles.resetStats();
        this.refreshBasic();
        Toast.show("Статистика сброшена", "info");
      };
      const copyLogBtn = document.createElement("button");
      copyLogBtn.className = "an-reset-btn";
      copyLogBtn.textContent = "Копировать лог";
      copyLogBtn.onclick = () => EventLog.copy();
      actionsGrid.append(resetAudioBtn, resetStatsBtn, copyLogBtn);
      body.appendChild(actionsGrid);

      const resetBtn = document.createElement("button");
      resetBtn.className = "an-reset-btn";
      resetBtn.textContent = "Сбросить";
      resetBtn.onclick = () => {
        if (confirm("Сбросить настройки?")) {
          Settings.reset();
          location.reload();
        }
      };
      body.appendChild(resetBtn);

      this.btnDrisnya = document.createElement("button");
      this.btnDrisnya.id = "an-drisnya-btn";
      this.btnDrisnya.className = "an-reset-btn an-drisnya-btn";
      this.btnDrisnya.textContent = "drisnya_mode";
      this.btnDrisnya.onclick = () => {
        if (settings.drisnyaMode) {
          settings.drisnyaMode = false;
          Settings.save();
          DrisnyaMode.apply();
          DrisnyaPrank.stop();
          Sounds.stopLoop();
          Sounds.clearQueue(true);
          this.updateDrisnyaButton();
          Toast.show("drisnya_mode выкл", "info");
          return;
        }
        ConfirmDialog.showDanger({
          message: "Вы точно готовы?",
          confirmText: "Готов",
          cancelText: "Не сейчас",
          onConfirm: () => {
            settings.drisnyaMode = true;
            Settings.save();
            Themes.apply(settings.selectedTheme);
            this.updateDrisnyaButton();
            if (settings.soundsEnabled && Sounds.isUnlocked) {
              Sounds.clearQueue(true);
              Sounds.play("drisnyaEnable");
            }
            Sounds.syncDrisnyaLoop();
            DrisnyaPrank.sync();
            Toast.show("drisnya_mode вкл", "warning");
          },
        });
      };
      body.appendChild(this.btnDrisnya);

      this.root.append(head, body);
      document.body.appendChild(this.root);
      if (settings.panelPosition && window.innerWidth > 600) {
        this.root.style.left = `${settings.panelPosition.left}px`;
        this.root.style.top = `${settings.panelPosition.top}px`;
        this.root.style.right = "auto";
      }
      this.updateButtons();
      this.updateDrisnyaButton();
      this.refreshBasic();
    },

    injectStyles() {
      const css = `
                @keyframes anToastIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
                @keyframes anToastOut{from{opacity:1}to{opacity:0;transform:translateY(-10px)}}
                @keyframes anPulse{0%,100%{opacity:1}50%{opacity:0.4}}
                @keyframes anBlink{0%,100%{opacity:1}50%{opacity:0.3}}

                #an-root{position:fixed;top:20px;right:20px;z-index:10000;width:320px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:rgba(17,20,24,0.96);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:14px;color:#e6edf3;box-shadow:0 8px 32px rgba(0,0,0,0.4);font-size:13px;overflow:hidden}
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
                .an-status.warning{background:#d29922}
                .an-status.error{background:#f85149}
                .an-status-text{font-size:11px;color:#7d8590;max-width:110px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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

                .an-ip-block{font-size:11px;color:#7d8590;background:rgba(0,0,0,0.25);border:1px solid rgba(88,166,255,0.1);border-radius:8px;padding:8px 12px;margin-bottom:8px;display:flex;align-items:center;gap:8px;min-height:34px}
                #an-ip-display{display:flex;align-items:center;gap:6px;flex:1}
                .an-ip-addr{color:#58a6ff;font-family:monospace;font-size:12px;font-weight:600;letter-spacing:0.5px}
                .an-ip-geo{color:#7d8590;font-size:10px;margin-left:4px}

                .an-controls{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px}
                .an-btn{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#e6edf3;border-radius:10px;padding:10px 4px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;transition:all 0.15s;font-size:10px}
                .an-btn:hover{background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.12)}
                .an-btn:active{transform:scale(0.96)}
                .an-btn.danger{background:rgba(248,81,73,0.12);border-color:rgba(248,81,73,0.3);color:#f85149}
                .an-btn-icon{display:flex}

                .an-divider{display:flex;align-items:center;gap:8px;margin:12px 0 8px;color:#7d8590;font-size:10px;text-transform:uppercase;letter-spacing:0.5px}
                .an-divider::before,.an-divider::after{content:'';flex:1;height:1px;background:rgba(255,255,255,0.06)}

                .an-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
                .an-help{font-size:10px;color:#7d8590;line-height:1.4;margin:-2px 0 8px}
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

                .an-select,.an-input{background:rgba(0,0,0,0.3);color:#e6edf3;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);font-size:12px;box-sizing:border-box}
                .an-select{cursor:pointer;min-width:100px}
                .an-input{width:100%}
                .an-textarea{width:100%;min-height:64px;resize:vertical;background:rgba(0,0,0,0.3);color:#e6edf3;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);font-size:12px;box-sizing:border-box;margin-bottom:8px}
                .an-reset-btn{width:100%;margin-top:12px;padding:8px;background:transparent;border:1px solid rgba(255,255,255,0.08);color:#7d8590;border-radius:8px;cursor:pointer;font-size:11px;transition:all 0.2s}
                .an-reset-btn:hover{border-color:#f85149;color:#f85149}
                .an-reset-btn.danger{border-color:#f85149;color:#f85149;background:rgba(248,81,73,0.12)}
                .an-inline-btn{padding:6px 8px;background:transparent;border:1px solid rgba(255,255,255,0.08);color:#c9d1d9;border-radius:8px;cursor:pointer;font-size:11px}
                .an-panel{background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:10px;margin-bottom:8px}
                .an-meter{height:8px;background:rgba(255,255,255,0.08);border-radius:99px;overflow:hidden;margin-bottom:8px}
                .an-meter-fill{height:100%;width:0;background:linear-gradient(90deg,#238636,#58a6ff,#f85149);transition:width .08s linear}
                .an-log-item{font-size:11px;line-height:1.4;color:#c9d1d9;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)}
                .an-log-item:last-child{border-bottom:none}
                .an-actions-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
                .an-drisnya-btn{border-color:rgba(248,81,73,0.45);color:#ffd2cf;background:rgba(108,16,14,0.72);font-weight:700;letter-spacing:0.05em;text-transform:lowercase}
                .an-drisnya-btn:hover{border-color:#ff6f61;color:#fff;background:rgba(148,24,20,0.84)}
                .an-drisnya-btn.active{box-shadow:0 0 0 1px rgba(255,134,124,0.24),0 0 18px rgba(161,32,26,0.34);background:rgba(142,27,21,0.9);color:#fff0ee}
                .an-confirm-overlay{position:fixed;inset:0;z-index:10003;background:rgba(19,6,4,0.82);display:flex;align-items:center;justify-content:center;padding:20px}
                .an-confirm-dialog{width:min(360px,100%);border-radius:16px;padding:18px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 18px 40px rgba(0,0,0,0.4)}
                .an-confirm-dialog-danger{background:linear-gradient(180deg,rgba(46,12,9,0.98),rgba(24,8,7,0.98));border-color:rgba(248,81,73,0.24)}
                .an-confirm-title{font-size:20px;font-weight:800;color:#ffd7d4;text-align:center;margin-bottom:16px}
                .an-confirm-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
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

    createDivider(text) {
      const d = document.createElement("div");
      d.className = "an-divider";
      d.textContent = text;
      return d;
    },

    createSubPanel(id, isOpen, label) {
      const sub = document.createElement("div");
      sub.id = id;
      sub.className = `an-sub ${isOpen ? "open" : ""}`;
      if (label) {
        const l = document.createElement("div");
        l.className = "an-sub-label";
        l.textContent = label;
        sub.appendChild(l);
      }
      return sub;
    },

    createRange(min, max, step, value, onChange) {
      const r = document.createElement("input");
      r.type = "range";
      r.min = min;
      r.max = max;
      r.step = step;
      r.value = value;
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
      inp.type = "checkbox";
      inp.checked = initial;
      inp.id = `an-tog-${key}`;
      inp.onchange = (e) => onChange(e.target.checked);
      const sl = document.createElement("span");
      sl.className = "an-slider";
      lbl.append(inp, sl);
      row.appendChild(lbl);
      container.appendChild(row);
    },

    updateButtons() {
      if (this.btnMic) {
        this.btnMic.className = `an-btn ${State.isMicMuted ? "danger" : ""}`;
        this.btnMic.querySelector(".an-btn-icon").innerHTML = State.isMicMuted
          ? ICONS.micOff
          : ICONS.mic;
        this.btnMic.querySelector("span:last-child").textContent =
          State.isMicMuted ? "Выкл" : "Мик";
      }
      if (this.btnHead) {
        this.btnHead.className = `an-btn ${State.isHeadphonesMuted ? "danger" : ""}`;
        this.btnHead.querySelector(".an-btn-icon").innerHTML =
          State.isHeadphonesMuted ? ICONS.headphonesOff : ICONS.headphones;
        this.btnHead.querySelector("span:last-child").textContent =
          State.isHeadphonesMuted ? "Выкл" : "Звук";
      }
      this.updateDrisnyaButton();
    },

    updateDrisnyaButton() {
      if (!this.btnDrisnya) return;
      this.btnDrisnya.classList.toggle("active", Boolean(settings.drisnyaMode));
      this.btnDrisnya.title = settings.drisnyaMode
        ? "Режим активен"
        : "Включить drisnya_mode";
    },

    updateToggle(key, val) {
      const el = document.getElementById(`an-tog-${key}`);
      if (el) el.checked = val;
    },

    updateStatus(status, text = "") {
      if (this.statusTextEl)
        this.statusTextEl.textContent =
          text || (STATUS_META[status] || STATUS_META.idle).text;
      if (this.statusEl) {
        this.statusEl.className = `an-status ${status}`;
        this.statusEl.title =
          { idle: "Ожидание", searching: "Поиск...", talking: "Разговор" }[
            status
          ] || "";
      }
    },

    refreshStatusFromDiagnostics() {
      if (
        Diagnostics.issues.length &&
        !State.isInConversation &&
        !State.isSearching
      )
        this.updateStatus("warning", Diagnostics.getSummary());
      else
        this.updateStatus(
          State.isInConversation
            ? "talking"
            : State.isSearching
              ? "searching"
              : "idle",
        );
    },

    updateStats() {
      if (!this.statsEl) return;
      const liveTime = State.isInConversation ? State.currentSessionTime : 0;
      const sessionLabel =
        State.sessionCount > 0 ? `+${State.sessionCount}` : "";
      this.statsEl.innerHTML = `
                <div class="an-stat-item">
                    <span class="an-stat-value">${ICONS.chat} ${settings.conversationCount}<span style="font-size:10px;color:#3fb950;margin-left:2px">${sessionLabel}</span></span>
                    <span class="an-stat-label">Разговоры</span>
                </div>
                <div class="an-stat-item">
                    <span class="an-stat-value ${State.isInConversation ? "an-stat-live" : ""}" id="an-live-timer">${Utils.formatTime(liveTime)}</span>
                    <span class="an-stat-label">${State.isInConversation ? "Сейчас" : "Сессия: " + Utils.formatTime(State.sessionTalkTime)}</span>
                </div>
                <div class="an-stat-item">
                    <span class="an-stat-value">${ICONS.clock} ${Utils.formatTime(settings.totalTalkTime)}</span>
                    <span class="an-stat-label">Всего</span>
                </div>
            `;
      this.liveTimerEl = document.getElementById("an-live-timer");
    },

    updateLiveTimer() {
      if (this.liveTimerEl && State.isInConversation) {
        this.liveTimerEl.textContent = Utils.formatTime(
          State.currentSessionTime,
        );
        this.liveTimerEl.className = "an-stat-value an-stat-live";
      }
    },

    updateDiagnostics() {
      if (!this.diagnosticsEl) return;
      this.diagnosticsEl.innerHTML = Diagnostics.issues.length
        ? Diagnostics.issues
            .map((issue) => `<div class="an-help">${issue.message}</div>`)
            .join("")
        : '<div class="an-help" style="margin:0">Self-check: проблем не найдено</div>';
    },

    updateEventLog() {
      if (!this.eventLogEl) return;
      this.eventLogEl.innerHTML = EventLog.items.length
        ? EventLog.items
            .slice(0, 8)
            .map(
              (item) =>
                `<div class="an-log-item"><span style="color:#7d8590">${item.at}</span> ${item.message}</div>`,
            )
            .join("")
        : '<div class="an-help" style="margin:0">Пока нет событий</div>';
    },

    updateMicTest(value, active) {
      if (this.micMeterEl) this.micMeterEl.style.width = `${value}%`;
      if (this.micMeterTextEl)
        this.micMeterTextEl.textContent = active
          ? `Уровень сигнала: ${value}%`
          : "Сигнал не проверяется";
      const btn = document.getElementById("an-mic-test-btn");
      if (btn) btn.textContent = active ? "Стоп" : "Старт";
    },

    refreshBasic() {
      this.updateButtons();
      this.updateStats();
      this.updateDiagnostics();
      this.updateEventLog();
      this.updateDrisnyaButton();
      DrisnyaMode.apply();
      Sounds.syncDrisnyaLoop();
      if (this.presetSelect)
        this.presetSelect.value = settings.selectedPreset || "custom";
      if (
        Diagnostics.issues.length &&
        !State.isInConversation &&
        !State.isSearching
      )
        this.updateStatus("warning", Diagnostics.getSummary());
      else
        this.updateStatus(
          State.isInConversation
            ? "talking"
            : State.isSearching
              ? "searching"
              : "idle",
        );
    },
  };

  // ==========================================
  // ИНИЦИАЛИЗАЦИЯ
  // ==========================================
  function init() {
    Utils.log("Запуск...", "info");
    const restoredSettings = Settings.load();
    const initialVoiceSupport = BrowserSupport.getVoiceControlSupport();
    if (settings.voiceControl && !initialVoiceSupport.supported) {
      settings.voiceControl = false;
      Settings.save();
    }
    Sounds.init();
    if (settings.enableIpChecker) IPChecker.init();
    else IPChecker.disable();
    MediaHook.init();
    Hotkeys.init();

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        State.wasHidden = true;
        return;
      }

      if (!State.wasHidden) return;
      State.wasHidden = false;
      if (!State.didInitComplete) return;
      Sounds.play("welcomeBack");
    });

    const unlock = () => {
      AudioEngine.getContext();
      document.removeEventListener("click", unlock, true);
    };
    document.addEventListener("click", unlock, true);

    UI.create();
    Themes.apply(settings.selectedTheme);
    Particles.init();
    Observer.init();
    Diagnostics.runSelfCheck();
    UI.refreshBasic();
    Sounds.syncDrisnyaLoop();

    if (settings.voiceControl) VoiceControl.toggle(true);
    Onboarding.maybeShow();
    if (settings.drisnyaMode) {
      Sounds.clearQueue(true);
      Sounds.play("drisnyaEnable");
    } else {
      if (restoredSettings) Sounds.play("restoredConfig");
      Sounds.play("startupSuccess");
    }
    State.didInitComplete = true;

    Utils.log("Готов!", "success");
    Toast.show(`AutoNektome v${VERSION}`, "success");
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
