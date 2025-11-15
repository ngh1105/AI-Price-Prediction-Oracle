#!/usr/bin/env python3
"""
Quick script to check scheduler status and test one run
"""

import os
import sys
from dotenv import load_dotenv

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

load_dotenv()

from src.tx_sender import get_cached_client, list_registered_symbols, check_contract_health
from src.scheduler import run_once

def main():
    print("=" * 60)
    print("Scheduler Status Check")
    print("=" * 60)
    
    # Check environment variables
    print("\n1. Environment Variables:")
    contract_address = os.getenv('CONTRACT_ADDRESS')
    private_key = os.getenv('PRIVATE_KEY')
    interval = os.getenv('UPDATE_INTERVAL_SECONDS', '900')
    symbols_env = os.getenv('SYMBOLS', '')
    
    print(f"   CONTRACT_ADDRESS: {'SET' if contract_address else 'NOT SET'}")
    if contract_address:
        print(f"   Contract: {contract_address[:10]}...{contract_address[-10:]}")
    print(f"   PRIVATE_KEY: {'SET' if private_key else 'NOT SET'}")
    print(f"   UPDATE_INTERVAL_SECONDS: {interval}")
    print(f"   SYMBOLS (whitelist): {symbols_env if symbols_env else 'NOT SET (will use all symbols)'}")
    
    if not contract_address:
        print("\n❌ ERROR: CONTRACT_ADDRESS not set in .env")
        return
    
    if not private_key:
        print("\n❌ ERROR: PRIVATE_KEY not set in .env")
        return
    
    # Check contract health
    print("\n2. Contract Health Check:")
    try:
        client, contract_address, account = get_cached_client()
        if check_contract_health(client, contract_address):
            print("   ✅ Contract is healthy")
        else:
            print("   ❌ Contract health check failed")
            return
    except Exception as e:
        print(f"   ❌ Error connecting to contract: {e}")
        return
    
    # List symbols
    print("\n3. Symbols in Contract:")
    try:
        symbols = list_registered_symbols(client, contract_address)
        if symbols:
            print(f"   Found {len(symbols)} symbols: {', '.join(symbols)}")
        else:
            print("   ⚠️  No symbols found in contract. Add symbols via frontend first.")
            return
    except Exception as e:
        print(f"   ❌ Error fetching symbols: {e}")
        return
    
    # Test run
    print("\n4. Testing Scheduler Run:")
    print("   Running run_once()...")
    try:
        run_once()
        print("   ✅ Scheduler run completed (check logs above for details)")
    except Exception as e:
        print(f"   ❌ Error during scheduler run: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n" + "=" * 60)
    print("Status check complete")
    print("=" * 60)

if __name__ == '__main__':
    main()

