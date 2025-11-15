"""
Unit tests for tx_sender module
"""

import unittest
from unittest.mock import patch, MagicMock
import os

from src.tx_sender import (
    initialise_client,
    get_cached_client,
    clear_client_cache,
    list_registered_symbols,
    check_contract_health,
    _normalise_symbol_list,
)


class TestTxSender(unittest.TestCase):
    """Test cases for transaction sender functions"""

    @patch.dict(os.environ, {
        'PRIVATE_KEY': '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        'CONTRACT_ADDRESS': '0xabcdef1234567890abcdef1234567890abcdef12',
        'GENLAYER_RPC_URL': 'https://test.genlayer.com/api'
    })
    @patch('src.tx_sender.create_client')
    @patch('src.tx_sender.create_account')
    def test_initialise_client(self, mock_account, mock_client):
        """Test client initialization"""
        mock_account.return_value = MagicMock()
        mock_client.return_value = MagicMock()

        client, contract_address, account = initialise_client()

        self.assertIsNotNone(client)
        self.assertEqual(contract_address, '0xabcdef1234567890abcdef1234567890abcdef12')
        self.assertIsNotNone(account)

    def test_get_cached_client_reuse(self):
        """Test that cached client is reused"""
        clear_client_cache()
        
        with patch('src.tx_sender.initialise_client') as mock_init:
            mock_init.return_value = (MagicMock(), '0x123', MagicMock())
            
            # First call
            client1, addr1, acc1 = get_cached_client()
            
            # Second call should use cache
            client2, addr2, acc2 = get_cached_client()
            
            # Should only initialize once
            self.assertEqual(mock_init.call_count, 1)
            self.assertEqual(client1, client2)

    def test_normalise_symbol_list_array(self):
        """Test normalizing symbol list from array"""
        result = _normalise_symbol_list(['BTC', 'ETH', 'SOL'])
        self.assertEqual(result, ['BTC', 'ETH', 'SOL'])

    def test_normalise_symbol_list_dict_numeric_keys(self):
        """Test normalizing symbol list from dict with numeric keys"""
        result = _normalise_symbol_list({'0': 'BTC', '1': 'ETH', '2': 'SOL'})
        self.assertEqual(result, ['BTC', 'ETH', 'SOL'])

    def test_normalise_symbol_list_dict_string_keys(self):
        """Test normalizing symbol list from dict with string keys"""
        result = _normalise_symbol_list({'BTC': True, 'ETH': True, 'SOL': True})
        self.assertEqual(set(result), {'BTC', 'ETH', 'SOL'})

    @patch('src.tx_sender.list_registered_symbols')
    def test_check_contract_health_success(self, mock_list):
        """Test contract health check success"""
        mock_list.return_value = ['BTC', 'ETH']
        client = MagicMock()
        
        result = check_contract_health(client, '0x123')
        
        self.assertTrue(result)

    @patch('src.tx_sender.list_registered_symbols')
    def test_check_contract_health_failure(self, mock_list):
        """Test contract health check failure"""
        mock_list.side_effect = Exception('Connection error')
        client = MagicMock()
        
        result = check_contract_health(client, '0x123')
        
        self.assertFalse(result)


if __name__ == '__main__':
    unittest.main()

