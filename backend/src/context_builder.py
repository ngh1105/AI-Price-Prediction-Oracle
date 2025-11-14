import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx

# Binance API endpoints (use first available)
BINANCE_BASE_URLS = [
    'https://api.binance.com',
    'https://api-gcp.binance.com',
    'https://api1.binance.com',
    'https://api2.binance.com',
    'https://api3.binance.com',
    'https://api4.binance.com',
]

# Binance symbol mapping
BINANCE_SYMBOLS = {
    'BTC': 'BTCUSDT',
    'ETH': 'ETHUSDT',
    'SOL': 'SOLUSDT',
    'AVAX': 'AVAXUSDT',
    'ARB': 'ARBUSDT',
    'DOGE': 'DOGEUSDT',
    'XRP': 'XRPUSDT',
}

COINGECKO_IDS = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'SOL': 'solana',
    'AVAX': 'avalanche-2',
    'ARB': 'arbitrum',
    'DOGE': 'dogecoin',
    'XRP': 'ripple',
}

NEWS_ENDPOINT = os.getenv('NEWS_API_URL', 'https://min-api.cryptocompare.com/data/v2/news/?categories=MARKET')


def _fetch_price_binance(symbol: str) -> Optional[Dict[str, Any]]:
    """Fetch price from Binance API (primary source)
    
    Automatically tries {SYMBOL}USDT pattern if not in mapping.
    """
    symbol_upper = symbol.upper()
    
    # First try mapping, then try auto pattern
    binance_symbol = BINANCE_SYMBOLS.get(symbol_upper)
    if not binance_symbol:
        # Auto-detect: try common pattern {SYMBOL}USDT
        binance_symbol = f"{symbol_upper}USDT"
    
    for base_url in BINANCE_BASE_URLS:
        try:
            resp = httpx.get(
                f'{base_url}/api/v3/ticker/24hr',
                params={'symbol': binance_symbol},
                timeout=5.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                price = float(data.get('lastPrice', 0))
                price_change_pct = float(data.get('priceChangePercent', 0))
                return {
                    'spot': price,
                    'usd_24h_change': price_change_pct,
                    'source': 'binance',
                }
            elif resp.status_code == 400:
                # Invalid symbol, try next endpoint or return None
                continue
        except Exception:
            continue  # Try next endpoint
    
    return None


def _fetch_price(symbol: str, retries: int = 3) -> Dict[str, Any]:
    # Try Binance first (better rate limits)
    binance_result = _fetch_price_binance(symbol)
    if binance_result:
        return binance_result
    
    # Fallback to CoinGecko
    symbol_upper = symbol.upper()
    cg_id = COINGECKO_IDS.get(symbol_upper)
    
    # Auto-detect: if not in mapping, try symbol name directly (lowercase)
    if not cg_id:
        cg_id = symbol.lower()
    
    for attempt in range(retries):
        try:
            resp = httpx.get(
                'https://api.coingecko.com/api/v3/simple/price',
                params={'ids': cg_id, 'vs_currencies': 'usd', 'include_24hr_change': 'true'},
                timeout=10.0,
            )
            
            # Handle rate limiting with exponential backoff
            if resp.status_code == 429:
                if attempt < retries - 1:
                    wait_time = (2 ** attempt) * 2  # 2s, 4s, 8s
                    time.sleep(wait_time)
                    continue
                return {'error': 'Rate limit exceeded after retries'}
            
            resp.raise_for_status()
            data = resp.json()
            payload = data.get(cg_id, {})
            return {
                'spot': payload.get('usd'),
                'usd_24h_change': payload.get('usd_24h_change'),
                'source': 'coingecko',
            }
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429 and attempt < retries - 1:
                wait_time = (2 ** attempt) * 2
                time.sleep(wait_time)
                continue
            return {'error': f'HTTP {e.response.status_code}: {str(e)}'}
        except Exception as e:
            return {'error': str(e)}
    
    return {'error': 'Failed after retries'}


def _fetch_ohlc_binance(symbol: str, days: int = 7) -> Optional[list]:
    """Fetch OHLC data from Binance API (primary source)
    
    Automatically tries {SYMBOL}USDT pattern if not in mapping.
    """
    symbol_upper = symbol.upper()
    
    # First try mapping, then try auto pattern
    binance_symbol = BINANCE_SYMBOLS.get(symbol_upper)
    if not binance_symbol:
        # Auto-detect: try common pattern {SYMBOL}USDT
        binance_symbol = f"{symbol_upper}USDT"
    
    # Binance uses intervals: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d
    # For 7 days, use 1h intervals (168 candles)
    interval = '1h'
    limit = min(500, days * 24)  # Binance max is 1000, but we'll use 500 for safety
    
    for base_url in BINANCE_BASE_URLS:
        try:
            resp = httpx.get(
                f'{base_url}/api/v3/klines',
                params={
                    'symbol': binance_symbol,
                    'interval': interval,
                    'limit': limit,
                },
                timeout=5.0,
            )
            if resp.status_code == 200:
                klines = resp.json()
                # Convert Binance format [open_time, open, high, low, close, volume, ...] to our format
                ohlc_data = []
                for kline in klines:
                    ohlc_data.append([
                        int(kline[0]),  # timestamp
                        float(kline[1]),  # open
                        float(kline[2]),  # high
                        float(kline[3]),  # low
                        float(kline[4]),  # close
                        float(kline[5]),  # volume
                    ])
                return ohlc_data
        except Exception:
            continue  # Try next endpoint
    
    return None


def _fetch_ohlc_data(symbol: str, days: int = 7, retries: int = 3) -> Dict[str, Any]:
    """Fetch OHLC (Open, High, Low, Close) data and calculate technical indicators"""
    # Try Binance first
    binance_ohlc = _fetch_ohlc_binance(symbol, days)
    if binance_ohlc and len(binance_ohlc) >= 2:
        # Process Binance data
        closes = [candle[4] for candle in binance_ohlc]  # Close prices
        highs = [candle[2] for candle in binance_ohlc]    # High prices
        lows = [candle[3] for candle in binance_ohlc]     # Low prices
        
        current_price = closes[-1]
        prev_price = closes[-2] if len(closes) > 1 else current_price
        
        # Moving Averages
        ma_7 = sum(closes[-7:]) / min(7, len(closes))
        ma_20 = sum(closes[-20:]) / min(20, len(closes)) if len(closes) >= 20 else None
        
        # Price change
        price_change_24h = ((current_price - prev_price) / prev_price * 100) if prev_price > 0 else 0
        
        # RSI calculation (14-period)
        rsi_period = 14
        rsi = None
        if len(closes) >= rsi_period + 1:
            gains = []
            losses = []
            for i in range(1, min(rsi_period + 1, len(closes))):
                change = closes[-i] - closes[-i-1]
                if change > 0:
                    gains.append(change)
                    losses.append(0)
                else:
                    gains.append(0)
                    losses.append(abs(change))
            avg_gain = sum(gains) / len(gains) if gains else 0
            avg_loss = sum(losses) / len(losses) if losses else 0
            if avg_loss > 0:
                rs = avg_gain / avg_loss
                rsi = 100 - (100 / (1 + rs))
        
        # Support and Resistance
        recent_high = max(highs[-20:]) if len(highs) >= 20 else max(highs)
        recent_low = min(lows[-20:]) if len(lows) >= 20 else min(lows)
        
        # MACD-like signal
        macd_signal = ma_7 - ma_20 if ma_20 else None
        
        # Trend determination
        if ma_20:
            if current_price > ma_7 > ma_20:
                trend = 'bullish'
            elif current_price < ma_7 < ma_20:
                trend = 'bearish'
            else:
                trend = 'neutral'
        else:
            trend = 'bullish' if current_price > ma_7 else 'bearish' if current_price < ma_7 else 'neutral'
        
        return {
            'current_price': round(current_price, 2),
            'price_change_24h_pct': round(price_change_24h, 2),
            'moving_averages': {
                'ma_7': round(ma_7, 2),
                'ma_20': round(ma_20, 2) if ma_20 else None,
            },
            'rsi': round(rsi, 2) if rsi is not None else None,
            'macd_signal': round(macd_signal, 2) if macd_signal is not None else None,
            'support_level': round(recent_low, 2),
            'resistance_level': round(recent_high, 2),
            'price_position': {
                'distance_from_support_pct': round(((current_price - recent_low) / recent_low * 100), 2) if recent_low > 0 else None,
                'distance_from_resistance_pct': round(((recent_high - current_price) / current_price * 100), 2) if current_price > 0 else None,
            },
            'trend': trend,
            'price_above_ma7': current_price > ma_7,
            'price_above_ma20': current_price > ma_20 if ma_20 else None,
            'source': 'binance',
        }
    
    # Fallback to CoinGecko
    symbol_upper = symbol.upper()
    cg_id = COINGECKO_IDS.get(symbol_upper)
    
    # Auto-detect: if not in mapping, try symbol name directly (lowercase)
    if not cg_id:
        cg_id = symbol.lower()
    
    for attempt in range(retries):
        try:
            resp = httpx.get(
                f'https://api.coingecko.com/api/v3/coins/{cg_id}/ohlc',
                params={'vs_currency': 'usd', 'days': days},
                timeout=10.0,
            )
            
            # Handle rate limiting with exponential backoff
            if resp.status_code == 429:
                if attempt < retries - 1:
                    wait_time = (2 ** attempt) * 2  # 2s, 4s, 8s
                    time.sleep(wait_time)
                    continue
                return {'error': 'Rate limit exceeded after retries'}
            
            resp.raise_for_status()
            ohlc_data = resp.json()
            
            if not ohlc_data or len(ohlc_data) < 2:
                return {}
            
            # Extract price data
            closes = [candle[4] for candle in ohlc_data]  # Close prices
            highs = [candle[2] for candle in ohlc_data]    # High prices
            lows = [candle[3] for candle in ohlc_data]     # Low prices
            
            current_price = closes[-1]
            prev_price = closes[-2] if len(closes) > 1 else current_price
            
            # Moving Averages
            ma_7 = sum(closes[-7:]) / min(7, len(closes))
            ma_20 = sum(closes[-20:]) / min(20, len(closes)) if len(closes) >= 20 else None
            
            # Price change
            price_change_24h = ((current_price - prev_price) / prev_price * 100) if prev_price > 0 else 0
            
            # RSI calculation (14-period)
            rsi_period = 14
            rsi = None
            if len(closes) >= rsi_period + 1:
                gains = []
                losses = []
                for i in range(1, min(rsi_period + 1, len(closes))):
                    change = closes[-i] - closes[-i-1]
                    if change > 0:
                        gains.append(change)
                        losses.append(0)
                    else:
                        gains.append(0)
                        losses.append(abs(change))
                avg_gain = sum(gains) / len(gains) if gains else 0
                avg_loss = sum(losses) / len(losses) if losses else 0
                if avg_loss > 0:
                    rs = avg_gain / avg_loss
                    rsi = 100 - (100 / (1 + rs))
            
            # Support and Resistance
            recent_high = max(highs[-20:]) if len(highs) >= 20 else max(highs)
            recent_low = min(lows[-20:]) if len(lows) >= 20 else min(lows)
            
            # MACD-like signal (difference between short and long MA)
            macd_signal = ma_7 - ma_20 if ma_20 else None
            
            # Trend determination
            if ma_20:
                if current_price > ma_7 > ma_20:
                    trend = 'bullish'
                elif current_price < ma_7 < ma_20:
                    trend = 'bearish'
                else:
                    trend = 'neutral'
            else:
                trend = 'bullish' if current_price > ma_7 else 'bearish' if current_price < ma_7 else 'neutral'
            
            return {
                'current_price': round(current_price, 2),
                'price_change_24h_pct': round(price_change_24h, 2),
                'moving_averages': {
                    'ma_7': round(ma_7, 2),
                    'ma_20': round(ma_20, 2) if ma_20 else None,
                },
                'rsi': round(rsi, 2) if rsi is not None else None,
                'macd_signal': round(macd_signal, 2) if macd_signal is not None else None,
                'support_level': round(recent_low, 2),
                'resistance_level': round(recent_high, 2),
                'price_position': {
                    'distance_from_support_pct': round(((current_price - recent_low) / recent_low * 100), 2) if recent_low > 0 else None,
                    'distance_from_resistance_pct': round(((recent_high - current_price) / current_price * 100), 2) if current_price > 0 else None,
                },
            'trend': trend,
            'price_above_ma7': current_price > ma_7,
            'price_above_ma20': current_price > ma_20 if ma_20 else None,
            'source': 'coingecko',
        }
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429 and attempt < retries - 1:
                wait_time = (2 ** attempt) * 2
                time.sleep(wait_time)
                continue
            return {'error': f'HTTP {e.response.status_code}: {str(e)}'}
        except Exception as e:
            if attempt < retries - 1:
                wait_time = (2 ** attempt) * 2
                time.sleep(wait_time)
                continue
            return {'error': str(e)}
    
    return {'error': 'Failed after retries'}


def _fetch_macro_headlines(symbol: str, limit: int = 5) -> Dict[str, Any]:
    """
    Fetch news headlines related to the specific symbol.
    Filters news by checking if title/body contains the symbol name.
    
    For new symbols not in the mapping:
    - Uses symbol code (e.g., 'NEWCOIN') to search
    - If CoinGecko ID exists, uses coin name from ID
    - Falls back to general market news if not enough symbol-specific news found
    
    To add support for a new symbol:
    1. Add to BINANCE_SYMBOLS if available on Binance
    2. Add to COINGECKO_IDS with CoinGecko coin ID
    3. Add to symbol_names mapping in this function for better news filtering
    """
    try:
        resp = httpx.get(NEWS_ENDPOINT, timeout=10.0)
        resp.raise_for_status()
        all_items = resp.json().get('Data', [])
        
        # Symbol name variations for filtering
        symbol_upper = symbol.upper()
        symbol_lower = symbol.lower()
        symbol_variations = [symbol_upper, symbol_lower, symbol_upper + 'USD', symbol_upper + '/USD']
        
        # Map symbol to common names in news
        symbol_names = {
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
        
        # Get additional search terms for the symbol
        if symbol_upper in symbol_names:
            search_terms = symbol_names[symbol_upper].copy()
        else:
            # For new symbols, try to infer coin name from symbol
            # Common patterns: symbol is often the coin name or abbreviation
            search_terms = [symbol_upper, symbol_lower]
            # Try to find coin name from CoinGecko ID if available
            cg_id = COINGECKO_IDS.get(symbol_upper)
            if cg_id:
                # Convert CoinGecko ID to readable name (e.g., 'avalanche-2' -> 'avalanche')
                coin_name = cg_id.replace('-2', '').replace('-', ' ')
                search_terms.extend([coin_name, coin_name.title(), coin_name.upper()])
        
        search_terms.extend(symbol_variations)
        
        # Filter news items that mention the symbol
        filtered_items = []
        for item in all_items:
            title = item.get('title', '').lower()
            body = item.get('body', '').lower()
            tags = ' '.join(item.get('tags', [])).lower()
            categories = ' '.join(item.get('categories', [])).lower()
            
            # Check if any search term appears in title, body, tags, or categories
            text_to_search = f"{title} {body} {tags} {categories}"
            if any(term.lower() in text_to_search for term in search_terms):
                filtered_items.append(item)
        
        # If we don't have enough symbol-specific news, add general market news
        if len(filtered_items) < limit:
            # Track URLs we've already added
            added_urls = {item.get('url') for item in filtered_items}
            
            # Add general market news that doesn't mention other specific coins
            general_terms = ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB', 'DOGE', 'bitcoin', 'ethereum', 'solana', 'avalanche', 'arbitrum', 'dogecoin']
            for item in all_items:
                if len(filtered_items) >= limit:
                    break
                if item.get('url') in added_urls:
                    continue
                title = item.get('title', '').lower()
                body = item.get('body', '').lower()
                text_to_search = f"{title} {body}"
                # Only add if it doesn't mention other specific coins (to avoid confusion)
                if not any(term.lower() in text_to_search for term in general_terms if term.upper() != symbol_upper):
                    filtered_items.append(item)
                    added_urls.add(item.get('url'))
        
        # Take up to limit items
        items = filtered_items[:limit]
        
        return {
            'headlines': [
                {
                    'title': item.get('title'),
                    'url': item.get('url'),
                    'published_at': item.get('published_on'),
                    'source': item.get('source'),
                }
                for item in items
            ]
        }
    except Exception as e:
        # Fallback: return empty headlines on error
        return {'headlines': []}


def build_market_context(symbol: str) -> str:
    """
    Returns a JSON string containing all the data needed by the contract.
    Includes both fundamental (news, sentiment) and technical (indicators) data.
    Backend callers should hand this payload to request_update.
    """
    timestamp = datetime.now(tz=timezone.utc).isoformat()
    price = _fetch_price(symbol)
    technical = _fetch_ohlc_data(symbol, days=7)
    news = _fetch_macro_headlines(symbol, limit=5)

    context: Dict[str, Any] = {
        'symbol': symbol.upper(),
        'generated_at': timestamp,
        'price': price,
        'technical_indicators': technical,
        'macro': news,
        'sentiment': {
            'funding_rate': None,
            'funding_rate_source': 'Not configured',
        },
        'on_chain': {
            'exchange_inflows': None,
            'whale_activity': None,
        },
        'notes': 'Context includes technical indicators (RSI, MACD, MA, Support/Resistance) and fundamental data (news, trends)',
    }

    return json.dumps(context, separators=(',', ':'))

