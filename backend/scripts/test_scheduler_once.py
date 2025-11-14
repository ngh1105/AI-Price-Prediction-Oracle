#!/usr/bin/env python3
"""
Test script để chạy scheduler một lần (không loop) để kiểm tra
"""
import sys
import os
from dotenv import load_dotenv

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.scheduler import run_once

if __name__ == '__main__':
    load_dotenv()
    print("Running scheduler once to test...")
    print("=" * 60)
    try:
        run_once()
        print("=" * 60)
        print("✅ Scheduler test completed!")
    except Exception as e:
        print("=" * 60)
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

