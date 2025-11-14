# Backend Automation (Python)

This folder contains a minimal scaffold for the automated updater (default: every 15 minutes) that prepares market context JSON
and calls the `request_update` entrypoint of `MarketPredictionManager`.

## Setup

```bash
python -m venv .venv
. .venv/Scripts/activate  # or source .venv/bin/activate
pip install -r requirements.txt
```

Create a `.env` file (not committed) with:

```
PRIVATE_KEY=0xabc123...
CONTRACT_ADDRESS=0x...
GENLAYER_RPC_URL=https://studio.genlayer.com/api
# Optional: If set, only update these symbols (whitelist)
# If not set, scheduler will update ALL symbols registered in contract
SYMBOLS=BTC,ETH,SOL,AVAX,ARB
UPDATE_INTERVAL_SECONDS=900
```

## Scripts

- `context_builder.py` – assembles market data from HTTP APIs into a JSON payload.
- `tx_sender.py` – signs and broadcasts transactions using `genlayer-py`.
- `scheduler.py` – orchestrates collection + submission loop (default: every 15 minutes, configurable via UPDATE_INTERVAL_SECONDS).

Run the scheduler:

```bash
python -m src.scheduler
```

The code aims to be extendable; swap out the placeholder data collectors with your real data providers.

