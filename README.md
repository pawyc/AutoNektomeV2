# AutoNektome V2

![Версия](https://img.shields.io/badge/версия-6.8-brightgreen)
![Лицензия](https://img.shields.io/badge/лицензия-MIT-blue)
![Платформа](https://img.shields.io/badge/Chromium%20%2B%20Tampermonkey-userscript-yellowgreen)

Userscript для [nekto.me/audiochat#/](https://nekto.me/audiochat#/) с авто-поиском, горячими клавишами, настройками аудио, голосовым управлением и отдельной панелью управления.

[![Скачать Tampermonkey](https://img.shields.io/badge/1.%20Скачать-Tampermonkey-black?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
[![Установить AutoNektome](https://img.shields.io/badge/2.%20Установить-AutoNektome.user.js-darkgreen?logo=tampermonkey&logoColor=white)](https://raw.githubusercontent.com/pawyc/AutoNektomeV2/main/AutoNektome.user.js)

## Совместимость

Скрипт рассчитан на Tampermonkey в браузерах на Chromium: Google Chrome, Microsoft Edge, Brave, Opera, Яндекс Браузер и похожие сборки.

Поддерживаемая страница:

- `https://nekto.me/audiochat#/`
- `https://nekto.me/audiochat`
- другие hash/router-варианты внутри `https://nekto.me/audiochat*`

## Установка

1. Нажмите кнопку **Скачать Tampermonkey** и установите расширение из Chrome Web Store.
2. Если браузер попросит разрешить userscripts, откройте страницу управления расширением Tampermonkey и включите **Allow User Scripts**. В старых Chromium-сборках может понадобиться **Developer Mode** на странице `chrome://extensions`.
3. Нажмите кнопку **Установить AutoNektome**.
4. В открывшемся окне Tampermonkey нажмите **Install**.
5. Откройте [nekto.me/audiochat#/](https://nekto.me/audiochat#/) и разрешите доступ к микрофону.

Важно: для автообновлений устанавливайте скрипт по кнопке выше, а не вставляйте код вручную в редактор Tampermonkey.

## Что умеет

- Авто-режим: автоматический запуск поиска нового собеседника.
- Горячие клавиши: быстрые действия с клавиатуры.
- Голосовое управление: команды `старт`, `стоп`, `скип`.
- Аудио-настройки: loopback, шумоподавление, pitch shift, voice enhance, lag effect.
- UI-панель: статус, статистика, таймер разговора и быстрые кнопки.
- Темы и фоновые эффекты.
- Скрытие нижнего промо-блока NektoMe с Google Play/App Store.
- Режим разработчика: история, стабильность, сброс аудио, сброс статистики, копирование лога и анимация фона в отдельной вкладке.
- IP-чекер через WebRTC ICE: отключен по умолчанию и включается вручную.

## Управление

Горячие клавиши:

- `M` - выключить или включить микрофон
- `H` - выключить или включить звук
- `S` - завершить текущий разговор или остановить поиск
- `A` - переключить авто-режим
- `Space` - начать поиск

Голосовые команды:

- `скип`, `далее`, `next`
- `стоп`, `завершить`
- `старт`, `чат`, `поиск`

Примечание для Brave: голосовое управление через браузерный Web Speech API в Brave фактически недоступно. Brave может показывать `webkitSpeechRecognition`, но при запуске возвращает `network`, потому что не подключается к сервису распознавания речи. Это не чинится разрешением микрофона; для голосовых команд используйте Chrome или Edge.

В Chrome/Edge проверьте:

- сайт `https://nekto.me` имеет разрешение на микрофон;
- страница открыта по HTTPS;
- в системе выбран рабочий микрофон;
- корпоративный прокси, VPN или блокировщик DNS не режет сервисы распознавания речи браузера.

## Автообновления

Tampermonkey проверяет обновления по metadata userscript.

- `@downloadURL`: [AutoNektome.user.js](https://raw.githubusercontent.com/pawyc/AutoNektomeV2/main/AutoNektome.user.js)
- `@updateURL`: [AutoNektome.meta.js](https://raw.githubusercontent.com/pawyc/AutoNektomeV2/main/AutoNektome.meta.js)

Если нужно проверить обновление вручную:

1. Откройте dashboard Tampermonkey.
2. Выберите **Check for userscript updates**.
3. Обновите страницу `nekto.me/audiochat#/`.

## Если скрипт не появился на сайте

- Проверьте, что расширение Tampermonkey включено.
- Проверьте, что сам скрипт включен в dashboard Tampermonkey.
- Для Chromium/Tampermonkey 5.3+ включите **Allow User Scripts** или **Developer Mode**.
- Откройте именно `https://nekto.me/audiochat#/`, а не другую страницу NektoMe.
- Перезагрузите страницу после установки или обновления.

## Разработка

Основные файлы:

- [AutoNektome.user.js](https://raw.githubusercontent.com/pawyc/AutoNektomeV2/main/AutoNektome.user.js) - основной userscript
- [AutoNektome.meta.js](https://raw.githubusercontent.com/pawyc/AutoNektomeV2/main/AutoNektome.meta.js) - metadata для автообновлений
- [githubdark.css](./githubdark.css) - внешняя тема
- [.github/workflows/publish-userscript.yml](./.github/workflows/publish-userscript.yml) - публикация новой версии

Локальная проверка:

```bash
node --check AutoNektome.user.js
node .github/scripts/generate-meta.mjs
```

## Лицензия

MIT. См. [LICENSE](./LICENSE).
