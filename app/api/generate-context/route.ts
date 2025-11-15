import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from './rate-limit'

const BINANCE_BASE_URLS = [
  'https://api.binance.com',
  'https://api-gcp.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
  'https://api4.binance.com',
]

const BINANCE_SYMBOLS: Record<string, string> = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
  AVAX: 'AVAXUSDT',
  ARB: 'ARBUSDT',
  DOGE: 'DOGEUSDT',
  XRP: 'XRPUSDT',
}

const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  AVAX: 'avalanche-2',
  ARB: 'arbitrum',
  DOGE: 'dogecoin',
  XRP: 'ripple',
}

async function fetchPriceBinance(symbol: string): Promise<{ spot: number; usd_24h_change: number; source: string } | null> {
  const symbolUpper = symbol.toUpperCase()
  
  // First try mapping, then try auto pattern
  let binanceSymbol = BINANCE_SYMBOLS[symbolUpper]
  if (!binanceSymbol) {
    // Auto-detect: try common pattern {SYMBOL}USDT
    binanceSymbol = `${symbolUpper}USDT`
  }

  for (const baseUrl of BINANCE_BASE_URLS) {
    try {
      const resp = await fetch(`${baseUrl}/api/v3/ticker/24hr?symbol=${binanceSymbol}`, {
        next: { revalidate: 60 }, // Cache for 60 seconds
      })
      if (resp.ok) {
        const data = await resp.json()
        return {
          spot: parseFloat(data.lastPrice || 0),
          usd_24h_change: parseFloat(data.priceChangePercent || 0),
          source: 'binance',
        }
      } else if (resp.status === 400) {
        // Invalid symbol, try next endpoint or return null
        continue
      }
    } catch {
      continue
    }
  }
  return null
}

async function fetchOHLCBinance(symbol: string, days: number = 7): Promise<any> {
  const symbolUpper = symbol.toUpperCase()
  
  // First try mapping, then try auto pattern
  let binanceSymbol = BINANCE_SYMBOLS[symbolUpper]
  if (!binanceSymbol) {
    // Auto-detect: try common pattern {SYMBOL}USDT
    binanceSymbol = `${symbolUpper}USDT`
  }

  const interval = '1h'
  const limit = Math.min(500, days * 24)

  for (const baseUrl of BINANCE_BASE_URLS) {
    try {
      const resp = await fetch(
        `${baseUrl}/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`,
        {
          next: { revalidate: 300 }, // Cache for 5 minutes
        }
      )
      if (resp.ok) {
        const klines = await resp.json()
        if (klines.length < 2) return null

        const closes = klines.map((k: any[]) => parseFloat(k[4]))
        const highs = klines.map((k: any[]) => parseFloat(k[2]))
        const lows = klines.map((k: any[]) => parseFloat(k[3]))

        const currentPrice = closes[closes.length - 1]
        const prevPrice = closes[closes.length - 2] || currentPrice

        const ma7 = closes.slice(-7).reduce((a: number, b: number) => a + b, 0) / Math.min(7, closes.length)
        const ma20 = closes.length >= 20 ? closes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20 : null

        const priceChange24h = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0

        // Simple RSI calculation
        let rsi: number | null = null
        if (closes.length >= 15) {
          const period = 14
          const changes = []
          for (let i = closes.length - period; i < closes.length; i++) {
            if (i > 0) changes.push(closes[i] - closes[i - 1])
          }
          const gains = changes.filter((c) => c > 0).reduce((a, b) => a + b, 0) / period
          const losses = Math.abs(changes.filter((c) => c < 0).reduce((a, b) => a + b, 0) / period)
          if (losses > 0) {
            const rs = gains / losses
            rsi = 100 - 100 / (1 + rs)
          }
        }

        const recentHigh = Math.max(...highs.slice(-20))
        const recentLow = Math.min(...lows.slice(-20))
        const macdSignal = ma20 ? ma7 - ma20 : null

        let trend = 'neutral'
        if (ma20) {
          if (currentPrice > ma7 && ma7 > ma20) trend = 'bullish'
          else if (currentPrice < ma7 && ma7 < ma20) trend = 'bearish'
        } else {
          trend = currentPrice > ma7 ? 'bullish' : 'bearish'
        }

        return {
          current_price: Math.round(currentPrice * 100) / 100,
          price_change_24h_pct: Math.round(priceChange24h * 100) / 100,
          moving_averages: {
            ma_7: Math.round(ma7 * 100) / 100,
            ma_20: ma20 ? Math.round(ma20 * 100) / 100 : null,
          },
          rsi: rsi ? Math.round(rsi * 100) / 100 : null,
          macd_signal: macdSignal ? Math.round(macdSignal * 100) / 100 : null,
          support_level: Math.round(recentLow * 100) / 100,
          resistance_level: Math.round(recentHigh * 100) / 100,
          price_position: {
            distance_from_support_pct:
              recentLow > 0 ? Math.round(((currentPrice - recentLow) / recentLow) * 100 * 100) / 100 : null,
            distance_from_resistance_pct:
              currentPrice > 0 ? Math.round(((recentHigh - currentPrice) / currentPrice) * 100 * 100) / 100 : null,
          },
          trend,
          price_above_ma7: currentPrice > ma7,
          price_above_ma20: ma20 ? currentPrice > ma20 : null,
          source: 'binance',
        }
      }
    } catch {
      continue
    }
  }
  return null
}

