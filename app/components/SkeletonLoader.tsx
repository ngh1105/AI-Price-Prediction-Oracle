'use client'

import { cn } from '@/lib/utils'

export function PredictionCardSkeleton() {
  return (
    <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6 shadow-xl glass space-y-5 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded-lg bg-muted/20" />
            <div className="h-4 w-16 rounded bg-muted/20" />
          </div>
          
          {/* Price skeleton */}
          <div className="space-y-3">
            <div className="h-6 w-32 rounded bg-muted/20" />
            <div className="h-8 w-48 rounded bg-muted/20" />
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="h-8 w-20 rounded-xl bg-muted/20" />
          <div className="h-4 w-24 rounded bg-muted/20" />
          <div className="h-4 w-16 rounded bg-muted/20" />
        </div>
      </div>
      
      {/* Content skeleton */}
      <div className="space-y-3 pt-4 border-t border-card-border/40">
        <div className="h-4 w-full rounded bg-muted/20" />
        <div className="h-4 w-5/6 rounded bg-muted/20" />
        <div className="h-4 w-4/6 rounded bg-muted/20" />
      </div>
      
      {/* Key events skeleton */}
      <div className="border border-card-border/50 rounded-xl px-5 py-4 space-y-2.5 bg-card/30">
        <div className="h-3 w-24 rounded bg-muted/20" />
        <div className="space-y-1.5 ml-2">
          <div className="h-4 w-full rounded bg-muted/20" />
          <div className="h-4 w-5/6 rounded bg-muted/20" />
          <div className="h-4 w-4/6 rounded bg-muted/20" />
        </div>
      </div>
    </div>
  )
}

export function SymbolButtonSkeleton() {
  return (
    <div className="flex flex-wrap gap-2.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="h-9 w-16 rounded-lg bg-muted/20 animate-pulse"
        />
      ))}
    </div>
  )
}

export function ChartSkeleton() {
  return (
    <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6 space-y-4">
      <div className="h-6 w-32 rounded bg-muted/20 animate-pulse" />
      <div className="h-64 w-full rounded-lg bg-muted/10 animate-pulse flex items-end justify-between px-4 pb-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
          <div
            key={i}
            className="w-8 bg-muted/20 rounded-t"
            style={{ height: `${Math.random() * 60 + 20}%` }}
          />
        ))}
      </div>
    </div>
  )
}

