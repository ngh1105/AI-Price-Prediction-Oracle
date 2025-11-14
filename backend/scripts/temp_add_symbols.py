#!/usr/bin/env python3
"""
Temporary helper script to add popular symbols and submit predictions for all timeframes.
Delete this file after use.
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

from src.context_builder import build_market_context
from src.tx_sender import (
    add_symbol,
    initialise_client,
    submit_prediction_update,
)

TIMEFRAMES = ["1h", "4h", "12h", "24h", "7d", "30d"]
DEFAULT_SYMBOLS = ["ETH", "XRP", "DOGE", "SOL", "BNB"]


def main():
    load_dotenv()

    symbols = [arg.upper() for arg in sys.argv[1:]] or DEFAULT_SYMBOLS

    client, contract_address, account = initialise_client()
    print(f"Using contract: {contract_address}")

    for symbol in symbols:
        print(f"\n=== Processing {symbol} ===")
        try:
            tx_hash, _ = add_symbol(
                client,
                contract_address,
                symbol,
                f"{symbol} auto-added by temp script",
            )
            print(f"Add symbol TX: {tx_hash}")
        except Exception as exc:
            if "symbol already exists" in str(exc).lower():
                print(f"{symbol} already registered, continuing...")
            else:
                print(f"Failed to add {symbol}: {exc}")
                continue

        try:
            context = build_market_context(symbol)
            print(f"Context generated ({len(context)} chars)")
        except Exception as exc:
            print(f"Failed to build context for {symbol}: {exc}")
            continue

        for timeframe in TIMEFRAMES:
            try:
                tx_hash, _ = submit_prediction_update(
                    client,
                    contract_address,
                    symbol,
                    context,
                    timeframe,
                )
                print(f"[{timeframe}] prediction submitted (tx {tx_hash[:16]}...)")
                if timeframe != TIMEFRAMES[-1]:
                    time.sleep(1)
            except Exception as exc:
                print(f"[{timeframe}] submission failed: {exc}")


if __name__ == "__main__":
    main()

