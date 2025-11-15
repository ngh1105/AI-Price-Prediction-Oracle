'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  trackTransactionGlobal as coreTrackTransactionGlobal,
  getTransactionStore,
  getTransactionListeners,
  type TransactionStatus,
  type TrackedTransaction
} from './transactionTrackerCore'

// Re-export types
export type { TransactionStatus, TrackedTransaction }

// Re-export global function
export const trackTransactionGlobal = coreTrackTransactionGlobal

// Get store and listeners from core
const transactionStore = getTransactionStore()
const listeners = getTransactionListeners()

export function useTransactionTracker() {
  const [transactions, setTransactions] = useState<Map<string, TrackedTransaction>>(new Map(transactionStore))

  useEffect(() => {
    // Sync with global store
    setTransactions(new Map(transactionStore))

    // Listen for updates
    const listener = (tx: TrackedTransaction) => {
      setTransactions(new Map(transactionStore))
    }
    listeners.add(listener)

    return () => {
      listeners.delete(listener)
    }
  }, [])

  const trackTransaction = useCallback((hash: string, functionName: string, args?: any[]) => {
    return trackTransactionGlobal(hash, functionName, args)
  }, [])

  const updateTransaction = useCallback((hash: string, updates: Partial<TrackedTransaction>) => {
    const existing = transactionStore.get(hash)
    if (!existing) return

    const updated: TrackedTransaction = {
      ...existing,
      ...updates,
    }
    transactionStore.set(hash, updated)
    listeners.forEach(listener => listener(updated))
    setTransactions(new Map(transactionStore))
  }, [])

  const clearTransaction = useCallback((hash: string) => {
    transactionStore.delete(hash)
    // Notify all listeners to trigger re-render
    const currentStore = new Map(transactionStore)
    setTransactions(currentStore)
    listeners.forEach(listener => {
      // Create a dummy transaction to trigger listener update
      // This ensures all components using the hook get notified
      const dummyTx: TrackedTransaction = {
        hash: '',
        status: 'submitted',
        functionName: '',
        submittedAt: Date.now(),
      }
      listener(dummyTx)
    })
  }, [])

  const clearAllTransactions = useCallback(() => {
    transactionStore.clear()
    setTransactions(new Map())
    // Notify all listeners
    listeners.forEach(listener => {
      const dummyTx: TrackedTransaction = {
        hash: '',
        status: 'submitted',
        functionName: '',
        submittedAt: Date.now(),
      }
      listener(dummyTx)
    })
  }, [])

  return {
    transactions: Array.from(transactions.values()),
    trackTransaction,
    updateTransaction,
    clearTransaction,
    clearAllTransactions,
    getTransaction: (hash: string) => transactionStore.get(hash),
  }
}

// Note: pollTransactionStatus and updateTransactionStatus are implemented in transactionTrackerCore.ts
// This file only provides React hooks for client components

