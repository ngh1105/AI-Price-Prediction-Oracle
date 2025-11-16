import { NextRequest, NextResponse } from 'next/server'

// Maximum number of symbols allowed per request
const MAX_SYMBOLS = 50

// Timeout for fetch requests (5 seconds)
const FETCH_TIMEOUT_MS = 5000

/**
 * Fetch with timeout wrapper to prevent hung requests
 */
async function fetchWithTimeout(
  url: string, 
  options: RequestInit & { next?: { revalidate?: number; tags?: string[] } } = {}
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

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

async function fetchPriceBinance(symbol: string): Promise<{ price: number; change24h: number; source: string } | null> {
  const symbolUpper = symbol.toUpperCase()
  
  // First try mapping, then try auto pattern
  let binanceSymbol = BINANCE_SYMBOLS[symbolUpper]
  if (!binanceSymbol) {
    // Auto-detect: try common pattern {SYMBOL}USDT
    binanceSymbol = `${symbolUpper}USDT`
  }

  for (const baseUrl of BINANCE_BASE_URLS) {
    try {
      const resp = await fetchWithTimeout(`${baseUrl}/api/v3/ticker/24hr?symbol=${binanceSymbol}`, {
        next: { revalidate: 10 }, // Cache for 10 seconds
      })
      if (resp.ok) {
        const data = await resp.json()
        return {
          price: parseFloat(data.lastPrice || 0),
          change24h: parseFloat(data.priceChangePercent || 0),
          source: 'binance',
        }
      } else if (resp.status === 400) {
        // Invalid symbol - 400 means invalid symbol across all endpoints, return null immediately
        return null
      }
    } catch (error: any) {
      // Handle abort/timeout errors and other network errors
      if (error.name === 'AbortError') {
        // Timeout occurred, try next endpoint
        continue
      }
      // Other errors, try next endpoint
      continue
    }
  }
  return null
}

async function fetchPriceCoinGecko(symbol: string): Promise<{ price: number; change24h: number; source: string } | null> {
  const symbolUpper = symbol.toUpperCase()
  let cgId = COINGECKO_IDS[symbolUpper]
  if (!cgId) {
    // Auto-detect: try symbol name directly (lowercase)
    cgId = symbol.toLowerCase()
  }
  
  try {
    const cgResp = await fetchWithTimeout(
      `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd&include_24hr_change=true`,
      { next: { revalidate: 10 } } // Cache for 10 seconds
    )
    if (cgResp.ok) {
      const cgData = await cgResp.json()
      const coinData = cgData[cgId]
      if (coinData) {
        return {
          price: coinData.usd || 0,
          change24h: coinData.usd_24h_change || 0,
          source: 'coingecko',
        }
      }
    }
  } catch (error: any) {
    // Handle abort/timeout errors and other network errors
    if (error.name === 'AbortError') {
      // Timeout occurred, return null to allow fallback
      return null
    }
    // Other errors, return null
    return null
  }
  return null
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const symbolsParam = searchParams.get('symbols')

  if (!symbolsParam) {
    return NextResponse.json({ error: 'Symbols parameter is required (comma-separated)' }, { status: 400 })
  }

  const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  
  if (symbols.length === 0) {
    return NextResponse.json({ error: 'At least one symbol is required' }, { status: 400 })
  }

  // Enforce maximum symbols limit
  if (symbols.length > MAX_SYMBOLS) {
    const truncatedSymbols = symbols.slice(0, 10).join(', ')
    const symbolsPreview = symbols.length > 10 
      ? `${truncatedSymbols}... (and ${symbols.length - 10} more)`
      : symbols.join(', ')
    
    console.error(`[current-prices] Request exceeded MAX_SYMBOLS limit: ${symbols.length} > ${MAX_SYMBOLS}. Symbols: ${symbolsPreview}`)
    
    return NextResponse.json(
      { 
        error: `Too many symbols requested. Maximum allowed: ${MAX_SYMBOLS}, received: ${symbols.length}`,
        requested_count: symbols.length,
        max_allowed: MAX_SYMBOLS,
        symbols_preview: symbols.slice(0, 10) // Include first 10 for debugging
      }, 
      { status: 400 }
    )
  }

  try {
    // Fetch prices for all symbols in parallel
    const pricePromises = symbols.map(async (symbol) => {
      // Try Binance first
      const binanceResult = await fetchPriceBinance(symbol)
      if (binanceResult) {
        return {
          symbol,
          price: binanceResult.price,
          change24h: binanceResult.change24h,
          source: binanceResult.source,
        }
      }
      
      // Fallback to CoinGecko
      const cgResult = await fetchPriceCoinGecko(symbol)
      if (cgResult) {
        return {
          symbol,
          price: cgResult.price,
          change24h: cgResult.change24h,
          source: cgResult.source,
        }
      }
      
      // Return null if both failed
      return {
        symbol,
        price: null,
        change24h: null,
        source: null,
        error: 'Failed to fetch price',
      }
    })

    const results = await Promise.all(pricePromises)
    
    // Convert to map for easier access
    const pricesMap: Record<string, { price: number | null; change24h: number | null; source: string | null; error?: string }> = {}
    results.forEach(result => {
      pricesMap[result.symbol] = {
        price: result.price,
        change24h: result.change24h,
        source: result.source,
        ...(result.error && { error: result.error }),
      }
    })

    return NextResponse.json({
      prices: pricesMap,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    const symbolsPreview = symbols.length > 10 
      ? `${symbols.slice(0, 10).join(', ')}... (and ${symbols.length - 10} more)`
      : symbols.join(', ')
    
    console.error(`[current-prices] Error fetching prices for ${symbols.length} symbols: ${symbolsPreview}`, error)
    
    return NextResponse.json(
      { 
        error: error.message || 'Failed to fetch prices',
        symbols_count: symbols.length,
        symbols_preview: symbols.slice(0, 10) // Include first 10 for debugging
      }, 
      { status: 500 }
    )
  }
}

