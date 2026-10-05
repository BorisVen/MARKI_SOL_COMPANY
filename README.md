# MARKI SOL COMPANY — кабінет компаній (Solana)

Веб-кабінет для брендів: випуск NFT (single / editions / колекції), масовий випуск, CRM (замовлення, доставки, COD, NFC-мітки), AI-генерація зображень, профіль. Мінт у Solana через Metaplex Umi.

- `web/` — Vite + React + TypeScript, Firebase Auth, Solana.
- `api/` — спільний Rust-бекенд.

## Фронтенд (`web/`)

```bash
cd web
cp .env.example .env.local     # VITE_API_BASE_URL, VITE_SOLANA_RPC, VITE_FIREBASE_*
npm ci --legacy-peer-deps
npm run dev                    # http://localhost:3002
```

## Бекенд (`api/`)

Rust + Axum, дані у Firebase (Firestore, Storage, Auth).

```bash
cp api/.env.example api/.env   # FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_PROJECT_ID, ...
cd api && cargo run            # http://localhost:8090
```

Docker: `docker build -t marki-api .` (Dockerfile у корені). `render.yaml` — приклад деплою на Render.
