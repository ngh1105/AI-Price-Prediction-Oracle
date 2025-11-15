'use client'

import { useEffect, useMemo, useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useWalletClient } from 'wagmi'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast, Toaster } from 'sonner'
import { fetchLatestPrediction, fetchLatestPredictionByTimeframe, listSymbols, requestSymbolUpdate, requestSymbolUpdateAllTimeframes, TIMEFRAMES, type Timeframe } from '@/lib/contract'
import { getLocalAccountAddress, hasLocalAccountConsent, setLocalAccountConsent } from '@/lib/glClient'
import { PredictionCard, type Prediction } from './components/PredictionCard'
import { SymbolManagerDialog } from './components/SymbolManagerDialog'
import { PredictionCardSkeleton } from './components/SkeletonLoader'
import { PriceChart } from './components/PriceChart'
import { PredictionHistory } from './components/PredictionHistory'
import { SymbolComparison } from './components/SymbolComparison'
import { TimeframeSelector } from './components/TimeframeSelector'
import { MultiTimeframeView } from './components/MultiTimeframeView'
import { AnalyticsDashboard } from './components/AnalyticsDashboard'
import { TransactionStatus } from './components/TransactionStatus'
import { useTransactionTracker } from '@/lib/transactionTracker'
import { setTransactionTracker } from '@/lib/contract'
import { formatErrorForToast } from '@/lib/errorUtils'
import { cn } from '@/lib/utils'
import { TrendingUp, Sparkles, Activity, History, BarChart3, Clock } from 'lucide-react'

