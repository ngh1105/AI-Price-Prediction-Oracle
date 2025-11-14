# Scheduler Analysis Report

## Tổng quan

File `backend/src/scheduler.py` quản lý việc tự động cập nhật predictions cho tất cả symbols và timeframes theo chu kỳ (mặc định 15 phút).

## Cấu trúc Code

### 1. `_parse_symbols()` - Parse symbols từ .env
```python
def _parse_symbols() -> List[str]:
    value = os.getenv('SYMBOLS', '')
    return [symbol.strip().upper() for symbol in value.split(',') if symbol.strip()]
```

**✅ Hoạt động tốt:**
- Parse đúng format: `BTC,ETH,SOL` hoặc `BTC, ETH, SOL`
- Tự động uppercase và strip spaces
- Trả về empty list nếu không có SYMBOLS

**⚠️ Potential issues:**
- Không validate symbol format (có thể có ký tự đặc biệt)
- Không check duplicate symbols

### 2. `run_once()` - Main execution logic

#### 2.1 Client Initialization
```python
client, contract_address, account = initialise_client()
```

**✅ Hoạt động tốt:**
- Tạo client mới mỗi lần chạy (đảm bảo fresh connection)
- Error handling nếu thiếu PRIVATE_KEY hoặc CONTRACT_ADDRESS

**⚠️ Potential issues:**
- Tạo client mới mỗi lần có thể tốn tài nguyên (nhưng OK vì chỉ chạy mỗi 15 phút)
- Không có connection pooling

#### 2.2 Symbol Reading
```python
contract_symbols = list_registered_symbols(client, contract_address)
```

**✅ Hoạt động tốt:**
- Đọc tất cả symbols từ contract
- Error handling đầy đủ
- Logging rõ ràng

**⚠️ Potential issues:**
- Nếu contract không accessible, toàn bộ run_once() sẽ fail
- Không có retry logic

#### 2.3 Whitelist Logic
```python
env_symbols = _parse_symbols()
if env_symbols:
    symbols_to_update = [s for s in contract_symbols if s in env_symbols]
else:
    symbols_to_update = contract_symbols
```

**✅ Hoạt động tốt:**
- Whitelist logic đúng
- Nếu không có SYMBOLS trong .env, update tất cả
- Logging rõ ràng về symbols được update/skip

**✅ Logic đúng:**
- Nếu SYMBOLS="BTC,ETH" và contract có ["BTC", "ETH", "SOL"] → chỉ update BTC, ETH
- Nếu SYMBOLS="" và contract có ["BTC", "ETH", "SOL"] → update tất cả

#### 2.4 Context Generation
```python
context = build_market_context(symbol)
```

**✅ Hoạt động tốt:**
- Generate context một lần cho mỗi symbol
- Dùng cùng context cho tất cả timeframes (OK vì là snapshot tại thời điểm đó)
- Error detection và warning logging

**⚠️ Potential issues:**
- Nếu context generation fail, toàn bộ symbol sẽ bị skip
- Không có retry logic cho context generation
- Context có thể stale nếu generation mất nhiều thời gian

#### 2.5 Timeframe Submission Loop
```python
for timeframe in TIMEFRAMES:
    try:
        tx_hash, _ = submit_prediction_update(...)
        if timeframe != TIMEFRAMES[-1]:
            time.sleep(2)  # 2 second delay
    except Exception as error:
        logging.exception(...)
```

**✅ Hoạt động tốt:**
- Submit cho tất cả 6 timeframes
- Error handling cho từng timeframe (nếu một timeframe fail, vẫn tiếp tục)
- Delay 2 giây giữa các timeframes để tránh rate limit
- Logging đầy đủ

**⚠️ Potential issues:**
- Nếu transaction submission fail, không có retry
- Delay cố định 2 giây có thể không đủ nếu network chậm
- Không track success/failure rate

#### 2.6 Symbol Loop
```python
for symbol in symbols_to_update:
    try:
        # Process symbol
        if symbol != symbols_to_update[-1]:
            time.sleep(3)  # 3 second delay
    except Exception as error:
        logging.exception(...)
```

**✅ Hoạt động tốt:**
- Error handling cho từng symbol (nếu một symbol fail, vẫn tiếp tục)
- Delay 3 giây giữa các symbols
- Logging đầy đủ

**⚠️ Potential issues:**
- Nếu một symbol fail hoàn toàn, không có retry
- Delay cố định có thể không đủ
- Không có summary sau mỗi run