async function fetchNews(symbol: string): Promise<any[]> {
  try {
    const resp = await fetch('https://min-api.cryptocompare.com/data/v2/news/?categories=MARKET', {
      next: { revalidate: 300 }, // Cache for 5 minutes
    })
    if (resp.ok) {
      const data = await resp.json()
      const allItems = data.Data || []
      
      // Symbol name variations for filtering
      const symbolUpper = symbol.toUpperCase()
      const symbolLower = symbol.toLowerCase()
      
      // Map symbol to common names in news
      const symbolNames: Record<string, string[]> = {
        'BTC': ['bitcoin', 'BTC', 'Bitcoin'],
        'ETH': ['ethereum', 'ETH', 'Ethereum'],
        'SOL': ['solana', 'SOL', 'Solana'],
        'AVAX': ['avalanche', 'AVAX', 'Avalanche'],
        'ARB': ['arbitrum', 'ARB', 'Arbitrum'],
        'DOGE': ['dogecoin', 'DOGE', 'Dogecoin', 'doge'],
        'MATIC': ['polygon', 'MATIC', 'Polygon', 'matic'],
        'LINK': ['chainlink', 'LINK', 'Chainlink'],
        'ADA': ['cardano', 'ADA', 'Cardano'],
        'DOT': ['polkadot', 'DOT', 'Polkadot'],
        'UNI': ['uniswap', 'UNI', 'Uniswap'],
        'ATOM': ['cosmos', 'ATOM', 'Cosmos'],
        'XRP': ['ripple', 'XRP', 'Ripple', 'xrp'],
        'BNB': ['binance', 'BNB', 'Binance Coin', 'binance coin'],
        'LTC': ['litecoin', 'LTC', 'Litecoin'],
        'BCH': ['bitcoin cash', 'BCH', 'Bitcoin Cash'],
      }
      
      // CoinGecko ID mapping for fallback
      const coinGeckoIds: Record<string, string> = {
        'BTC': 'bitcoin',
        'ETH': 'ethereum',
        'SOL': 'solana',
        'AVAX': 'avalanche-2',
        'ARB': 'arbitrum',
        'DOGE': 'dogecoin',
        'XRP': 'ripple',
      }
      
      // Get search terms for the symbol
      let searchTerms: string[]
      if (symbolNames[symbolUpper]) {
        searchTerms = [...symbolNames[symbolUpper]]
      } else {
        // For new symbols, try to infer coin name
        searchTerms = [symbolUpper, symbolLower]
        // Try to find coin name from CoinGecko ID if available
        const cgId = coinGeckoIds[symbolUpper]
        if (cgId) {
          // Convert CoinGecko ID to readable name
          const coinName = cgId.replace('-2', '').replace(/-/g, ' ')
          searchTerms.push(coinName, coinName.charAt(0).toUpperCase() + coinName.slice(1), coinName.toUpperCase())
        }
      }
      
      // Add symbol variations
      searchTerms.push(symbolUpper + 'USD', symbolUpper + '/USD')
      
      // Filter news items that mention the symbol
      const filteredItems: any[] = []
      for (const item of allItems) {
        const title = (item.title || '').toLowerCase()
        const body = (item.body || '').toLowerCase()
        const tags = (item.tags || []).join(' ').toLowerCase()
        const categories = (item.categories || []).join(' ').toLowerCase()
        
        // Check if any search term appears in title, body, tags, or categories
        const textToSearch = `${title} ${body} ${tags} ${categories}`
        if (searchTerms.some(term => textToSearch.includes(term.toLowerCase()))) {
          filteredItems.push(item)
        }
      }
      
      // If we don't have enough symbol-specific news, add general market news
      if (filteredItems.length < 5) {
        // Track URLs we've already added
        const addedUrls = new Set(filteredItems.map((item: any) => item.url))
        
        const generalTerms = ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB', 'DOGE', 'bitcoin', 'ethereum', 'solana', 'avalanche', 'arbitrum', 'dogecoin']
        for (const item of allItems) {
          if (filteredItems.length >= 5) break
          if (addedUrls.has(item.url)) continue
          
          const title = (item.title || '').toLowerCase()
          const body = (item.body || '').toLowerCase()
          const textToSearch = `${title} ${body}`
          
          // Only add if it doesn't mention other specific coins
          const mentionsOtherCoin = generalTerms.some(
            term => term.toUpperCase() !== symbolUpper && textToSearch.includes(term.toLowerCase())
          )
          if (!mentionsOtherCoin) {
            filteredItems.push(item)
            addedUrls.add(item.url)
          }
        }
      }
      
      return filteredItems.slice(0, 5).map((item: any) => ({
        title: item.title,
        url: item.url,
        published_at: item.published_on,
        source: item.source,
      }))
    }
  } catch {
    // Ignore errors
  }
  return []
}

