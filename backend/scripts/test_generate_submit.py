#!/usr/bin/env python3
"""Test script to verify generate context and submit prediction flow"""
import os
import sys
import json
import logging
from dotenv import load_dotenv

# Change to backend directory for proper imports
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
os.chdir(backend_dir)
sys.path.insert(0, backend_dir)

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s %(message)s',
)

def test_generate_context():
    """Test context generation"""
    print("=" * 60)
    print("Testing context generation...")
    print("=" * 60)
    
    try:
        from src.context_builder import build_market_context
        
        # Test with a known symbol
        symbol = "BTC"
        print(f"\nGenerating context for {symbol}...")
        context = build_market_context(symbol)
        
        # Parse and validate
        context_dict = json.loads(context)
        print(f"\n[OK] Context generated successfully ({len(context)} chars)")
        print(f"\nContext structure:")
        print(f"  - symbol: {context_dict.get('symbol')}")
        print(f"  - generated_at: {context_dict.get('generated_at')}")
        print(f"  - price: {context_dict.get('price', {}).get('spot')} USD")
        print(f"  - technical_indicators: {'present' if context_dict.get('technical_indicators') else 'missing'}")
        print(f"  - macro.headlines: {len(context_dict.get('macro', {}).get('headlines', []))} items")
        
        # Check for errors
        price_error = context_dict.get('price', {}).get('error')
        tech_error = context_dict.get('technical_indicators', {}).get('error')
        if price_error:
            print(f"\n[WARNING] Price error: {price_error}")
        if tech_error:
            print(f"\n[WARNING] Technical indicators error: {tech_error}")
        
        return context
    except Exception as e:
        print(f"\n[ERROR] Failed to generate context: {e}")
        import traceback
        traceback.print_exc()
        return None

def test_submit_prediction(context_json: str):
    """Test prediction submission"""
    print("\n" + "=" * 60)
    print("Testing prediction submission...")
    print("=" * 60)
    
    try:
        from src.tx_sender import initialise_client, submit_prediction_update
        
        symbol = "BTC"
        timeframe = "24h"
        
        print(f"\nInitializing client...")
        client, contract_address, account = initialise_client()
        print(f"[OK] Connected to contract: {contract_address}")
        print(f"[OK] Account: {account.address}")
        
        print(f"\nSubmitting prediction for {symbol} ({timeframe})...")
        tx_hash, receipt_id = submit_prediction_update(
            client, 
            contract_address, 
            symbol, 
            context_json, 
            timeframe
        )
        
        print(f"\n[OK] Transaction submitted successfully!")
        print(f"  - TX Hash: {tx_hash}")
        print(f"  - Receipt ID: {receipt_id if receipt_id else 'Pending...'}")
        
        return True
    except Exception as e:
        print(f"\n[ERROR] Failed to submit prediction: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("\n" + "=" * 60)
    print("TEST: Generate Context & Submit Prediction")
    print("=" * 60)
    
    # Step 1: Generate context
    context = test_generate_context()
    if not context:
        print("\n[FAILED] Context generation failed. Cannot proceed with submission test.")
        return
    
    # Step 2: Submit prediction
    success = test_submit_prediction(context)
    
    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    print(f"Context Generation: {'[OK]' if context else '[FAILED]'}")
    print(f"Prediction Submission: {'[OK]' if success else '[FAILED]'}")
    
    if context and success:
        print("\n[SUCCESS] All tests passed!")
    else:
        print("\n[FAILED] Some tests failed. Check errors above.")

if __name__ == '__main__':
    main()

