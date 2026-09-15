# Air Radar MVP

Локальный 3D-трекер самолётов: Three.js + OSM/Overpass + серверный FR24 web live feed.

## Возможности
- задаваемая центральная точка и радиус;
- плоская синяя координатная сетка;
- OSM `primary`, `secondary`, `*_link` и здания;
- здания экструдируются по `height`, затем `building:levels`, иначе 6 м;
- самолёты из server-side FR24 web feed;
- вертикальная линия до земли и подпись высоты посередине;
- масштаб высоты;
- сохранение последних N проходов через область;
- OSM кэшируется на диске, треки и настройки переживают перезапуск.

## Запуск
```bash
npm install
npm run build
npm start
```
Открыть http://localhost:8787

Для разработки фронтенда отдельно:
```bash
npm run server
npm run dev
```
В dev-режиме Vite по умолчанию работает на 5173; проще использовать production build либо добавить proxy.

## FR24 liveFeed
По умолчанию `server/providers/fr24Web.js` использует legacy/web endpoint:
`https://data-cloud.flightradar24.com/zones/fcgi/feed.js`.

Это не официальный стабильный API. Если FR24 изменит адрес или формат, задайте `FR24_LIVEFEED_URL` либо замените только provider-файл. Остальная система от источника не зависит.

## Переменные окружения
См. `.env.example`. Node сам `.env` не загружает; задайте переменные окружения оболочки либо используйте любой env-loader.

## Кэш
- `data/settings.json`
- `data/tracks.json`
- `data/cache/osm/*.json`

Чтобы принудительно перекачать OSM для той же точки/радиуса, удалите соответствующий файл из `data/cache/osm/`.
