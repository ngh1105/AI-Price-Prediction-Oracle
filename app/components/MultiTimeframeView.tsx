'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { fetchAllTimeframePredictions, TIMEFRAMES, TIMEFRAME_LABELS, type Timeframe } from '@/lib/contract'
import { PredictionCard, type Prediction } from './PredictionCard'
import { PredictionCardSkeleton } from './SkeletonLoader'
import { cn } from '@/lib/utils'

interface MultiTimeframeViewProps {
  symbol: string
}

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

function calculateWeightedAverage(predictions: Record<string, Prediction>): number {
  const weights: Record<Timeframe, number> = {
    '1h': 0.15,
    '4h': 0.20,
    '12h': 0.20,
    '24h': 0.25,
    '7d': 0.15,
    '30d': 0.05,
  }

  let total = 0
  let totalWeight = 0

  for (const [tf, pred] of Object.entries(predictions)) {
    const price = parsePredictedPrice(pred.predicted_price as string)
    if (price && weights[tf as Timeframe]) {
      total += price * weights[tf as Timeframe]
      totalWeight += weights[tf as Timeframe]
    }
  }

  return totalWeight > 0 ? total / totalWeight : 0
}

export function MultiTimeframeView({ symbol }: MultiTimeframeViewProps) {
  const predictionsQuery = useQuery({
    queryKey: ['all-timeframe-predictions', symbol],
    queryFn: async () => {
      const data = await fetchAllTimeframePredictions(symbol)
      
      // Parse predictions
      const parsed: Record<string, Prediction> = {}
      for (const [tf, pred] of Object.entries(data)) {
        if (pred) {
          let keyEvents: string[] = []
          let sources: string[] = []
          try {
            if (pred.key_events_json) {
              keyEvents = typeof pred.key_events_json === 'string' 
                ? JSON.parse(pred.key_events_json) 
                : (pred.key_events_json as string[])
            }
            if (pred.sources_json) {
              sources = typeof pred.sources_json === 'string'
                ? JSON.parse(pred.sources_json)
                : (pred.sources_json as string[])
            }
          } catch (e) {
            console.warn('Failed to parse key_events or sources:', e)
          }

          const confidence = typeof pred.confidence === 'string' 
            ? parseInt(pred.confidence, 10) 
            : (pred.confidence || 0)

          parsed[tf] = {
            ...pred,
            timeframe: tf,
            key_events: keyEvents,
            sources: sources,
            confidence: isNaN(confidence) ? 0 : confidence,
            generated_at: parseInt(pred.counter || '0', 10),
          } as Prediction
        }
      }
      return parsed
    },
    enabled: !!symbol,
    refetchInterval: 60_000,
  })

  if (predictionsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <PredictionCardSkeleton />
        <PredictionCardSkeleton />
        <PredictionCardSkeleton />
      </div>
    )
  }

  if (predictionsQuery.error || !predictionsQuery.data) {
    return (
      <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6 text-center">
        <p className="text-muted-foreground">Failed to load timeframe predictions</p>
      </div>
    )
  }

  const predictions = predictionsQuery.data
  const weightedAvg = calculateWeightedAverage(predictions)
  const availableTimeframes = TIMEFRAMES.filter(tf => predictions[tf])

  if (availableTimeframes.length === 0) {
    return (
      <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6 text-center">
        <p className="text-muted-foreground">No predictions available for {symbol}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Weighted Average Summary */}
      {weightedAvg > 0 && (
        <motion.div
          initial={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          className="bg-gradient-to-r from-accent/10 to-accent/5 border border-accent/20 rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5 text-accent" />
            <h3 className="text-lg font-bold">Weighted Average Prediction</h3>
          </div>
          <div className="text-3xl font-bold text-accent">
            ${weightedAvg.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Calculated from {availableTimeframes.length} timeframes with confidence-weighted averaging
          </p>
        </motion.div>
      )}

      {/* Timeframe Predictions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {availableTimeframes.map((timeframe) => {
          const prediction = predictions[timeframe]
          if (!prediction) return null

          return (
            <motion.div
              key={timeframe}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">{TIMEFRAME_LABELS[timeframe]}</span>
                  </div>
                  <div className={cn(
                    'px-2 py-1 rounded text-xs font-medium',
                    prediction.outlook === 'bullish' ? 'bg-emerald-500/20 text-emerald-400' :
                    prediction.outlook === 'bearish' ? 'bg-rose-500/20 text-rose-400' :
                    'bg-sky-500/20 text-sky-400'
                  )}>
                    {prediction.outlook?.toUpperCase() || 'NEUTRAL'}
                  </div>
                </div>
                
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Predicted Price</div>
                  <div className="text-xl font-bold">
                    {prediction.predicted_price || 'N/A'}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-card-border/40">
                  <div className="text-xs text-muted-foreground">Confidence</div>
                  <div className="text-sm font-semibold">{prediction.confidence || 0}%</div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Detailed Predictions */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Clock className="h-5 w-5 text-accent" />
          Detailed Predictions by Timeframe
        </h3>
        {availableTimeframes.map((timeframe) => {
          const prediction = predictions[timeframe]
          if (!prediction) return null
          return <PredictionCard key={timeframe} prediction={prediction} />
        })}
      </div>
    </div>
  )
}

