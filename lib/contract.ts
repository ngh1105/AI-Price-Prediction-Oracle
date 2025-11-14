import type { Account, Address, CalldataEncodable } from 'genlayer-js/types'
import { attachSigner, getClient } from './glClient'

export const FALLBACK_ADDRESS = '0x1111111111111111111111111111111111111111' as Address

export function getContractAddress(): Address {
  const fromEnv = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS
  if (typeof fromEnv === 'string' && fromEnv.startsWith('0x') && fromEnv.length === 42) {
    return fromEnv as Address
  }
  return FALLBACK_ADDRESS
}

export async function readContract(functionName: string, args: CalldataEncodable[] = []) {
  const client = getClient()
  const address = getContractAddress()
  return client.readContract({ address, functionName, args, jsonSafeReturn: true })
}

export async function writeContract(
  account: Account | Address | undefined,
  functionName: string,
  args: CalldataEncodable[] = [],
  value: bigint = 0n,
  provider?: any
) {
  try {
    const signer = typeof account === 'string' ? (account as Address) : (account?.address as Address | undefined)
    if (!signer) {
      throw new Error('No account/signer provided')
    }
    if (!provider) {
      throw new Error('No provider provided. Please connect your wallet.')
    }
    
    attachSigner(provider, signer)
    const client = getClient()
    const address = getContractAddress()
    
    console.log(`[writeContract] Submitting ${functionName} to ${address}`, {
      functionName,
      args: args.map((a, i) => i === 1 ? `${String(a).substring(0, 50)}...` : a), // Truncate contextJson
      signer,
    })
    
    const txHash = await client.writeContract({ address, functionName, args, value })
    
    console.log(`[writeContract] Transaction submitted: ${txHash}`)
    return txHash
  } catch (error: any) {
    console.error(`[writeContract] Error submitting transaction:`, error)
    throw error
  }
}

export async function waitForTransactionReceipt(
  hash: `0x${string}`, 
  status: 'FINALIZED' | 'ACCEPTED' = 'FINALIZED',
  options?: { timeout?: number; retries?: number; interval?: number }
) {
  const client = getClient()
  const { TransactionStatus } = await import('genlayer-js/types')
  
  const timeout = options?.timeout || 60000 // 60 seconds default
  const retries = options?.retries || 20
  const interval = options?.interval || 3000 // 3 seconds
  
  try {
    return await client.waitForTransactionReceipt({
      hash: hash as any,
      status: status === 'FINALIZED' ? TransactionStatus.FINALIZED : TransactionStatus.ACCEPTED,
      retries,
      interval,
    })
  } catch (error: any) {
    // If transaction was submitted but not yet accepted, return the hash anyway
    // This allows the caller to continue (transaction may still be processing)
    console.warn(`Transaction ${hash} submitted but not yet ${status} within timeout. It may still be processing.`)
    throw error
  }
}

export async function listSymbols(): Promise<string[]> {
  const response = await readContract('list_symbols')
  console.log('[listSymbols] Raw response:', response, 'Type:', typeof response, 'IsArray:', Array.isArray(response))
  
  if (Array.isArray(response)) {
    return response
  }
  // Handle DynArray/TreeMap serialization (object with numeric or string keys)
  if (response && typeof response === 'object') {
    const keys = Object.keys(response)
    console.log('[listSymbols] Object keys:', keys)
    // If keys are numeric (0, 1, 2...), it's likely a DynArray
    const numericKeys = keys.filter(k => /^\d+$/.test(k))
    if (numericKeys.length > 0) {
      const result = numericKeys
        .map(k => parseInt(k, 10))
        .sort((a, b) => a - b)
        .map(k => response[k])
        .filter(Boolean)
      console.log('[listSymbols] Parsed from numeric keys:', result)
      return result
    }
    // Otherwise, treat keys as symbol names (TreeMap case)
    const result = keys.filter(key => key !== 'length' && !key.startsWith('_'))
    console.log('[listSymbols] Parsed from string keys:', result)
    return result
  }
  console.warn('[listSymbols] Unexpected response format, returning empty array')
  return []
}

export async function fetchLatestPrediction(symbol: string) {
  try {
    const response = await readContract('get_latest_prediction', [symbol])
    console.log(`[fetchLatestPrediction] ${symbol}:`, response)
    return response
  } catch (error: any) {
    console.error(`[fetchLatestPrediction] Error for ${symbol}:`, error)
    throw error
  }
}

export async function fetchPredictionHistory(symbol: string, limit = 10) {
  const response = await readContract('get_prediction_history', [symbol, limit])
  return Array.isArray(response) ? response : []
}

export async function fetchSymbolConfig(symbol: string) {
  return readContract('get_symbol_config', [symbol])
}

