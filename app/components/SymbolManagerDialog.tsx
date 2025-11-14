'use client'

import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAccount } from 'wagmi'
import { useState } from 'react'
import { toast } from 'sonner'
import { addSymbol, requestSymbolUpdate } from '@/lib/contract'
import { cn } from '@/lib/utils'
import { Plus, FileText } from 'lucide-react'

const schema = z.object({
  symbol: z.string().min(1, 'Symbol is required').max(12, 'Keep symbol short'),
  description: z.string().min(1, 'Description is required').max(160),
})

type FormValues = z.infer<typeof schema>

export function SymbolManagerDialog({ 
  provider, 
  onSymbolAdded 
}: { 
  provider?: any
  onSymbolAdded?: (symbol: string) => void 
}) {
  const { address } = useAccount()
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      symbol: '',
      description: '',
    },
  })

  const onSubmit = handleSubmit(async values => {
    if (!address) {
      toast.error('Connect a wallet before adding a symbol.')
      return
    }
    setSubmitting(true)
    try {
      // Add symbol to contract
      await addSymbol(address, {
        symbol: values.symbol,
        description: values.description,
      }, provider)
      toast.success(`Symbol ${values.symbol.toUpperCase()} added`)
      
      // Automatically generate and submit first prediction
      try {
        toast.info(`Generating initial prediction for ${values.symbol.toUpperCase()}...`)
        
        // Generate context
        const contextResp = await fetch(`/api/generate-context?symbol=${encodeURIComponent(values.symbol.toUpperCase())}`)
        if (!contextResp.ok) {
          const error = await contextResp.json()
          throw new Error(error.error || 'Failed to generate context')
        }
        const context = await contextResp.json()
        const contextJson = JSON.stringify(context)
        
        // Submit prediction
        await requestSymbolUpdate(address, {
          symbol: values.symbol.toUpperCase(),
          contextJson: contextJson,
        }, provider)
        
        toast.success(`Initial prediction submitted for ${values.symbol.toUpperCase()}`)
      } catch (predError: any) {
        // Log error but don't fail the add symbol operation
        console.error('Failed to auto-generate prediction:', predError)
        toast.warning(`Symbol added, but prediction generation failed: ${predError?.message || 'Unknown error'}`)
      }
      
      // Notify parent to refresh queries
      if (onSymbolAdded) {
        onSymbolAdded(values.symbol.toUpperCase())
      }
      
      reset()
    } catch (error: any) {
      console.error(error)
      toast.error(error?.message ?? 'Failed to add symbol')
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <form
      onSubmit={onSubmit}
      className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6 shadow-xl glass space-y-5 relative overflow-hidden"
    >
      {/* Decorative gradient overlay */}
      <div className="absolute top-0 left-0 w-48 h-48 bg-accent/5 rounded-full blur-3xl -z-0" />
      
      <div className="relative z-10 space-y-1">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-accent/10 border border-accent/20">
            <Plus className="h-4 w-4 text-accent" />
          </div>
          Add Symbol
        </h3>
        <p className="text-sm text-muted leading-relaxed">
          Provide a ticker and short description for the symbol. A prediction will be automatically generated after adding.
        </p>
      </div>

      <div className="space-y-4 relative z-10">
        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-muted font-semibold flex items-center gap-1.5">
            <FileText className="h-3 w-3" />
            Symbol
          </span>
          <input
            {...register('symbol')}
            placeholder="BTC"
            className={cn(
              "bg-card/50 border border-card-border/60 rounded-xl px-4 py-3 text-sm",
              "focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40",
              "transition-all duration-200 placeholder:text-muted/50",
              errors.symbol && "border-rose-500/50 focus:ring-rose-500/40"
            )}
          />
          {errors.symbol && (
            <span className="text-xs text-rose-400 flex items-center gap-1">
              {errors.symbol.message}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-muted font-semibold flex items-center gap-1.5">
            <FileText className="h-3 w-3" />
            Description
          </span>
          <textarea
            rows={3}
            {...register('description')}
            placeholder="Brief description of the asset..."
            className={cn(
              "bg-card/50 border border-card-border/60 rounded-xl px-4 py-3 text-sm",
              "focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40",
              "transition-all duration-200 resize-none placeholder:text-muted/50",
              errors.description && "border-rose-500/50 focus:ring-rose-500/40"
            )}
          />
          {errors.description && (
            <span className="text-xs text-rose-400 flex items-center gap-1">
              {errors.description.message}
            </span>
          )}
        </label>
      </div>

      <div className="flex items-center justify-end gap-3 relative z-10 pt-2">
        <button
          type="button"
          onClick={() => reset()}
          className={cn(
            "px-4 py-2.5 rounded-xl border border-card-border/60 text-sm font-medium",
            "hover:bg-card/50 transition-all duration-200 active:scale-95",
            "text-muted hover:text-foreground"
          )}
        >
          Clear
        </button>
        <button
          type="submit"
          disabled={submitting}
          className={cn(
            "px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "bg-accent text-black hover:bg-accent/90 hover:shadow-lg hover:shadow-accent/30",
            "active:scale-95"
          )}
        >
          {submitting ? 'Submitting…' : 'Add Symbol'}
        </button>
      </div>
    </form>
  )
}

