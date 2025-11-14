'use client'

import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown } from 'lucide-react'

type PriceChartProps = {
  currentPrice: number | null
  predictedPrice: number | null
  symbol: string
  priceChange?: number | null
}

export function PriceChart({ currentPrice, predictedPrice, symbol, priceChange }: PriceChartProps) {
  const data = useMemo(() => {
    if (!currentPrice || !predictedPrice) return []
    
    // Create data points: current price at time 0, predicted at time 24h
    return [
      { time: 'Now', price: currentPrice, type: 'current' },
      { time: '24h', price: predictedPrice, type: 'predicted' },
    ]
  }, [currentPrice, predictedPrice])

  if (!currentPrice || !predictedPrice) {
    return (
      <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6">
        <div className="text-sm text-muted text-center py-8">
          Price data unavailable for chart
        </div>
      </div>
    )
  }

  const isBullish = predictedPrice > currentPrice
  const changePercent = ((predictedPrice - currentPrice) / currentPrice) * 100

  return (
    <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">Price Forecast</h3>
        <div className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold",
          isBullish 
            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
            : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
        )}>
          {isBullish ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          {isBullish ? '+' : ''}{changePercent.toFixed(2)}%
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--card-border))" opacity={0.3} />
          <XAxis 
            dataKey="time" 
            stroke="hsl(var(--fg-muted))"
            style={{ fontSize: '12px' }}
          />
          <YAxis 
            stroke="hsl(var(--fg-muted))"
            style={{ fontSize: '12px' }}
            domain={['dataMin - 5%', 'dataMax + 5%']}
            tickFormatter={(value) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card-bg))',
              border: '1px solid hsl(var(--card-border))',
              borderRadius: '0.5rem',
              color: 'hsl(var(--fg))',
            }}
            formatter={(value: number) => [
              `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`,
              'Price'
            ]}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke={isBullish ? '#10b981' : '#ef4444'}
            strokeWidth={3}
            dot={{ fill: isBullish ? '#10b981' : '#ef4444', r: 6 }}
            activeDot={{ r: 8 }}
          />
          <ReferenceLine 
            y={currentPrice} 
            stroke="hsl(var(--fg-muted))" 
            strokeDasharray="2 2"
            label={{ value: 'Current', position: 'right', fill: 'hsl(var(--fg-muted))', fontSize: 10 }}
          />
        </LineChart>
      </ResponsiveContainer>
      
      <div className="flex items-center justify-between text-xs text-muted pt-2 border-t border-card-border/40">
        <div>
          <span className="font-semibold text-foreground">Current:</span>{' '}
          ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
        </div>
        <div>
          <span className="font-semibold text-foreground">Predicted (24h):</span>{' '}
          ${predictedPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
        </div>
      </div>
    </div>
  )
}