export async function addSymbol(
  account: Account | Address | undefined,
  { symbol, description }: { symbol: string; description: string },
  provider?: any
) {
  try {
    const tx = await writeContract(account, 'add_symbol', [symbol, description], 0n, provider)
    console.log(`Add symbol transaction submitted: ${tx}`)
    
    // Wait for transaction with increased timeout and retries
    try {
      const receipt = await waitForTransactionReceipt(tx, 'ACCEPTED', {
        timeout: 60000, // 60 seconds
        retries: 20,
        interval: 3000, // 3 seconds between retries
      })
      console.log(`Add symbol transaction accepted: ${tx}`)
      return receipt
    } catch (error: any) {
      // Transaction was submitted successfully but not yet accepted
      // This is common with GenLayer - transaction may still be processing
      console.warn(`Add symbol transaction submitted but not yet accepted: ${tx}`)
      console.warn(`Transaction may still be processing. Error: ${error?.message || error}`)
      // Return a mock receipt with the tx hash so caller can continue
      // The symbol will be added once transaction is processed
      return { hash: tx, id: '' } as any
    }
  } catch (error: any) {
    console.error(`Failed to submit add symbol transaction: ${error}`)
    throw error
  }
}

export async function requestSymbolUpdate(
  account: Account | Address | undefined,
  { symbol, contextJson, timeframe = '24h' }: { symbol: string; contextJson: string; timeframe?: string },
  provider?: any
) {
  const tx = await writeContract(account, 'request_update', [symbol, contextJson, timeframe], 0n, provider)
  return waitForTransactionReceipt(tx, 'ACCEPTED')
}

// Submit predictions for all timeframes at once
export async function requestSymbolUpdateAllTimeframes(
  account: Account | Address | undefined,
  { symbol, contextJson }: { symbol: string; contextJson: string },
  provider?: any
): Promise<Array<{ timeframe: Timeframe; txHash: string; success: boolean; error?: string }>> {
  console.log(`[requestSymbolUpdateAllTimeframes] Starting submission for ${symbol} across ${TIMEFRAMES.length} timeframes`)
  
  // Attach signer once before submitting all transactions
  const signer = typeof account === 'string' ? (account as Address) : (account?.address as Address | undefined)
  if (!signer) {
    throw new Error('No account/signer provided')
  }
  if (!provider) {
    throw new Error('No provider provided. Please connect your wallet.')
  }
  
  // Attach signer once for all transactions
  attachSigner(provider, signer)
  const client = getClient()
  const address = getContractAddress()
  
  // Submit all timeframes in parallel for faster submission
  // Each submission is independent, so we can do them concurrently
  const submitPromises = TIMEFRAMES.map(async (timeframe): Promise<{ timeframe: Timeframe; txHash: string; success: boolean; error?: string }> => {
    try {
      console.log(`[requestSymbolUpdateAllTimeframes] Submitting ${timeframe} for ${symbol}...`)
      const startTime = Date.now()
      
      // Use client directly instead of writeContract to avoid re-attaching signer
      const tx = await client.writeContract({ 
        address, 
        functionName: 'request_update', 
        args: [symbol, contextJson, timeframe], 
        value: 0n 
      })
      
      const elapsed = Date.now() - startTime
      console.log(`[requestSymbolUpdateAllTimeframes] ${timeframe} submitted in ${elapsed}ms: ${tx}`)
      
      return {
        timeframe,
        txHash: tx,
        success: true,
      }
    } catch (error: any) {
      console.error(`[requestSymbolUpdateAllTimeframes] Failed to submit ${timeframe} for ${symbol}:`, error)
      return {
        timeframe,
        txHash: '',
        success: false,
        error: error?.message || 'Unknown error',
      }
    }
  })
  
  // Wait for all submissions to complete
  const results = await Promise.all(submitPromises)
  
  const successCount = results.filter(r => r.success).length
  console.log(`[requestSymbolUpdateAllTimeframes] Completed: ${successCount}/${TIMEFRAMES.length} successful`)
  
  return results
}

// Timeframe constants
export const TIMEFRAMES = ['1h', '4h', '12h', '24h', '7d', '30d'] as const
export type Timeframe = typeof TIMEFRAMES[number]

// Timeframe display labels
export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  '1h': '1 Hour',
  '4h': '4 Hours',
  '12h': '12 Hours',
  '24h': '24 Hours',
  '7d': '7 Days',
  '30d': '30 Days',
}

// Fetch latest prediction by timeframe
export async function fetchLatestPredictionByTimeframe(symbol: string, timeframe: string) {
  try {
    const response = await readContract('get_latest_prediction_by_timeframe', [symbol, timeframe])
    console.log(`[fetchLatestPredictionByTimeframe] ${symbol} ${timeframe}:`, response)
    return response
  } catch (error: any) {
    console.error(`[fetchLatestPredictionByTimeframe] Error for ${symbol} ${timeframe}:`, error)
    throw error
  }
}

// Fetch all timeframe predictions for a symbol
export async function fetchAllTimeframePredictions(symbol: string) {
  try {
    const response = await readContract('get_all_timeframe_predictions', [symbol])
    console.log(`[fetchAllTimeframePredictions] ${symbol}:`, response)
    
    // Convert TreeMap to object
    if (response && typeof response === 'object') {
      const result: Record<string, any> = {}
      for (const tf of TIMEFRAMES) {
        if (response[tf]) {
          result[tf] = response[tf]
        }
      }
      return result
    }
    return {}
  } catch (error: any) {
    console.error(`[fetchAllTimeframePredictions] Error for ${symbol}:`, error)
    return {}
  }
}

