const fs = require('fs');
let code = fs.readFileSync('e:\\All Project\\AutoNektomeV2\\AutoNektome.user.js', 'utf8');

const firefoxCheck = `      if (this.getBrowserName() === "Firefox") {
        return {
          supported: false,
          ctor: null,
          message:
            "Firefox в текущей конфигурации не предоставляет SpeechRecognition. Скрипт автоматически включит голосовой режим, если API доступен в вашей сборке браузера.",
        };
      }`;

code = code.replace(firefoxCheck, '');

const particlesStart = `this.ctx.clearRect(0, 0, w, h);
      this.ctx.fillStyle = "rgba(88,166,255,0.4)";`;

const particlesStartMod = `this.ctx.clearRect(0, 0, w, h);
      if (settings.drisnyaMode) {
        this.ctx.font = "24px Arial";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
      } else {
        this.ctx.fillStyle = "rgba(88,166,255,0.4)";
      }`;

code = code.replace(particlesStart, particlesStartMod);

const particlesDraw = `this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
        this.ctx.fill();
        for (let j = i + 1; j < this.parts.length; j++) {`;

const particlesDrawMod = `if (settings.drisnyaMode) {
          this.ctx.fillText("💩", p.x, p.y);
        } else {
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
          this.ctx.fill();
          for (let j = i + 1; j < this.parts.length; j++) {`;

code = code.replace(particlesDraw, particlesDrawMod);

// Close the if statement
const particlesEnd = `this.ctx.stroke();
          }
        }
      }`;

const particlesEndMod = `this.ctx.stroke();
            }
          }
        }
      }`;

code = code.replace(particlesEnd, particlesEndMod);

fs.writeFileSync('e:\\All Project\\AutoNektomeV2\\AutoNektome.user.js', code);
console.log('emoji replaces:', code.includes('💩'), 'firefox removed:', !code.includes('Firefox в текущей'));
