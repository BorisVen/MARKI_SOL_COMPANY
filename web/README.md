# admin-company

Веб-кабинет для компаний/брендов экосистемы Marki Identity: создание NFT (single / editions / коллекции), массовый выпуск, CRM (доставки, COD, NFC-меты), AI-генерация артов, профиль.

Стек: **Vite + React + TypeScript + Solana (Umi + Metaplex) + Firebase Auth**.

## Запуск локально

```bash
npm install
cp .env.example .env.local
# отредактируй .env.local под себя
npm run dev
```

Откроется на `http://localhost:3002`.

## Переменные окружения

| Переменная         | Назначение                                                                  |
| ------------------ | --------------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | Базовый URL Rust API (локально `http://localhost:8090`, прод `https://idenity-backend.duckdns.org`). |
| `VITE_SOLANA_RPC`  | Solana RPC. Для батч-минтов обязателен платный (Helius free / QuickNode).   |

Firebase API key захардкожен в `src/firebase.ts` — это публичный ключ клиента, гарантии безопасности обеспечиваются authorized-domains в Firebase Console.

## Скрипты

| Скрипт            | Что делает                          |
| ----------------- | ----------------------------------- |
| `npm run dev`     | Dev сервер на :3002                 |
| `npm run build`   | Билд в `dist/` (tsc + vite build)   |
| `npm run preview` | Превью прод-билда                   |

## Деплой (Vercel)

1. Импортируй репозиторий в [Vercel](https://vercel.com/new).
2. Framework Preset: **Vite** (определится автоматически из `vercel.json`).
3. В **Environment Variables** задай `VITE_API_BASE_URL` и `VITE_SOLANA_RPC`.
4. После деплоя добавь домен Vercel в [Firebase Console → Authentication → Settings → Authorized domains](https://console.firebase.google.com/), иначе Firebase Auth откажет.

## Бэкенд

Rust/Axum API живёт отдельно (см. `idenity-backend.duckdns.org`). Этот фронт его НЕ содержит — только клиент.

## Связанные приложения

- `identity/` — основное мобильное/веб-приложение пользователя
- `admin/` — внутренняя админка платформы
- `api/` — Rust бэкенд (общий для всех фронтов)
