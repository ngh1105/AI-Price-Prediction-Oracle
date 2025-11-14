#!/usr/bin/env python3
"""Test script to manually run scheduler.run_once() and check for errors"""
import os
import sys
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

try:
    from src.scheduler import run_once
    
    print("=" * 60)
    print("Testing scheduler.run_once()...")
    print("=" * 60)
    
    run_once()
    
    print("=" * 60)
    print("run_once() completed successfully!")
    print("=" * 60)
    
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()

