import json
import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from typing import List

import schedule
from dotenv import load_dotenv

from .context_builder import build_market_context
from .tx_sender import (
  get_cached_client,
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


def is_timeframe_expired(client, contract_address: str, symbol: str, timeframe: str) -> bool:
  """
  Check if the latest prediction for a timeframe has expired.
  Returns True if expired or no prediction exists.
  """
  try:
    # Get latest prediction
    latest = client.read_contract(
      address=contract_address,
      function_name='get_latest_prediction_by_timeframe',
      args=[symbol, timeframe]
    )
    
    if not latest:
      logging.debug(f'{symbol} {timeframe}: No prediction exists, will create')
      return True  # No prediction exists, need to create one
    
    # Extract raw_context and parse generated_at
    raw_context = latest.get('raw_context', '{}')
    if not raw_context:
      logging.debug(f'{symbol} {timeframe}: No raw_context, will update')
      return True
    
    try:
      context = json.loads(raw_context)
      generated_at_str = context.get('generated_at', '')
      
      if not generated_at_str:
        logging.debug(f'{symbol} {timeframe}: No timestamp in context, will update')
        return True  # No timestamp, consider expired
      
      # Parse ISO timestamp
      # Handle both 'Z' and '+00:00' formats
      if generated_at_str.endswith('Z'):
        generated_at_str = generated_at_str[:-1] + '+00:00'
      
      generated_at = datetime.fromisoformat(generated_at_str)
      if generated_at.tzinfo is None:
        generated_at = generated_at.replace(tzinfo=timezone.utc)
      
      # Calculate expiration time based on timeframe
      timeframe_durations = {
        '1h': timedelta(hours=1),
        '4h': timedelta(hours=4),
        '12h': timedelta(hours=12),
        '24h': timedelta(hours=24),
        '7d': timedelta(days=7),
        '30d': timedelta(days=30),
      }
      
      duration = timeframe_durations.get(timeframe.lower())
      if not duration:
        logging.warning(f'{symbol} {timeframe}: Unknown timeframe, will update')
        return True  # Unknown timeframe, consider expired
      
      expiration_time = generated_at + duration
      now = datetime.now(timezone.utc)
      
      is_expired = now >= expiration_time
      
      if is_expired:
        expired_ago = now - expiration_time
        logging.info(f'{symbol} {timeframe}: EXPIRED (generated: {generated_at.strftime("%Y-%m-%d %H:%M:%S UTC")}, expired: {expiration_time.strftime("%Y-%m-%d %H:%M:%S UTC")}, expired {expired_ago} ago)')
      else:
        remaining = expiration_time - now
        logging.info(f'{symbol} {timeframe}: Still valid (expires in {remaining})')
      
      return is_expired
      
    except (json.JSONDecodeError, ValueError, KeyError) as e:
      logging.warning(f'{symbol} {timeframe}: Failed to parse timestamp: {e}, will update')
      return True  # On error, consider expired to be safe
      
  except Exception as e:
    # If prediction doesn't exist or error reading, consider expired
    error_msg = str(e).lower()
    if 'no predictions recorded' in error_msg or 'prediction missing' in error_msg:
      logging.debug(f'{symbol} {timeframe}: No prediction found, will create')
    else:
      logging.warning(f'{symbol} {timeframe}: Error checking expiration: {e}, will update')
    return True


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
      'timeframes_skipped': 0,  # New counter for skipped timeframes
      'total_timeframes_checked': 0,
    }
    
    # Use cached client for better performance
    client, contract_address, account = get_cached_client()
    
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
    summary['total_timeframes_checked'] = len(symbols_to_update) * len(TIMEFRAMES)

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
        # Check expiration for each timeframe before submitting
        expired_timeframes = []
        for tf in TIMEFRAMES:
          if is_timeframe_expired(client, contract_address, symbol, tf):
            expired_timeframes.append(tf)
          else:
            summary['timeframes_skipped'] += 1
        
        if not expired_timeframes:
          logging.info('Symbol %s: All timeframes still valid, skipping', symbol)
          summary['symbols_processed'] += 1
          continue
        
        logging.info('Symbol %s: Submitting %d expired timeframes: %s', symbol, len(expired_timeframes), expired_timeframes)
        
        # Generate predictions for EXPIRED timeframes only, in parallel (with rate limiting)
        max_workers = min(3, len(expired_timeframes))  # Limit concurrent submissions to avoid rate limits
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
          # Submit only expired timeframes
          future_to_timeframe = {
            executor.submit(submit_prediction_update, client, contract_address, symbol, context, tf): tf
            for tf in expired_timeframes
          }
          
          # Process results as they complete
          for future in as_completed(future_to_timeframe):
            timeframe = future_to_timeframe[future]
            try:
              tx_hash, _ = future.result()
              logging.info('Update submitted for %s %s (tx %s)', symbol, timeframe, tx_hash)
              summary['timeframes_submitted'] += 1
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
    logging.info('  Timeframes checked: %d', summary['total_timeframes_checked'])
    logging.info('  Timeframes submitted: %d (expired)', summary['timeframes_submitted'])
    logging.info('  Timeframes skipped: %d (still valid)', summary['timeframes_skipped'])
    logging.info('  Timeframes failed: %d', summary['timeframes_failed'])
    if summary['total_timeframes_checked'] > 0:
      expired_rate = (summary['timeframes_submitted'] / summary['total_timeframes_checked'] * 100)
      logging.info('  Expired rate: %.1f%%', expired_rate)
    logging.info('=' * 60)
    
  finally:
    run_lock.release()


def main():
  load_dotenv()
  # Default to 1 hour (3600 seconds)
  interval = int(os.getenv('UPDATE_INTERVAL_SECONDS', '3600'))

  run_once()
  schedule.every(interval).seconds.do(run_once)

  logging.info('Scheduler started (interval=%ss)', interval)
  while True:
    schedule.run_pending()
    time.sleep(1)


if __name__ == '__main__':
  main()

