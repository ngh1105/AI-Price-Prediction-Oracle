"""
Standalone script to run the accuracy recorder periodically.
Can be run as a separate process or integrated into the main scheduler.
"""

import logging
import os
import time
from dotenv import load_dotenv
from .accuracy_recorder import record_expired_predictions

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s %(message)s',
)


def main():
    """Run accuracy recorder on a schedule"""
    load_dotenv()
    
    # Default to run every 10 minutes
    interval = int(os.getenv('ACCURACY_RECORDER_INTERVAL_SECONDS', '600'))
    
    logging.info(f'Accuracy recorder started (interval={interval}s)')
    
    # Run once immediately
    record_expired_predictions()
    
    # Then run on schedule
    import schedule
    schedule.every(interval).seconds.do(record_expired_predictions)
    
    while True:
        schedule.run_pending()
        time.sleep(1)


if __name__ == '__main__':
    main()

