#!/usr/bin/env python3
"""Test Binance API fetching for SOL"""
import sys
import os
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.context_builder import _fetch_price_binance, _fetch_ohlc_binance, build_market_context

def main():
    symbol = 'SOL'
    
    print(f"Testing Binance API for {symbol}")
    print("=" * 60)
    
    # Test price fetch
    print("\n1. Testing price fetch...")
    price_result = _fetch_price_binance(symbol)
    if price_result:
        print(f"[OK] Price fetch successful:")
        print(f"   Price: ${price_result.get('spot')}")
        print(f"   24h Change: {price_result.get('usd_24h_change')}%")
        print(f"   Source: {price_result.get('source')}")
    else:
        print("[ERROR] Price fetch failed")
    
    # Test OHLC fetch
    print("\n2. Testing OHLC fetch...")
    ohlc_result = _fetch_ohlc_binance(symbol, days=7)
    if ohlc_result and len(ohlc_result) > 0:
        print(f"[OK] OHLC fetch successful:")
        print(f"   Number of candles: {len(ohlc_result)}")
        print(f"   Latest close: ${ohlc_result[-1][4]}")
        print(f"   First candle: {ohlc_result[0]}")
        print(f"   Last candle: {ohlc_result[-1]}")
    else:
        print("[ERROR] OHLC fetch failed")
    
    # Test full context
    print("\n3. Testing full context build...")
    try:
        context_json = build_market_context(symbol)
        context_dict = json.loads(context_json)
        
        print(f"[OK] Context build successful")
        print(f"   Context length: {len(context_json)} chars")
        
        price_data = context_dict.get('price', {})
        print(f"\n   Price data:")
        if 'error' in price_data:
            print(f"     [ERROR] Error: {price_data.get('error')}")
        else:
            print(f"     [OK] Spot: ${price_data.get('spot')}")
            print(f"     [OK] 24h Change: {price_data.get('usd_24h_change')}%")
            print(f"     [OK] Source: {price_data.get('source', 'unknown')}")
        
        tech_data = context_dict.get('technical_indicators', {})
        print(f"\n   Technical indicators:")
        if 'error' in tech_data:
            print(f"     [ERROR] Error: {tech_data.get('error')}")
        else:
            print(f"     [OK] Current Price: ${tech_data.get('current_price')}")
            print(f"     [OK] RSI: {tech_data.get('rsi')}")
            print(f"     [OK] Trend: {tech_data.get('trend')}")
            print(f"     [OK] Source: {tech_data.get('source', 'unknown')}")
        
    except Exception as e:
        print(f"[ERROR] Context build failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()