export default function Page() {
  const queryClient = useQueryClient()
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { trackTransaction } = useTransactionTracker()
  
  // Initialize local account on mount (with user consent)
  const [localAccountConsentShown, setLocalAccountConsentShown] = useState(false)
  // Track whether user wants to use local account (based on consent)
  const [useLocalAccount, setUseLocalAccount] = useState(() => hasLocalAccountConsent())
  
  useEffect(() => {
    // Check if user has already consented
    if (hasLocalAccountConsent()) {
      // User has already consented, initialize account (consent already checked, pass false)
      setUseLocalAccount(true)
      try {
        const localAddress = getLocalAccountAddress(false)
        console.log('[Page] Local account initialized:', localAddress)
      } catch (error) {
        console.warn('[Page] Failed to initialize local account:', error)
      }
    } else if (!localAccountConsentShown) {
      // Show consent dialog
      setLocalAccountConsentShown(true)
      const confirmed = window.confirm(
        '🔐 Local Account Setup\n\n' +
        'This app can create a local account (private key) for faster transactions.\n\n' +
        '⚠️ SECURITY WARNING:\n' +
        '• Private key will be stored UNENCRYPTED in your browser\n' +
        '• Anyone with access to this browser can control the account\n' +
        '• This is a HOT WALLET - use only for testing/development\n\n' +
        'For production, use MetaMask or implement encryption.\n\n' +
        'Do you want to create a local account?'
      )
      
      if (confirmed) {
        setLocalAccountConsent(true)
        setUseLocalAccount(true)
        try {
          // Pass true to require consent (which we just obtained)
          const localAddress = getLocalAccountAddress(true)
          console.log('[Page] Local account created with user consent:', localAddress)
          toast.info('Local account created. Transactions will be faster!', { duration: 3000 })
        } catch (error) {
          console.warn('[Page] Failed to create local account:', error)
          setUseLocalAccount(false)
        }
      } else {
        setLocalAccountConsent(false)
        setUseLocalAccount(false)
        console.log('[Page] User declined local account creation')
      }
    }
  }, [localAccountConsentShown])
  
  // Setup transaction tracking
  useEffect(() => {
    setTransactionTracker(trackTransaction)
  }, [trackTransaction])
  
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

  // Health check monitoring
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const resp = await fetch('/api/health')
      const data = await resp.json()
      if (!resp.ok) {
        // Include error data in the thrown error
        const error = new Error(data.error || 'Health check failed') as any
        error.response = { data }
        throw error
      }
      return data
    },
    refetchInterval: 30_000, // Check every 30 seconds
    retry: 2,
    retryDelay: 5000,
    // Don't show error toast on initial load if wallet not connected
    retryOnMount: false,
  })

  // Alert user if health check fails
  useEffect(() => {
    if (healthQuery.isError && !healthQuery.isFetching) {
      const errorData = healthQuery.error as any
      const errorMessage = errorData?.response?.data?.error || errorData?.message || 'System health check failed'
      const suggestion = errorData?.response?.data?.suggestion || ''
      
      toast.error(
        <div>
          <div className="font-semibold">{errorMessage}</div>
          {suggestion && <div className="text-sm mt-1 opacity-90">{suggestion}</div>}
        </div>,
        {
          duration: 15000,
          id: 'health-check-error', // Prevent duplicate toasts
        }
      )
    }
  }, [healthQuery.isError, healthQuery.isFetching, healthQuery.error])

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('24h')
  const [activeTab, setActiveTab] = useState<'prediction' | 'history' | 'comparison' | 'timeframes' | 'analytics'>('prediction')

  useEffect(() => {
    if (!selectedSymbol && symbolsQuery.data && symbolsQuery.data.length > 0) {
      setSelectedSymbol(symbolsQuery.data[0])
    }
  }, [symbolsQuery.data, selectedSymbol])

  const predictionQuery = useQuery({
    queryKey: ['prediction', selectedSymbol, selectedTimeframe],
    queryFn: async () => {
      if (!selectedSymbol) return null
      try {
        // Use timeframe-specific fetch if not 24h, otherwise use legacy method for backward compat
        const latest = selectedTimeframe === '24h' 
          ? await fetchLatestPrediction(selectedSymbol)
          : await fetchLatestPredictionByTimeframe(selectedSymbol, selectedTimeframe)
        if (!latest) return null
        
        // Parse key_events and sources from JSON strings
        let keyEvents: string[] = []
        let sources: string[] = []
        try {
          const latestAny = latest as any
          if (latestAny?.key_events_json) {
            keyEvents = typeof latestAny.key_events_json === 'string' 
              ? JSON.parse(latestAny.key_events_json) 
              : (latestAny.key_events_json as string[])
          }
          if (latestAny?.sources_json) {
            sources = typeof latestAny.sources_json === 'string'
              ? JSON.parse(latestAny.sources_json)
              : (latestAny.sources_json as string[])
          }
        } catch (e) {
          console.warn('Failed to parse key_events or sources:', e)
        }
        
        // Ensure confidence is a number
        const latestAny = latest as any
        const confidence = typeof latestAny?.confidence === 'string' 
          ? parseInt(latestAny.confidence, 10) 
          : (latestAny?.confidence || 0)
        
        const result = {
          ...latestAny,
          timeframe: latestAny?.timeframe || selectedTimeframe, // Include timeframe
          key_events: keyEvents,
          sources: sources,
          raw_context: latestAny?.raw_context as string | undefined,
          confidence: isNaN(confidence) ? 0 : confidence,
          // Map counter to generated_at if generated_at is not present
          generated_at: latestAny?.generated_at || parseInt(latestAny?.counter || '0', 10),
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
      
      toast.info(`Submitting predictions for ${selectedSymbol}...`, { duration: 2000 })
      
      // Submit for ALL timeframes automatically
      const results = await requestSymbolUpdateAllTimeframes(address, { 
        symbol: selectedSymbol, 
        contextJson: minified 
      }, provider, useLocalAccount)
      
      // Count successes
      const successCount = results.filter(r => r.success).length
      const failedCount = results.filter(r => !r.success).length
      
      if (successCount > 0) {
        return { successCount, failedCount, results }
      } else {
        // Show detailed error if all failed
        const errors = results.filter(r => !r.success).map(r => `${r.timeframe}: ${r.error}`).join(', ')
        throw new Error(`Failed to submit any predictions. Errors: ${errors}`)
      }
    },
    onSuccess: async (data) => {
      if (data.failedCount > 0) {
        toast.warning(`Predictions submitted for ${data.successCount}/6 timeframes. ${data.failedCount} failed.`, {
          duration: 5000,
        })
      } else {
        toast.success(`✅ Predictions submitted for all ${data.successCount} timeframes!`, {
          duration: 3000,
        })
      }
      
      // Poll to verify predictions were added on-chain
      if (data.successCount > 0 && selectedSymbol) {
        toast.info(`Verifying predictions on-chain for ${selectedSymbol}...`, {
          duration: 3000,
        })
        
        let predictionsVerified = false
        const maxAttempts = 30 // 60 seconds total
        const pollInterval = 2000 // 2 seconds
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          await new Promise(resolve => setTimeout(resolve, pollInterval))
          
          try {
            // Try to fetch predictions for at least one timeframe
            const testTimeframe = TIMEFRAMES[0] // Check first timeframe
            const prediction = await fetchLatestPredictionByTimeframe(selectedSymbol, testTimeframe)
            
            // Check if prediction exists and has valid data
            const predictionAny = prediction as any
            if (prediction && (predictionAny.predicted_price || predictionAny.prediction_id)) {
              predictionsVerified = true
              console.log(`✅ Predictions verified on-chain for ${selectedSymbol} after ${attempt + 1} attempts (${(attempt + 1) * pollInterval / 1000}s)`)
              break
            }
          } catch (pollError) {
            console.warn(`[Poll ${attempt + 1}/${maxAttempts}] Failed to verify predictions:`, pollError)
            // Continue polling even if one attempt fails
          }
        }
        
        if (predictionsVerified) {
          toast.success(`Predictions confirmed on-chain for ${selectedSymbol}!`, {
            duration: 3000,
          })
        } else {
          toast.warning(
            `Predictions submitted but not yet visible on-chain. They may take a few more moments to process.`,
            {
              duration: 10000,
            }
          )
        }
      }
      
      // Invalidate all prediction queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['prediction'] })
      queryClient.invalidateQueries({ queryKey: ['all-timeframe-predictions', selectedSymbol] })
      generateContext.reset()
    },
    onError: (error: any) => {
      console.error('[requestUpdate] Error:', error)
      const { title, description } = formatErrorForToast(error)
      toast.error(
        <div>
          <div className="font-semibold">{title}</div>
          {description && <div className="text-sm mt-1 opacity-90">{description}</div>}
        </div>,
        {
          duration: 10000,
        }
      )
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
      <TransactionStatus />
      
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
              <button
                onClick={() => setActiveTab('timeframes')}
                disabled={!selectedSymbol}
                className={cn(
                  "px-4 py-2 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5",
                  activeTab === 'timeframes'
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-foreground",
                  !selectedSymbol && "opacity-50 cursor-not-allowed"
                )}
              >
                <Clock className="h-3.5 w-3.5" />
                Timeframes
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={cn(
                  "px-4 py-2 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5",
                  activeTab === 'analytics'
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-foreground"
                )}
              >
                <Activity className="h-3.5 w-3.5" />
                Analytics
              </button>
            </div>

            {/* Tab Content */}
            <div>
              {activeTab === 'prediction' && (
                <>
                  {selectedSymbol && (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-semibold text-muted uppercase tracking-wider">Select Timeframe</span>
                      </div>
                      <TimeframeSelector 
                        selected={selectedTimeframe} 
                        onSelect={setSelectedTimeframe}
                      />
                    </div>
                  )}
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

              {activeTab === 'timeframes' && (
                selectedSymbol ? (
                  <MultiTimeframeView symbol={selectedSymbol} />
                ) : (
                  <div className="border border-sky-500/40 bg-gradient-to-br from-sky-500/10 to-sky-500/5 backdrop-blur-sm text-sky-100 rounded-2xl px-6 py-5 shadow-lg shadow-sky-500/10">
                    <p className="font-semibold text-base">Select a symbol to view multi-timeframe predictions</p>
                    <p className="text-sky-200/70 mt-2 text-sm leading-relaxed">
                      Choose a symbol from the list above to see predictions across all timeframes (1h, 4h, 12h, 24h, 7d, 30d).
                    </p>
                  </div>
                )
              )}

              {activeTab === 'analytics' && (
                <AnalyticsDashboard />
              )}
            </div>
          </div>

          <aside className="space-y-6">
            <SymbolManagerDialog 
              provider={provider}
              useLocalAccount={useLocalAccount}
              onSymbolAdded={async (symbol) => {
                // Force immediate refresh of symbols list
                await queryClient.refetchQueries({ queryKey: ['symbols'] })
                // Select the newly added symbol
                setSelectedSymbol(symbol)
                // Refresh prediction for the new symbol
                queryClient.invalidateQueries({ queryKey: ['prediction', symbol] })
                queryClient.invalidateQueries({ queryKey: ['all-timeframe-predictions', symbol] })
              }}
            />

            <div className="bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-2xl p-6 space-y-5 shadow-xl glass">
              <div className="space-y-1">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" />
                  Generate Prediction
                </h3>
                <p className="text-sm text-muted leading-relaxed">
                  Automatically generate price predictions for all timeframes (1h, 4h, 12h, 24h, 7d, 30d) for the selected symbol. The system will fetch current market data, technical indicators, and news to create comprehensive analyses.
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
                      ? 'Submitting predictions for all timeframes...'
                      : !address
                      ? 'Connect wallet to generate'
                      : 'Generate & Submit All Timeframes'}
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

