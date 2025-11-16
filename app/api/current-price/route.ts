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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const symbol = searchParams.get('symbol')

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol parameter is required' }, { status: 400 })
  }

  try {
    const symbolUpper = symbol.toUpperCase()
    
    // Try Binance first (faster, better rate limits)
    const binanceResult = await fetchPriceBinance(symbolUpper)
    if (binanceResult) {
      return NextResponse.json({
        symbol: symbolUpper,
        price: binanceResult.price,
        change24h: binanceResult.change24h,
        source: binanceResult.source,
        timestamp: new Date().toISOString(),
      })
    }
    
    // Fallback to CoinGecko
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
          return NextResponse.json({
            symbol: symbolUpper,
            price: coinData.usd || 0,
            change24h: coinData.usd_24h_change || 0,
            source: 'coingecko',
            timestamp: new Date().toISOString(),
          })
        }
      }
    } catch {
      // Ignore CoinGecko errors
    }
    
    return NextResponse.json({ error: 'Failed to fetch price' }, { status: 500 })
  } catch (error: any) {
    console.error('Error fetching current price:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch price' }, { status: 500 })
  }
}

