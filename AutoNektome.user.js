// ==UserScript==
// @name         PawycMe
// @namespace    http://tampermonkey.net/
// @version      4.15
// @description  Автоматический переход с настройками звука, голосовым управлением, улучшенной автогромкостью, изменением голоса и выбором тем для nekto.me audiochat
// @author       @pawyc
// @match        https://nekto.me/audiochat
// @grant        none
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/498724/AutoNektome.user.js
// @updateURL https://update.greasyfork.org/scripts/498724/AutoNektome.meta.js
// ==/UserScript==

(function () {
  "use strict";

  // ==========================================
  // КОНФИГУРАЦИЯ
  // ==========================================
  const CONFIG = {
    sounds: {
      start:
        "https://zvukogram.com/mp3/22/skype-sound-message-received-message-received.mp3",
      end: "https://www.myinstants.com/media/sounds/teleport1_Cw1ot9l.mp3",
      startVol: 0.4,
      endVol: 0.3,
    },
    autoVol: { target: 50, interval: 200, smoothing: 0.8 },
    themes: {
      Original: null,
      "GitHub Dark":
        "https://raw.githubusercontent.com/pawyc/AutoNektomeV2/main/githubdark.css",
    },
    voiceCommands: {
      skip: ["скип", "skip", "скиф", "далее", "некст"],
      stop: ["завершить", "остановить", "закончить", "стоп"],
      start: [
        "чат",
        "старт",
        "поехали",
        "начни",
        "начать",
        "поиск",
        "ищи",
        "найди",
      ],
    },
  };

  const settings = {
    enableLoopback: false,
    gainValue: 1.0,
    voicePitch: false,
    pitchLevel: 0.5,
    voiceEnhance: false, // Выключено по умолчанию для надежности
    noiseSuppression: true,
    autoVolume: true,
    voiceControl: false,
    conversationCount: 0,
    selectedTheme: "Original",
    isCollapsed: false,
    ...JSON.parse(localStorage.getItem("AutoNektomeSettings") || "{}"),
  };

  let isAutoModeEnabled = false;

  function saveSettings() {
    const toSave = { ...settings };
    delete toSave.isAutoModeEnabled;
    localStorage.setItem("AutoNektomeSettings", JSON.stringify(toSave));
  }

  // ==========================================
  // AUDIO ENGINE (Robust & Preview)
  // ==========================================
  const AudioEngine = {
    ctx: null,
    workletLoaded: false,

    // Потоки
    micSource: null,
    previewStream: null, // Стрим для предпрослушивания (до звонка)
    outputNode: null,
    stableDest: null,
    loopGain: null,
    pitchNode: null,

    async getContext() {
      if (!this.ctx) {
        const AudioContextClass =
          window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) this.ctx = new AudioContextClass();
      }
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return this.ctx;
    },

    // Запуск предпрослушивания (когда сайт еще не попросил микрофон)
    async startPreview() {
      try {
        // Останавливаем старый, если был
        this.stopPreview();

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: settings.noiseSuppression,
          },
        });
        this.previewStream = stream;
        await this.updateChain(stream);
      } catch (e) {
        console.error("Preview failed:", e);
      }
    },

    stopPreview() {
      if (this.previewStream) {
        this.previewStream.getTracks().forEach((t) => t.stop());
        this.previewStream = null;
      }
    },

    async initWorklet() {
      if (this.workletLoaded) return;
      const ctx = await this.getContext();
      if (!ctx) return;

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
        const blob = new Blob([workletCode], {
          type: "application/javascript",
        });
        await ctx.audioWorklet.addModule(URL.createObjectURL(blob));
        this.workletLoaded = true;
      } catch (e) {
        console.error(e);
      }
    },

    async getStableStream() {
      const ctx = await this.getContext();
      if (!this.stableDest && ctx) {
        this.stableDest = ctx.createMediaStreamDestination();
      }
      return this.stableDest ? this.stableDest.stream : null;
    },

    // Основная функция сборки графа
    async updateChain(stream) {
      const ctx = await this.getContext();
      if (!ctx) return;
      if (!this.stableDest) await this.getStableStream();

      // Отключаем старые узлы
      try {
        if (this.micSource) this.micSource.disconnect();
        if (this.loopGain) this.loopGain.disconnect();
      } catch (e) {}

      this.micSource = ctx.createMediaStreamSource(stream);
      let current = this.micSource;

      // --- ЭФФЕКТЫ ---

      // 1. Студийный звук
      if (settings.voiceEnhance) {
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 85;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -24;
        comp.knee.value = 30;
        comp.ratio.value = 12;
        comp.attack.value = 0.003;
        comp.release.value = 0.25;

        current.connect(hp);
        hp.connect(comp);
        current = comp;
      }

      // 2. Питч
      if (settings.voicePitch) {
        await this.initWorklet();
        if (this.workletLoaded) {
          const pitchNode = new AudioWorkletNode(ctx, "pitch-shift-processor");
          pitchNode.port.postMessage(settings.pitchLevel + 0.5);
          current.connect(pitchNode);
          current = pitchNode;
          this.pitchNode = pitchNode;
        }
      }

      // 3. Вывод на сайт (в stableDest)
      current.connect(this.stableDest);

      // 4. Самопрослушивание (Прямо в destination)
      if (settings.enableLoopback) {
        this.loopGain = ctx.createGain();
        this.loopGain.gain.value = settings.gainValue;

        current.connect(this.loopGain);
        this.loopGain.connect(ctx.destination);
      }
    },

    updateLiveParams() {
      if (this.pitchNode)
        this.pitchNode.port.postMessage(settings.pitchLevel + 0.5);
      if (this.loopGain) this.loopGain.gain.value = settings.gainValue;
    },
  };

  // ==========================================
  // GLOBAL UNLOCK
  // ==========================================
  document.addEventListener(
    "click",
    () => {
      if (AudioEngine.ctx && AudioEngine.ctx.state === "suspended")
        AudioEngine.ctx.resume();
    },
    { once: false, capture: true },
  );

  // ==========================================
  // UI
  // ==========================================
  function createUI() {
    if (document.getElementById("an-ui")) return;

    const css = `
            #an-ui {
                position: fixed; top: 20px; right: 20px; z-index: 999999;
                background: rgba(13, 17, 23, 0.9); backdrop-filter: blur(12px);
                border: 1px solid rgba(88, 166, 255, 0.2); border-radius: 12px;
                width: 270px; color: #c9d1d9; font-family: system-ui, sans-serif;
                box-shadow: 0 4px 25px rgba(0,0,0,0.6); overflow: hidden;
            }
            .an-header {
                padding: 12px 15px; background: rgba(255,255,255,0.05);
                display: flex; justify-content: space-between; align-items: center;
                cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05);
            }
            .an-title { font-size: 13px; font-weight: 700; color: #58a6ff; text-transform: uppercase; }
            .an-arrow { transition: transform 0.3s; color: #8b949e; }
            .an-minimized .an-arrow { transform: rotate(-90deg); }
            .an-content { padding: 15px; max-height: 80vh; overflow-y: auto; }
            .an-minimized .an-content { display: none; }
            .an-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
            .an-btn-group { display: flex; gap: 10px; justify-content: center; margin-bottom: 15px; }
            .an-icon-btn {
                width: 44px; height: 44px; border-radius: 12px;
                border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05);
                color: #c9d1d9; cursor: pointer; font-size: 20px; display: flex; justify-content: center; align-items: center;
                transition: 0.2s;
            }
            .an-icon-btn.muted { background: rgba(248, 81, 73, 0.2); border-color: #f85149; }
            .an-toggle { position: relative; width: 32px; height: 18px; }
            .an-toggle input { opacity: 0; width: 0; height: 0; }
            .an-slider { position: absolute; cursor: pointer; top:0; left:0; right:0; bottom:0; background: #30363d; border-radius: 18px; transition: .3s; }
            .an-slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 2px; bottom: 2px; background: white; border-radius: 50%; transition: .3s; }
            input:checked + .an-slider { background: #238636; }
            input:checked + .an-slider:before { transform: translateX(14px); }
            .an-label { font-size: 13px; }
            .an-sub { background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; margin-bottom: 10px; border: 1px solid rgba(255,255,255,0.05); }
            .an-range { width: 100%; height: 4px; background: #30363d; border-radius: 2px; appearance: none; outline: none; }
            .an-range::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; background: #58a6ff; border-radius: 50%; cursor: pointer; border: 2px solid #0d1117; }
            .an-select { width: 100%; background: #161b22; color: #c9d1d9; border: 1px solid #30363d; padding: 6px; border-radius: 6px; font-size: 13px; }
        `;

    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    const ui = document.createElement("div");
    ui.id = "an-ui";
    if (settings.isCollapsed) ui.classList.add("an-minimized");

    const header = document.createElement("div");
    header.className = "an-header";
    header.innerHTML = `<span class="an-title">AutoNektome v4.14</span><span class="an-arrow">▼</span>`;
    header.onclick = () => {
      ui.classList.toggle("an-minimized");
      settings.isCollapsed = ui.classList.contains("an-minimized");
      saveSettings();
    };
    ui.append(header);

    const content = document.createElement("div");
    content.className = "an-content";

    const btnGroup = document.createElement("div");
    btnGroup.className = "an-btn-group";
    const micBtn = document.createElement("button");
    micBtn.className = "an-icon-btn";
    micBtn.innerHTML = "🎤";
    micBtn.onclick = () => {
      isMicMuted = !isMicMuted;
      updateBtns();
      toggleMicState();
    };
    const headBtn = document.createElement("button");
    headBtn.className = "an-icon-btn";
    headBtn.innerHTML = "🎧";
    headBtn.onclick = () => {
      isHeadphonesMuted = !isHeadphonesMuted;
      updateBtns();
      toggleHeadState();
    };
    function updateBtns() {
      micBtn.className = `an-icon-btn ${isMicMuted ? "muted" : ""}`;
      headBtn.className = `an-icon-btn ${isHeadphonesMuted ? "muted" : ""}`;
    }
    btnGroup.append(micBtn, headBtn);
    content.append(btnGroup);

    function addToggle(label, key, cb) {
      const row = document.createElement("div");
      row.className = "an-row";
      row.innerHTML = `<span class="an-label">${label}</span>`;
      const tog = document.createElement("label");
      tog.className = "an-toggle";
      const inp = document.createElement("input");
      inp.type = "checkbox";
      inp.checked = key === "autoMode" ? isAutoModeEnabled : settings[key];
      inp.onchange = (e) => {
        if (key === "autoMode") isAutoModeEnabled = e.target.checked;
        else {
          settings[key] = e.target.checked;
          saveSettings();
        }
        if (cb) cb(e.target.checked);
      };
      tog.append(inp, document.createElement("span"));
      tog.lastChild.className = "an-slider";
      row.append(tog);
      content.append(row);
      return row;
    }

    addToggle("Авторежим", "autoMode");
    addToggle("Самопрослушивание", "enableLoopback", (v) => {
      // ЛОГИКА PREVIEW
      if (v) {
        // Если звонок не идет, включаем превью микрофона
        if (!globalMicStreamOrig) AudioEngine.startPreview();
        else AudioEngine.updateChain(globalMicStreamOrig); // Если идет, обновляем текущий
      } else {
        AudioEngine.stopPreview(); // Выключаем превью
        AudioEngine.updateChain(globalMicStreamOrig); // Обновляем текущий (убираем лупбэк)
      }
      lbSub.style.display = v ? "block" : "none";
    });

    const lbSub = document.createElement("div");
    lbSub.className = "an-sub";
    lbSub.style.display = settings.enableLoopback ? "block" : "none";
    lbSub.innerHTML = `<div style="font-size:11px; margin-bottom:5px; color:#8b949e;">Громкость</div>`;
    const lbRange = document.createElement("input");
    lbRange.type = "range";
    lbRange.className = "an-range";
    lbRange.min = 0.0;
    lbRange.max = 1.0;
    lbRange.step = 0.05;
    lbRange.value = settings.gainValue > 1 ? 1 : settings.gainValue;
    lbRange.oninput = (e) => {
      settings.gainValue = parseFloat(e.target.value);
      saveSettings();
      AudioEngine.updateLiveParams();
    };
    lbSub.append(lbRange);
    content.append(lbSub);

    addToggle("Студийный звук", "voiceEnhance", () => refreshAudio());
    addToggle("Изменение голоса", "voicePitch", (v) => {
      refreshAudio();
      pSub.style.display = v ? "block" : "none";
    });
    const pSub = document.createElement("div");
    pSub.className = "an-sub";
    pSub.style.display = settings.voicePitch ? "block" : "none";
    pSub.innerHTML = `<div style="font-size:11px; margin-bottom:5px; color:#8b949e;">Тон (ниже - влево)</div>`;
    const pRange = document.createElement("input");
    pRange.type = "range";
    pRange.className = "an-range";
    pRange.min = 0;
    pRange.max = 1;
    pRange.step = 0.01;
    pRange.value = settings.pitchLevel;
    pRange.oninput = (e) => {
      settings.pitchLevel = parseFloat(e.target.value);
      saveSettings();
      AudioEngine.updateLiveParams();
    };
    pSub.append(pRange);
    content.append(pSub);

    addToggle("Шумоподавление", "noiseSuppression", (enabled) =>
      updateMicConstraints(enabled),
    );
    addToggle("Автогромкость чата", "autoVolume");
    addToggle("Голосовое управление", "voiceControl", (v) => {
      if (v) {
        if (!recognition) initSpeech();
        if (recognition) recognition.start();
      } else if (recognition) recognition.stop();
    });

    const tRow = document.createElement("div");
    tRow.className = "an-row";
    const sel = document.createElement("select");
    sel.className = "an-select";
    for (let k in CONFIG.themes) {
      let o = document.createElement("option");
      o.value = k;
      o.textContent = k;
      if (k === settings.selectedTheme) o.selected = true;
      sel.append(o);
    }
    sel.onchange = (e) => applyTheme(e.target.value);
    tRow.append(sel);
    content.append(tRow);

    ui.append(content);
    document.body.append(ui);
    updateBtns();
  }

  function refreshAudio() {
    if (globalMicStreamOrig) AudioEngine.updateChain(globalMicStreamOrig);
    else if (settings.enableLoopback) AudioEngine.startPreview(); // Если просто тестим
  }

  async function updateMicConstraints(enableNS) {
    if (globalMicStreamOrig) {
      const track = globalMicStreamOrig.getAudioTracks()[0];
      if (track) {
        try {
          await track.applyConstraints({
            noiseSuppression: enableNS,
            echoCancellation: false,
            autoGainControl: false,
          });
        } catch (e) {
          console.error(e);
        }
      }
    }
  }

  // ==========================================
  // SYSTEM
  // ==========================================
  let isMicMuted = false;
  let isHeadphonesMuted = false;
  let globalMicStreamOrig = null;
  let recognition = null;
  let conversationTimer = null;
  let currentThemeStyle = null;

  const soundStart = new Audio(CONFIG.sounds.start);
  soundStart.volume = CONFIG.sounds.startVol;
  const soundEnd = new Audio(CONFIG.sounds.end);
  soundEnd.volume = CONFIG.sounds.endVol;

  function applyTheme(name) {
    document.documentElement.style.background = "#0d1117";
    document.body.style.background = "#0d1117";
    if (currentThemeStyle) currentThemeStyle.remove();
    if (name !== "Original" && CONFIG.themes[name]) {
      const link = document.createElement("style");
      fetch(CONFIG.themes[name])
        .then((r) => r.text())
        .then((css) => {
          link.textContent = css;
          document.head.append(link);
          currentThemeStyle = link;
          document.body.classList.add("night_theme");
        });
    } else if (name === "Original") {
      document.body.classList.remove("night_theme");
      document.body.style.background = "";
      document.documentElement.style.background = "";
    }
    settings.selectedTheme = name;
    saveSettings();
  }

  // ХУК НА МИКРОФОН
  const origGUM = navigator.mediaDevices.getUserMedia.bind(
    navigator.mediaDevices,
  );
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    // Останавливаем превью, если оно было включено
    AudioEngine.stopPreview();

    if (constraints?.audio) {
      constraints.audio = {
        ...constraints.audio,
        autoGainControl: false,
        noiseSuppression: settings.noiseSuppression,
        echoCancellation: false,
      };
    }
    try {
      const stream = await origGUM(constraints);
      globalMicStreamOrig = stream;

      // BYPASS LOGIC: Если эффекты выключены, отдаем оригинал (Защита от тишины)
      if (!settings.voicePitch && !settings.voiceEnhance) {
        // Если нужен лупбэк, подключаем его параллельно
        if (settings.enableLoopback) AudioEngine.updateChain(stream);
        return stream;
      }

      // Если эффекты включены, обрабатываем
      await AudioEngine.updateChain(stream);
      const stable = await AudioEngine.getStableStream();
      if (isMicMuted) toggleMicState();
      return stable;
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  function toggleMicState() {
    if (globalMicStreamOrig)
      globalMicStreamOrig
        .getAudioTracks()
        .forEach((t) => (t.enabled = !isMicMuted));
  }

  function toggleHeadState() {
    const audio = document.querySelector("audio#audioStream");
    if (audio) audio.muted = isHeadphonesMuted;
    if (isHeadphonesMuted && !isMicMuted) {
      isMicMuted = true;
      toggleMicState();
    }
  }

  let obsTimer;
  const observer = new MutationObserver(() => {
    if (obsTimer) clearTimeout(obsTimer);
    obsTimer = setTimeout(() => {
      if (isAutoModeEnabled) clickSearch();
      const audio = document.querySelector("audio#audioStream");
      if (audio && !audio.dataset.inited) {
        audio.dataset.inited = "true";
        if (audio.srcObject) startAutoVolume(audio.srcObject);
      }
      const timer = document.querySelector(".callScreen__time, .timer-label");
      if (timer && timer.textContent === "00:00" && !conversationTimer) {
        soundStart.play().catch(() => {});
        conversationTimer = true;
      } else if (!timer && conversationTimer) {
        soundEnd.play().catch(() => {});
        conversationTimer = null;
        settings.conversationCount++;
        saveSettings();
      }
    }, 150);
  });

  function clickSearch() {
    const btn =
      document.getElementById("searchCompanyBtn") ||
      document.querySelector(
        "button.callScreen__findBtn, button.go-scan-button, .scan-button",
      );
    if (btn && btn.offsetParent) btn.click();
  }

  function initSpeech() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = "ru-RU";
    recognition.onresult = (e) => {
      const t = e.results[e.results.length - 1][0].transcript.toLowerCase();
      if (CONFIG.voiceCommands.skip.some((w) => t.includes(w))) skip();
      if (CONFIG.voiceCommands.stop.some((w) => t.includes(w))) {
        isAutoModeEnabled = false;
        skip();
      }
      if (CONFIG.voiceCommands.start.some((w) => t.includes(w))) {
        isAutoModeEnabled = true;
        clickSearch();
      }
    };
    recognition.onend = () => {
      if (settings.voiceControl) recognition.start();
    };
  }

  function skip() {
    const btn = document.querySelector(
      "button.callScreen__cancelCallBtn, button.stop-talk-button",
    );
    if (btn) {
      btn.click();
      setTimeout(() => {
        const confirm = document.querySelector("button.swal2-confirm");
        if (confirm) confirm.click();
      }, 300);
    }
  }

  function initParticles() {
    const c = document.createElement("canvas");
    c.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;pointer-events:none;opacity:0;transition:opacity 2s;";
    document.body.prepend(c);
    setTimeout(() => (c.style.opacity = "1"), 100);
    const ctx = c.getContext("2d");
    let w,
      h,
      parts = [];
    const resize = () => {
      w = c.width = window.innerWidth;
      h = c.height = window.innerHeight;
    };
    window.onresize = resize;
    resize();
    class P {
      constructor() {
        this.x = Math.random() * w;
        this.y = Math.random() * h;
        this.vx = (Math.random() - 0.5) * 0.2;
        this.vy = (Math.random() - 0.5) * 0.2;
      }
      up() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0 || this.x > w) this.vx *= -1;
        if (this.y < 0 || this.y > h) this.vy *= -1;
      }
      dr() {
        ctx.fillStyle = "rgba(88,166,255,0.4)";
        ctx.beginPath();
        ctx.arc(this.x, this.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (let i = 0; i < 70; i++) parts.push(new P());
    function loop() {
      ctx.clearRect(0, 0, w, h);
      parts.forEach((p, i) => {
        p.up();
        p.dr();
        for (let j = i; j < parts.length; j++) {
          let dx = p.x - parts[j].x,
            dy = p.y - parts[j].y,
            d = Math.sqrt(dx * dx + dy * dy);
          if (d < 130) {
            ctx.strokeStyle = `rgba(88,166,255,${0.15 * (1 - d / 130)})`;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(parts[j].x, parts[j].y);
            ctx.stroke();
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
    observer.observe(document.body, { childList: true, subtree: true });
    if (settings.voiceControl) {
      initSpeech();
      if (recognition) recognition.start();
    }
    const origPlay = HTMLAudioElement.prototype.play;
    HTMLAudioElement.prototype.play = function () {
      if (this.src?.includes("connect.mp3")) return Promise.resolve();
      return origPlay.apply(this, arguments);
    };
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
