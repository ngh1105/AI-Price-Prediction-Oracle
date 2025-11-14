'use client'

import { useEffect, useMemo, useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useWalletClient } from 'wagmi'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast, Toaster } from 'sonner'
import { fetchLatestPrediction, listSymbols, requestSymbolUpdate } from '@/lib/contract'
import { PredictionCard, type Prediction } from './components/PredictionCard'
import { SymbolManagerDialog } from './components/SymbolManagerDialog'
import { PredictionCardSkeleton } from './components/SkeletonLoader'
import { PriceChart } from './components/PriceChart'
import { PredictionHistory } from './components/PredictionHistory'
import { SymbolComparison } from './components/SymbolComparison'
import { cn } from '@/lib/utils'
import { TrendingUp, Sparkles, Activity, History, BarChart3 } from 'lucide-react'

export default function Page() {
  const queryClient = useQueryClient()
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const provider = useMemo(() => {
    if (!walletClient) return undefined
    return {
      request: walletClient.request,
    }
  }, [walletClient])

  const symbolsQuery = useQuery({
    queryKey: ['symbols'],
    queryFn: async () => {
      const symbols = await listSymbols()
      return symbols as string[]
    },
    refetchInterval: 60_000,
  })

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'prediction' | 'history' | 'comparison'>('prediction')

  useEffect(() => {
    if (!selectedSymbol && symbolsQuery.data && symbolsQuery.data.length > 0) {
      setSelectedSymbol(symbolsQuery.data[0])
    }
  }, [symbolsQuery.data, selectedSymbol])

  const predictionQuery = useQuery({
    queryKey: ['prediction', selectedSymbol],
    queryFn: async () => {
      if (!selectedSymbol) return null
      try {
        const latest = await fetchLatestPrediction(selectedSymbol)
        if (!latest) return null
        
        // Parse key_events and sources from JSON strings
        let keyEvents: string[] = []
        let sources: string[] = []
        try {
          if (latest?.key_events_json) {
            keyEvents = typeof latest.key_events_json === 'string' 
              ? JSON.parse(latest.key_events_json) 
              : (latest.key_events_json as string[])
          }
          if (latest?.sources_json) {
            sources = typeof latest.sources_json === 'string'
              ? JSON.parse(latest.sources_json)
              : (latest.sources_json as string[])
          }
        } catch (e) {
          console.warn('Failed to parse key_events or sources:', e)
        }
        
        // Ensure confidence is a number
        const confidence = typeof latest?.confidence === 'string' 
          ? parseInt(latest.confidence, 10) 
          : (latest?.confidence || 0)
        
        const result = {
          ...latest,
          key_events: keyEvents,
          sources: sources,
          raw_context: latest?.raw_context as string | undefined,
          confidence: isNaN(confidence) ? 0 : confidence,
          // Map counter to generated_at if generated_at is not present
          generated_at: latest?.generated_at || parseInt(latest?.counter || '0', 10),
        } as Prediction
        
        // Debug logging
        console.log(`[PredictionCard] ${selectedSymbol} data:`, {
          predicted_price: result.predicted_price,
          confidence: result.confidence,
          has_raw_context: !!result.raw_context,
          raw_context_length: result.raw_context?.length || 0,
        })
        
        return result
      } catch (error: any) {
        // Handle "no predictions recorded" error gracefully
        const errorMessage = error?.message || String(error)
        if (errorMessage.includes('no predictions recorded') || errorMessage.includes('prediction missing')) {
          return null // Return null to indicate no prediction yet
        }
        throw error // Re-throw other errors
      }
    },
    enabled: !!selectedSymbol,
    refetchInterval: 60_000,
    retry: false, // Don't retry on "no predictions" errors
  })

  const generateContext = useMutation({
    mutationFn: async (symbol: string) => {
      const resp = await fetch(`/api/generate-context?symbol=${encodeURIComponent(symbol)}`)
      if (!resp.ok) {
        const error = await resp.json()
        throw new Error(error.error || 'Failed to generate context')
      }
      const context = await resp.json()
      return JSON.stringify(context)
    },
  })

  const requestUpdate = useMutation({
    mutationFn: async () => {
      if (!selectedSymbol) throw new Error('Select a symbol first')
      if (!address) throw new Error('Connect your wallet to submit updates')

      // Auto-generate context if not provided
      let contextJson: string
      if (generateContext.data) {
        contextJson = generateContext.data
      } else {
        // Generate context on the fly
        const resp = await fetch(`/api/generate-context?symbol=${encodeURIComponent(selectedSymbol)}`)
        if (!resp.ok) {
          const error = await resp.json()
          throw new Error(error.error || 'Failed to generate context')
        }
        const context = await resp.json()
        contextJson = JSON.stringify(context)
      }

      const parsed = JSON.parse(contextJson)
      const minified = JSON.stringify(parsed)
      await requestSymbolUpdate(address, { symbol: selectedSymbol, contextJson: minified }, provider)
    },
    onSuccess: () => {
      toast.success('Prediction update submitted. Validators will finalise shortly.')
      queryClient.invalidateQueries({ queryKey: ['prediction', selectedSymbol] })
      generateContext.reset()
    },
    onError: (error: any) => {
      console.error(error)
      toast.error(error?.message ?? 'Failed to submit update')
    },
  })

  const handleGenerateAndSubmit = async () => {
    if (!selectedSymbol) {
      toast.error('Please select a symbol first')
      return
    }
    if (!address) {
      toast.error('Please connect your wallet first')
      return
    }

    try {
      // Generate context first
      await generateContext.mutateAsync(selectedSymbol)
      // Then submit
      await requestUpdate.mutateAsync()
    } catch (error: any) {
      // Error already handled in mutations
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-slate-950 to-slate-900 text-foreground relative overflow-hidden">
      {/* Animated background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-slate-950 to-slate-900 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.1),transparent_50%)] animate-pulse" />
      </div>
      
      <Toaster richColors position="bottom-right" />
      
      <header className="border-b border-card-border/40 backdrop-blur-xl bg-card/50 sticky top-0 z-40 glass">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10 border border-accent/20">
              <Activity className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight gradient-text">
                AI Price Prediction Oracle
              </h1>
              <p className="text-sm text-muted flex items-center gap-2 mt-0.5">
                <Sparkles className="h-3 w-3" />
                Autonomous 24h outlooks powered by GenLayer Intelligent Contracts
              </p>
            </div>
          </div>
          <ConnectButton />
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-12 space-y-8 relative z-10">
        <section className="grid gap-8 lg:grid-cols-[1fr,420px]">
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-accent" />
                <span className="text-sm font-semibold text-muted uppercase tracking-wider">Tracked Symbols</span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {symbolsQuery.data?.length
                  ? symbolsQuery.data.map(symbol => (
                      <button
                        key={symbol}
                        onClick={() => setSelectedSymbol(symbol)}
                        className={cn(
                          "px-4 py-2 rounded-lg border text-xs font-semibold uppercase tracking-wide transition-all duration-200",
                          "hover:scale-105 active:scale-95",
                          selectedSymbol === symbol
                            ? 'border-accent text-black bg-accent shadow-lg shadow-accent/30'
                            : 'border-card-border/60 text-muted hover:text-foreground hover:border-accent/40 bg-card/50 backdrop-blur-sm'
                        )}
                      >
                        {symbol}
                      </button>
                    ))
                  : (
                    <div className="px-4 py-3 rounded-lg border border-card-border/40 bg-card/30 text-sm text-muted">
                      No symbols added yet. Add one to get started.
                    </div>
                  )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 border-b border-card-border/40 mb-4">
              <button
                onClick={() => setActiveTab('prediction')}
                className={cn(
                  "px-4 py-2 text-sm font-semibold border-b-2 transition-colors",
                  activeTab === 'prediction'
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-foreground"
                )}
              >
                Prediction
              </button>
              <button
                onClick={() => setActiveTab('history')}
                disabled={!selectedSymbol}
                className={cn(
                  "px-4 py-2 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5",
                  activeTab === 'history'
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-foreground",
                  !selectedSymbol && "opacity-50 cursor-not-allowed"
                )}
              >
                <History className="h-3.5 w-3.5" />
                History
              </button>
              <button
                onClick={() => setActiveTab('comparison')}
                className={cn(
                  "px-4 py-2 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5",
                  activeTab === 'comparison'
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-foreground"
                )}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Compare
              </button>
            </div>

            {/* Tab Content */}
            <div>
              {activeTab === 'prediction' && (
                <>
                  {predictionQuery.isLoading && <PredictionCardSkeleton />}
                  {predictionQuery.data && (
                    <div className="space-y-4">
                      <PredictionCard prediction={predictionQuery.data} />
                      {(() => {
                        const currentPrice = (() => {
                          try {
                            const context = JSON.parse(predictionQuery.data.raw_context || '{}')
                            return context.technical_indicators?.current_price || context.price?.spot || null
                          } catch {
                            return null
                          }
                        })()
                        const predictedPrice = (() => {
                          const match = predictionQuery.data.predicted_price?.match(/[\d.]+/)
                          return match ? parseFloat(match[0]) : null
                        })()
                        
                        if (currentPrice && predictedPrice) {
                          return <PriceChart 
                            currentPrice={currentPrice} 
                            predictedPrice={predictedPrice}
                            symbol={selectedSymbol || ''}
                            priceChange={((predictedPrice - currentPrice) / currentPrice) * 100}
                          />
                        }
                        return null
                      })()}
                    </div>
                  )}
                  {!predictionQuery.isLoading && !predictionQuery.data && !predictionQuery.isError && (
                    <div className="border border-sky-500/40 bg-gradient-to-br from-sky-500/10 to-sky-500/5 backdrop-blur-sm text-sky-100 rounded-2xl px-6 py-5 shadow-lg shadow-sky-500/10">
                      <p className="font-semibold text-base">No prediction available for {selectedSymbol} yet.</p>
                      <p className="text-sky-200/70 mt-2 text-sm leading-relaxed">
                        The backend scheduler will generate predictions automatically. Check back in a few minutes.
                      </p>
                    </div>
                  )}
                  {predictionQuery.isError && (
                    <div className="border border-rose-500/40 bg-gradient-to-br from-rose-500/10 to-rose-500/5 backdrop-blur-sm text-rose-100 rounded-2xl px-6 py-5 shadow-lg shadow-rose-500/10">
                      <p className="font-semibold text-base">Could not load prediction for {selectedSymbol}.</p>
                      <p className="text-rose-200/70 mt-2 text-sm leading-relaxed">
                        {predictionQuery.error?.message || 'Try again later or check if the symbol is registered.'}
                      </p>
                    </div>
                  )}
                </>
              )}

              {activeTab === 'history' && (
                selectedSymbol ? (
                  <PredictionHistory 
                    symbol={selectedSymbol}
                    currentPrice={(() => {
                      if (!predictionQuery.data?.raw_context) return null
                      try {
                        const context = JSON.parse(predictionQuery.data.raw_context)
                        return context.technical_indicators?.current_price || context.price?.spot || null
                      } catch {
                        return null
                      }
                    })()}
                  />
                ) : (
                  <div className="border border-sky-500/40 bg-gradient-to-br from-sky-500/10 to-sky-500/5 backdrop-blur-sm text-sky-100 rounded-2xl px-6 py-5 shadow-lg shadow-sky-500/10">
                    <p className="font-semibold text-base">Select a symbol to view prediction history</p>
                    <p className="text-sky-200/70 mt-2 text-sm leading-relaxed">
                      Choose a symbol from the list above to see its prediction history.
                    </p>
                  </div>
                )
              )}

              {activeTab === 'comparison' && (
                <SymbolComparison />
              )}
            </div>
          </div>

          <aside className="space-y-6">
            <SymbolManagerDialog 
              provider={provider} 
              onSymbolAdded={(symbol) => {
                // Refresh symbols list
                queryClient.invalidateQueries({ queryKey: ['symbols'] })
                // Select the newly added symbol
                setSelectedSymbol(symbol)
                // Refresh prediction for the new symbol
                queryClient.invalidateQueries({ queryKey: ['prediction', symbol] })
              }}
            />

            <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6 space-y-5 shadow-xl glass">
              <div className="space-y-1">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" />
                  Generate Prediction
                </h3>
                <p className="text-sm text-muted leading-relaxed">
                  Automatically generate a price prediction for the selected symbol. The system will fetch current market data, technical indicators, and news to create a comprehensive analysis.
                </p>
              </div>

              {selectedSymbol ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-accent/10 border border-accent/20">
                    <span className="text-muted">Selected symbol:</span>
                    <span className="font-bold text-accent uppercase">{selectedSymbol}</span>
                  </div>
                  
                  <button
                    onClick={handleGenerateAndSubmit}
                    disabled={requestUpdate.isPending || generateContext.isPending || !address}
                    className={cn(
                      "w-full py-3.5 rounded-xl font-semibold text-sm transition-all duration-200",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      "bg-accent text-black hover:bg-accent/90 hover:shadow-lg hover:shadow-accent/30",
                      "active:scale-95"
                    )}
                  >
                    {generateContext.isPending
                      ? 'Generating context...'
                      : requestUpdate.isPending
                      ? 'Submitting prediction...'
                      : !address
                      ? 'Connect wallet to generate'
                      : 'Generate & Submit Prediction'}
                  </button>

                  {generateContext.isError && (
                    <div className="text-xs text-rose-400 bg-gradient-to-br from-rose-500/10 to-rose-500/5 border border-rose-500/30 rounded-xl px-4 py-3 backdrop-blur-sm">
                      Failed to generate context: {generateContext.error?.message || 'Unknown error'}
                    </div>
                  )}

                  {generateContext.isSuccess && (
                    <div className="text-xs text-emerald-400 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/30 rounded-xl px-4 py-3 backdrop-blur-sm">
                      Context generated successfully. Submitting prediction...
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted text-center py-6 px-4 rounded-xl bg-card/30 border border-card-border/40">
                  Select a symbol from the list above to generate a prediction
                </div>
              )}
            </div>
          </aside>
        </section>

        <section className="border border-card-border/40 rounded-2xl p-8 space-y-4 bg-card/60 backdrop-blur-sm glass shadow-lg">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Activity className="h-5 w-5 text-accent" />
            How it works
          </h2>
          <ol className="list-decimal list-inside space-y-3 text-sm text-foreground/90 leading-relaxed ml-2">
            <li className="pl-2">
              The backend automation aggregates market data (price, news, sentiment) every 15 minutes.
            </li>
            <li className="pl-2">
              A transaction calls <code className="px-1.5 py-0.5 rounded bg-accent/10 text-accent font-mono text-xs">request_update</code> with the JSON context. Validators run the LLM prompt,
              applying the Equivalence Principle constraints.
            </li>
            <li className="pl-2">
              The latest prediction gets persisted on-chain and the dashboard refreshes automatically.
            </li>
            <li className="pl-2">
              Appeals can be filed on-chain if reasoning or data quality is questionable, forcing a re-evaluation by a
              broader committee.
            </li>
          </ol>
        </section>
      </div>
    </main>
  )
}

