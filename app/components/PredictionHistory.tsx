'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchPredictionHistory, fetchPredictionHistoryByTimeframe, TIMEFRAMES, TIMEFRAME_LABELS, type Timeframe } from '@/lib/contract'
import { motion } from 'framer-motion'
import { Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMemo, useState } from 'react'

type PredictionHistoryProps = {
  symbol: string
  currentPrice: number | null
  timeframe?: Timeframe // Optional timeframe filter
}

function parsePredictedPrice(predictedPrice: string): number | null {
  if (!predictedPrice || predictedPrice === 'N/A USD' || predictedPrice.includes('N/A')) {
    return null
  }
  // Extract numeric value from strings like "43750.25 USD" or "0.16348 USD"
  const match = predictedPrice.match(/[\d.]+/)
  if (match) {
    const price = parseFloat(match[0])
    if (!isNaN(price) && price > 0) return price
  }
  return null
}

export function PredictionHistory({ symbol, currentPrice, timeframe }: PredictionHistoryProps) {
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe | 'all'>(timeframe || 'all')
  
  const historyQuery = useQuery({
    queryKey: ['prediction-history', symbol, selectedTimeframe],
    queryFn: async () => {
      try {
        if (selectedTimeframe === 'all') {
          // Use legacy method for backward compatibility (defaults to 24h)
          const history = await fetchPredictionHistory(symbol, 20)
          return Array.isArray(history) ? history : []
        } else {
          // Use timeframe-specific method
          const history = await fetchPredictionHistoryByTimeframe(symbol, selectedTimeframe, 20)
          return Array.isArray(history) ? history : []
        }
      } catch (error) {
        console.error('Failed to fetch prediction history:', error)
        return []
      }
    },
    enabled: !!symbol,
    refetchInterval: 60_000, // Auto-refresh every 60 seconds
  })

  const historyWithAccuracy = useMemo(() => {
    if (!historyQuery.data) return []
    
    return historyQuery.data.map((pred: any) => {
      const predicted = parsePredictedPrice(pred.predicted_price || '')
      let accuracy: number | null = null
      
      // Priority 1: Use on-chain accuracy_score if available (from contract)
      if (pred.accuracy_score !== undefined && pred.accuracy_score !== null && pred.accuracy_score !== '0') {
        const onChainAccuracy = typeof pred.accuracy_score === 'string' 
          ? parseFloat(pred.accuracy_score) 
          : pred.accuracy_score
        if (!isNaN(onChainAccuracy) && onChainAccuracy > 0) {
          accuracy = onChainAccuracy
        }
      }
      
      // Priority 2: Fallback to calculating from current price if no on-chain accuracy
      if (accuracy === null && predicted && currentPrice) {
        // Calculate how close the prediction was (inverse of error percentage)
        const error = Math.abs((predicted - currentPrice) / currentPrice) * 100
        accuracy = Math.max(0, 100 - error) // 100% if perfect, 0% if very wrong
      }
      
      return {
        ...pred,
        predictedNum: predicted,
        accuracy,
        actualPrice: pred.actual_price || null, // Include actual_price if available
        isExpired: pred.is_expired === 'true' || pred.is_expired === true,
      }
    })
  }, [historyQuery.data, currentPrice])

  if (historyQuery.isLoading) {
    return (
      <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6">
        <div className="text-sm text-muted text-center py-4">Loading history...</div>
      </div>
    )
  }

  if (!historyQuery.data || historyQuery.data.length === 0) {
    return (
      <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6">
        <div className="text-sm text-muted text-center py-4">No prediction history available</div>
      </div>
    )
  }

  return (
    <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-accent" />
          <h3 className="text-lg font-bold">Prediction History</h3>
          <span className="text-xs text-muted">({historyWithAccuracy.length} predictions)</span>
        </div>
        
        {/* Timeframe selector */}
        {!timeframe && (
          <div className="flex items-center gap-2">
            <select
              value={selectedTimeframe}
              onChange={(e) => setSelectedTimeframe(e.target.value as Timeframe | 'all')}
              className="bg-card/50 border border-card-border/60 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="all">All Timeframes</option>
              {TIMEFRAMES.map(tf => (
                <option key={tf} value={tf}>{TIMEFRAME_LABELS[tf]}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {historyWithAccuracy.map((pred, idx) => {
          const outlook = pred.outlook?.toLowerCase() || 'neutral'
          const isBullish = outlook === 'bullish'
          const isBearish = outlook === 'bearish'
          const predictedNum = pred.predictedNum
          const hasComparison = predictedNum && currentPrice
          const difference = hasComparison ? predictedNum - currentPrice : null
          const differencePercent = hasComparison && currentPrice 
            ? ((difference! / currentPrice) * 100) 
            : null

          return (
            <motion.div
              key={pred.prediction_id || idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="border border-card-border/40 rounded-xl p-4 bg-card/30 hover:bg-card/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">Update #{pred.counter || idx + 1}</span>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-xs font-semibold uppercase",
                      isBullish && "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
                      isBearish && "bg-rose-500/10 text-rose-400 border border-rose-500/30",
                      !isBullish && !isBearish && "bg-sky-500/10 text-sky-400 border border-sky-500/30"
                    )}>
                      {outlook}
                    </span>
                    {pred.accuracy !== null && (
                      <span className="text-xs text-muted">
                        Accuracy: <span className="font-semibold text-foreground">{pred.accuracy.toFixed(1)}%</span>
                      </span>
                    )}
                  </div>
                  
                  {predictedNum ? (
                    <div className="space-y-1">
                      <div className="text-sm font-semibold">
                        Predicted: ${predictedNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
                      </div>
                      {hasComparison && (
                        <div className={cn(
                          "flex items-center gap-1 text-xs",
                          difference! > 0 ? "text-emerald-400" : difference! < 0 ? "text-rose-400" : "text-muted"
                        )}>
                          {difference! > 0 ? <TrendingUp className="h-3 w-3" /> : 
                           difference! < 0 ? <TrendingDown className="h-3 w-3" /> : 
                           <Minus className="h-3 w-3" />}
                          {difference! > 0 ? '+' : ''}
                          {differencePercent?.toFixed(2)}% vs current
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-muted">{pred.predicted_price}</div>
                  )}
                  
                  {pred.summary && (
                    <p className="text-xs text-foreground/70 line-clamp-2">{pred.summary}</p>
                  )}
                </div>
                
                <div className="text-right space-y-1">
                  <div className="text-xs text-muted">Confidence</div>
                  <div className="text-sm font-semibold">{pred.confidence || 0}%</div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

