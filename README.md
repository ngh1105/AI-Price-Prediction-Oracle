# AI Price Prediction Oracle

## Overview

AI Price Prediction Oracle is a GenLayer-powered application that produces 24-hour price forecasts (with reasoning) for any supported symbol.  
The project bundles everything needed to deploy, operate, and visualise the oracle:

- `contracts/` &mdash; GenLayer Intelligent Contract (`MarketPredictionManager.py`).
- `app/` &mdash; Next.js dashboard for viewing forecasts and submitting update jobs.
- `backend/` &mdash; Python automation skeleton using `genlayer-py` for scheduled updates.

The contract accepts structured market context, executes a non-deterministic LLM analysis, and stores JSON-formatted predictions with confidence, outlook, supporting factors, and citation list. Clients can fetch the latest record or the full history per symbol.

## Repository Layout

```
ai-price-prediction/
├─ contracts/
│  └─ MarketPredictionManager.py
├─ app/
│  ├─ components/
│  │  ├─ PredictionCard.tsx
│  │  └─ SymbolManagerDialog.tsx
│  ├─ client-providers.tsx
│  ├─ globals.css
│  ├─ layout.tsx
│  └─ page.tsx
├─ lib/
│  ├─ contract.ts
│  ├─ genlayer.ts
│  └─ glClient.ts
├─ backend/
│  ├─ README.md
│  ├─ requirements.txt
│  └─ src/
│     ├─ context_builder.py
│     ├─ scheduler.py
│     └─ tx_sender.py
├─ public/
│  └─ favicon.png
├─ LICENSE
├─ package.json
├─ postcss.config.js
├─ tailwind.config.ts
├─ tsconfig.json
├─ next.config.js
├─ next-env.d.ts
├─ global.d.ts
└─ .gitignore
```

## Contract Highlights

- Maintains registry of supported symbols with configurable minimum update interval.
- Stores history of prediction records per symbol (confidence, outlook, summary, reasoning, sources).
- `request_update(symbol, context_json)` runs a non-deterministic routine that uses the Equivalence Principle to validate LLM output before persisting the latest prediction.
- View methods expose symbol metadata, most recent prediction, or an arbitrary slice of history.

See `contracts/MarketPredictionManager.py` for the full implementation.

## Frontend (Next.js 15 + TailwindCSS)

- Wallet connection via RainbowKit/Wagmi.
- Real-time read from the contract using `genlayer-js`.
- Pages/components:
  - `page.tsx` renders the dashboard.
  - `PredictionCard.tsx` shows a single prediction with reasoning.
  - `SymbolManagerDialog.tsx` lets privileged users add new symbols.

### Running locally

```bash
npm install
npm run dev
```

Environment overrides (optional): create `.env.local` with

```
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYourDeployedContract
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_wc_id
```

## Backend Automation (Python + genlayer-py)

`backend/` contains an intentionally slim scaffold:

1. `context_builder.py` – aggregates data feeds (price, news, sentiment) into JSON context handed to the contract.
2. `tx_sender.py` – signs and submits `request_update` transactions with a local private key on **studionet**.
3. `scheduler.py` – runs the loop (default every 15 minutes, configurable via `UPDATE_INTERVAL_SECONDS`).

Install dependencies and run:

```bash
cd backend
python -m venv .venv
. .venv/Scripts/activate  # or source .venv/bin/activate
pip install -r requirements.txt
python -m src.scheduler
```

Set secrets through a `.env` file (not committed):

```
PRIVATE_KEY=0xabc...
CONTRACT_ADDRESS=0x...
GENLAYER_RPC_URL=https://studio.genlayer.com/api
SYMBOLS=BTC,ETH,SOL,AVAX,ARB
UPDATE_INTERVAL_SECONDS=900
```

## Deployment Steps

1. Deploy `MarketPredictionManager` using `genlayer-js` or the Python client.
2. Update the frontend `.env.local` with the deployed address and run `npm run build`.
3. Start the backend scheduler to push hourly updates.
4. (Optional) Configure a CI pipeline to deploy the Next.js app to Vercel or similar.

## License

MIT — see `LICENSE`.

