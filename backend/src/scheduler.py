import json
import logging
import os
import threading
import time
from typing import List

import schedule
from dotenv import load_dotenv

from .context_builder import build_market_context
from .tx_sender import (
  initialise_client,
  list_registered_symbols,
  submit_prediction_update,
  check_contract_health,
)

logging.basicConfig(
  level=logging.INFO,
  format='[%(asctime)s] %(levelname)s %(message)s',
)

# Run lock to prevent overlapping executions
run_lock = threading.Lock()


def _parse_symbols() -> List[str]:
  """Parse symbols from .env file (optional whitelist)"""
  value = os.getenv('SYMBOLS', '')
  return [symbol.strip().upper() for symbol in value.split(',') if symbol.strip()]


def run_once():
  # Check if previous run is still in progress
  if not run_lock.acquire(blocking=False):
    logging.warning('Previous run still in progress, skipping this run to prevent overlap')
    return
  
  try:
    start_time = time.time()
    logging.info('=' * 60)
    logging.info('Starting scheduler run')
    logging.info('=' * 60)
    
    # Initialize summary counters
    summary = {
      'symbols_processed': 0,
      'symbols_failed': 0,
      'timeframes_submitted': 0,
      'timeframes_failed': 0,
      'total_timeframes': 0,
    }
    
    client, contract_address, account = initialise_client()
    
    # Health check before proceeding
    if not check_contract_health(client, contract_address):
      logging.error('Contract health check failed. Skipping this run.')
      return
    
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
    summary['total_timeframes'] = len(symbols_to_update) * len(TIMEFRAMES)

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
        
        symbol_success = True
        # Generate predictions for ALL timeframes
        for timeframe in TIMEFRAMES:
          try:
            logging.info('Submitting %s prediction for %s', timeframe, symbol)
            tx_hash, _ = submit_prediction_update(client, contract_address, symbol, context, timeframe)
            logging.info('Update submitted for %s %s (tx %s)', symbol, timeframe, tx_hash)
            summary['timeframes_submitted'] += 1
            
            # Small delay between timeframes to avoid rate limits
            if timeframe != TIMEFRAMES[-1]:
              time.sleep(2)  # 2 second delay between timeframes
          except Exception as error:
            logging.exception('Failed to submit %s prediction for %s: %s', timeframe, symbol, error)
            summary['timeframes_failed'] += 1
            symbol_success = False
        
        if symbol_success:
          summary['symbols_processed'] += 1
        else:
          summary['symbols_failed'] += 1
        
        # Add delay between symbols to avoid rate limits
        if symbol != symbols_to_update[-1]:
          time.sleep(3)  # 3 second delay between symbols
      except Exception as error:
        logging.exception('Failed to process %s: %s', symbol, error)
        summary['symbols_failed'] += 1
    
    # Log summary
    elapsed_time = time.time() - start_time
    logging.info('=' * 60)
    logging.info('Scheduler run completed in %.2f seconds', elapsed_time)
    logging.info('Summary:')
    logging.info('  Symbols processed: %d/%d', summary['symbols_processed'], len(symbols_to_update))
    logging.info('  Symbols failed: %d', summary['symbols_failed'])
    logging.info('  Timeframes submitted: %d/%d', summary['timeframes_submitted'], summary['total_timeframes'])
    logging.info('  Timeframes failed: %d', summary['timeframes_failed'])
    success_rate = (summary['timeframes_submitted'] / summary['total_timeframes'] * 100) if summary['total_timeframes'] > 0 else 0
    logging.info('  Success rate: %.1f%%', success_rate)
    logging.info('=' * 60)
    
  finally:
    run_lock.release()


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

