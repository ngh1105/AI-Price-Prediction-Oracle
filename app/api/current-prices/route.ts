import { NextRequest, NextResponse } from 'next/server'

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
      const resp = await fetch(`${baseUrl}/api/v3/ticker/24hr?symbol=${binanceSymbol}`, {
        next: { revalidate: 10 }, // Cache 10 giây
      })
      if (resp.ok) {
        const data = await resp.json()
        return {
          price: parseFloat(data.lastPrice || 0),
          change24h: parseFloat(data.priceChangePercent || 0),
          source: 'binance',
        }
      } else if (resp.status === 400) {
        // Invalid symbol, try next endpoint
        continue
      }
    } catch {
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
    const cgResp = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd&include_24hr_change=true`,
      { next: { revalidate: 10 } } // Cache 10 giây
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
  } catch {
    // Ignore errors
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
    console.error('Error fetching current prices:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch prices' }, { status: 500 })
  }
}