### 3. `main()` - Scheduler loop
```python
def main():
    load_dotenv()
    interval = int(os.getenv('UPDATE_INTERVAL_SECONDS', '900'))
    
    run_once()  # Run immediately
    schedule.every(interval).seconds.do(run_once)
    
    while True:
        schedule.run_pending()
        time.sleep(1)
```

**✅ Hoạt động tốt:**
- Chạy ngay lập tức khi start (không đợi interval đầu tiên)
- Sử dụng `schedule` library đúng cách
- Default interval 900 giây (15 phút)

**⚠️ Potential issues:**
- Nếu `run_once()` mất quá nhiều thời gian (> interval), có thể overlap
- Không có mechanism để skip run nếu previous run chưa xong
- Nếu `run_once()` crash, scheduler sẽ dừng (không có error recovery)

## Performance Analysis

### Time Calculation

**Per Symbol:**
- Context generation: ~5-10 seconds (API calls)
- 6 timeframes × (submission + 2s delay) = ~12-18 seconds
- **Total per symbol: ~17-28 seconds**

**For 5 symbols:**
- 5 symbols × 25 seconds (avg) = 125 seconds
- 4 delays × 3 seconds = 12 seconds
- **Total: ~137 seconds (~2.3 minutes)**

**For 10 symbols:**
- 10 symbols × 25 seconds = 250 seconds
- 9 delays × 3 seconds = 27 seconds
- **Total: ~277 seconds (~4.6 minutes)**

### Rate Limiting

**Current delays:**
- 2 seconds between timeframes
- 3 seconds between symbols

**Potential issues:**
- Nếu có nhiều symbols (10+), một run có thể mất > 5 phút
- Nếu interval là 15 phút và run mất 5 phút, vẫn OK
- Nếu interval là 5 phút và run mất 5 phút, sẽ overlap

## Error Handling

### ✅ Good Practices
1. **Try-catch cho từng symbol**: Nếu một symbol fail, vẫn tiếp tục với symbol khác
2. **Try-catch cho từng timeframe**: Nếu một timeframe fail, vẫn tiếp tục với timeframe khác
3. **Logging đầy đủ**: Mọi error đều được log với `logging.exception()`
4. **Graceful degradation**: Nếu context có errors, vẫn submit (với warning)

### ⚠️ Potential Improvements
1. **Retry logic**: Thêm retry cho failed transactions
2. **Circuit breaker**: Nếu quá nhiều failures, tạm dừng một thời gian
3. **Summary logging**: Log summary sau mỗi run (success/failure counts)
4. **Health check**: Check contract accessibility trước khi bắt đầu

## Recommendations

### 1. Add Summary Logging
```python
def run_once():
    # ... existing code ...
    
    summary = {
        'symbols_processed': 0,
        'symbols_failed': 0,
        'timeframes_submitted': 0,
        'timeframes_failed': 0,
    }
    
    # ... in loops, update summary ...
    
    logging.info('Run summary: %s', summary)
```

### 2. Add Retry Logic
```python
def submit_with_retry(client, contract_address, symbol, context, timeframe, max_retries=3):
    for attempt in range(max_retries):
        try:
            return submit_prediction_update(...)
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            time.sleep(5 * (attempt + 1))  # Exponential backoff
```

### 3. Add Run Lock
```python
import threading

run_lock = threading.Lock()

def run_once():
    if not run_lock.acquire(blocking=False):
        logging.warning('Previous run still in progress, skipping this run')
        return
    
    try:
        # ... existing code ...
    finally:
        run_lock.release()
```

### 4. Add Health Check
```python
def check_contract_health(client, contract_address):
    try:
        symbols = list_registered_symbols(client, contract_address)
        return len(symbols) > 0
    except:
        return False
```

### 5. Optimize Client Reuse
```python
# Reuse client across runs (with reconnection logic)
_client = None

def get_client():
    global _client
    if _client is None:
        _client, _, _ = initialise_client()
    return _client
```

## Current Status

### ✅ Working Well
- Symbol whitelist logic đúng
- Error handling đầy đủ
- Logging rõ ràng
- Delay logic hợp lý
- Multi-timeframe support

### ⚠️ Areas for Improvement
- Retry logic cho failed transactions
- Summary logging
- Run lock để tránh overlap
- Health check
- Client reuse optimization

## Conclusion

Scheduler hiện tại **hoạt động tốt** và đáp ứng yêu cầu cơ bản. Code structure rõ ràng, error handling đầy đủ, và logic đúng.

**Khuyến nghị**: Có thể cải thiện thêm với retry logic và summary logging, nhưng không bắt buộc cho production.

