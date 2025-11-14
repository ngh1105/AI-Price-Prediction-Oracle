'use client'

import { motion } from 'framer-motion'
import { BadgeDollarSign, Sparkle, TrendingUp, TrendingDown, Target, Clock } from 'lucide-react'
import classNames from 'classnames'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { TIMEFRAME_LABELS } from '@/lib/contract'

export type Prediction = {
  prediction_id: string
  symbol: string
  timeframe?: string  // "1h", "4h", "12h", "24h", "7d", "30d"
  generated_at: number
  predicted_price: string
  outlook: string
  confidence: number
  summary: string
  reasoning: string
  key_events: string[]
  sources: string[]
  raw_context?: string
}

const outlookColors: Record<string, string> = {
  bullish: 'text-emerald-400',
  bearish: 'text-rose-400',
  neutral: 'text-sky-300',
}

function parseCurrentPrice(rawContext?: string): number | null {
  if (!rawContext) return null
  try {
    const context = JSON.parse(rawContext)
    // Try to get from technical_indicators first (more accurate)
    if (context.technical_indicators?.current_price) {
      const price = parseFloat(context.technical_indicators.current_price)
      if (!isNaN(price) && price > 0) return price
    }
    // Fallback to price.spot
    if (context.price?.spot) {
      const price = parseFloat(context.price.spot)
      if (!isNaN(price) && price > 0) return price
    }
  } catch (e) {
    console.warn('Failed to parse current price from raw_context:', e)
  }
  return null
}

function parsePredictedPrice(predictedPrice: string): number | null {
  if (!predictedPrice || predictedPrice === 'N/A USD' || predictedPrice.includes('N/A')) {
    return null
  }
  // Extract number from strings like "43750.25 USD" or "43750.25" or "142.50 USD"
  const match = predictedPrice.match(/[\d,]+\.?\d*/)
  if (match) {
    const price = parseFloat(match[0].replace(/,/g, ''))
    if (!isNaN(price) && price > 0) return price
  }
  return null
}

