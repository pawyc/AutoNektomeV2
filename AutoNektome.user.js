// ==UserScript==
// @name         AutoPawycMe
// @namespace    http://tampermonkey.net/
// @version      4.4
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
  // КОНФИГУРАЦИЯ И КОНСТАНТЫ
  // ==========================================
  const CONFIG = {
    sounds: {
      start:
        "https://zvukogram.com/mp3/22/skype-sound-message-received-message-received.mp3",
      end: "https://www.myinstants.com/media/sounds/teleport1_Cw1ot9l.mp3",
      startVol: 0.4,
      endVol: 0.3,
    },
    autoVol: {
      target: 50,
      interval: 200,
      smoothing: 0.8, // Коэффициент сглаживания (0-1)
    },
    themes: {
      Original: null,
      "GitHub Dark":
        "https://raw.githubusercontent.com/pawyc/AutoNektomeV2/main/githubdark.css",
    },
    voiceCommands: {
      skip: ["скип", "skip", "скиф", "скипнуть", "кефир"],
      stop: ["завершить", "остановить", "закончить", "кумыс"],
      start: ["чат", "старт", "поехали"],
    },
  };

  // Настройки (State)
  const settings = {
    enableLoopback: false,
    gainValue: 1.5,
    voicePitch: false,
    pitchLevel: 0,
    autoGainControl: false,
    noiseSuppression: true,
    echoCancellation: false,
    autoVolume: true,
    voiceControl: false,
    conversationCount: 0,
    selectedTheme: "Original",
    // Загрузка
    ...JSON.parse(localStorage.getItem("AutoNektomeSettings") || "{}"),
  };

  function saveSettings() {
    localStorage.setItem("AutoNektomeSettings", JSON.stringify(settings));
  }

  // ==========================================
  // AUDIO ENGINE (SINGLETON)
  // ==========================================
  const AudioEngine = {
    ctx: null,
    workletLoaded: false,
    pitchNode: null,
    gainNode: null,
    analyser: null,
    micSource: null,

    // Получение или создание контекста (ОДИН НА ВЕСЬ СКРИПТ)
    async getContext() {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.ctx.state === "suspended") {
        await this.ctx.resume();
      }
      return this.ctx;
    },

    // Инициализация Worklet (один раз)
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
      const blob = new Blob([workletCode], { type: "application/javascript" });
      await ctx.audioWorklet.addModule(URL.createObjectURL(blob));
      this.workletLoaded = true;
    },

    // Обработка микрофона
    async processMicrophone(stream) {
      const ctx = await this.getContext();

      // Очистка старых узлов
      if (this.micSource) this.micSource.disconnect();

      this.micSource = ctx.createMediaStreamSource(stream);
      let outputNode = this.micSource;

      // 1. Pitch Shift
      if (settings.voicePitch && settings.pitchLevel > 0) {
        await this.initWorklet();
        this.pitchNode = new AudioWorkletNode(ctx, "pitch-shift-processor");
        this.pitchNode.port.postMessage(1.0 - settings.pitchLevel);

        // Фильтр для сглаживания
        const filter = ctx.createBiquadFilter();
        filter.type = "lowshelf";
        filter.frequency.value = 300;
        filter.gain.value = 5;

        this.micSource.connect(this.pitchNode);
        this.pitchNode.connect(filter);
        outputNode = filter;
      }

      // 2. Loopback (Самопрослушивание)
      if (settings.enableLoopback) {
        if (this.gainNode) this.gainNode.disconnect();
        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = settings.gainValue;
        outputNode.connect(this.gainNode);
        this.gainNode.connect(ctx.destination);
      } else if (this.gainNode) {
        this.gainNode.disconnect(); // Отключаем, если выключено
      }

      // 3. Вывод в стрим (для сайта)
      const destination = ctx.createMediaStreamDestination();
      outputNode.connect(destination);
      return destination.stream;
    },

    // Обновление параметров без пересоздания графа
    updateParams() {
      if (this.gainNode) this.gainNode.gain.value = settings.gainValue;
      if (this.pitchNode)
        this.pitchNode.port.postMessage(1.0 - settings.pitchLevel);
    },
  };

  // ==========================================
  // ЛОГИКА АВТОГРОМКОСТИ (SMOOTH)
  // ==========================================
  let autoVolInterval = null;

  function startAutoVolume(stream) {
    if (!settings.autoVolume || !stream) return;

    // Используем ТОТ ЖЕ глобальный контекст
    AudioEngine.getContext().then((ctx) => {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const audioEl = document.querySelector("audio#audioStream");
      let smoothVol = CONFIG.autoVol.target;

      if (autoVolInterval) clearInterval(autoVolInterval);

      autoVolInterval = setInterval(() => {
        if (!settings.autoVolume || !audioEl) return;

        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const currentVol = Math.min(1, rms * 10) * 100;

        // Экспоненциальное сглаживание
        smoothVol =
          smoothVol * CONFIG.autoVol.smoothing +
          currentVol * (1 - CONFIG.autoVol.smoothing);

        // Логика понижения громкости
        if (smoothVol > CONFIG.autoVol.target + 15) {
          if (audioEl.volume > 0.2) audioEl.volume -= 0.02; // Плавно снижаем
        } else if (smoothVol < CONFIG.autoVol.target - 10) {
          // if (audioEl.volume < 1.0) audioEl.volume += 0.01; // Плавно повышаем (опционально)
        }
      }, CONFIG.autoVol.interval);
    });
  }

  // ==========================================
  // UI (ИНТЕРФЕЙС)
  // ==========================================
  function createUI() {
    if (document.getElementById("an-ui")) return;

    const css = `
            #an-ui {
                position: fixed; top: 20px; right: 20px; z-index: 999999;
                background: rgba(13, 17, 23, 0.75);
                backdrop-filter: blur(16px) saturate(180%);
                -webkit-backdrop-filter: blur(16px) saturate(180%);
                padding: 16px; border-radius: 14px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.6);
                border: 1px solid rgba(88, 166, 255, 0.15);
                width: 260px; color: #c9d1d9; font-family: -apple-system, system-ui, sans-serif;
                transition: opacity 0.3s, transform 0.3s;
            }
            .an-title {
                text-align: center; font-size: 14px; font-weight: 800; color: #58a6ff;
                text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px;
                padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);
            }
            .an-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
            .an-btn-group { display: flex; gap: 10px; justify-content: center; margin-bottom: 15px; }
            .an-btn {
                width: 42px; height: 42px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1);
                background: rgba(255,255,255,0.05); color: #c9d1d9; cursor: pointer;
                display: flex; align-items: center; justify-content: center; font-size: 18px; transition: 0.2s;
            }
            .an-btn:hover { background: rgba(88, 166, 255, 0.2); border-color: #58a6ff; }
            .an-btn.active { background: #238636; border-color: #238636; color: #fff; }
            .an-btn.muted { background: #da3633; border-color: #da3633; color: #fff; }

            .an-toggle { position: relative; width: 34px; height: 18px; }
            .an-toggle input { opacity: 0; width: 0; height: 0; }
            .an-slider { position: absolute; cursor: pointer; top:0; left:0; right:0; bottom:0; background: #30363d; border-radius: 18px; transition: .3s; }
            .an-slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 2px; bottom: 2px; background: white; border-radius: 50%; transition: .3s; }
            input:checked + .an-slider { background: #238636; }
            input:checked + .an-slider:before { transform: translateX(16px); }

            .an-label { font-size: 13px; font-weight: 500; }
            .an-sub { padding: 8px; background: rgba(0,0,0,0.2); border-radius: 8px; margin-top: -5px; margin-bottom: 10px; }
            .an-range { width: 100%; height: 4px; background: #30363d; border-radius: 2px; appearance: none; outline: none; }
            .an-range::-webkit-slider-thumb { appearance: none; width: 12px; height: 12px; background: #58a6ff; border-radius: 50%; cursor: pointer; }
            .an-select { width: 100%; background: #0d1117; color: #c9d1d9; border: 1px solid #30363d; padding: 4px; border-radius: 6px; }
        `;

    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    const ui = document.createElement("div");
    ui.id = "an-ui";

    // Header
    ui.innerHTML = `<div class="an-title">AutoNektome v4.4</div>`;

    // Mic/Headphone Controls
    const btnGroup = document.createElement("div");
    btnGroup.className = "an-btn-group";

    const micBtn = document.createElement("button");
    micBtn.className = "an-btn";
    micBtn.innerHTML = "🎤";
    micBtn.onclick = () => {
      isMicMuted = !isMicMuted;
      updateBtn();
      toggleMicState();
    };

    const headBtn = document.createElement("button");
    headBtn.className = "an-btn";
    headBtn.innerHTML = "🎧";
    headBtn.onclick = () => {
      isHeadphonesMuted = !isHeadphonesMuted;
      updateBtn();
      toggleHeadState();
    };

    function updateBtn() {
      micBtn.className = `an-btn ${isMicMuted ? "muted" : ""}`;
      headBtn.className = `an-btn ${isHeadphonesMuted ? "muted" : ""}`;
    }

    btnGroup.append(micBtn, headBtn);
    ui.append(btnGroup);

    // Helper for Toggles
    function addToggle(label, key, callback) {
      const row = document.createElement("div");
      row.className = "an-row";
      row.innerHTML = `<span class="an-label">${label}</span>`;

      const labelEl = document.createElement("label");
      labelEl.className = "an-toggle";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = key ? settings[key] : false;

      // Special handling for Automode which is global var
      if (key === "autoMode") input.checked = isAutoModeEnabled;

      input.onchange = (e) => {
        if (key === "autoMode") isAutoModeEnabled = e.target.checked;
        else {
          settings[key] = e.target.checked;
          saveSettings();
        }
        if (callback) callback(e.target.checked);
      };

      const slider = document.createElement("span");
      slider.className = "an-slider";

      labelEl.append(input, slider);
      row.append(labelEl);
      ui.append(row);
      return row;
    }

    addToggle("Авторежим", "autoMode");

    addToggle("Самопрослушивание", "enableLoopback", (val) => {
      AudioEngine.updateParams(); // Триггер обновления графа
      // Реальное применение происходит внутри processMicrophone,
      // но мы можем заставить пересобрать граф, если стрим активен
      if (globalStream)
        AudioEngine.processMicrophone(globalMicStreamOrig).then(
          (s) => (globalStream = s),
        );
      // ^ Упрощено, на самом деле проще просто переключить флаг,
      // AudioEngine сам проверит его при следующем create.
      // Для мгновенного эффекта:
      if (globalMicStreamOrig)
        AudioEngine.processMicrophone(globalMicStreamOrig);

      lbDiv.style.display = val ? "block" : "none";
    });

    const lbDiv = document.createElement("div");
    lbDiv.className = "an-sub";
    lbDiv.style.display = settings.enableLoopback ? "block" : "none";
    lbDiv.innerHTML = `<div style="font-size:11px; margin-bottom:5px;">Громкость</div>`;
    const lbSlider = document.createElement("input");
    lbSlider.type = "range";
    lbSlider.className = "an-range";
    lbSlider.min = 0.1;
    lbSlider.max = 3.0;
    lbSlider.step = 0.1;
    lbSlider.value = settings.gainValue;
    lbSlider.oninput = (e) => {
      settings.gainValue = parseFloat(e.target.value);
      saveSettings();
      AudioEngine.updateParams();
    };
    lbDiv.append(lbSlider);
    ui.append(lbDiv);

    addToggle("Изменение голоса", "voicePitch", (val) => {
      // Аналогично, лучше перезапросить обработку
      if (globalMicStreamOrig)
        AudioEngine.processMicrophone(globalMicStreamOrig).then(
          (s) => (globalStream = s),
        );
      pDiv.style.display = val ? "block" : "none";
    });

    const pDiv = document.createElement("div");
    pDiv.className = "an-sub";
    pDiv.style.display = settings.voicePitch ? "block" : "none";
    pDiv.innerHTML = `<div style="font-size:11px; margin-bottom:5px;">Тон (ниже - влево)</div>`;
    const pSlider = document.createElement("input");
    pSlider.type = "range";
    pSlider.className = "an-range";
    pSlider.min = 0;
    pSlider.max = 0.4;
    pSlider.step = 0.01;
    pSlider.value = settings.pitchLevel;
    pSlider.oninput = (e) => {
      settings.pitchLevel = parseFloat(e.target.value);
      saveSettings();
      AudioEngine.updateParams();
    };
    pDiv.append(pSlider);
    ui.append(pDiv);

    addToggle("Автогромкость собеседника", "autoVolume");

    addToggle("Голосовое управление", "voiceControl", (val) => {
      if (val) {
        if (!recognition) initSpeech();
        recognition.start();
      } else if (recognition) recognition.stop();
    });

    // Theme
    const themeRow = document.createElement("div");
    themeRow.className = "an-row";
    themeRow.style.marginTop = "15px";
    const sel = document.createElement("select");
    sel.className = "an-select";
    for (let t in CONFIG.themes) {
      let opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      if (t === settings.selectedTheme) opt.selected = true;
      sel.append(opt);
    }
    sel.onchange = (e) => applyTheme(e.target.value);
    themeRow.append(sel);
    ui.append(themeRow);

    document.body.append(ui);
  }

  // ==========================================
  // СИСТЕМНАЯ ЛОГИКА
  // ==========================================
  let isAutoModeEnabled = true;
  let isMicMuted = false;
  let isHeadphonesMuted = false;
  let globalStream = null;
  let globalMicStreamOrig = null; // Храним оригинал для переобработки
  let recognition = null;
  let conversationTimer = null;
  let currentThemeStyle = null;

  // Звуки
  const soundStart = new Audio(CONFIG.sounds.start);
  soundStart.volume = CONFIG.sounds.startVol;
  const soundEnd = new Audio(CONFIG.sounds.end);
  soundEnd.volume = CONFIG.sounds.endVol;

  function applyTheme(name) {
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
    }
    settings.selectedTheme = name;
    saveSettings();
  }

  // Перехват GUM (GetUserMedia)
  const origGUM = navigator.mediaDevices.getUserMedia.bind(
    navigator.mediaDevices,
  );
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (constraints?.audio) {
      constraints.audio = {
        ...constraints.audio,
        autoGainControl: settings.autoGainControl,
        noiseSuppression: settings.noiseSuppression,
        echoCancellation: settings.echoCancellation,
      };
    }
    try {
      const stream = await origGUM(constraints);
      globalMicStreamOrig = stream; // Сохраняем "сырой" поток
      const processed = await AudioEngine.processMicrophone(stream);
      globalStream = processed;

      // Восстанавливаем мут если был
      if (isMicMuted) toggleMicState();

      return processed;
    } catch (e) {
      console.error("Mic Error", e);
      throw e;
    }
  };

  function toggleMicState() {
    if (globalStream)
      globalStream.getAudioTracks().forEach((t) => (t.enabled = !isMicMuted));
  }

  function toggleHeadState() {
    const audio = document.querySelector("audio#audioStream");
    if (audio) audio.muted = isHeadphonesMuted;
    if (isHeadphonesMuted && !isMicMuted) {
      isMicMuted = true;
      toggleMicState();
    } // Auto mute mic
  }

  // Автоматизация
  let obsTimer;
  const observer = new MutationObserver(() => {
    if (obsTimer) clearTimeout(obsTimer);
    obsTimer = setTimeout(() => {
      // Клик "Искать"
      if (isAutoModeEnabled) {
        const btn = document.querySelector(
          "button.callScreen__findBtn, button.go-scan-button, .scan-button",
        );
        if (btn && btn.offsetParent) btn.click();
      }

      // Аудио элемент
      const audio = document.querySelector("audio#audioStream");
      if (audio && !audio.dataset.inited) {
        audio.dataset.inited = "true";
        if (audio.srcObject) startAutoVolume(audio.srcObject);
      }

      // Таймер (простой детектор начала/конца)
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
    }, 150); // Debounce
  });

  // Voice
  function initSpeech() {
    if (!("webkitSpeechRecognition" in window)) return;
    recognition = new webkitSpeechRecognition();
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

  // Animation
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

  // Init
  function init() {
    applyTheme(settings.selectedTheme);
    createUI();
    initParticles();
    observer.observe(document.body, { childList: true, subtree: true });
    if (settings.voiceControl) {
      initSpeech();
      recognition.start();
    }

    // Block connect sound
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
