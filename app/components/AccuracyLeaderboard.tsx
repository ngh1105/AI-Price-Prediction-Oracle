'use client'

import { useQuery } from '@tanstack/react-query'
import { listSymbols, fetchPredictionHistoryByTimeframe, TIMEFRAMES, type Timeframe } from '@/lib/contract'
import { calculateLeaderboard, type PredictionWithPrice } from '@/lib/accuracyCalculator'
import { motion } from 'framer-motion'
import { Trophy, TrendingUp, TrendingDown, Award, Target, BarChart3 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

export function AccuracyLeaderboard() {
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe | 'all'>('all')
  const [sortBy, setSortBy] = useState<'accuracy' | 'mae' | 'rmse' | 'mape'>('accuracy')

  const symbolsQuery = useQuery({
    queryKey: ['symbols'],
    queryFn: async () => {
      const symbols = await listSymbols()
      return symbols as string[]
    },
    refetchInterval: 60_000,
  })

  // Fetch current prices for all symbols
  const currentPricesQuery = useQuery({
    queryKey: ['current-prices', symbolsQuery.data],
    queryFn: async () => {
      if (!symbolsQuery.data || symbolsQuery.data.length === 0) return {}
      
      try {
        const response = await fetch(`/api/current-prices?symbols=${symbolsQuery.data.join(',')}`)
        if (!response.ok) {
          console.error('[AccuracyLeaderboard] Failed to fetch current prices:', response.statusText)
          return {}
        }
        const data = await response.json()
        return data.prices || {}
      } catch (error) {
        console.error('[AccuracyLeaderboard] Error fetching current prices:', error)
        return {}
      }
    },
    enabled: !!symbolsQuery.data && symbolsQuery.data.length > 0,
    refetchInterval: 60_000,
  })

  // Fetch prediction history for all symbols
  const predictionsQueries = useQuery({
    queryKey: ['leaderboard-predictions', symbolsQuery.data, selectedTimeframe],
    queryFn: async () => {
      if (!symbolsQuery.data || symbolsQuery.data.length === 0) return []
      
      const results: Array<{
        symbol: string
        predictions: PredictionWithPrice[]
        currentPrice: number | null
        timeframe?: string
      }> = []
      
      for (const symbol of symbolsQuery.data) {
        try {
          const currentPrice = currentPricesQuery.data?.[symbol] || null
          
          if (selectedTimeframe === 'all') {
            // Fetch history for all timeframes
            const allPredictions: PredictionWithPrice[] = []
            for (const tf of TIMEFRAMES) {
              try {
                const history = await fetchPredictionHistoryByTimeframe(symbol, tf, 10)
                const predictionsWithTimeframe = (Array.isArray(history) ? history : []).map((p: any) => ({
                  ...p,
                  timeframe: tf,
                }))
                allPredictions.push(...predictionsWithTimeframe)
              } catch (error) {
                console.error(`Failed to fetch ${tf} history for ${symbol}:`, error)
              }
            }
            results.push({ symbol, predictions: allPredictions, currentPrice })
          } else {
            // Fetch history for specific timeframe
            const history = await fetchPredictionHistoryByTimeframe(symbol, selectedTimeframe, 10)
            const predictions = (Array.isArray(history) ? history : []).map((p: any) => ({
              ...p,
              timeframe: selectedTimeframe,
            }))
            results.push({ symbol, predictions, currentPrice, timeframe: selectedTimeframe })
          }
        } catch (error) {
          console.error(`Failed to fetch predictions for ${symbol}:`, error)
        }
      }
      
      return results
    },
    enabled: !!symbolsQuery.data && symbolsQuery.data.length > 0 && !!currentPricesQuery.data,
    refetchInterval: 60_000,
  })

  const leaderboard = useMemo(() => {
    if (!predictionsQueries.data) return []
    
    const stats = calculateLeaderboard(predictionsQueries.data)
    
    // Sort by selected metric
    return stats.sort((a, b) => {
      switch (sortBy) {
        case 'accuracy':
          return b.averageAccuracy - a.averageAccuracy
        case 'mae':
          return a.mae - b.mae // Lower is better
        case 'rmse':
          return a.rmse - b.rmse // Lower is better
        case 'mape':
          return a.mape - b.mape // Lower is better
        default:
          return b.averageAccuracy - a.averageAccuracy
      }
    })
  }, [predictionsQueries.data, sortBy])

  if (symbolsQuery.isLoading || predictionsQueries.isLoading || currentPricesQuery.isLoading) {
    return (
      <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6">
        <div className="text-sm text-muted text-center py-4">Loading leaderboard...</div>
      </div>
    )
  }

  if (!symbolsQuery.data || symbolsQuery.data.length === 0) {
    return (
      <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6">
        <div className="text-sm text-muted text-center py-4">No symbols available for leaderboard</div>
      </div>
    )
  }

  if (leaderboard.length === 0) {
    return (
      <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6">
        <div className="text-sm text-muted text-center py-4">No accuracy data available yet</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-accent" />
            <h3 className="text-lg font-bold">Accuracy Leaderboard</h3>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Timeframe selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Timeframe:</span>
            <select
              value={selectedTimeframe}
              onChange={(e) => setSelectedTimeframe(e.target.value as Timeframe | 'all')}
              className="px-3 py-1.5 bg-card/50 border border-card-border/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              <option value="all">All Timeframes</option>
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </div>

          {/* Sort selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-3 py-1.5 bg-card/50 border border-card-border/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              <option value="accuracy">Average Accuracy</option>
              <option value="mae">MAE (Lower is better)</option>
              <option value="rmse">RMSE (Lower is better)</option>
              <option value="mape">MAPE (Lower is better)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6">
        <div className="space-y-3">
          {leaderboard.map((stat, idx) => {
            const rank = idx + 1
            const isTop3 = rank <= 3
            
            return (
              <motion.div
                key={`${stat.symbol}-${stat.timeframe || 'all'}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={cn(
                  "border rounded-xl p-4 transition-colors",
                  isTop3 
                    ? "bg-gradient-to-r from-accent/10 to-accent/5 border-accent/40" 
                    : "border-card-border/40 bg-card/30 hover:bg-card/50"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Rank and Symbol */}
                  <div className="flex items-start gap-3 flex-1">
                    <div className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-lg font-bold text-lg",
                      rank === 1 && "bg-yellow-500/20 text-yellow-400",
                      rank === 2 && "bg-slate-400/20 text-slate-300",
                      rank === 3 && "bg-amber-600/20 text-amber-400",
                      rank > 3 && "bg-card-border/20 text-muted"
                    )}>
                      {isTop3 ? (
                        rank === 1 ? <Trophy className="h-5 w-5" /> :
                        rank === 2 ? <Award className="h-5 w-5" /> :
                        <Award className="h-5 w-5" />
                      ) : (
                        rank
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg font-bold">{stat.symbol}</span>
                        {stat.timeframe && (
                          <span className="text-xs text-muted px-2 py-0.5 bg-card-border/20 rounded">
                            {stat.timeframe}
                          </span>
                        )}
                      </div>

                      {/* Metrics Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                        <div>
                          <div className="text-xs text-muted mb-1">Avg Accuracy</div>
                          <div className="text-sm font-semibold text-accent">
                            {stat.averageAccuracy.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted mb-1">MAE</div>
                          <div className="text-sm font-semibold">
                            {stat.mae.toFixed(2)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted mb-1">RMSE</div>
                          <div className="text-sm font-semibold">
                            {stat.rmse.toFixed(2)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted mb-1">MAPE</div>
                          <div className="text-sm font-semibold">
                            {stat.mape.toFixed(2)}%
                          </div>
                        </div>
                      </div>

                      {/* Range */}
                      <div className="flex items-center gap-4 mt-3 text-xs">
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3 text-emerald-400" />
                          <span className="text-muted">Best:</span>
                          <span className="font-semibold text-emerald-400">
                            {stat.bestAccuracy.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <TrendingDown className="h-3 w-3 text-rose-400" />
                          <span className="text-muted">Worst:</span>
                          <span className="font-semibold text-rose-400">
                            {stat.worstAccuracy.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Target className="h-3 w-3 text-muted" />
                          <span className="text-muted">Predictions:</span>
                          <span className="font-semibold">
                            {stat.predictionsWithAccuracy}/{stat.totalPredictions}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Accuracy Bar */}
                  <div className="flex flex-col items-end gap-2">
                    <div className="text-right">
                      <div className="text-2xl font-bold text-accent">
                        {stat.averageAccuracy.toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted">accuracy</div>
                    </div>
                    <div className="w-24 h-2 bg-card-border/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-accent to-accent/60 transition-all"
                        style={{ width: `${Math.min(100, stat.averageAccuracy)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