export async function GET(request: NextRequest) {
  // Rate limiting with proper IP detection
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const ip = forwardedFor?.split(',')[0]?.trim() || realIp || null
  
  let rateLimitKey: string
  let rateLimitLimit: number
  let rateLimitStrategy: string
  
  if (!ip) {
    // Strategy C: Use shared bucket key "no-ip" with conservative limit
    // This ensures rate limiting still works for requests without IP headers
    // while being more permissive than rejecting all such requests
    rateLimitKey = 'no-ip'
    rateLimitLimit = 20 // Conservative limit for requests without IP (lower than default)
    rateLimitStrategy = 'shared-bucket-no-ip'
    console.log('[generate-context] Missing client IP headers, using shared "no-ip" bucket with conservative limit (20 req/min)')
  } else {
    rateLimitKey = ip
    rateLimitLimit = 30 // Default limit for requests with IP
    rateLimitStrategy = 'ip-based'
  }
  
  const rateLimit = checkRateLimit(rateLimitKey, { maxRequests: rateLimitLimit })
  
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { 
        error: 'Rate limit exceeded', 
        message: `Too many requests. Please try again after ${new Date(rateLimit.resetAt).toISOString()}`,
        resetAt: rateLimit.resetAt,
      },
      { 
        status: 429,
        headers: {
          'X-RateLimit-Limit': rateLimit.limit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': rateLimit.resetAt.toString(),
          'Retry-After': Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString(),
          'X-RateLimit-Strategy': rateLimitStrategy,
        },
      }
    )
  }

  const searchParams = request.nextUrl.searchParams
  const symbol = searchParams.get('symbol')

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol parameter is required' }, { status: 400 })
  }

  try {
    // Fetch price (auto-detects symbol if not in mapping)
    let priceData = await fetchPriceBinance(symbol.toUpperCase())
    
    // Fallback to CoinGecko if Binance fails
    if (!priceData) {
      const symbolUpper = symbol.toUpperCase()
      let cgId = COINGECKO_IDS[symbolUpper]
      if (!cgId) {
        // Auto-detect: try symbol name directly (lowercase)
        cgId = symbol.toLowerCase()
      }
      
      try {
        const cgResp = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd&include_24hr_change=true`,
          { next: { revalidate: 60 } }
        )
        if (cgResp.ok) {
          const cgData = await cgResp.json()
          const coinData = cgData[cgId]
          if (coinData) {
            priceData = {
              spot: coinData.usd || 0,
              usd_24h_change: coinData.usd_24h_change || 0,
              source: 'coingecko',
            }
          }
        }
      } catch {
        // Ignore CoinGecko errors
      }
    }
    
    if (!priceData) {
      return NextResponse.json({ error: 'Failed to fetch price data' }, { status: 500 })
    }

    // Fetch technical indicators
    const technicalData = await fetchOHLCBinance(symbol.toUpperCase(), 7)

    // Fetch news filtered by symbol
    const headlines = await fetchNews(symbol.toUpperCase())

    // Build context
    const context = {
      symbol: symbol.toUpperCase(),
      generated_at: new Date().toISOString(),
      price: priceData,
      technical_indicators: technicalData || {},
      macro: {
        headlines,
      },
      sentiment: {
        funding_rate: null,
        funding_rate_source: 'Not configured',
      },
      on_chain: {
        exchange_inflows: null,
        whale_activity: null,
      },
      notes: 'Context includes technical indicators (RSI, MACD, MA, Support/Resistance) and fundamental data (news, trends)',
    }

    const response = NextResponse.json(context)
    
    // Add rate limit headers (limit matches actual enforcement)
    response.headers.set('X-RateLimit-Limit', rateLimit.limit.toString())
    response.headers.set('X-RateLimit-Remaining', rateLimit.remaining.toString())
    response.headers.set('X-RateLimit-Reset', rateLimit.resetAt.toString())
    response.headers.set('X-RateLimit-Strategy', rateLimitStrategy)
    
    return response
  } catch (error: any) {
    console.error('Error generating context:', error)
    return NextResponse.json({ error: error.message || 'Failed to generate context' }, { status: 500 })
  }
}

