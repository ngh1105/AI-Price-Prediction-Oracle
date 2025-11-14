import json
import logging
import os
import time
from typing import List

import schedule
from dotenv import load_dotenv

from .context_builder import build_market_context
from .tx_sender import (
  initialise_client,
  list_registered_symbols,
  submit_prediction_update,
)

logging.basicConfig(
  level=logging.INFO,
  format='[%(asctime)s] %(levelname)s %(message)s',
)


def _parse_symbols() -> List[str]:
  """Parse symbols from .env file (optional whitelist)"""
  value = os.getenv('SYMBOLS', '')
  return [symbol.strip().upper() for symbol in value.split(',') if symbol.strip()]


def run_once():
  client, contract_address, account = initialise_client()
  
  # Read all symbols from contract
  try:
    contract_symbols = list_registered_symbols(client, contract_address)
    logging.info('Found %d symbols in contract: %s', len(contract_symbols), contract_symbols)
  except Exception as error:
    logging.error('Unable to fetch symbols from contract: %s', error, exc_info=True)
    return
  
  if not contract_symbols:
    logging.warning('No symbols registered in contract. Add symbols via frontend first.')
    return
  
  # If SYMBOLS is set in .env, use it as whitelist (only update those symbols)
  # Otherwise, update all symbols from contract
  env_symbols = _parse_symbols()
  if env_symbols:
    # Use .env as whitelist - only update symbols that are both in contract and .env
    symbols_to_update = [s for s in contract_symbols if s in env_symbols]
    logging.info('SYMBOLS whitelist active: Updating %d/%d symbols from contract (%s)', 
                 len(symbols_to_update), len(contract_symbols), symbols_to_update)
    if len(symbols_to_update) < len(contract_symbols):
      skipped = [s for s in contract_symbols if s not in symbols_to_update]
      logging.info('Skipping %d symbols not in whitelist: %s', len(skipped), skipped)
  else:
    # No .env config - update all symbols from contract
    symbols_to_update = contract_symbols
    logging.info('No SYMBOLS whitelist in .env - Updating ALL %d symbols from contract: %s', 
                 len(symbols_to_update), symbols_to_update)
  
  if not symbols_to_update:
    logging.warning('No symbols to update (contract has symbols but none match .env whitelist)')
    return

  # Supported timeframes
  TIMEFRAMES = ["1h", "4h", "12h", "24h", "7d", "30d"]

  for symbol in symbols_to_update:
    try:
      context = build_market_context(symbol)
      # Check if context has critical errors
      try:
        context_dict = json.loads(context)
        price_error = context_dict.get('price', {}).get('error')
        tech_error = context_dict.get('technical_indicators', {}).get('error')
        if price_error or tech_error:
          logging.warning('Symbol %s has API errors - price: %s, technical: %s', symbol, price_error, tech_error)
          logging.warning('Submitting anyway, but prediction quality may be reduced')
      except:
        pass  # If context is not valid JSON, let contract handle it
      
      # Generate predictions for ALL timeframes
      for timeframe in TIMEFRAMES:
        try:
          logging.info('Submitting %s prediction for %s', timeframe, symbol)
          tx_hash, _ = submit_prediction_update(client, contract_address, symbol, context, timeframe)
          logging.info('Update submitted for %s %s (tx %s)', symbol, timeframe, tx_hash)
          
          # Small delay between timeframes to avoid rate limits
          if timeframe != TIMEFRAMES[-1]:
            time.sleep(2)  # 2 second delay between timeframes
        except Exception as error:
          logging.exception('Failed to submit %s prediction for %s: %s', timeframe, symbol, error)
      
      # Add delay between symbols to avoid rate limits
      if symbol != symbols_to_update[-1]:
        time.sleep(3)  # 3 second delay between symbols
    except Exception as error:
      logging.exception('Failed to process %s: %s', symbol, error)


def main():
  load_dotenv()
  # Default to 15 minutes (900 seconds) instead of 1 hour
  interval = int(os.getenv('UPDATE_INTERVAL_SECONDS', '900'))

  run_once()
  schedule.every(interval).seconds.do(run_once)

  logging.info('Scheduler started (interval=%ss)', interval)
  while True:
    schedule.run_pending()
    time.sleep(1)


if __name__ == '__main__':
  main()

