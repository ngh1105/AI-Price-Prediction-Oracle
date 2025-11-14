# Health Check Troubleshooting Guide

## Overview

The health check system monitors the contract connectivity and alerts users if there are issues. This guide helps diagnose and fix common health check failures.

## Health Check Endpoint

**URL**: `GET /api/health`

**Response (Healthy)**:
```json
{
  "status": "healthy",
  "contractAddress": "0x...",
  "symbolCount": 5,
  "timestamp": "2025-11-14T..."
}
```

**Response (Unhealthy)**:
```json
{
  "status": "unhealthy",
  "error": "Error message",
  "errorType": "network|contract|unknown",
  "contractAddress": "0x...",
  "suggestion": "Actionable suggestion",
  "timestamp": "2025-11-14T..."
}
```

## Common Issues and Solutions

### 1. Contract Address Not Configured

**Error**: `Contract address not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local`

**Solution**:
1. Check if `.env.local` file exists in the root directory
2. Add or update:
   ```env
   NEXT_PUBLIC_CONTRACT_ADDRESS=0xYourDeployedContractAddress
   ```
3. Restart the Next.js dev server

**Verify**:
```bash
# Check if variable is set
echo $NEXT_PUBLIC_CONTRACT_ADDRESS
```

### 2. Network Error

**Error**: `Failed to fetch` or `ECONNREFUSED` or `timeout`

**Possible Causes**:
- RPC URL not configured correctly
- Network connectivity issues
- GenLayer RPC endpoint down

**Solution**:
1. Check `NEXT_PUBLIC_GENLAYER_RPC_URL` in `.env.local`:
   ```env
   NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
   ```
2. Verify network connectivity:
   ```bash
   curl https://studio.genlayer.com/api
   ```
3. Check if you're behind a firewall or proxy
4. Try using a different RPC endpoint if available

### 3. Contract Not Found

**Error**: `Contract not found` or `Invalid contract address`

**Possible Causes**:
- Contract address is incorrect
- Contract not deployed on the network
- Contract address format is wrong

**Solution**:
1. Verify contract address format (should be 42 characters starting with `0x`)
2. Check if contract is deployed:
   - Use GenLayer explorer
   - Verify contract address in deployment logs
3. Ensure contract address matches the network (studionet)

### 4. Contract Read Error

**Error**: `Failed to read contract` or specific contract method error

**Possible Causes**:
- Contract method doesn't exist
- Contract state is corrupted
- Permission issues

**Solution**:
1. Verify contract has `list_symbols` method
2. Check contract deployment logs
3. Try reading contract directly:
   ```typescript
   const symbols = await readContract('list_symbols', [])
   ```

## Testing Health Check

### Manual Test

```bash
# Test health endpoint
curl http://localhost:3000/api/health

# Expected output (healthy):
{
  "status": "healthy",
  "contractAddress": "0x...",
  "symbolCount": 5,
  "timestamp": "..."
}
```

### Browser Console

Open browser console and check:
1. Network tab for `/api/health` requests
2. Console for error messages
3. Response details in Network tab

### Frontend Test

1. Open browser DevTools (F12)
2. Go to Network tab
3. Filter by "health"
4. Check request/response details

## Debugging Steps

### Step 1: Check Environment Variables

```bash
# Frontend (.env.local)
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
```

### Step 2: Verify Contract Address

```typescript
// In browser console
const address = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS
console.log('Contract address:', address)
```

### Step 3: Test Contract Read Directly

```typescript
// In browser console or component
import { readContract } from '@/lib/contract'

try {
  const symbols = await readContract('list_symbols', [])
  console.log('Symbols:', symbols)
} catch (error) {
  console.error('Error:', error)
}
```

### Step 4: Check RPC Connectivity

```bash
# Test RPC endpoint
curl -X POST https://studio.genlayer.com/api \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

## Health Check Behavior

### Automatic Monitoring
- Frontend checks health every 30 seconds
- Retries 2 times with 5 second delay
- Shows toast notification on failure

### Error Handling
- Timeout: 10 seconds
- Detailed error messages
- Actionable suggestions
- Prevents duplicate notifications

## Disabling Health Check (Not Recommended)

If you need to temporarily disable health check:

```typescript
// In app/page.tsx, comment out health check query
// const healthQuery = useQuery({...})
```

**Note**: This is not recommended as it reduces system visibility.

## Getting Help

If health check continues to fail:

1. Check server logs for detailed errors
2. Verify all environment variables are set
3. Test contract connectivity manually
4. Check GenLayer network status
5. Review contract deployment logs

## Related Files

- `app/api/health/route.ts` - Health check API endpoint
- `app/page.tsx` - Frontend health monitoring
- `lib/contract.ts` - Contract interaction functions
- `lib/glClient.ts` - GenLayer client setup

