const fs = require('fs');
let code = fs.readFileSync('e:\\All Project\\AutoNektomeV2\\AutoNektome.user.js', 'utf8');

// 1. Remove Morse from PRESETS
code = code.replace(/,\s*morse:\s*\{[\s\S]*?morseMonitorVolume:\s*0\.18,\s*\}/g, '');

// 2. Remove Morse keys from AUDIO_SETTING_KEYS
code = code.replace(/\s*\"morseEnabled\",\s*\"morseUnit\",\s*\"morseFrequency\",\s*\"morseVolume\",\s*\"morseMonitorVolume\",/g, '');

// 3. Remove MORSE_MAP
code = code.replace(/\s*const MORSE_MAP = \{[\s\S]*?\};\s*(?=const THEMES)/g, '\n\n  ');

// 4. Voice control Firefox fix
code = code.replace(/if\s*\(this\.getBrowserName\(\)\s*===\s*\"Firefox\"\)\s*\{[\s\S]*?\}\s*return\s*\{/g, 'return {');

// 5. Remove Morse from defaultSettings
code = code.replace(/\s*morseEnabled:\s*false,\s*morseUnit:\s*0\.08,\s*morseFrequency:\s*880,\s*morseVolume:\s*0\.28,\s*morseMonitorVolume:\s*0\.18,\s*morseLastMessage:\s*\"SOS\",/g, '');

// 6. Remove compact mode from defaultSettings
code = code.replace(/\s*compactMode:\s*false,/g, '');

// 7. Remove Morse.stop()
code = code.replace(/\s*Morse\.stop\(\);/g, '');

// 8. Remove Morse.syncUi()
code = code.replace(/\s*Morse\.syncUi\?\.\(\);/g, '');

// 9. Remove Morse object
code = code.replace(/\s*const Morse = \{[\s\S]*?^\s*};\s*(?=\/\/ ==========================================\s*\/\/ СОСТОЯНИЕ И ТАЙМЕР)/m, '\n\n  ');

// 10. Remove Morse from presetSelect
code = code.replace(/\s*\[\"morse\",\s*\"Морзе\"\],/g, '');

// 11. Remove compactBtn
code = code.replace(/\s*const compactBtn = document\.createElement\(\"button\"\);[\s\S]*?compactBtn\.textContent\s*=\s*settings\.compactMode[\s\S]*?\"Компактный режим\";\s*\};\s*actionsGrid\.append\(resetAudioBtn,\s*resetStatsBtn,\s*copyLogBtn,\s*compactBtn\);/g, '\n      actionsGrid.append(resetAudioBtn, resetStatsBtn, copyLogBtn);');

// 12. Remove CSS for compact mode
code = code.replace(/\s*\.an-compact \.an-sub,\.an-compact \.an-ip-block,\.an-compact \.an-panel,\.an-compact \.an-actions-grid,\.an-compact \.an-divider:nth-of-type\(n\+3\),\.an-compact \.an-row:nth-of-type\(n\+9\),\.an-compact input\[type=range\]:nth-of-type\(n\+2\)\{display:none\}/g, '');

// 13. Remove compactMode check from UI initialization
code = code.replace(/\s*if \(settings\.compactMode\) this\.root\.classList\.add\(\"an-compact\"\);/g, '');

// 14. Remove Morse UI panel (morseHeader and morsePanel)
code = code.replace(/\s*const morseHeader = document\.createElement\(\"div\"\);[\s\S]*?Morse\.syncUi\(\);/g, '');

// 15. Particles fix for drisnya mode
// Look for this.ctx.clearRect calling and then this.ctx.fillStyle
code = code.replace(/this\.ctx\.clearRect\(0,\s*0,\s*w,\s*h\);\s*this\.ctx\.fillStyle = \"rgba\(88,166,255,0\.4\)\";\s*for\s*\(let\s*i\s*=\s*0;\s*i\s*<\s*this\.parts\.length;\s*i\+\+\)\s*\{/g, 
  'this.ctx.clearRect(0, 0, w, h);\n      if (settings.drisnyaMode) {\n        this.ctx.font = \"24px Arial\";\n        this.ctx.textAlign = \"center\";\n        this.ctx.textBaseline = \"middle\";\n      } else {\n        this.ctx.fillStyle = \"rgba(88,166,255,0.4)\";\n      }\n      for (let i = 0; i < this.parts.length; i++) {');

// The replace logic for particles rendering
code = code.replace(/this\.ctx\.beginPath\(\);\s*this\.ctx\.arc\(p\.x,\s*p\.y,\s*1\.5,\s*0,\s*Math\.PI\s*\*\s*2\);\s*this\.ctx\.fill\(\);\s*for\s*\(let\s*j\s*=\s*i\s*\+\s*1;\s*j\s*<\s*this\.parts\.length;\s*j\+\+\)\s*\{/g, 
  'if (settings.drisnyaMode) {\n          this.ctx.fillText(\"\\uD83D\\uDCA9\", p.x, p.y);\n        } else {\n          this.ctx.beginPath();\n          this.ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);\n          this.ctx.fill();\n          for (let j = i + 1; j < this.parts.length; j++) {');

// We also need to close the else block for the inner loop and rendering
code = code.replace(/this\.ctx\.stroke\(\);\s*\}\s*\}\s*\}/g, 'this.ctx.stroke();\n            }\n          }\n        }\n      }');

fs.writeFileSync('e:\\All Project\\AutoNektomeV2\\AutoNektome.user.js', code);
console.log("Refactoring done.");
