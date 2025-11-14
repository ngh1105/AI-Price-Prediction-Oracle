# Frontend Submit Test Guide

## Kiểm tra phần Submit của Frontend

### 1. Các thành phần liên quan

#### `lib/contract.ts`
- `writeContract()`: Gọi `attachSigner()` và `client.writeContract()`
- `requestSymbolUpdate()`: Submit cho 1 timeframe, đợi receipt
- `requestSymbolUpdateAllTimeframes()`: Submit cho tất cả 6 timeframes, không đợi receipt

#### `lib/glClient.ts`
- `attachSigner()`: Tạo client mới với provider và address
- `getClient()`: Trả về client hiện tại

#### `app/page.tsx`
- `provider`: Được tạo từ `walletClient.request`
- `requestUpdate` mutation: Gọi `requestSymbolUpdateAllTimeframes()`
- `handleGenerateAndSubmit()`: Generate context rồi submit

### 2. Flow Submit

```
User clicks "Generate & Submit All Timeframes"
  ↓
handleGenerateAndSubmit()
  ↓
generateContext.mutateAsync() → /api/generate-context
  ↓
requestUpdate.mutateAsync()
  ↓
requestSymbolUpdateAllTimeframes(address, {symbol, contextJson}, provider)
  ↓
For each timeframe (1h, 4h, 12h, 24h, 7d, 30d):
  ↓
writeContract(account, 'request_update', [symbol, contextJson, timeframe], 0n, provider)
  ↓
attachSigner(provider, address)
  ↓
client.writeContract({ address, functionName, args, value })
  ↓
Returns txHash
```

### 3. Các điểm cần kiểm tra

#### ✅ Provider Setup
- [ ] `walletClient` có sẵn khi user connect wallet
- [ ] `provider` được tạo đúng format: `{ request: walletClient.request }`
- [ ] `provider` được pass vào `requestSymbolUpdateAllTimeframes()`

#### ✅ Context Generation
- [ ] Context được generate trước khi submit
- [ ] Context JSON được minify đúng
- [ ] Context có đầy đủ: price, technical_indicators, macro.headlines

#### ✅ Transaction Submission
- [ ] Mỗi timeframe được submit riêng biệt
- [ ] Có delay 1 giây giữa các timeframe
- [ ] Transaction hash được return đúng
- [ ] Error được catch và log

#### ✅ Error Handling
- [ ] Wallet chưa connect → Show error
- [ ] Symbol chưa chọn → Show error
- [ ] Context generation fail → Show error
- [ ] Transaction fail → Show error với details
- [ ] Một số timeframe fail → Show partial success message

#### ✅ UI Feedback
- [ ] Loading state khi đang submit
- [ ] Success toast với số timeframe thành công
- [ ] Error toast với message rõ ràng
- [ ] Query invalidation sau khi submit thành công

### 4. Test Cases

#### Test Case 1: Submit với wallet đã connect
1. Connect wallet
2. Chọn symbol (ví dụ: BTC)
3. Click "Generate & Submit All Timeframes"
4. **Expected**: 
   - Loading state hiển thị
   - Context được generate
   - 6 transactions được submit
   - Success toast: "Predictions submitted for all 6 timeframes!"
   - Predictions được refresh

#### Test Case 2: Submit không có wallet
1. Không connect wallet
2. Chọn symbol
3. Click "Generate & Submit All Timeframes"
4. **Expected**: 
   - Error toast: "Please connect your wallet first"

#### Test Case 3: Submit không có symbol
1. Connect wallet
2. Không chọn symbol
3. Click "Generate & Submit All Timeframes"
4. **Expected**: 
   - Error toast: "Please select a symbol first"

#### Test Case 4: Partial failure
1. Connect wallet
2. Chọn symbol
3. Submit (giả sử 2 timeframe fail)
4. **Expected**: 
   - Success toast: "Predictions submitted for 4/6 timeframes. 2 failed."

#### Test Case 5: Context generation fail
1. Connect wallet
2. Chọn symbol không hợp lệ (hoặc API down)
3. Click "Generate & Submit All Timeframes"
4. **Expected**: 
   - Error toast: "Failed to generate context: [error message]"

### 5. Debug Checklist

Khi submit không hoạt động, kiểm tra:

- [ ] Console có error không?
- [ ] `walletClient` có undefined không?
- [ ] `provider` có được tạo đúng không?
- [ ] `address` có sẵn không?
- [ ] Contract address trong `.env.local` đúng không?
- [ ] RPC URL đúng không?
- [ ] Network có kết nối không?
- [ ] Wallet có approve transaction không?

### 6. Common Issues

#### Issue: "Provider is undefined"
**Cause**: `walletClient` chưa sẵn sàng
**Fix**: Đảm bảo wallet đã connect và `useWalletClient()` return data

#### Issue: "Transaction failed"
**Cause**: Contract address sai, hoặc RPC URL sai
**Fix**: Kiểm tra `.env.local` file

#### Issue: "Failed to generate context"
**Cause**: API route `/api/generate-context` fail
**Fix**: Kiểm tra network tab trong DevTools, xem error response

#### Issue: "Some timeframes failed"
**Cause**: Rate limiting hoặc network issues
**Fix**: Đây là bình thường, retry sau

### 7. Code Review Points

#### ✅ Good Practices
- Error handling đầy đủ
- Loading states rõ ràng
- User feedback tốt (toast notifications)
- Query invalidation sau submit
- Context được minify trước khi submit

#### ⚠️ Potential Issues
- `requestSymbolUpdateAllTimeframes` không đợi receipt → có thể user không biết transaction đã được accept chưa
- Provider format có thể không đúng với `EIP1193Provider` type
- Không có retry logic nếu transaction fail

### 8. Recommendations

1. **Add transaction status tracking**: Track transaction status và hiển thị trong UI
2. **Add retry logic**: Retry failed timeframes tự động
3. **Better error messages**: Hiển thị error chi tiết hơn (ví dụ: "Transaction rejected by user")
4. **Transaction history**: Lưu transaction hashes và hiển thị trong UI

