/**
 * Core transaction tracking functionality (no React hooks)
 * Can be used in both client and server components
 */

import { getClient } from './glClient'

export type TransactionStatus = 'pending' | 'submitted' | 'accepted' | 'finalized' | 'failed'

export interface TrackedTransaction {
  hash: string
  status: TransactionStatus
  functionName: string
  args?: any[]
  submittedAt: number
  acceptedAt?: number
  finalizedAt?: number
  error?: string
}

// Global transaction tracker (persists across component unmounts)
const transactionStore = new Map<string, TrackedTransaction>()

// Listeners for transaction updates
const listeners = new Set<(tx: TrackedTransaction) => void>()

// Global function to track transactions (can be called from anywhere)
export function trackTransactionGlobal(hash: string, functionName: string, args?: any[]) {
  const tx: TrackedTransaction = {
    hash,
    status: 'submitted',
    functionName,
    args,
    submittedAt: Date.now(),
  }
  transactionStore.set(hash, tx)
  listeners.forEach(listener => listener(tx))
  
  // Start polling for status
  pollTransactionStatus(hash)
  
  return tx
}

export function getTransactionStore() {
  return transactionStore
}

export function getTransactionListeners() {
  return listeners
}

async function pollTransactionStatus(hash: string, maxAttempts = 40) {
  const client = getClient()
  const { TransactionStatus } = await import('genlayer-js/types')
  
  let attempts = 0
  const pollInterval = 3000 // 3 seconds

  const poll = async () => {
    // Increment attempts BEFORE checking maxAttempts to ensure proper counting
    attempts++

    // Check max attempts AFTER incrementing (both success and error paths need this check)
    if (attempts >= maxAttempts) {
      const existing = transactionStore.get(hash)
      if (existing && existing.status === 'submitted') {
        // Transaction still pending after max attempts
        updateTransactionStatus(hash, 'pending', 'Transaction is taking longer than expected. It may still be processing.')
      }
      return // Stop polling
    }

    try {
      // Try to get transaction receipt
      const receipt = await client.getTransactionReceipt({ hash: hash as any })
      
      if (receipt) {
        const status = receipt.status as any
        if (status === TransactionStatus.ACCEPTED || status === TransactionStatus.FINALIZED) {
          const existing = transactionStore.get(hash)
          if (existing) {
            const updates: Partial<TrackedTransaction> = {
              status: status === TransactionStatus.FINALIZED ? 'finalized' : 'accepted',
              acceptedAt: existing.acceptedAt || Date.now(),
              finalizedAt: status === TransactionStatus.FINALIZED ? Date.now() : undefined,
            }
            transactionStore.set(hash, { ...existing, ...updates })
            listeners.forEach(listener => listener(transactionStore.get(hash)!))
          }
          return // Stop polling on success
        }
      }
      
      // Receipt not found or status not ACCEPTED/FINALIZED - continue polling
      if (attempts < maxAttempts) {
        setTimeout(poll, pollInterval)
      } else {
        // Max attempts reached in success path
        const existing = transactionStore.get(hash)
        if (existing && existing.status === 'submitted') {
          updateTransactionStatus(hash, 'pending', 'Transaction is taking longer than expected. It may still be processing.')
        }
      }
    } catch (error: any) {
      // Transaction not found or still processing - continue polling
      if (attempts < maxAttempts) {
        setTimeout(poll, pollInterval)
      } else {
        // Max attempts reached in error path
        const existing = transactionStore.get(hash)
        if (existing && existing.status === 'submitted') {
          updateTransactionStatus(hash, 'pending', 'Transaction is taking longer than expected. It may still be processing.')
        }
      }
    }
  }

  // Start polling after initial delay
  setTimeout(poll, pollInterval)
}

function updateTransactionStatus(hash: string, status: TransactionStatus, error?: string) {
  const existing = transactionStore.get(hash)
  if (!existing) return

  const updates: Partial<TrackedTransaction> = {
    status,
    error,
  }
  transactionStore.set(hash, { ...existing, ...updates })
  listeners.forEach(listener => listener(transactionStore.get(hash)!))
}

