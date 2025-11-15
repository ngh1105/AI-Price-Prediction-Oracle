'use client'

import { useTransactionTracker } from '@/lib/transactionTracker'
import { cn } from '@/lib/utils'
import { CheckCircle2, Clock, XCircle, Loader2, ExternalLink } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export function TransactionStatus() {
  const { transactions, clearTransaction, clearAllTransactions } = useTransactionTracker()

  if (transactions.length === 0) return null

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'finalized':
        return <CheckCircle2 className="h-4 w-4 text-emerald-400" />
      case 'accepted':
        return <CheckCircle2 className="h-4 w-4 text-emerald-400" />
      case 'submitted':
        return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-400" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-rose-400" />
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'finalized':
        return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
      case 'accepted':
        return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
      case 'submitted':
        return 'bg-blue-500/20 border-blue-500/40 text-blue-400'
      case 'pending':
        return 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400'
      case 'failed':
        return 'bg-rose-500/20 border-rose-500/40 text-rose-400'
      default:
        return 'bg-muted/20 border-muted/40 text-muted-foreground'
    }
  }

  const formatTime = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }

  const truncateHash = (hash: string) => {
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-md">
      <AnimatePresence>
        {transactions.map((tx) => (
          <motion.div
            key={tx.hash}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={cn(
              'bg-card/90 backdrop-blur-xl border rounded-xl p-4 shadow-xl',
              getStatusColor(tx.status)
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="mt-0.5">{getStatusIcon(tx.status)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold capitalize">{tx.status}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(tx.submittedAt)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mb-1">
                    {tx.functionName}
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-muted-foreground">{truncateHash(tx.hash)}</span>
                    <a
                      href={`https://studio.genlayer.com/transactions/${tx.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:text-accent/80 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  {tx.error && (
                    <div className="text-xs text-rose-400 mt-1">{tx.error}</div>
                  )}
                </div>
              </div>
              <button
                onClick={() => clearTransaction(tx.hash)}
                className="text-muted-foreground hover:text-foreground transition-colors text-xs px-1 py-0.5 rounded hover:bg-muted/50"
                title="Dismiss"
              >
                ×
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      
      {transactions.length > 0 && (
        <button
          onClick={clearAllTransactions}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-muted/50 border border-muted/50"
        >
          Clear all ({transactions.length})
        </button>
      )}
    </div>
  )
}

