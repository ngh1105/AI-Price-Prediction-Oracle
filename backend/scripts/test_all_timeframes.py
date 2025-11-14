#!/usr/bin/env python3
"""
Test script to manually submit predictions for all timeframes for a symbol.
This can be used to test the multi-timeframe functionality immediately.
"""

import os
import sys
import time
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
from src.context_builder import build_market_context
from src.tx_sender import initialise_client, submit_prediction_update

load_dotenv()

TIMEFRAMES = ["1h", "4h", "12h", "24h", "7d", "30d"]

def main():
    if len(sys.argv) < 2:
        print("Usage: python test_all_timeframes.py <SYMBOL>")
        print("Example: python test_all_timeframes.py BTC")
        sys.exit(1)
    
    symbol = sys.argv[1].upper()
    
    print(f"Testing multi-timeframe predictions for {symbol}")
    print("=" * 60)
    
    # Initialize client
    try:
        client, contract_address, account = initialise_client()
        print(f"[OK] Connected to contract: {contract_address}")
    except Exception as e:
        print(f"[ERROR] Failed to initialize client: {e}")
        sys.exit(1)
    
    # Build context once
    print(f"\nBuilding market context for {symbol}...")
    try:
        context = build_market_context(symbol)
        print(f"[OK] Context generated ({len(context)} chars)")
    except Exception as e:
        print(f"[ERROR] Failed to build context: {e}")
        sys.exit(1)
    
    # Submit for each timeframe
    print(f"\nSubmitting predictions for all timeframes...")
    print("-" * 60)
    
    results = {}
    for timeframe in TIMEFRAMES:
        try:
            print(f"\n[{timeframe}] Submitting...", end=" ", flush=True)
            tx_hash, receipt_id = submit_prediction_update(
                client, 
                contract_address, 
                symbol, 
                context, 
                timeframe
            )
            results[timeframe] = {"success": True, "tx_hash": tx_hash}
            print(f"[OK] Success! TX: {tx_hash[:16]}...")
            
            # Small delay between timeframes
            if timeframe != TIMEFRAMES[-1]:
                time.sleep(2)
        except Exception as e:
            results[timeframe] = {"success": False, "error": str(e)}
            print(f"[ERROR] Failed: {e}")
    
    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY:")
    print("-" * 60)
    success_count = sum(1 for r in results.values() if r.get("success"))
    print(f"Successfully submitted: {success_count}/{len(TIMEFRAMES)}")
    
    for timeframe, result in results.items():
        status = "[OK]" if result.get("success") else "[ERROR]"
        print(f"  {status} {timeframe}: ", end="")
        if result.get("success"):
            print(f"TX {result['tx_hash'][:16]}...")
        else:
            print(f"Error: {result.get('error', 'Unknown')}")
    
    if success_count == len(TIMEFRAMES):
        print("\n[OK] All timeframes submitted successfully!")
    else:
        print(f"\n[WARNING] {len(TIMEFRAMES) - success_count} timeframe(s) failed")

if __name__ == '__main__':
    main()

