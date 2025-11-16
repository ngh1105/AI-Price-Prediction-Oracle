"""
Automated script to record actual prices for expired predictions.
This script should run periodically (e.g., every 5-10 minutes) to check for
expired predictions and record their actual prices.
"""

import json
import logging
import os
import time
from typing import List, Optional

import requests
from dotenv import load_dotenv

from .tx_sender import get_cached_client, list_registered_symbols

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s %(message)s',
)

TIMEFRAMES = ['1h', '4h', '12h', '24h', '7d', '30d']


def fetch_current_price(symbol: str) -> Optional[float]:
    """
    Fetch current price for a symbol from Binance API.
    Returns None if fetch fails.
    """
    try:
        # Try Binance first
        binance_symbol = f"{symbol}USDT"
        url = f"https://api.binance.com/api/v3/ticker/price?symbol={binance_symbol}"
        response = requests.get(url, timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            return float(data.get('price', 0))
        
        # Fallback to CoinGecko
        logging.warning(f"Binance failed for {symbol}, trying CoinGecko...")
        gecko_url = f"https://api.coingecko.com/api/v3/simple/price?ids={symbol.lower()}&vs_currencies=usd"
        gecko_response = requests.get(gecko_url, timeout=5)
        
        if gecko_response.status_code == 200:
            data = gecko_response.json()
            price_key = symbol.lower()
            if price_key in data and 'usd' in data[price_key]:
                return float(data[price_key]['usd'])
        
        logging.error(f"Failed to fetch price for {symbol}")
        return None
        
    except Exception as e:
        logging.error(f"Error fetching price for {symbol}: {e}")
        return None


def parse_predicted_price(price_str: str) -> Optional[float]:
    """Parse price from string format (e.g., '43750.25 USD' or '43750.25')"""
    import re
    if not price_str or len(price_str.strip()) == 0:
        return None
    
    # Extract numeric value
    match = re.search(r'[\d,]+\.?\d*', price_str.replace(',', ''))
    if match:
        try:
            return float(match.group(0))
        except:
            return None
    return None


def record_expired_predictions():
    """
    Main function to check for expired predictions and record their actual prices.
    """
    load_dotenv()
    
    contract_address = os.getenv('CONTRACT_ADDRESS')
    if not contract_address:
        logging.error("CONTRACT_ADDRESS not set in .env")
        return
    
    client = get_cached_client()
    
    try:
        symbols = list_registered_symbols(client, contract_address)
        if not symbols:
            logging.info("No symbols registered")
            return
        
        total_recorded = 0
        total_errors = 0
        
        for symbol in symbols:
            for timeframe in TIMEFRAMES:
                try:
                    # Get expired predictions that need actual price
                    expired = client.read_contract(
                        address=contract_address,
                        function_name='get_expired_predictions',
                        args=[symbol, timeframe, 10]  # Check up to 10 expired predictions
                    )
                    
                    if not expired or len(expired) == 0:
                        continue
                    
                    logging.info(f"Found {len(expired)} expired predictions for {symbol} {timeframe}")
                    
                    # Fetch current price (for expired predictions, use current price as actual)
                    current_price = fetch_current_price(symbol)
                    if current_price is None:
                        logging.warning(f"Could not fetch price for {symbol}, skipping...")
                        continue
                    
                    actual_price_str = f"{current_price:.2f} USD"
                    
                    # Record actual price for each expired prediction
                    for pred in expired:
                        prediction_id = pred.get('prediction_id', '')
                        if not prediction_id:
                            continue
                        
                        # Check if already has actual_price
                        if pred.get('actual_price') and len(pred.get('actual_price', '')) > 0:
                            logging.debug(f"{prediction_id} already has actual_price, skipping")
                            continue
                        
                        try:
                            # Submit transaction to record actual price
                            tx_hash = client.write_contract(
                                address=contract_address,
                                function_name='record_actual_price',
                                args=[prediction_id, actual_price_str],
                                value=0
                            )
                            
                            logging.info(f"Recorded actual price for {prediction_id}: {actual_price_str} (tx: {tx_hash})")
                            total_recorded += 1
                            
                            # Small delay to avoid rate limiting
                            time.sleep(0.5)
                            
                        except Exception as e:
                            logging.error(f"Failed to record actual price for {prediction_id}: {e}")
                            total_errors += 1
                    
                except Exception as e:
                    logging.error(f"Error processing {symbol} {timeframe}: {e}")
                    total_errors += 1
        
        logging.info(f"Accuracy recording complete: {total_recorded} recorded, {total_errors} errors")
        
    except Exception as e:
        logging.error(f"Error in record_expired_predictions: {e}")


if __name__ == '__main__':
    record_expired_predictions()

