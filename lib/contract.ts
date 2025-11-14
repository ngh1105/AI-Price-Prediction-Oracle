import type { Account, Address, CalldataEncodable } from 'genlayer-js/types'
import { attachSigner, getClient } from './glClient'

const FALLBACK_ADDRESS = '0x1111111111111111111111111111111111111111' as Address

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
  const signer = typeof account === 'string' ? (account as Address) : (account?.address as Address | undefined)
  attachSigner(provider, signer)
  const client = getClient()
  const address = getContractAddress()
  return client.writeContract({ address, functionName, args, value })
}

export async function waitForTransactionReceipt(hash: `0x${string}`, status: 'FINALIZED' | 'ACCEPTED' = 'FINALIZED') {
  const client = getClient()
  const { TransactionStatus } = await import('genlayer-js/types')
  return client.waitForTransactionReceipt({
    hash: hash as any,
    status: status === 'FINALIZED' ? TransactionStatus.FINALIZED : TransactionStatus.ACCEPTED,
  })
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
  const tx = await writeContract(account, 'add_symbol', [symbol, description], 0n, provider)
  return waitForTransactionReceipt(tx, 'ACCEPTED')
}

export async function requestSymbolUpdate(
  account: Account | Address | undefined,
  { symbol, contextJson }: { symbol: string; contextJson: string },
  provider?: any
) {
  const tx = await writeContract(account, 'request_update', [symbol, contextJson], 0n, provider)
  return waitForTransactionReceipt(tx, 'ACCEPTED')
}

