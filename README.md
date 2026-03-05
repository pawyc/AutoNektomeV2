# AutoNektome V2

![Версия](https://img.shields.io/badge/версия-6.1-brightgreen)
![Лицензия](https://img.shields.io/badge/лицензия-MIT-blue)
![Платформа](https://img.shields.io/badge/Tampermonkey-userscript-yellowgreen)

Userscript для [nekto.me/audiochat](https://nekto.me/audiochat) с авто-поиском, голосовым управлением, настройками аудио, кастомным UI и автообновлением через GitHub.

[![Установить в Tampermonkey](https://img.shields.io/badge/Tampermonkey-Установить%20скрипт-darkgreen?logo=tampermonkey&logoColor=white)](https://raw.githubusercontent.com/pawyc/AutoNektomeV2/main/AutoNektome.user.js)

## Что умеет

- Авто-режим: автоматический поиск нового собеседника.
- Авто-скип: пропуск через заданное количество секунд разговора.
- Горячие клавиши: быстрые действия с клавиатуры.
- Голосовое управление: команды `старт`, `стоп`, `скип`.
- Аудио-настройки: loopback, усиление микрофона, шумоподавление, pitch shift, voice enhance, lag effect.
- UI-панель: статистика, состояние сессии, быстрые кнопки управления.
- Темы и фоновые эффекты.
- IP-чекер: отключен по умолчанию и включается вручную в интерфейсе.

## Установка

1. Установите расширение Tampermonkey.
2. Нажмите кнопку выше `Установить в Tampermonkey`.
3. Подтвердите установку скрипта в Tampermonkey.
4. Откройте [nekto.me/audiochat](https://nekto.me/audiochat).

Важно:

- Для автообновлений скрипт должен быть установлен именно по GitHub-ссылке, а не вставлен вручную в редактор Tampermonkey.
- Для аудио-функций браузер должен получить доступ к микрофону.
- Некоторые функции зависят от поддержки Web Audio API и SpeechRecognition в вашем браузере.

## Автообновления

Проект публикуется напрямую из ветки `main`.

- `@downloadURL` указывает на [AutoNektome.user.js](https://raw.githubusercontent.com/pawyc/AutoNektomeV2/main/AutoNektome.user.js)
- `@updateURL` указывает на [AutoNektome.meta.js](https://raw.githubusercontent.com/pawyc/AutoNektomeV2/main/AutoNektome.meta.js)
- при пуше в `main` GitHub Actions обновляет версию и пересобирает metadata-файл
- Tampermonkey подтягивает новую версию при проверке обновлений

Если нужно проверить вручную:

1. Откройте Tampermonkey.
2. Выберите `Check for userscript updates`.
3. Убедитесь, что версия скрипта стала новее.

## Управление

Основные горячие клавиши:

- `M` - выключить/включить микрофон
- `H` - выключить/включить звук
- `S` - скипнуть собеседника
- `A` - переключить авто-режим
- `Space` - начать поиск

Голосовые команды по умолчанию:

- `скип`, `далее`, `next`
- `стоп`, `завершить`
- `старт`, `чат`, `поиск`

## Разработка

Основные файлы проекта:

- [AutoNektome.user.js](https://raw.githubusercontent.com/pawyc/AutoNektomeV2/main/AutoNektome.user.js) - основной userscript
- [AutoNektome.meta.js](https://raw.githubusercontent.com/pawyc/AutoNektomeV2/main/AutoNektome.meta.js) - metadata для обновлений
- [githubdark.css](./githubdark.css) - внешняя тема
- [.github/workflows/publish-userscript.yml](./.github/workflows/publish-userscript.yml) - автопубликация новой версии

Локальная проверка:

```bash
node --check AutoNektome.user.js
node .github/scripts/generate-meta.mjs
```

## Лицензия

MIT. См. [LICENSE](./LICENSE).
