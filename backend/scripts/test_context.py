#!/usr/bin/env python3
"""
Test script để kiểm tra context builder và xem output JSON
"""
import json
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.context_builder import build_market_context

def main():
    import time
    symbols = ['BTC', 'ETH']
    
    for symbol in symbols:
        print(f"\n{'='*60}")
        print(f"Testing context builder for {symbol}")
        print(f"{'='*60}\n")
        
        try:
            context_json = build_market_context(symbol)
            context_dict = json.loads(context_json)
            
            # Summary
            print(f"--- Summary for {symbol} ---")
            price_data = context_dict.get('price', {})
            print(f"Price: ${price_data.get('spot', 'N/A')}")
            print(f"24h Change: {price_data.get('usd_24h_change', 'N/A')}%")
            
            tech = context_dict.get('technical_indicators', {})
            if tech and 'error' not in tech:
                print(f"\nTechnical Indicators:")
                print(f"  Current Price: ${tech.get('current_price', 'N/A')}")
                print(f"  RSI: {tech.get('rsi', 'N/A')}")
                print(f"  Trend: {tech.get('trend', 'N/A')}")
                ma = tech.get('moving_averages', {})
                print(f"  MA7: ${ma.get('ma_7', 'N/A')}")
                print(f"  MA20: ${ma.get('ma_20', 'N/A')}")
                print(f"  MACD Signal: {tech.get('macd_signal', 'N/A')}")
                print(f"  Support: ${tech.get('support_level', 'N/A')}")
                print(f"  Resistance: ${tech.get('resistance_level', 'N/A')}")
                print(f"  Price above MA7: {tech.get('price_above_ma7', 'N/A')}")
                print(f"  Price above MA20: {tech.get('price_above_ma20', 'N/A')}")
            elif tech and 'error' in tech:
                print(f"\n[WARNING] Technical indicators error: {tech.get('error')}")
            else:
                print(f"\n[WARNING] No technical indicators available")
            
            news_count = len(context_dict.get('macro', {}).get('headlines', []))
            print(f"\nNews headlines: {news_count}")
            if news_count > 0:
                for i, headline in enumerate(context_dict.get('macro', {}).get('headlines', [])[:2], 1):
                    print(f"  {i}. {headline.get('title', 'N/A')[:60]}...")
            
            print(f"\nContext JSON length: {len(context_json)} characters")
            print(f"Context is valid JSON: OK")
            
        except Exception as e:
            print(f"[ERROR] Error for {symbol}: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()
        
        # Delay to avoid rate limiting
        if symbol != symbols[-1]:
            print(f"\nWaiting 2 seconds to avoid rate limits...")
            time.sleep(2)

if __name__ == '__main__':
    main()

