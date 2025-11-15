"""
Unit tests for context_builder module
"""

import unittest
from unittest.mock import patch, MagicMock
import json

from src.context_builder import build_market_context, _fetch_price, _fetch_ohlc_data, _fetch_macro_headlines


class TestContextBuilder(unittest.TestCase):
    """Test cases for context builder functions"""

    @patch('src.context_builder.httpx.get')
    def test_fetch_price_binance_success(self, mock_get):
        """Test successful price fetch from Binance"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'lastPrice': '50000.00',
            'priceChangePercent': '2.5'
        }
        mock_get.return_value = mock_response

        result = _fetch_price('BTC', retries=1)
        
        self.assertIn('spot', result)
        self.assertEqual(result['spot'], 50000.0)
        self.assertEqual(result['usd_24h_change'], 2.5)
        self.assertEqual(result['source'], 'binance')

    @patch('src.context_builder.httpx.get')
    def test_fetch_price_binance_fallback_coingecko(self, mock_get):
        """Test fallback to CoinGecko when Binance fails"""
        # Binance fails
        mock_binance = MagicMock()
        mock_binance.status_code = 400
        mock_get.return_value = mock_binance

        # CoinGecko succeeds
        mock_coingecko = MagicMock()
        mock_coingecko.status_code = 200
        mock_coingecko.json.return_value = {
            'bitcoin': {
                'usd': 50000.0,
                'usd_24h_change': 2.5
            }
        }
        mock_get.side_effect = [mock_binance, mock_coingecko]

        result = _fetch_price('BTC', retries=1)
        
        self.assertIn('spot', result)
        self.assertEqual(result['spot'], 50000.0)
        self.assertEqual(result['source'], 'coingecko')

    @patch('src.context_builder._fetch_price')
    @patch('src.context_builder._fetch_ohlc_data')
    @patch('src.context_builder._fetch_macro_headlines')
    def test_build_market_context_structure(self, mock_news, mock_ohlc, mock_price):
        """Test that build_market_context returns correct structure"""
        mock_price.return_value = {
            'spot': 50000.0,
            'usd_24h_change': 2.5,
            'source': 'binance'
        }
        mock_ohlc.return_value = {
            'current_price': 50000.0,
            'rsi': 65.5,
            'trend': 'bullish'
        }
        mock_news.return_value = {
            'headlines': [
                {'title': 'Test News', 'url': 'https://example.com'}
            ]
        }

        context_json = build_market_context('BTC')
        context = json.loads(context_json)

        self.assertIn('symbol', context)
        self.assertIn('generated_at', context)
        self.assertIn('price', context)
        self.assertIn('technical_indicators', context)
        self.assertIn('macro', context)
        self.assertEqual(context['symbol'], 'BTC')
        self.assertEqual(context['price']['spot'], 50000.0)

    def test_build_market_context_json_valid(self):
        """Test that build_market_context returns valid JSON"""
        with patch('src.context_builder._fetch_price') as mock_price, \
             patch('src.context_builder._fetch_ohlc_data') as mock_ohlc, \
             patch('src.context_builder._fetch_macro_headlines') as mock_news:
            
            mock_price.return_value = {'spot': 50000.0, 'usd_24h_change': 2.5, 'source': 'binance'}
            mock_ohlc.return_value = {'current_price': 50000.0}
            mock_news.return_value = {'headlines': []}

            context_json = build_market_context('BTC')
            
            # Should be valid JSON
            context = json.loads(context_json)
            self.assertIsInstance(context, dict)


if __name__ == '__main__':
    unittest.main()