export function PredictionCard({ prediction }: { prediction: Prediction }) {
  // generated_at might be a counter (number) or timestamp
  // If it's a small number (< 1000000), it's likely a counter, not a timestamp
  const generatedAtValue = typeof prediction.generated_at === 'string' 
    ? parseInt(prediction.generated_at) 
    : prediction.generated_at || 0
  const generatedAt = generatedAtValue > 1000000 
    ? new Date(generatedAtValue * 1000).toLocaleString()
    : `Update #${generatedAtValue}`
  const outlook = prediction.outlook ?? 'neutral'
  
  const currentPrice = useMemo(() => {
    const price = parseCurrentPrice(prediction.raw_context)
    if (price === null && prediction.raw_context) {
      console.warn(`[PredictionCard] Could not parse current price for ${prediction.symbol}. raw_context length: ${prediction.raw_context.length}`)
    }
    return price
  }, [prediction.raw_context, prediction.symbol])
  
  const predictedPriceNum = useMemo(() => {
    const price = parsePredictedPrice(prediction.predicted_price)
    if (price === null && prediction.predicted_price) {
      console.warn(`[PredictionCard] Could not parse predicted price for ${prediction.symbol}. Value: "${prediction.predicted_price}"`)
    }
    return price
  }, [prediction.predicted_price, prediction.symbol])
  
  const priceChange = useMemo(() => {
    if (currentPrice && predictedPriceNum) {
      return ((predictedPriceNum - currentPrice) / currentPrice) * 100
    }
    return null
  }, [currentPrice, predictedPriceNum])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, translateY: 8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6 shadow-xl glass space-y-5 relative overflow-hidden"
    >
      {/* Decorative gradient overlay */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl -z-0" />
      
      <div className="flex items-start justify-between gap-6 relative z-10">
        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm uppercase tracking-wide text-muted">
              <div className="p-1.5 rounded-lg bg-accent/10 border border-accent/20">
                <BadgeDollarSign className="h-3.5 w-3.5 text-accent" />
              </div>
              <span className="font-semibold">{prediction.symbol}</span>
            </div>
            {/* Timeframe Badge */}
            {prediction.timeframe && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card/60 border border-card-border/40">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  {TIMEFRAME_LABELS[prediction.timeframe as keyof typeof TIMEFRAME_LABELS] || prediction.timeframe}
                </span>
              </div>
            )}
          </div>
          
          {/* Price Comparison Section */}
          <div className="space-y-3">
            {currentPrice !== null ? (
              <div className="flex items-baseline gap-4">
                <div>
                  <div className="text-xs text-muted uppercase tracking-wider mb-1">Current Price</div>
                  <div className="text-2xl font-bold text-foreground">
                    ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
                  </div>
                </div>
                {predictedPriceNum !== null && priceChange !== null && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/50 border border-card-border/40">
                    {priceChange > 0 ? (
                      <TrendingUp className="h-4 w-4 text-emerald-400" />
                    ) : priceChange < 0 ? (
                      <TrendingDown className="h-4 w-4 text-rose-400" />
                    ) : null}
                    <span className={cn(
                      'text-sm font-bold',
                      priceChange > 0 ? 'text-emerald-400' : priceChange < 0 ? 'text-rose-400' : 'text-muted'
                    )}>
                      {priceChange > 0 ? '+' : ''}{priceChange.toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted italic px-2 py-1">
                Current price unavailable (checking raw_context...)
              </div>
            )}
            
            <div className="pt-2 border-t border-card-border/40">
              <div className="text-xs text-muted uppercase tracking-wider mb-1.5">Predicted Price (24h)</div>
              {predictedPriceNum !== null ? (
                <h2 className="text-3xl font-bold text-foreground gradient-text">
                  ${predictedPriceNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
                  {prediction.predicted_price.includes('USD') ? '' : ' USD'}
                </h2>
              ) : (
                <h2 className="text-3xl font-bold text-foreground text-muted">{prediction.predicted_price}</h2>
              )}
            </div>
          </div>
        </div>
        <div className="text-right space-y-2 relative z-10">
          <div className={cn(
            "px-4 py-2 rounded-xl border font-bold text-sm uppercase tracking-wide",
            outlook === 'bullish' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
            outlook === 'bearish' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' :
            'bg-sky-500/10 border-sky-500/30 text-sky-400'
          )}>
            {outlook.toUpperCase()}
          </div>
          <div className="flex flex-col gap-1.5 text-xs">
            <div className="flex items-center gap-1.5 text-muted justify-end">
              <Target className="h-3 w-3" />
              <span>Confidence: <span className="font-semibold text-foreground">{prediction.confidence}%</span></span>
            </div>
            <div className="flex items-center gap-1.5 text-muted justify-end">
              <Clock className="h-3 w-3" />
              <span>{generatedAt}</span>
            </div>
          </div>
        </div>
      </div>

      {prediction.summary && (
        <div className="relative z-10 pt-4 border-t border-card-border/40">
          <p className="text-sm text-foreground/90 leading-relaxed">{prediction.summary}</p>
        </div>
      )}

      {prediction.key_events?.length > 0 && (
        <div className="border border-card-border/50 rounded-xl px-5 py-4 space-y-2.5 bg-card/30 backdrop-blur-sm relative z-10">
          <div className="text-xs uppercase tracking-wider text-muted flex items-center gap-2 font-semibold">
            <Sparkle className="h-3.5 w-3.5 text-accent" />
            Key Drivers
          </div>
          <ul className="list-disc list-inside text-sm space-y-1.5 text-foreground/90 ml-2">
            {prediction.key_events.map((event, idx) => (
              <li key={`${prediction.prediction_id}-event-${idx}`} className="leading-relaxed">
                {event}
              </li>
            ))}
          </ul>
        </div>
      )}

      {prediction.sources?.length > 0 && (
        <div className="text-xs text-muted space-y-2 relative z-10">
          <div className="uppercase tracking-wider font-semibold">Sources</div>
          <ul className="list-disc list-inside space-y-1.5">
            {prediction.sources.map((source, idx) => (
              <li key={`${prediction.prediction_id}-source-${idx}`}>
                <a
                  href={source}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground/80 hover:text-accent transition-colors underline underline-offset-2"
                >
                  {source}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {prediction.reasoning && (
        <div className="text-sm text-foreground/85 leading-relaxed whitespace-pre-line border-t border-card-border/40 pt-5 relative z-10">
          <div className="text-xs uppercase tracking-wider text-muted mb-2 font-semibold">Detailed Analysis</div>
          <div className="prose prose-invert max-w-none">
            {prediction.reasoning}
          </div>
        </div>
      )}
    </motion.div>
  )
}

