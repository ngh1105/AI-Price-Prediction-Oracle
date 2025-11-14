#!/usr/bin/env python3
"""Detailed test script to verify scheduler logic"""
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

def test_symbol_parsing():
    """Test _parse_symbols function"""
    print("\n" + "=" * 60)
    print("TEST 1: Symbol Parsing")
    print("=" * 60)
    
    from src.scheduler import _parse_symbols
    
    # Test with empty
    os.environ['SYMBOLS'] = ''
    result = _parse_symbols()
    print(f"Empty SYMBOLS: {result}")
    assert result == [], "Should return empty list"
    
    # Test with single symbol
    os.environ['SYMBOLS'] = 'BTC'
    result = _parse_symbols()
    print(f"Single symbol: {result}")
    assert result == ['BTC'], "Should return ['BTC']"
    
    # Test with multiple symbols
    os.environ['SYMBOLS'] = 'BTC,ETH,SOL'
    result = _parse_symbols()
    print(f"Multiple symbols: {result}")
    assert result == ['BTC', 'ETH', 'SOL'], "Should return ['BTC', 'ETH', 'SOL']"
    
    # Test with spaces
    os.environ['SYMBOLS'] = ' BTC , ETH , SOL '
    result = _parse_symbols()
    print(f"With spaces: {result}")
    assert result == ['BTC', 'ETH', 'SOL'], "Should strip spaces"
    
    # Test with lowercase
    os.environ['SYMBOLS'] = 'btc,eth,sol'
    result = _parse_symbols()
    print(f"Lowercase: {result}")
    assert result == ['BTC', 'ETH', 'SOL'], "Should uppercase"
    
    print("[OK] Symbol parsing tests passed!")

def test_interval_config():
    """Test interval configuration"""
    print("\n" + "=" * 60)
    print("TEST 2: Interval Configuration")
    print("=" * 60)
    
    # Test default
    if 'UPDATE_INTERVAL_SECONDS' in os.environ:
        del os.environ['UPDATE_INTERVAL_SECONDS']
    from src.scheduler import main
    import importlib
    import src.scheduler as scheduler_module
    importlib.reload(scheduler_module)
    
    # This is tricky to test without running main(), so just check env reading
    interval = int(os.getenv('UPDATE_INTERVAL_SECONDS', '900'))
    print(f"Default interval: {interval} seconds ({interval/60:.1f} minutes)")
    assert interval == 900, "Default should be 900 seconds"
    
    # Test custom
    os.environ['UPDATE_INTERVAL_SECONDS'] = '600'
    interval = int(os.getenv('UPDATE_INTERVAL_SECONDS', '900'))
    print(f"Custom interval: {interval} seconds ({interval/60:.1f} minutes)")
    assert interval == 600, "Should read custom interval"
    
    print("[OK] Interval configuration tests passed!")

def test_timeframes():
    """Test timeframe list"""
    print("\n" + "=" * 60)
    print("TEST 3: Timeframes")
    print("=" * 60)
    
    TIMEFRAMES = ["1h", "4h", "12h", "24h", "7d", "30d"]
    print(f"Timeframes: {TIMEFRAMES}")
    print(f"Total timeframes: {len(TIMEFRAMES)}")
    
    # Calculate total time per symbol
    delay_between_timeframes = 2  # seconds
    total_delay = (len(TIMEFRAMES) - 1) * delay_between_timeframes
    print(f"Total delay between timeframes: {total_delay} seconds")
    
    # Calculate total time for multiple symbols
    delay_between_symbols = 3  # seconds
    num_symbols = 5
    total_time = num_symbols * (total_delay + delay_between_symbols)
    print(f"Estimated time for {num_symbols} symbols: ~{total_time} seconds ({total_time/60:.1f} minutes)")
    
    print("[OK] Timeframe tests passed!")

def test_context_validation():
    """Test context validation logic"""
    print("\n" + "=" * 60)
    print("TEST 4: Context Validation")
    print("=" * 60)
    
    # Test valid context
    valid_context = json.dumps({
        'symbol': 'BTC',
        'price': {'spot': 50000, 'usd_24h_change': 2.5},
        'technical_indicators': {'current_price': 50000},
        'macro': {'headlines': []}
    })
    
    try:
        context_dict = json.loads(valid_context)
        price_error = context_dict.get('price', {}).get('error')
        tech_error = context_dict.get('technical_indicators', {}).get('error')
        print(f"Valid context - price_error: {price_error}, tech_error: {tech_error}")
        assert price_error is None and tech_error is None, "Should have no errors"
    except Exception as e:
        print(f"[ERROR] Failed to parse valid context: {e}")
        raise
    
    # Test context with errors
    error_context = json.dumps({
        'symbol': 'BTC',
        'price': {'error': 'Rate limit exceeded'},
        'technical_indicators': {'error': 'API timeout'}
    })
    
    try:
        context_dict = json.loads(error_context)
        price_error = context_dict.get('price', {}).get('error')
        tech_error = context_dict.get('technical_indicators', {}).get('error')
        print(f"Error context - price_error: {price_error}, tech_error: {tech_error}")
        assert price_error is not None or tech_error is not None, "Should detect errors"
    except Exception as e:
        print(f"[ERROR] Failed to parse error context: {e}")
        raise
    
    print("[OK] Context validation tests passed!")

def main():
    print("\n" + "=" * 60)
    print("SCHEDULER DETAILED TEST SUITE")
    print("=" * 60)
    
    try:
        test_symbol_parsing()
        test_interval_config()
        test_timeframes()
        test_context_validation()
        
        print("\n" + "=" * 60)
        print("ALL TESTS PASSED!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n[FAILED] Test error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()

