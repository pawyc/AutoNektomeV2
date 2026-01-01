// ==UserScript==
// @name         AutoNektome
// @namespace    http://tampermonkey.net/
// @version      4.2
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

    // ### Настройка звуков уведомлений
    const START_CONVERSATION_SOUND_URL = 'https://zvukogram.com/mp3/22/skype-sound-message-received-message-received.mp3'; // Ссылка на звук начала разговора
    const END_CONVERSATION_SOUND_URL = 'https://www.myinstants.com/media/sounds/teleport1_Cw1ot9l.mp3'; // Ссылка на звук окончания разговора
    const START_SOUND_VOLUME = 0.4; // Громкость звука начала разговора (0.0 - 1.0)
    const END_SOUND_VOLUME = 0.3; // Громкость звука окончания разговора (0.0 - 1.0)

    // ### Настройка голосовых команд
    const VOICE_COMMANDS = {
        skip: ['скип', 'skip', 'скиф', 'скипнуть', 'кефир'],
        stop: ['завершить', 'остановить', 'закончить', 'кумыс'],
        start: ['чат']
    };

    // ### Настройки автогромкости собеседника
    const TARGET_VOLUME = 50; // Целевая громкость звука в процентах (0-100), к которой стремится автогромкость
    const MIN_VOLUME = 10; // Минимально допустимая громкость в процентах (0-100), ниже которой автогромкость не опустит звук
    const MAX_VOLUME = 90; // Максимально допустимая громкость в процентах (0-100), выше которой автогромкость не поднимет звук
    const TRANSITION_DURATION = 1000; // Длительность плавного перехода громкости в миллисекундах (1000 мс = 1 секунда)
    const VOLUME_CHECK_INTERVAL = 200; // Интервал проверки громкости в миллисекундах (как часто анализируется уровень звука)
    const HOLD_DURATION = 5000; // Время удержания текущей громкости в миллисекундах после громкого звука (5000 мс = 5 секунд)
    const SILENCE_THRESHOLD = 5; // Порог тишины в процентах (0-100), ниже которого звук считается слишком тихим
    const HISTORY_SIZE = 15; // Размер истории измерений громкости (количество последних значений для усреднения)

    // ### Темы
    const THEMES = {
        'Original': null,
        'GitHub Dark': 'https://raw.githubusercontent.com/paracosm17/AutoNektome/refs/heads/main/githubdark.css'
    };

    // ### Настройки из localStorage
    const settings = {
        enableLoopback: loadSetting('enableLoopback', false),
        autoGainControl: loadSetting('autoGainControl', false),
        noiseSuppression: loadSetting('noiseSuppression', true),
        echoCancellation: loadSetting('echoCancellation', false),
        gainValue: loadSetting('gainValue', 1.5, parseFloat),
        voiceControl: loadSetting('voiceControl', false),
        autoVolume: loadSetting('autoVolume', true),
        voicePitch: loadSetting('voicePitch', false),
        pitchLevel: loadSetting('pitchLevel', 0, parseFloat),
        conversationCount: loadSetting('conversationCount', 0, parseInt),
        conversationStats: loadSetting('conversationStats', {
            over5min: 0,
            over15min: 0,
            over30min: 0,
            over1hour: 0,
            over2hours: 0,
            over3hours: 0,
            over5hours: 0
        }),
        selectedTheme: loadSetting('selectedTheme', 'Original')
    };

    // ### Переменные состояния
    let isAutoModeEnabled = true;
    let isVoiceControlEnabled = settings.voiceControl;
    let observer = null;
    let globalStream = null;
    let audioContext = null;
    let gainNode = null;
    let micStream = null;
    let recognition = null;
    let voiceHintElement = null;
    let remoteAudioContext = null;
    let volumeAnalyser = null;
    let volumeCheckIntervalId = null;
    let lastLoudTime = 0;
    let volumeHistory = [];
    let lastAdjustedVolume = TARGET_VOLUME;
    let pitchNode = null;
    let pitchAudioContext = null;
    let pitchSource = null;
    let pitchWorkletNode = null;
    let conversationTimer = null;
    let currentConversationStart = null;
    let isConversationActive = false;
    let isMicMuted = false;
    let isHeadphonesMuted = false;
    let currentThemeLink = null;

    // ### Утилиты
    const endConversationAudio = new Audio(END_CONVERSATION_SOUND_URL);
    endConversationAudio.volume = END_SOUND_VOLUME;
    const startConversationAudio = new Audio(START_CONVERSATION_SOUND_URL);
    startConversationAudio.volume = START_SOUND_VOLUME;

    // Блокировка звука connect.mp3 через MutationObserver
    const blockConnectSound = () => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length) {
                    const audioElements = document.querySelectorAll('audio');
                    audioElements.forEach(audio => {
                        if (audio.src.includes('connect.mp3') && !audio.dataset.custom) {
                            audio.src = '';
                            audio.muted = true;
                            audio.pause();
                            audio.removeAttribute('preload');
                            audio.setAttribute('data-blocked', 'true');
                            console.log('Звук connect.mp3 заблокирован');
                        }
                    });
                }
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    };

    // Запускаем блокировку сразу
    blockConnectSound();
    const originalPlay = HTMLAudioElement.prototype.play;
    HTMLAudioElement.prototype.play = function() {
        if (this.src.includes('connect.mp3') && !this.dataset.custom) {
            console.log('Попытка воспроизведения connect.mp3 заблокирована');
            return Promise.resolve();
        }
        return originalPlay.apply(this, arguments);
    };

    function loadSetting(key, defaultValue, transform = JSON.parse) {
        const value = localStorage.getItem(key);
        return value !== null ? transform(value) : defaultValue;
    }

    function saveSetting(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    // ### Управление темами
    function applyTheme(themeName) {
        if (currentThemeLink) {
            currentThemeLink.remove();
            currentThemeLink = null;
        }

        const loadingIndicator = document.querySelector('#settings-container select + span + span');
        if (loadingIndicator) loadingIndicator.style.display = 'block';

        if (themeName !== 'Original' && THEMES[themeName]) {
            const styleElement = document.createElement('style');
            styleElement.id = 'custom-theme-style';

            fetch(THEMES[themeName])
                .then(response => {
                    if (!response.ok) throw new Error('Ошибка загрузки CSS');
                    return response.text();
                })
                .then(css => {
                    styleElement.textContent = css;
                    document.head.appendChild(styleElement);
                    currentThemeLink = styleElement;
                    if (loadingIndicator) loadingIndicator.style.display = 'none';
                })
                .catch(error => {
                    console.error('Ошибка при загрузке темы:', error);
                    if (loadingIndicator) loadingIndicator.style.display = 'none';
                });
        } else if (themeName === 'Original') {
            const existingStyles = document.querySelectorAll('style[id="custom-theme-style"]');
            existingStyles.forEach(style => style.remove());
            currentThemeLink = null;
            if (loadingIndicator) loadingIndicator.style.display = 'none';
        }

        settings.selectedTheme = themeName;
        saveSetting('selectedTheme', themeName);
    }

    function createThemeSelector() {
        const themeContainer = document.createElement('div');
        themeContainer.style.marginTop = '20px';

        const themeLabel = document.createElement('span');
        themeLabel.textContent = 'Тема оформления';
        themeLabel.style.fontSize = '14px';
        themeLabel.style.color = '#fff';
        themeLabel.style.fontWeight = 'bold';
        themeLabel.style.textShadow = '0 0 3px rgba(255,255,255,0.5)';
        themeLabel.style.display = 'block';
        themeLabel.style.marginBottom = '8px';

        const selectWrapper = document.createElement('div');
        selectWrapper.style.position = 'relative';
        selectWrapper.style.width = '100%';

        const select = document.createElement('select');
        select.style.width = '100%';
        select.style.padding = '8px 25px 8px 10px';
        select.style.background = '#2b2b2b';
        select.style.color = '#fff';
        select.style.border = '1px solid #ff007a';
        select.style.borderRadius = '8px';
        select.style.fontSize = '14px';
        select.style.cursor = 'pointer';
        select.style.appearance = 'none';
        select.style.outline = 'none';
        select.style.transition = 'border-color 0.3s ease';

        for (const themeName in THEMES) {
            const option = document.createElement('option');
            option.value = themeName;
            option.textContent = themeName;
            if (themeName === settings.selectedTheme) {
                option.selected = true;
            }
            select.appendChild(option);
        }

        const arrow = document.createElement('span');
        arrow.textContent = '▼';
        arrow.style.position = 'absolute';
        arrow.style.right = '10px';
        arrow.style.top = '50%';
        arrow.style.transform = 'translateY(-50%)';
        arrow.style.color = '#ff007a';
        arrow.style.pointerEvents = 'none';

        selectWrapper.appendChild(select);
        selectWrapper.appendChild(arrow);
        themeContainer.appendChild(themeLabel);
        themeContainer.appendChild(selectWrapper);

        select.addEventListener('change', (e) => {
            const selectedTheme = e.target.value;
            applyTheme(selectedTheme);
        });

        select.addEventListener('mouseover', () => {
            select.style.borderColor = '#00ff9d';
        });
        select.addEventListener('mouseout', () => {
            select.style.borderColor = '#ff007a';
        });

        return themeContainer;
    }

    // ### AudioWorklet процессор для pitch shifting
    const pitchShiftWorkletCode = `
        class PitchShiftProcessor extends AudioWorkletProcessor {
            constructor() {
                super();
                this.bufferSize = 4096;
                this.buffer = new Float32Array(this.bufferSize);
                this.writeIndex = 0;
                this.readIndex = 0;
                this.pitchFactor = 1.0;
                this.port.onmessage = (event) => {
                    this.pitchFactor = event.data;
                };
            }

            process(inputs, outputs, parameters) {
                const input = inputs[0][0];
                const output = outputs[0][0];

                if (!input || !output) return true;

                for (let i = 0; i < input.length; i++) {
                    this.buffer[this.writeIndex] = input[i];
                    this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
                }

                for (let i = 0; i < output.length; i++) {
                    const intIndex = Math.floor(this.readIndex);
                    const frac = this.readIndex - intIndex;
                    const sample1 = this.buffer[intIndex % this.bufferSize];
                    const sample2 = this.buffer[(intIndex + 1) % this.bufferSize];
                    output[i] = sample1 + (sample2 - sample1) * frac;
                    this.readIndex = (this.readIndex + this.pitchFactor) % this.bufferSize;
                }

                return true;
            }
        }

        registerProcessor('pitch-shift-processor', PitchShiftProcessor);
    `;

    // ### Функции авторежима
    function checkAndClickButton() {
        if (!isAutoModeEnabled) return;

        // Новый интерфейс: экран после завершения разговора
        const finishedScreen = document.querySelector('.callScreen.callFinished');
        let button = null;
        if (finishedScreen) {
            button = finishedScreen.querySelector('button.callScreen__findBtn.btn.green.filled');
        }

        // Старый интерфейс — на всякий случай оставляем
        if (!button) {
            button = document.querySelector('button.btn.btn-lg.go-scan-button');
        }

        if (button) {
            button.click();
        }
    }

    function skipConversation() {
        // Новый интерфейс
        let stopButton = document.querySelector('button.callScreen__cancelCallBtn.btn.danger2.cancelCallBtnNoMess');

        // Старый интерфейс — fallback
        if (!stopButton) {
            stopButton = document.querySelector('button.btn.btn-lg.stop-talk-button');
        }

        if (stopButton) {
            stopButton.click();

            setTimeout(() => {
                const confirmButton = document.querySelector('button.swal2-confirm.swal2-styled');
                if (confirmButton) {
                    // Если по-прежнему есть подтверждение через SweetAlert
                    confirmButton.click();
                    playNotificationOnEnd();
                } else {
                    // Если подтверждения нет — просто считаем разговор завершённым
                    playNotificationOnEnd();
                }
            }, 500);
        }
    }

    function playNotificationOnEnd() {
        if (isConversationActive) {
            endConversationAudio.play();
            isConversationActive = false;
        }
    }

    function playNotificationOnStart() {
        if (!isConversationActive) {
            startConversationAudio.dataset.custom = 'true'; // Помечаем как кастомный звук
            startConversationAudio.play();
            isConversationActive = true;
        }
    }

    function updateSliderStyles(enable) {
        const slider = document.querySelector('.slider');
        const sliderCircle = document.querySelector('.slider-circle');
        if (slider) slider.style.background = enable ? '#00ff9d' : '#555';
        if (sliderCircle) sliderCircle.style.left = enable ? '40px' : '4px';
    }

    function applyCustomStyles(enable) {
        const styleId = 'custom-slider-styles';
        let styleElement = document.getElementById(styleId);
        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = styleId;
            document.head.appendChild(styleElement);
        }
        styleElement.textContent = `
            .slider { background: ${enable ? '#00ff9d' : '#555'} !important; transition: background 0.4s !important; }
            .slider-circle { left: ${enable ? '40px' : '4px'} !important; }
        `;
    }

    function toggleAutoMode(enable) {
        isAutoModeEnabled = enable;
        const toggleInput = document.querySelector('input[type="checkbox"]');
        const toggleLabel = document.querySelector('span.toggle-label');
        if (toggleInput) toggleInput.checked = enable;
        if (toggleLabel) {
            toggleLabel.textContent = `Авторежим ${enable ? 'ВКЛ' : 'ВЫКЛ'}`;
            toggleLabel.style.color = enable ? '#00ff9d' : '#ff4d4d';
            toggleLabel.style.textShadow = `0 0 5px ${enable ? '#00ff9d' : '#ff4d4d'}`;
        }
        updateSliderStyles(enable);
        applyCustomStyles(enable);
    }

    // ### Аудио функции
    async function getMicStream() {
        try {
            micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    autoGainControl: settings.autoGainControl,
                    noiseSuppression: settings.noiseSuppression,
                    echoCancellation: settings.echoCancellation
                }
            });
            return micStream;
        } catch (e) {
            console.error('Ошибка получения микрофона:', e);
            return null;
        }
    }

    function enableSelfListening(stream) {
        if (!stream || !stream.getAudioTracks().length) return;
        if (audioContext) audioContext.close();
        audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        gainNode = audioContext.createGain();
        gainNode.gain.value = settings.gainValue;

        if (settings.voicePitch && settings.pitchLevel > 0) {
            pitchNode = audioContext.createBiquadFilter();
            pitchNode.type = 'lowshelf';
            pitchNode.frequency.value = 300;
            pitchNode.gain.value = 10;
            source.connect(pitchNode);
            pitchNode.connect(gainNode);
        } else {
            source.connect(gainNode);
        }

        gainNode.connect(audioContext.destination);
    }

    async function createPitchShiftedStream(stream) {
        if (pitchAudioContext) pitchAudioContext.close();
        pitchAudioContext = new AudioContext();
        pitchSource = pitchAudioContext.createMediaStreamSource(stream);
        const outputNode = pitchAudioContext.createGain();

        if (settings.voicePitch && settings.pitchLevel > 0) {
            const blob = new Blob([pitchShiftWorkletCode], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            await pitchAudioContext.audioWorklet.addModule(url);

            pitchWorkletNode = new AudioWorkletNode(pitchAudioContext, 'pitch-shift-processor');
            const pitchShiftFactor = 1.0 - settings.pitchLevel;
            pitchWorkletNode.port.postMessage(pitchShiftFactor);

            pitchNode = pitchAudioContext.createBiquadFilter();
            pitchNode.type = 'lowshelf';
            pitchNode.frequency.value = 300;
            pitchNode.gain.value = 10;

            pitchSource.connect(pitchWorkletNode);
            pitchWorkletNode.connect(pitchNode);
            pitchNode.connect(outputNode);
        } else {
            pitchSource.connect(outputNode);
        }

        const destination = pitchAudioContext.createMediaStreamDestination();
        outputNode.connect(destination);
        return destination.stream;
    }

    function updatePitchEffect(enable) {
        settings.voicePitch = enable;
        if (globalStream) {
            createPitchShiftedStream(micStream || globalStream).then(newStream => {
                globalStream.getAudioTracks().forEach(track => track.stop());
                globalStream = newStream;
                if (settings.enableLoopback) enableSelfListening(newStream);
            });
        }
    }

    function updatePitchLevel(value) {
        settings.pitchLevel = value;
        localStorage.setItem('pitchLevel', value);
        if (pitchWorkletNode) {
            const pitchShiftFactor = 1.0 - settings.pitchLevel;
            pitchWorkletNode.port.postMessage(pitchShiftFactor);
        } else if (globalStream) {
            createPitchShiftedStream(micStream || globalStream).then(newStream => {
                globalStream.getAudioTracks().forEach(track => track.stop());
                globalStream = newStream;
                if (settings.enableLoopback) enableSelfListening(newStream);
            });
        }
    }

    // ### Улучшенная автогромкость
    function setupAutoVolume(stream) {
        if (!settings.autoVolume || !stream) return;

        if (remoteAudioContext) remoteAudioContext.close();
        if (volumeCheckIntervalId) clearInterval(volumeCheckIntervalId);

        remoteAudioContext = new AudioContext();
        const source = remoteAudioContext.createMediaStreamSource(stream);
        volumeAnalyser = remoteAudioContext.createAnalyser();
        volumeAnalyser.fftSize = 256;
        source.connect(volumeAnalyser);

        const bufferLength = volumeAnalyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const audioElement = document.querySelector('audio#audioStream');
        volumeHistory = [];
        lastAdjustedVolume = TARGET_VOLUME;

        function adjustVolume() {
            if (!settings.autoVolume || !volumeAnalyser || !audioElement) return;

            volumeAnalyser.getByteTimeDomainData(dataArray);
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                const value = (dataArray[i] - 128) / 128;
                sum += value * value;
            }
            const rms = Math.sqrt(sum / bufferLength);
            const volumeLevel = Math.min(1, rms * 10) * 100;

            volumeHistory.push(volumeLevel);
            if (volumeHistory.length > HISTORY_SIZE) volumeHistory.shift();

            const avgVolume = volumeHistory.reduce((a, b) => a + b, 0) / volumeHistory.length;

            const volumeSlider = document.querySelector('.volume_slider input.slider-input');
            if (!volumeSlider) return;

            let targetValue;
            const currentTime = Date.now();

            if (avgVolume > TARGET_VOLUME + 20) {
                targetValue = Math.max(MIN_VOLUME, TARGET_VOLUME - (avgVolume - TARGET_VOLUME));
                lastLoudTime = currentTime;
                lastAdjustedVolume = targetValue;
            } else if (currentTime - lastLoudTime < HOLD_DURATION || avgVolume < SILENCE_THRESHOLD) {
                targetValue = lastAdjustedVolume;
            } else if (avgVolume < TARGET_VOLUME - 20) {
                targetValue = Math.min(MAX_VOLUME, lastAdjustedVolume + (TARGET_VOLUME - avgVolume) / 2);
                lastAdjustedVolume = targetValue;
            } else {
                targetValue = lastAdjustedVolume;
            }

            const startValue = parseInt(volumeSlider.value) || TARGET_VOLUME;
            if (Math.abs(startValue - targetValue) > 5) {
                smoothTransition(volumeSlider, startValue, targetValue, audioElement);
            }
        }

        function smoothTransition(slider, startValue, targetValue, audio) {
            const startTime = performance.now();
            function step(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / TRANSITION_DURATION, 1);
                const newValue = startValue + (targetValue - startValue) * progress;

                slider.value = newValue;
                slider.dispatchEvent(new Event('input', { bubbles: true }));
                slider.dispatchEvent(new Event('change', { bubbles: true }));
                updateSliderVisuals(newValue);
                audio.volume = newValue / 100;

                if (progress < 1) requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
        }

        function updateSliderVisuals(value) {
            const sliderDot = document.querySelector('.slider-dot');
            const sliderProcess = document.querySelector('.slider-process');
            const tooltip = document.querySelector('.slider-tooltip');
            if (sliderDot && sliderProcess && tooltip) {
                const maxTranslate = 48;
                const translateX = (value / 100) * maxTranslate;
                sliderDot.style.transform = `translateX(${translateX}px)`;
                sliderProcess.style.width = `${translateX + 4}px`;
                tooltip.textContent = Math.round(value);
            }
        }

        volumeCheckIntervalId = setInterval(adjustVolume, VOLUME_CHECK_INTERVAL);
    }

    // ### Голосовое управление
    async function initSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window)) return;
        if (!micStream) await getMicStream();
        recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'ru-RU';

        recognition.onresult = (event) => {
            if (!isVoiceControlEnabled) return;
            const transcript = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();
            if (VOICE_COMMANDS.skip.some(cmd => transcript.includes(cmd))) {
                skipConversation();
            } else if (VOICE_COMMANDS.stop.some(cmd => transcript.includes(cmd))) {
                toggleAutoMode(false);
                skipConversation();
            } else if (VOICE_COMMANDS.start.some(cmd => transcript.includes(cmd))) {
                toggleAutoMode(true);
                checkAndClickButton();
            }
        };

        recognition.onerror = (event) => {
            if (event.error !== 'aborted' && isVoiceControlEnabled) setTimeout(() => recognition.start(), 100);
        };

        recognition.onend = () => {
            if (isVoiceControlEnabled) setTimeout(() => recognition.start(), 100);
        };

        if (settings.voiceControl) {
            isVoiceControlEnabled = true;
            recognition.start();
            if (voiceHintElement) voiceHintElement.style.display = 'inline-block';
            setInterval(() => {
                if (isVoiceControlEnabled) {
                    recognition.stop();
                    setTimeout(() => recognition.start(), 200);
                }
            }, 10000);
        }
    }

    // ### Счетчик разговоров
    function updateConversationStats(duration) {
        settings.conversationCount++;
        if (duration >= 300) settings.conversationStats.over5min++;
        if (duration >= 900) settings.conversationStats.over15min++;
        if (duration >= 1800) settings.conversationStats.over30min++;
        if (duration >= 3600) settings.conversationStats.over1hour++;
        if (duration >= 7200) settings.conversationStats.over2hours++;
        if (duration >= 10800) settings.conversationStats.over3hours++;
        if (duration >= 18000) settings.conversationStats.over5hours++;

        saveSetting('conversationCount', settings.conversationCount);
        saveSetting('conversationStats', settings.conversationStats);

        const counter = document.querySelector('#conversation-counter span');
        if (counter) counter.textContent = `Разговоров: ${settings.conversationCount}`;
    }

    function startConversationTimer() {
        if (conversationTimer) clearInterval(conversationTimer);
        currentConversationStart = Date.now();
        playNotificationOnStart();

        conversationTimer = setInterval(() => {
            const timerElement = document.querySelector('.callScreen__time, .timer-label');
            // Если таймер исчез или вдруг сбросился в 00:00 — считаем, что разговор закончился/перезапустился
            if (!timerElement || timerElement.textContent === '00:00') {
                stopConversationTimer();
            }
        }, 1000);
    }

    function stopConversationTimer() {
        if (conversationTimer && currentConversationStart) {
            clearInterval(conversationTimer);
            const duration = Math.floor((Date.now() - currentConversationStart) / 1000);
            updateConversationStats(duration);
            playNotificationOnEnd();
            conversationTimer = null;
            currentConversationStart = null;
        }
    }

    // ### Новые функции для управления микрофоном и наушниками
    function toggleMic() {
        isMicMuted = !isMicMuted;
        if (globalStream) {
            globalStream.getAudioTracks().forEach(track => {
                track.enabled = !isMicMuted;
            });
        }
        updateButtonStyles();
    }

    function toggleHeadphones() {
        isHeadphonesMuted = !isHeadphonesMuted;
        const audio = document.querySelector('audio#audioStream');
        if (audio) {
            audio.muted = isHeadphonesMuted;
        }
        if (isHeadphonesMuted && !isMicMuted) {
            toggleMic(); // Выключение наушников мутит микрофон
        }
        updateButtonStyles();
    }

    function updateButtonStyles() {
        const micButton = document.querySelector('#mic-toggle');
        const headphoneButton = document.querySelector('#headphone-toggle');

        if (micButton) {
            const micState = globalStream && globalStream.getAudioTracks().length > 0 ? !globalStream.getAudioTracks()[0].enabled : isMicMuted;
            isMicMuted = micState;
            micButton.style.background = isMicMuted ? '#ff4d4d' : '#00ff9d';
            micButton.style.textDecoration = isMicMuted ? 'line-through' : 'none';
            micButton.style.boxShadow = `0 0 10px ${isMicMuted ? '#ff4d4d' : '#00ff9d'}`;
        }

        if (headphoneButton) {
            headphoneButton.style.background = isHeadphonesMuted ? '#ff4d4d' : '#00ff9d';
            headphoneButton.style.textDecoration = isHeadphonesMuted ? 'line-through' : 'none';
            headphoneButton.style.boxShadow = `0 0 10px ${isHeadphonesMuted ? '#ff4d4d' : '#00ff9d'}`;
        }
    }

    // ### UI элементы
    function createVoiceHints() {
        const wrapper = document.createElement('div');
        wrapper.className = 'voice-hint-wrapper';
        wrapper.style.cssText = `margin-left: 5px; display: ${isVoiceControlEnabled ? 'inline-block' : 'none'};`;
        const trigger = document.createElement('span');
        trigger.textContent = 'Подсказка';
        trigger.style.cssText = `font-size: 12px; color: #bbb; cursor: help; padding: 2px 5px; background: #444; border-radius: 5px; transition: color 0.2s ease;`;
        const content = document.createElement('div');
        content.style.cssText = `position: absolute; background: rgba(43, 43, 43, 0.95); color: #fff; padding: 8px; border-radius: 6px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4); font-size: 11px; display: none; transform: translateY(5px); opacity: 0; transition: all 0.3s ease; z-index: 1000;`;
        content.innerHTML = `<b>Голосовые команды:</b><br><b>пропустить: </b>${VOICE_COMMANDS.skip.join('/')}<br><b>начать: </b>${VOICE_COMMANDS.start.join('/')}<br><b>остановить: </b>${VOICE_COMMANDS.stop.join('/')}`;

        wrapper.appendChild(trigger);
        wrapper.appendChild(content);

        trigger.addEventListener('mouseenter', () => {
            trigger.style.color = '#fff';
            content.style.display = 'block';
            setTimeout(() => { content.style.opacity = '1'; content.style.transform = 'translateY(0)'; }, 10);
        });
        trigger.addEventListener('mouseleave', () => {
            trigger.style.color = '#bbb';
            content.style.opacity = '0';
            content.style.transform = 'translateY(5px)';
            setTimeout(() => content.style.display = 'none', 300);
        });

        voiceHintElement = wrapper;
        return wrapper;
    }

    function createConversationCounter() {
        const counterDiv = document.createElement('div');
        counterDiv.id = 'conversation-counter';
        counterDiv.style.cssText = `
            margin-bottom: 15px;
            text-align: center;
            position: relative;
        `;

        const counterSpan = document.createElement('span');
        counterSpan.textContent = `Разговоров: ${settings.conversationCount}`;
        counterSpan.style.cssText = `
            color: #00ff9d;
            font-size: 16px;
            font-weight: bold;
            text-shadow: 0 0 5px #00ff9d, 0 0 10px #00ff9d;
            padding: 5px 10px;
            background: rgba(0, 0, 0, 0.7);
            border-radius: 8px;
            cursor: default;
            display: inline-block;
        `;

        const tooltip = document.createElement('div');
        tooltip.style.cssText = `
            position: absolute;
            top: calc(100% + 5px);
            left: 50%;
            transform: translateX(-50%);
            background: rgba(43, 43, 43, 0.95);
            color: #fff;
            padding: 10px;
            border-radius: 6px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
            font-size: 12px;
            display: none;
            opacity: 0;
            transition: opacity 0.3s ease;
            z-index: 1000;
            white-space: nowrap;
        `;
        tooltip.innerHTML = `
            Из них дольше:<br>
            5 минут: ${settings.conversationStats.over5min}<br>
            15 минут: ${settings.conversationStats.over15min}<br>
            30 минут: ${settings.conversationStats.over30min}<br>
            1 часа: ${settings.conversationStats.over1hour}<br>
            2 часов: ${settings.conversationStats.over2hours}<br>
            3 часов: ${settings.conversationStats.over3hours}<br>
            5 часов: ${settings.conversationStats.over5hours}
        `;

        counterDiv.appendChild(counterSpan);
        counterDiv.appendChild(tooltip);

        counterSpan.addEventListener('mouseenter', () => {
            tooltip.style.display = 'block';
            setTimeout(() => {
                tooltip.style.opacity = '1';
            }, 10);
        });

        counterSpan.addEventListener('mouseleave', () => {
            tooltip.style.opacity = '0';
            setTimeout(() => {
                tooltip.style.display = 'none';
            }, 300);
        });

        return counterDiv;
    }

    function createSettingsUI() {
        const container = document.createElement('div');
        container.id = 'settings-container';
        // Glassmorphism style
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            background: rgba(13, 17, 23, 0.7); /* GitHub Dark bg with opacity */
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(88, 166, 255, 0.1);
            width: 280px;
            color: #c9d1d9;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
            transition: transform 0.3s ease, opacity 0.3s ease;
        `;

        const header = document.createElement('h3');
        header.textContent = 'AutoNektome';
        header.style.cssText = `
            margin: 0 0 20px;
            font-size: 18px;
            color: #58a6ff; /* GitHub Blue */
            text-align: center;
            font-weight: 600;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            border-bottom: 1px solid rgba(48, 54, 61, 0.7);
            padding-bottom: 10px;
        `;
        container.appendChild(header);

        container.appendChild(createConversationCounter());

        // Audio Controls (Icons)
        const audioControls = document.createElement('div');
        audioControls.style.cssText = `
            display: flex;
            gap: 15px;
            margin-bottom: 25px;
            justify-content: center;
        `;

        const createIconButton = (id, icon, onClick) => {
            const btn = document.createElement('button');
            btn.id = id;
            btn.innerHTML = icon;
            btn.style.cssText = `
                width: 45px;
                height: 45px;
                border-radius: 50%;
                background: rgba(33, 38, 45, 0.8);
                border: 1px solid rgba(88, 166, 255, 0.3);
                cursor: pointer;
                font-size: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                color: #c9d1d9;
            `;
            btn.addEventListener('mouseenter', () => {
                btn.style.borderColor = '#58a6ff';
                btn.style.boxShadow = '0 0 10px rgba(88, 166, 255, 0.2)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.borderColor = 'rgba(88, 166, 255, 0.3)';
                btn.style.boxShadow = 'none';
            });
            btn.addEventListener('click', onClick);
            return btn;
        };

        const micButton = createIconButton('mic-toggle', '🎤', toggleMic);
        // Initial state style update happens in updateButtonStyles called later
        const headphoneButton = createIconButton('headphone-toggle', '🎧', toggleHeadphones);

        audioControls.appendChild(micButton);
        audioControls.appendChild(headphoneButton);
        container.appendChild(audioControls);

        // Auto Mode Toggle (Main Switch)
        const toggleWrapper = document.createElement('div');
        toggleWrapper.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 25px;
            background: rgba(33, 38, 45, 0.5);
            padding: 10px;
            border-radius: 8px;
        `;

        const label = document.createElement('label');
        label.style.position = 'relative';
        label.style.display = 'inline-block';
        label.style.width = '50px';
        label.style.height = '26px';

        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.style.display = 'none';
        toggleInput.checked = isAutoModeEnabled;

        const slider = document.createElement('span');
        slider.className = 'slider';
        slider.style.cssText = `
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: #30363d;
            transition: .4s;
            border-radius: 34px;
        `;

        const sliderCircle = document.createElement('span');
        sliderCircle.className = 'slider-circle';
        sliderCircle.style.cssText = `
            position: absolute;
            height: 20px;
            width: 20px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        `;

        if (isAutoModeEnabled) {
            slider.style.backgroundColor = '#238636'; // GitHub Green
            sliderCircle.style.transform = 'translateX(24px)';
        }

        slider.appendChild(sliderCircle);
        label.appendChild(toggleInput);
        label.appendChild(slider);

        const toggleLabel = document.createElement('span');
        toggleLabel.className = 'toggle-label';
        toggleLabel.textContent = isAutoModeEnabled ? 'Авторежим ВКЛ' : 'Авторежим ВЫКЛ';
        toggleLabel.style.cssText = `
            font-size: 14px;
            font-weight: 600;
            color: ${isAutoModeEnabled ? '#3fb950' : '#f85149'};
        `;

        toggleWrapper.appendChild(toggleLabel);
        toggleWrapper.appendChild(label);
        container.appendChild(toggleWrapper);

        // Detailed Settings
        const audioSettings = document.createElement('div');
        audioSettings.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 12px;
        `;

        function createToggle(labelText, key) {
            const div = document.createElement('div');
            const toggleDiv = document.createElement('div');
            toggleDiv.style.cssText = `
                display: flex;
                align-items: center;
                gap: 10px;
                cursor: pointer;
            `;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = settings[key];
            checkbox.style.cssText = `
                appearance: none;
                width: 16px;
                height: 16px;
                border: 1px solid #30363d;
                border-radius: 4px;
                background-color: #0d1117;
                cursor: pointer;
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            if (checkbox.checked) {
                checkbox.style.backgroundColor = '#1f6feb';
                checkbox.style.borderColor = '#1f6feb';
            }

            // Custom checkmark using pseudo-element logic via inline SVG or similar is hard,
            // relying on background color change for simplicity in JS-only.
            // Or simple unicode check.
            const checkIcon = document.createElement('span');
            checkIcon.textContent = '✔';
            checkIcon.style.cssText = `
                position: absolute;
                font-size: 12px;
                color: white;
                display: ${checkbox.checked ? 'block' : 'none'};
                pointer-events: none;
            `;
            checkbox.parentNode?.insertBefore(checkIcon, checkbox.nextSibling); // Hacky, appending to parent instead

             // Wrapper for custom checkbox visual
            const checkboxWrapper = document.createElement('div');
            checkboxWrapper.style.position = 'relative';
            checkboxWrapper.style.display = 'flex';
            checkboxWrapper.style.alignItems = 'center';
            checkboxWrapper.appendChild(checkbox);
            checkboxWrapper.appendChild(checkIcon);


            const labelSpan = document.createElement('span');
            labelSpan.textContent = labelText;
            labelSpan.style.cssText = 'font-size: 13px; color: #8b949e;';

            toggleDiv.appendChild(checkboxWrapper);
            toggleDiv.appendChild(labelSpan);
            div.appendChild(toggleDiv);

            // Additional controls (sliders)
            let volumeContainer = null;
            let pitchContainer = null;

            // Slider Helper
            const createSlider = (min, max, step, value, onInput) => {
                const sliderInput = document.createElement('input');
                sliderInput.type = 'range';
                sliderInput.min = min;
                sliderInput.max = max;
                sliderInput.step = step;
                sliderInput.value = value;
                sliderInput.style.cssText = `
                    width: 100%;
                    height: 4px;
                    background: #30363d;
                    border-radius: 2px;
                    appearance: none;
                    outline: none;
                    margin-top: 5px;
                `;
                sliderInput.addEventListener('input', function() {
                    const percentage = ((this.value - this.min) / (this.max - this.min)) * 100;
                    this.style.background = `linear-gradient(to right, #1f6feb ${percentage}%, #30363d ${percentage}%)`;
                    onInput(this.value);
                });
                 // Initial gradient
                const percentage = ((value - min) / (max - min)) * 100;
                sliderInput.style.background = `linear-gradient(to right, #1f6feb ${percentage}%, #30363d ${percentage}%)`;

                return sliderInput;
            };


            if (key === 'enableLoopback') {
                volumeContainer = document.createElement('div');
                volumeContainer.style.display = settings.enableLoopback ? 'block' : 'none';
                volumeContainer.style.marginTop = '8px';
                volumeContainer.style.paddingLeft = '26px';

                const volumeLabel = document.createElement('div');
                volumeLabel.textContent = `Громкость: ${settings.gainValue.toFixed(1)}`;
                volumeLabel.style.fontSize = '12px';
                volumeLabel.style.color = '#8b949e';

                const sliderEl = createSlider(0.1, 3.0, 0.1, settings.gainValue, (val) => {
                    settings.gainValue = parseFloat(val);
                    volumeLabel.textContent = `Громкость: ${settings.gainValue.toFixed(1)}`;
                    saveSetting('gainValue', settings.gainValue);
                    if (gainNode) gainNode.gain.value = settings.gainValue;
                });

                volumeContainer.appendChild(volumeLabel);
                volumeContainer.appendChild(sliderEl);
            }

            if (key === 'voicePitch') {
                pitchContainer = document.createElement('div');
                pitchContainer.style.display = settings.voicePitch ? 'block' : 'none';
                pitchContainer.style.marginTop = '8px';
                pitchContainer.style.paddingLeft = '26px';

                const pitchLabel = document.createElement('div');
                pitchLabel.textContent = `Уровень: ${settings.pitchLevel.toFixed(2)}`;
                pitchLabel.style.fontSize = '12px';
                pitchLabel.style.color = '#8b949e';

                const sliderEl = createSlider(0, 0.4, 0.01, settings.pitchLevel, (val) => {
                    settings.pitchLevel = parseFloat(val);
                    pitchLabel.textContent = `Уровень: ${settings.pitchLevel.toFixed(2)}`;
                    saveSetting('pitchLevel', settings.pitchLevel);
                    updatePitchLevel(settings.pitchLevel);
                });

                pitchContainer.appendChild(pitchLabel);
                pitchContainer.appendChild(sliderEl);
            }

            checkbox.addEventListener('change', () => {
                settings[key] = checkbox.checked;
                saveSetting(key, checkbox.checked);

                // Visual update
                checkbox.style.backgroundColor = checkbox.checked ? '#1f6feb' : '#0d1117';
                checkbox.style.borderColor = checkbox.checked ? '#1f6feb' : '#30363d';
                checkIcon.style.display = checkbox.checked ? 'block' : 'none';


                if (key === 'enableLoopback') {
                    if (checkbox.checked && globalStream) enableSelfListening(globalStream);
                    else if (audioContext) audioContext.close();
                    if (volumeContainer) volumeContainer.style.display = checkbox.checked ? 'block' : 'none';
                } else if (key === 'voiceControl') {
                    isVoiceControlEnabled = checkbox.checked;
                    if (voiceHintElement) voiceHintElement.style.display = checkbox.checked ? 'inline-block' : 'none';
                    if (checkbox.checked) {
                        if (!recognition) initSpeechRecognition();
                        recognition.start();
                    } else if (recognition) recognition.stop();
                } else if (key === 'autoVolume') {
                    if (checkbox.checked) {
                        const audio = document.querySelector('audio#audioStream');
                        if (audio && audio.srcObject) setupAutoVolume(audio.srcObject);
                    } else {
                        if (remoteAudioContext) remoteAudioContext.close();
                        if (volumeCheckIntervalId) clearInterval(volumeCheckIntervalId);
                    }
                } else if (key === 'voicePitch') {
                    updatePitchEffect(checkbox.checked);
                    if (pitchContainer) pitchContainer.style.display = checkbox.checked ? 'block' : 'none';
                }
            });

            if (key === 'voiceControl') div.appendChild(createVoiceHints());
            if (key === 'enableLoopback' && volumeContainer) div.appendChild(volumeContainer);
            if (key === 'voicePitch' && pitchContainer) div.appendChild(pitchContainer);
            return div;
        }

        audioSettings.appendChild(createToggle('Самопрослушивание', 'enableLoopback'));
        audioSettings.appendChild(createToggle('Автогромкость (Микро)', 'autoGainControl'));
        audioSettings.appendChild(createToggle('Автогромкость (Чат)', 'autoVolume'));
        audioSettings.appendChild(createToggle('Шумоподавление', 'noiseSuppression'));
        audioSettings.appendChild(createToggle('Эхоподавление', 'echoCancellation'));
        audioSettings.appendChild(createToggle('Низкий голос', 'voicePitch'));
        audioSettings.appendChild(createToggle('Голосовое управление', 'voiceControl'));

        container.appendChild(audioSettings);
        container.appendChild(createThemeSelector());

        document.body.appendChild(container);

        // Hover effect for the whole container
        container.addEventListener('mouseenter', () => {
            container.style.opacity = '1';
        });

        // Main Toggle Logic
        toggleInput.addEventListener('change', (e) => {
            toggleAutoMode(e.target.checked);
            // Local visual update for slider
            if (e.target.checked) {
                slider.style.backgroundColor = '#238636';
                sliderCircle.style.transform = 'translateX(24px)';
                toggleLabel.textContent = 'Авторежим ВКЛ';
                toggleLabel.style.color = '#3fb950';
            } else {
                slider.style.backgroundColor = '#30363d';
                sliderCircle.style.transform = 'translateX(0)';
                toggleLabel.textContent = 'Авторежим ВЫКЛ';
                toggleLabel.style.color = '#f85149';
            }
        });
    }

    // ### Инициализация
    function initObserver() {
        observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length) {
                    checkAndClickButton();
                    const audio = document.querySelector('audio#audioStream');
                    if (audio && audio.srcObject && settings.autoVolume) setupAutoVolume(audio.srcObject);

                    // Новый + старый вариант селектора таймера
                    const timerElement = document.querySelector('.callScreen__time, .timer-label');

                    if (timerElement && timerElement.textContent === '00:00' && !conversationTimer) {
                        // Таймер появился и стоит на 00:00 — стартуем отсчёт разговора
                        startConversationTimer();
                    }

                    if (!timerElement && conversationTimer) {
                        // Таймер исчез (например, экран завершения разговора) — завершаем
                        stopConversationTimer();
                    }

                    // Новый селектор кнопки "Завершить"
                    let stopButton = document.querySelector('button.callScreen__cancelCallBtn.btn.danger2.cancelCallBtnNoMess');
                    // Старый вариант — на всякий случай
                    if (!stopButton) {
                        stopButton = document.querySelector('button.btn.btn-lg.stop-talk-button');
                    }

                    if (stopButton && !stopButton.dataset.listenerAdded) {
                        stopButton.addEventListener('click', () => {
                            setTimeout(() => {
                                const confirmButton = document.querySelector('button.swal2-confirm.swal2-styled');
                                if (confirmButton && !confirmButton.dataset.listenerAdded) {
                                    confirmButton.addEventListener('click', playNotificationOnEnd);
                                    confirmButton.dataset.listenerAdded = 'true';
                                }
                            }, 500);
                        });
                        stopButton.dataset.listenerAdded = 'true';
                    }
                }
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    navigator.mediaDevices.getUserMedia = ((original) => {
        return async (constraints) => {
            if (constraints?.audio) {
                constraints.audio = {
                    ...constraints.audio,
                    autoGainControl: settings.autoGainControl,
                    noiseSuppression: settings.noiseSuppression,
                    echoCancellation: settings.echoCancellation
                };
            }
            const stream = await original.call(navigator.mediaDevices, constraints);
            micStream = stream;
            const processedStream = await createPitchShiftedStream(stream);
            globalStream = processedStream;

            if (globalStream && isMicMuted) {
                globalStream.getAudioTracks().forEach(track => {
                    track.enabled = false;
                });
            }

            if (settings.enableLoopback) enableSelfListening(processedStream);
            return processedStream;
        };
    })(navigator.mediaDevices.getUserMedia);

    const originalSet = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject').set;
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
        set: function(stream) {
            originalSet.call(this, stream);
            if (this.id === 'audioStream' && stream && settings.autoVolume) setupAutoVolume(stream);
        }
    });

    // ### Canvas Background Animation (Web Effect)
    function initParticles() {
        const canvas = document.createElement('canvas');
        canvas.id = 'particles-canvas';
        document.body.prepend(canvas);

        const ctx = canvas.getContext('2d');
        let particles = [];
        const particleCount = 100;
        const connectionDistance = 150;
        const mouseDistance = 200;

        let mouse = { x: null, y: null };

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }

        window.addEventListener('resize', resize);
        window.addEventListener('mousemove', (e) => {
            mouse.x = e.x;
            mouse.y = e.y;
        });

        resize();

        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.vx = (Math.random() - 0.5) * 0.5;
                this.vy = (Math.random() - 0.5) * 0.5;
                this.size = Math.random() * 2 + 1;
            }

            update() {
                this.x += this.vx;
                this.y += this.vy;

                if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
                if (this.y < 0 || this.y > canvas.height) this.vy *= -1;

                // Mouse interaction
                if (mouse.x != null) {
                    let dx = mouse.x - this.x;
                    let dy = mouse.y - this.y;
                    let distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < mouseDistance) {
                        const forceDirectionX = dx / distance;
                        const forceDirectionY = dy / distance;
                        const force = (mouseDistance - distance) / mouseDistance;
                        const directionX = forceDirectionX * force * 0.6;
                        const directionY = forceDirectionY * force * 0.6;
                        this.vx += directionX;
                        this.vy += directionY;
                    }
                }
            }

            draw() {
                ctx.fillStyle = 'rgba(88, 166, 255, 0.5)'; // GitHub Blue
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        function initParticlesArray() {
            particles = [];
            for (let i = 0; i < particleCount; i++) {
                particles.push(new Particle());
            }
        }

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < particles.length; i++) {
                particles[i].update();
                particles[i].draw();

                for (let j = i; j < particles.length; j++) {
                    let dx = particles[i].x - particles[j].x;
                    let dy = particles[i].y - particles[j].y;
                    let distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < connectionDistance) {
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(88, 166, 255, ${1 - distance / connectionDistance})`;
                        ctx.lineWidth = 0.5;
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }
            requestAnimationFrame(animate);
        }

        initParticlesArray();
        animate();
    }

    async function init() {
        initParticles();
        console.log('Инициализация скрипта...');
        createSettingsUI();
        applyTheme(settings.selectedTheme);
        checkAndClickButton();
        initObserver();
        await initSpeechRecognition();
        console.log('Инициализация завершена');
    }

    window.addEventListener('load', () => {
        console.log('Страница загружена, запускаем init');
        init();
    });
})();
