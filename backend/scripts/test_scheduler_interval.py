#!/usr/bin/env python3
"""Test script to verify scheduler interval configuration"""
import os
import sys
import time
from dotenv import load_dotenv

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../src')))

load_dotenv()

# Check interval from .env
interval = int(os.getenv('UPDATE_INTERVAL_SECONDS', '900'))
print(f"UPDATE_INTERVAL_SECONDS from .env: {interval} seconds ({interval/60:.1f} minutes)")

# Test schedule import
try:
    import schedule
    print(f"Schedule library imported successfully")
    
    # Test schedule configuration
    schedule.clear()
    schedule.every(interval).seconds.do(lambda: print(f"[TEST] Scheduled job executed at {time.strftime('%H:%M:%S')}"))
    
    print(f"Scheduler configured to run every {interval} seconds")
    print(f"Waiting 10 seconds to test if scheduler is working...")
    
    # Run for 10 seconds to see if it triggers
    start_time = time.time()
    while time.time() - start_time < 10:
        schedule.run_pending()
        time.sleep(1)
    
    print("Test completed. If you see '[TEST] Scheduled job executed' above, scheduler is working.")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()

