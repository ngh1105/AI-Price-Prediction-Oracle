'use client'

import { useQuery } from '@tanstack/react-query'
import { listSymbols, fetchAllTimeframePredictions, TIMEFRAMES, type Timeframe } from '@/lib/contract'
import { motion } from 'framer-motion'
import { BarChart3, TrendingUp, TrendingDown, Activity, Target, Clock, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { AccuracyLeaderboard } from './AccuracyLeaderboard'
import { PerformanceMetrics } from './PerformanceMetrics'

function parsePredictedPrice(predictedPrice: string): number | null {
  if (!predictedPrice || predictedPrice === 'N/A USD' || predictedPrice.includes('N/A')) {
    return null
  }
  const match = predictedPrice.match(/[\d,]+\.?\d*/)
  if (match) {
    const price = parseFloat(match[0].replace(/,/g, ''))
    if (!isNaN(price) && price > 0) return price
  }
  return null
}

interface SymbolStats {
  symbol: string
  totalPredictions: number
  averageConfidence: number
  bullishCount: number
  bearishCount: number
  neutralCount: number
  timeframesWithPredictions: number
}

export function AnalyticsDashboard() {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'leaderboard' | 'metrics'>('overview')
  
  const symbolsQuery = useQuery({
    queryKey: ['symbols'],
    queryFn: async () => {
      const symbols = await listSymbols()
      return symbols as string[]
    },
    refetchInterval: 60_000,
  })

  // Fetch predictions for all symbols
  const predictionsQueries = useQuery({
    queryKey: ['analytics-predictions', symbolsQuery.data],
    queryFn: async () => {
      if (!symbolsQuery.data || symbolsQuery.data.length === 0) return []
      
      const results: Array<{ symbol: string; predictions: Record<string, any> }> = []
      
      for (const symbol of symbolsQuery.data) {
        try {
          const predictions = await fetchAllTimeframePredictions(symbol)
          results.push({ symbol, predictions })
        } catch (error) {
          console.error(`Failed to fetch predictions for ${symbol}:`, error)
        }
      }
      
      return results
    },
    enabled: !!symbolsQuery.data && symbolsQuery.data.length > 0,
    refetchInterval: 60_000,
  })

  const stats = useMemo(() => {
    if (!predictionsQueries.data) return []

    const symbolStats: SymbolStats[] = []

    for (const { symbol, predictions } of predictionsQueries.data) {
      const preds = Object.values(predictions)
      if (preds.length === 0) continue

      let totalConfidence = 0
      let bullishCount = 0
      let bearishCount = 0
      let neutralCount = 0

      for (const pred of preds) {
        const confidence = typeof pred.confidence === 'string' 
          ? parseInt(pred.confidence, 10) 
          : (pred.confidence || 0)
        totalConfidence += confidence

        const outlook = (pred.outlook || 'neutral').toLowerCase()
        if (outlook === 'bullish') bullishCount++
        else if (outlook === 'bearish') bearishCount++
        else neutralCount++
      }

      symbolStats.push({
        symbol,
        totalPredictions: preds.length,
        averageConfidence: totalConfidence / preds.length,
        bullishCount,
        bearishCount,
        neutralCount,
        timeframesWithPredictions: preds.length,
      })
    }

    return symbolStats.sort((a, b) => b.totalPredictions - a.totalPredictions)
  }, [predictionsQueries.data])

  const overallStats = useMemo(() => {
    if (stats.length === 0) return null

    const totalSymbols = stats.length
    const totalPredictions = stats.reduce((sum, s) => sum + s.totalPredictions, 0)
    const avgConfidence = stats.reduce((sum, s) => sum + s.averageConfidence, 0) / totalSymbols
    const totalBullish = stats.reduce((sum, s) => sum + s.bullishCount, 0)
    const totalBearish = stats.reduce((sum, s) => sum + s.bearishCount, 0)
    const totalNeutral = stats.reduce((sum, s) => sum + s.neutralCount, 0)

    return {
      totalSymbols,
      totalPredictions,
      avgConfidence,
      totalBullish,
      totalBearish,
      totalNeutral,
    }
  }, [stats])

  if (symbolsQuery.isLoading || predictionsQueries.isLoading) {
    return (
      <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6">
        <div className="text-sm text-muted text-center py-4">Loading analytics...</div>
      </div>
    )
  }

  if (!symbolsQuery.data || symbolsQuery.data.length === 0) {
    return (
      <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6">
        <div className="text-sm text-muted text-center py-4">No symbols available for analytics</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={cn(
              "flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              activeSubTab === 'overview'
                ? "bg-accent text-black"
                : "text-muted hover:text-foreground hover:bg-card/50"
            )}
          >
            <div className="flex items-center justify-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Overview
            </div>
          </button>
          <button
            onClick={() => setActiveSubTab('leaderboard')}
            className={cn(
              "flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              activeSubTab === 'leaderboard'
                ? "bg-accent text-black"
                : "text-muted hover:text-foreground hover:bg-card/50"
            )}
          >
            <div className="flex items-center justify-center gap-2">
              <Trophy className="h-4 w-4" />
              Leaderboard
            </div>
          </button>
          <button
            onClick={() => setActiveSubTab('metrics')}
            className={cn(
              "flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              activeSubTab === 'metrics'
                ? "bg-accent text-black"
                : "text-muted hover:text-foreground hover:bg-card/50"
            )}
          >
            <div className="flex items-center justify-center gap-2">
              <Activity className="h-4 w-4" />
              Performance
            </div>
          </button>
        </div>
      </div>

      {activeSubTab === 'leaderboard' && (
        <AccuracyLeaderboard />
      )}

      {activeSubTab === 'metrics' && (
        <PerformanceMetrics />
      )}

      {activeSubTab === 'overview' && (
        <>
          {/* Overall Stats */}
          {overallStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-accent" />
              <span className="text-xs text-muted uppercase">Total Symbols</span>
            </div>
            <div className="text-2xl font-bold">{overallStats.totalSymbols}</div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-accent" />
              <span className="text-xs text-muted uppercase">Total Predictions</span>
            </div>
            <div className="text-2xl font-bold">{overallStats.totalPredictions}</div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-4 w-4 text-accent" />
              <span className="text-xs text-muted uppercase">Avg Confidence</span>
            </div>
            <div className="text-2xl font-bold">{overallStats.avgConfidence.toFixed(1)}%</div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              <span className="text-xs text-muted uppercase">Bullish</span>
            </div>
            <div className="text-2xl font-bold text-emerald-400">{overallStats.totalBullish}</div>
          </motion.div>
        </div>
      )}

      {/* Symbol Statistics */}
      <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-accent" />
          <h3 className="text-lg font-bold">Symbol Statistics</h3>
        </div>

        <div className="space-y-3">
          {stats.map((stat, idx) => (
            <motion.div
              key={stat.symbol}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="border border-card-border/40 rounded-xl p-4 bg-card/30 hover:bg-card/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg font-bold">{stat.symbol}</span>
                    <span className="text-xs text-muted">
                      {stat.timeframesWithPredictions}/{TIMEFRAMES.length} timeframes
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mt-3">
                    <div>
                      <div className="text-xs text-muted mb-1">Avg Confidence</div>
                      <div className="text-sm font-semibold">{stat.averageConfidence.toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted mb-1">Outlook</div>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded",
                          stat.bullishCount > stat.bearishCount ? "bg-emerald-500/20 text-emerald-400" :
                          stat.bearishCount > stat.bullishCount ? "bg-rose-500/20 text-rose-400" :
                          "bg-sky-500/20 text-sky-400"
                        )}>
                          {stat.bullishCount > stat.bearishCount ? 'Bullish' :
                           stat.bearishCount > stat.bullishCount ? 'Bearish' : 'Neutral'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted mb-1">Distribution</div>
                      <div className="text-xs">
                        <span className="text-emerald-400">↑{stat.bullishCount}</span>
                        {' '}/{' '}
                        <span className="text-rose-400">↓{stat.bearishCount}</span>
                        {' '}/{' '}
                        <span className="text-sky-400">→{stat.neutralCount}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
        </>
      )}
    </div>
  )
}

