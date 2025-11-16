'use client'

import { useQuery } from '@tanstack/react-query'
import { listSymbols, fetchPredictionHistoryByTimeframe, getTimeframeStatistics, getSymbolStatistics, TIMEFRAMES, type Timeframe } from '@/lib/contract'
import { 
  calculateSymbolAccuracyStats, 
  getBestWorstPredictions,
  parsePredictedPrice,
  type PredictionWithPrice 
} from '@/lib/accuracyCalculator'
import { motion } from 'framer-motion'
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Award, 
  AlertCircle,
  Activity,
  Zap,
  Clock
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

export function PerformanceMetrics() {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe | 'all'>('all')

  const symbolsQuery = useQuery({
    queryKey: ['symbols'],
    queryFn: async () => {
      const symbols = await listSymbols()
      return symbols as string[]
    },
    refetchInterval: 60_000,
  })

  // Set first symbol as default
  const defaultSymbol = useMemo(() => {
    if (symbolsQuery.data && symbolsQuery.data.length > 0 && !selectedSymbol) {
      return symbolsQuery.data[0]
    }
    return selectedSymbol
  }, [symbolsQuery.data, selectedSymbol])

  // Fetch current price for selected symbol
  const currentPriceQuery = useQuery({
    queryKey: ['current-price', defaultSymbol],
    queryFn: async () => {
      if (!defaultSymbol) return null
      
      try {
        const response = await fetch(`/api/current-prices?symbols=${defaultSymbol}`)
        if (!response.ok) return null
        const data = await response.json()
        return data.prices?.[defaultSymbol] || null
      } catch (error) {
        console.error('[PerformanceMetrics] Error fetching current price:', error)
        return null
      }
    },
    enabled: !!defaultSymbol,
    refetchInterval: 60_000,
  })

  // Fetch prediction history
  const historyQuery = useQuery({
    queryKey: ['performance-history', defaultSymbol, selectedTimeframe],
    queryFn: async () => {
      if (!defaultSymbol) return []
      
      try {
        if (selectedTimeframe === 'all') {
          const allPredictions: PredictionWithPrice[] = []
          for (const tf of TIMEFRAMES) {
            try {
              const history = await fetchPredictionHistoryByTimeframe(defaultSymbol, tf, 20)
              const predictionsWithTimeframe = (Array.isArray(history) ? history : []).map((p: any) => ({
                ...p,
                timeframe: tf,
              }))
              allPredictions.push(...predictionsWithTimeframe)
            } catch (error) {
              console.error(`Failed to fetch ${tf} history:`, error)
            }
          }
          return allPredictions
        } else {
          const history = await fetchPredictionHistoryByTimeframe(defaultSymbol, selectedTimeframe, 20)
          return (Array.isArray(history) ? history : []).map((p: any) => ({
            ...p,
            timeframe: selectedTimeframe,
          }))
        }
      } catch (error) {
        console.error('[PerformanceMetrics] Error fetching history:', error)
        return []
      }
    },
    enabled: !!defaultSymbol,
    refetchInterval: 60_000,
  })

  // Try to fetch on-chain statistics first (more efficient)
  const onChainStatsQuery = useQuery({
    queryKey: ['onchain-stats', defaultSymbol, selectedTimeframe],
    queryFn: async () => {
      if (!defaultSymbol) return null
      
      try {
        if (selectedTimeframe === 'all') {
          return await getSymbolStatistics(defaultSymbol)
        } else {
          return await getTimeframeStatistics(defaultSymbol, selectedTimeframe)
        }
      } catch (error) {
        console.error('[PerformanceMetrics] Error fetching on-chain stats:', error)
        return null
      }
    },
    enabled: !!defaultSymbol,
    refetchInterval: 60_000,
  })

  const stats = useMemo(() => {
    // Priority 1: Use on-chain statistics if available
    if (onChainStatsQuery.data) {
      const onChain = onChainStatsQuery.data as any
      return {
        symbol: defaultSymbol || '',
        timeframe: selectedTimeframe === 'all' ? undefined : selectedTimeframe,
        totalPredictions: parseInt(onChain.total_predictions || '0', 10),
        averageAccuracy: parseFloat(onChain.avg_accuracy || '0'),
        medianAccuracy: parseFloat(onChain.avg_accuracy || '0'), // Contract doesn't provide median, use avg
        bestAccuracy: parseFloat(onChain.best_accuracy || '0'),
        worstAccuracy: parseFloat(onChain.worst_accuracy || '0'),
        mae: 0, // Contract doesn't provide MAE, would need to calculate
        rmse: 0, // Contract doesn't provide RMSE, would need to calculate
        mape: 0, // Contract doesn't provide MAPE, would need to calculate
        predictionsWithAccuracy: parseInt(onChain.predictions_with_accuracy || '0', 10),
      }
    }
    
    // Priority 2: Fallback to calculating from history
    if (!defaultSymbol || !historyQuery.data || historyQuery.data.length === 0 || !currentPriceQuery.data) {
      return null
    }

    return calculateSymbolAccuracyStats(
      defaultSymbol,
      historyQuery.data,
      currentPriceQuery.data,
      selectedTimeframe === 'all' ? undefined : selectedTimeframe
    )
  }, [defaultSymbol, historyQuery.data, currentPriceQuery.data, selectedTimeframe, onChainStatsQuery.data])

  const { best, worst } = useMemo(() => {
    if (!historyQuery.data) {
      return { best: null, worst: null }
    }
    
    // Find best/worst from history using on-chain accuracy_score if available
    let bestPred: any = null
    let worstPred: any = null
    let bestAccuracy = -1
    let worstAccuracy = 101
    
    for (const pred of historyQuery.data) {
      // Use on-chain accuracy_score if available
      let accuracy: number | null = null
      if (pred.accuracy_score !== undefined && pred.accuracy_score !== null && pred.accuracy_score !== '0') {
        const onChainAccuracy = typeof pred.accuracy_score === 'string' 
          ? parseFloat(pred.accuracy_score) 
          : pred.accuracy_score
        if (!isNaN(onChainAccuracy) && onChainAccuracy > 0) {
          accuracy = onChainAccuracy
        }
      }
      
      // Fallback to calculating from current price
      if (accuracy === null && currentPriceQuery.data) {
        const predicted = parsePredictedPrice(pred.predicted_price || '')
        if (predicted) {
          const error = Math.abs((predicted - currentPriceQuery.data) / currentPriceQuery.data) * 100
          accuracy = Math.max(0, 100 - error)
        }
      }
      
      if (accuracy !== null) {
        if (accuracy > bestAccuracy) {
          bestAccuracy = accuracy
          bestPred = { ...pred, accuracy }
        }
        if (accuracy < worstAccuracy) {
          worstAccuracy = accuracy
          worstPred = { ...pred, accuracy }
        }
      }
    }
    
    return { best: bestPred, worst: worstPred }
  }, [historyQuery.data, currentPriceQuery.data])

  // Accuracy over time (for chart visualization)
  const accuracyOverTime = useMemo(() => {
    if (!historyQuery.data || !currentPriceQuery.data) return []
    
    const accuracies: Array<{ timestamp: number; accuracy: number; timeframe?: string }> = []
    
    for (const pred of historyQuery.data) {
      const predicted = parsePredictedPrice(pred.predicted_price || '')
      if (predicted && currentPriceQuery.data) {
        const error = Math.abs((predicted - currentPriceQuery.data) / currentPriceQuery.data) * 100
        const accuracy = Math.max(0, 100 - error)
        
        const timestamp = typeof pred.generated_at === 'string' 
          ? parseInt(pred.generated_at) 
          : (pred.generated_at || 0)
        
        accuracies.push({
          timestamp: timestamp > 1000000 ? timestamp : Date.now() / 1000,
          accuracy,
          timeframe: pred.timeframe,
        })
      }
    }
    
    return accuracies.sort((a, b) => a.timestamp - b.timestamp)
  }, [historyQuery.data, currentPriceQuery.data])

  if (symbolsQuery.isLoading || historyQuery.isLoading || currentPriceQuery.isLoading || onChainStatsQuery.isLoading) {
    return (
      <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6">
        <div className="text-sm text-muted text-center py-4">Loading performance metrics...</div>
      </div>
    )
  }

  if (!symbolsQuery.data || symbolsQuery.data.length === 0) {
    return (
      <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6">
        <div className="text-sm text-muted text-center py-4">No symbols available</div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6">
        <div className="text-sm text-muted text-center py-4">
          {defaultSymbol ? 'No accuracy data available yet' : 'Select a symbol to view metrics'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-accent" />
            <h3 className="text-lg font-bold">Performance Metrics</h3>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Symbol selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Symbol:</span>
            <select
              value={defaultSymbol || ''}
              onChange={(e) => setSelectedSymbol(e.target.value || null)}
              className="px-3 py-1.5 bg-card/50 border border-card-border/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              {symbolsQuery.data.map((sym) => (
                <option key={sym} value={sym}>
                  {sym}
                </option>
              ))}
            </select>
          </div>

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
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-xl p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-accent" />
            <span className="text-xs text-muted uppercase">Avg Accuracy</span>
          </div>
          <div className="text-2xl font-bold text-accent">{stats.averageAccuracy.toFixed(1)}%</div>
          <div className="text-xs text-muted mt-1">
            Median: {stats.medianAccuracy.toFixed(1)}%
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-xl p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-emerald-400" />
            <span className="text-xs text-muted uppercase">MAE</span>
          </div>
          <div className="text-2xl font-bold">{stats.mae.toFixed(2)}%</div>
          <div className="text-xs text-muted mt-1">Mean Absolute Error</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-xl p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-yellow-400" />
            <span className="text-xs text-muted uppercase">RMSE</span>
          </div>
          <div className="text-2xl font-bold">{stats.rmse.toFixed(2)}%</div>
          <div className="text-xs text-muted mt-1">Root Mean Squared Error</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-xl p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-rose-400" />
            <span className="text-xs text-muted uppercase">MAPE</span>
          </div>
          <div className="text-2xl font-bold">{stats.mape.toFixed(2)}%</div>
          <div className="text-xs text-muted mt-1">Mean Absolute % Error</div>
        </motion.div>
      </div>

      {/* Range and Best/Worst */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Accuracy Range */}
        <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-accent" />
            <h4 className="font-bold">Accuracy Range</h4>
          </div>
          
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted">Best Accuracy</span>
                <span className="text-lg font-bold text-emerald-400">
                  {stats.bestAccuracy.toFixed(1)}%
                </span>
              </div>
              <div className="w-full h-3 bg-card-border/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                  style={{ width: `${Math.min(100, stats.bestAccuracy)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted">Average Accuracy</span>
                <span className="text-lg font-bold text-accent">
                  {stats.averageAccuracy.toFixed(1)}%
                </span>
              </div>
              <div className="w-full h-3 bg-card-border/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-accent to-accent/60"
                  style={{ width: `${Math.min(100, stats.averageAccuracy)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted">Worst Accuracy</span>
                <span className="text-lg font-bold text-rose-400">
                  {stats.worstAccuracy.toFixed(1)}%
                </span>
              </div>
              <div className="w-full h-3 bg-card-border/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-rose-400 to-rose-500"
                  style={{ width: `${Math.min(100, stats.worstAccuracy)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Best & Worst Predictions */}
        <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Award className="h-5 w-5 text-accent" />
            <h4 className="font-bold">Best & Worst Predictions</h4>
          </div>
          
          <div className="space-y-4">
            {best && (
              <div className="border border-emerald-500/30 bg-emerald-500/10 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-400">Best Prediction</span>
                </div>
                <div className="text-lg font-bold mb-1">{best.predicted_price}</div>
                <div className="flex items-center gap-4 text-xs text-muted">
                  <span>Accuracy: <span className="font-semibold text-emerald-400">{best.accuracy.toFixed(1)}%</span></span>
                  {best.timeframe && (
                    <span>Timeframe: <span className="font-semibold">{best.timeframe}</span></span>
                  )}
                </div>
              </div>
            )}

            {worst && (
              <div className="border border-rose-500/30 bg-rose-500/10 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="h-4 w-4 text-rose-400" />
                  <span className="text-sm font-semibold text-rose-400">Worst Prediction</span>
                </div>
                <div className="text-lg font-bold mb-1">{worst.predicted_price}</div>
                <div className="flex items-center gap-4 text-xs text-muted">
                  <span>Accuracy: <span className="font-semibold text-rose-400">{worst.accuracy.toFixed(1)}%</span></span>
                  {worst.timeframe && (
                    <span>Timeframe: <span className="font-semibold">{worst.timeframe}</span></span>
                  )}
                </div>
              </div>
            )}

            {!best && !worst && (
              <div className="text-sm text-muted text-center py-4">
                No predictions with accuracy data available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-5 w-5 text-accent" />
          <h4 className="font-bold">Summary Statistics</h4>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-muted mb-1">Total Predictions</div>
            <div className="text-lg font-bold">{stats.totalPredictions}</div>
          </div>
          <div>
            <div className="text-xs text-muted mb-1">With Accuracy</div>
            <div className="text-lg font-bold text-accent">
              {stats.predictionsWithAccuracy}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted mb-1">Coverage</div>
            <div className="text-lg font-bold">
              {((stats.predictionsWithAccuracy / stats.totalPredictions) * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-xs text-muted mb-1">Timeframe</div>
            <div className="text-lg font-bold">
              {stats.timeframe || 'All'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

