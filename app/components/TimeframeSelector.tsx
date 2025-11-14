'use client'

import { motion } from 'framer-motion'
import { Clock } from 'lucide-react'
import { TIMEFRAMES, TIMEFRAME_LABELS, type Timeframe } from '@/lib/contract'
import { cn } from '@/lib/utils'

interface TimeframeSelectorProps {
  selected: Timeframe
  onSelect: (timeframe: Timeframe) => void
  className?: string
}

export function TimeframeSelector({ selected, onSelect, className }: TimeframeSelectorProps) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {TIMEFRAMES.map((timeframe) => {
        const isSelected = timeframe === selected
        return (
          <motion.button
            key={timeframe}
            onClick={() => onSelect(timeframe)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
              'border backdrop-blur-sm',
              isSelected
                ? 'bg-accent/20 border-accent text-accent shadow-lg shadow-accent/20'
                : 'bg-card/60 border-card-border/60 text-muted-foreground hover:bg-card/80 hover:border-card-border'
            )}
          >
            <div className="flex items-center gap-2">
              <Clock className={cn('h-3.5 w-3.5', isSelected ? 'text-accent' : 'text-muted-foreground')} />
              <span>{TIMEFRAME_LABELS[timeframe]}</span>
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}

