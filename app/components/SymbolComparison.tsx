'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchLatestPrediction, listSymbols } from '@/lib/contract'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useMemo } from 'react'

function parsePredictedPrice(predictedPrice: string): number | null {
  if (!predictedPrice || predictedPrice === 'N/A USD' || predictedPrice.includes('N/A')) {
    return null
  }
  const match = predictedPrice.match(/[\d.]+/)
  if (match) {
    const price = parseFloat(match[0])
    if (!isNaN(price) && price > 0) return price
  }
  return null
}

function parseCurrentPrice(rawContext?: string): number | null {
  if (!rawContext) return null
  try {
    const context = JSON.parse(rawContext)
    if (context.technical_indicators?.current_price) {
      const price = parseFloat(context.technical_indicators.current_price)
      if (!isNaN(price) && price > 0) return price
    }
    if (context.price?.spot) {
      const price = parseFloat(context.price.spot)
      if (!isNaN(price) && price > 0) return price
    }
  } catch {
    return null
  }
  return null
}

export function SymbolComparison() {
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([])
  
  const symbolsQuery = useQuery({
    queryKey: ['symbols'],
    queryFn: async () => {
      const symbols = await listSymbols()
      return symbols as string[]
    },
    refetchInterval: 60_000, // Auto-refresh every 60 seconds
  })

  // Fetch real-time current prices for all selected symbols
  const currentPricesQuery = useQuery({
    queryKey: ['current-prices-comparison', selectedSymbols],
    queryFn: async () => {
      if (selectedSymbols.length === 0) return {}
      
      try {
        const symbolsParam = selectedSymbols.join(',')
        const resp = await fetch(`/api/current-prices?symbols=${encodeURIComponent(symbolsParam)}`)
        if (!resp.ok) return {}
        
        const data = await resp.json()
        // Convert to map: { symbol: price }
        const pricesMap: Record<string, number> = {}
        if (data.prices) {
          Object.entries(data.prices).forEach(([symbol, priceData]: [string, any]) => {
            if (priceData.price !== null && priceData.price !== undefined) {
              pricesMap[symbol] = priceData.price
            }
          })
        }
        return pricesMap
      } catch (error) {
        console.error('Failed to fetch current prices for comparison:', error)
        return {}
      }
    },
    enabled: selectedSymbols.length > 0,
    refetchInterval: 60_000, // Update mỗi 1 phút (60 giây)
    staleTime: 0, // Luôn coi là stale để refetch
  })

  const predictions = useQuery({
    queryKey: ['comparison', selectedSymbols],
    queryFn: async () => {
      if (selectedSymbols.length === 0) return []
      
      const results = await Promise.all(
        selectedSymbols.map(async (symbol) => {
          try {
            const pred = await fetchLatestPrediction(symbol)
            if (!pred) return null
            
            // Cast to any to access dynamic properties from contract response
            const predAny = pred as any
            
            // Parse data
            let keyEvents: string[] = []
            let sources: string[] = []
            try {
              if (predAny.key_events_json) {
                keyEvents = typeof predAny.key_events_json === 'string' 
                  ? JSON.parse(predAny.key_events_json) 
                  : (predAny.key_events_json as string[])
              }
              if (predAny.sources_json) {
                sources = typeof predAny.sources_json === 'string'
                  ? JSON.parse(predAny.sources_json)
                  : (predAny.sources_json as string[])
              }
            } catch {}
            
            // Ưu tiên dùng real-time price từ query, fallback về raw_context
            const realTimePrice = currentPricesQuery.data?.[symbol] ?? null
            const currentPrice = realTimePrice ?? parseCurrentPrice(predAny.raw_context as string)
            const predictedPrice = parsePredictedPrice(predAny.predicted_price as string)
            const priceChange = currentPrice && predictedPrice
              ? ((predictedPrice - currentPrice) / currentPrice) * 100
              : null

            return {
              symbol,
              currentPrice,
              predictedPrice,
              priceChange,
              outlook: predAny.outlook,
              confidence: typeof predAny.confidence === 'string' ? parseInt(predAny.confidence, 10) : (predAny.confidence || 0),
              summary: predAny.summary,
              keyEvents,
            }
          } catch {
            return null
          }
        })
      )
      
      return results.filter(Boolean) as any[]
    },
    enabled: selectedSymbols.length > 0,
    refetchInterval: 60_000, // Auto-refresh every 60 seconds
  })

  const toggleSymbol = (symbol: string) => {
    setSelectedSymbols(prev => 
      prev.includes(symbol)
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol].slice(0, 5) // Max 5 symbols
    )
  }

  return (
    <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-accent" />
        <h3 className="text-lg font-bold">Compare Symbols</h3>
      </div>
      
      <div className="space-y-3">
        <div className="text-sm text-muted">Select up to 5 symbols to compare:</div>
        <div className="flex flex-wrap gap-2">
          {symbolsQuery.data?.map(symbol => (
            <button
              key={symbol}
              onClick={() => toggleSymbol(symbol)}
              className={cn(
                "px-3 py-1.5 rounded-lg border text-xs font-semibold uppercase transition-all",
                selectedSymbols.includes(symbol)
                  ? "bg-accent text-black border-accent"
                  : "bg-card/50 border-card-border/60 text-muted hover:text-foreground"
              )}
            >
              {symbol}
            </button>
          ))}
        </div>
      </div>

      {selectedSymbols.length === 0 && (
        <div className="text-sm text-muted text-center py-8">
          Select symbols above to compare predictions
        </div>
      )}

      {predictions.isLoading && (
        <div className="text-sm text-muted text-center py-8">Loading comparisons...</div>
      )}

      {predictions.data && predictions.data.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {predictions.data.map((pred, idx) => {
              const outlook = pred.outlook?.toLowerCase() || 'neutral'
              const isBullish = outlook === 'bullish'
              const isBearish = outlook === 'bearish'
              
              return (
                <motion.div
                  key={pred.symbol}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.1 }}
                  className="border border-card-border/40 rounded-xl p-4 bg-card/30 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-lg">{pred.symbol}</h4>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-xs font-semibold uppercase",
                      isBullish && "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
                      isBearish && "bg-rose-500/10 text-rose-400 border border-rose-500/30",
                      !isBullish && !isBearish && "bg-sky-500/10 text-sky-400 border border-sky-500/30"
                    )}>
                      {outlook}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    {pred.currentPrice && (
                      <div>
                        <div className="text-xs text-muted">Current</div>
                        <div className="text-sm font-semibold">
                          ${pred.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
                        </div>
                      </div>
                    )}
                    
                    {pred.predictedPrice && (
                      <div>
                        <div className="text-xs text-muted">Predicted (24h)</div>
                        <div className="text-sm font-semibold">
                          ${pred.predictedPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
                        </div>
                      </div>
                    )}
                    
                    {pred.priceChange !== null && (
                      <div className={cn(
                        "flex items-center gap-1 text-sm font-semibold",
                        pred.priceChange > 0 ? "text-emerald-400" : 
                        pred.priceChange < 0 ? "text-rose-400" : "text-muted"
                      )}>
                        {pred.priceChange > 0 ? <TrendingUp className="h-4 w-4" /> : 
                         pred.priceChange < 0 ? <TrendingDown className="h-4 w-4" /> : 
                         <Minus className="h-4 w-4" />}
                        {pred.priceChange > 0 ? '+' : ''}{pred.priceChange.toFixed(2)}%
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between pt-2 border-t border-card-border/40">
                    <div className="text-xs text-muted">Confidence</div>
                    <div className="text-sm font-semibold">{pred.confidence}%</div>
                  </div>
                  
                  {pred.summary && (
                    <p className="text-xs text-foreground/70 line-clamp-2">{pred.summary}</p>
                  )}
                </motion.div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

