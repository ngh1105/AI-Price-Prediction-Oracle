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
configured_interval = int(os.getenv('UPDATE_INTERVAL_SECONDS', '900'))
print(f"UPDATE_INTERVAL_SECONDS from .env: {configured_interval} seconds ({configured_interval/60:.1f} minutes)")

# Use a short test interval so the job can execute within the test window
test_interval = 5  # 5 seconds for testing
print(f"Using test interval: {test_interval} seconds (to verify scheduler works within test window)")

# Test schedule import
try:
    import schedule
    print(f"Schedule library imported successfully")
    
    # Test schedule configuration with test interval
    schedule.clear()
    job_executed = [False]  # Use list to allow modification in lambda
    
    def test_job():
        job_executed[0] = True
        print(f"[TEST] Scheduled job executed at {time.strftime('%H:%M:%S')}")
    
    schedule.every(test_interval).seconds.do(test_job)
    
    print(f"Scheduler configured to run every {test_interval} seconds (test mode)")
    print(f"Waiting {test_interval + 3} seconds to verify scheduler execution...")
    
    # Run for test_interval + 3 seconds to allow the job to execute
    start_time = time.time()
    test_duration = test_interval + 3
    while time.time() - start_time < test_duration:
        schedule.run_pending()
        time.sleep(1)
    
    if job_executed[0]:
        print(f"[SUCCESS] Test completed. Scheduled job executed successfully!")
        print(f"Note: Production interval is {configured_interval} seconds ({configured_interval/60:.1f} minutes)")
    else:
        print(f"[WARNING] Test completed but scheduled job did not execute within {test_duration} seconds")
        print(f"This may indicate an issue with the scheduler configuration.")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()

