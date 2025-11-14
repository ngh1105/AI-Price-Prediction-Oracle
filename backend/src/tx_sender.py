import json
import logging
import os
from typing import Iterable, List, Tuple

from dotenv import load_dotenv
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus

load_dotenv()

logger = logging.getLogger(__name__)


def _resolve_chain():
    rpc_url = os.getenv('GENLAYER_RPC_URL')
    if not rpc_url:
        return studionet, None
    return studionet, rpc_url


def initialise_client():
    private_key = os.getenv('PRIVATE_KEY')
    if not private_key:
        raise RuntimeError('PRIVATE_KEY missing from environment')

    account = create_account(private_key)
    chain, endpoint = _resolve_chain()
    if endpoint:
        client = create_client(chain=chain, account=account, endpoint=endpoint)
    else:
        client = create_client(chain=chain, account=account)
    contract_address = os.getenv('CONTRACT_ADDRESS')
    if not contract_address:
        raise RuntimeError('CONTRACT_ADDRESS missing from environment')
    return client, contract_address, account


def _normalise_symbol_list(raw: Iterable) -> List[str]:
    symbols: List[str] = []
    if isinstance(raw, list):
        symbols = [str(item).upper() for item in raw]
    elif isinstance(raw, dict):
        keys = list(raw.keys())
        numeric_keys = [k for k in keys if str(k).isdigit()]
        if numeric_keys:
            for key in sorted(numeric_keys, key=lambda x: int(x)):
                value = raw.get(key)
                if value:
                    symbols.append(str(value).upper())
        else:
            symbols = [str(key).upper() for key in keys if key not in ('length',)]
    else:
        logger.debug('Unknown symbol list shape: %s', type(raw))
    return symbols


def list_registered_symbols(client, contract_address: str) -> List[str]:
    try:
        response = client.read_contract(address=contract_address, function_name='list_symbols', args=[])
    except Exception as exc:
        logger.error('Failed to read list_symbols: %s', exc, exc_info=True)
        raise
    if response is None:
        return []
    return _normalise_symbol_list(response)


def submit_prediction_update(client, contract_address: str, symbol: str, context_json: str, timeframe: str = "24h") -> Tuple[str, str]:
    """
    Submit a prediction update transaction to the GenLayer contract.
    
    Args:
        client: GenLayer client instance
        contract_address: Contract address
        symbol: Trading symbol (e.g., 'BTC', 'ETH')
        context_json: JSON string containing market context data
        timeframe: Prediction timeframe ("1h", "4h", "12h", "24h", "7d", "30d")
    
    Returns:
        Tuple of (transaction_hash, receipt_id)
    """
    # Validate and normalize JSON
    try:
        # Parse to ensure it's valid JSON
        parsed = json.loads(context_json)
        # Re-serialize to ensure consistent formatting (minified)
        normalized_json = json.dumps(parsed, separators=(',', ':'))
        logger.debug(f"JSON validated and normalized. Length: {len(normalized_json)} chars")
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in context_json: {e}")
        raise ValueError(f"Invalid JSON in context_json: {e}") from e
    
    # Ensure symbol is uppercase and stripped
    symbol_clean = symbol.upper().strip()
    if not symbol_clean:
        raise ValueError("symbol cannot be empty")
    
    # Validate timeframe
    valid_timeframes = ["1h", "4h", "12h", "24h", "7d", "30d"]
    timeframe_clean = timeframe.lower().strip()
    if timeframe_clean not in valid_timeframes:
        raise ValueError(f"invalid timeframe. Must be one of: {valid_timeframes}")
    
    logger.info(f"Submitting transaction: symbol={symbol_clean}, timeframe={timeframe_clean}, contract={contract_address}")
    logger.debug(f"Context JSON preview (first 200 chars): {normalized_json[:200]}...")
    
    # Call contract method
    try:
        tx_hash = client.write_contract(
            address=contract_address,
            function_name='request_update',
            args=[symbol_clean, normalized_json, timeframe_clean],
        )
        logger.info(f"Transaction submitted: {tx_hash}")
    except Exception as e:
        logger.error(f"Failed to submit transaction: {e}", exc_info=True)
        raise
    
    # Wait for transaction to be accepted (with increased timeout)
    try:
        receipt = client.wait_for_transaction_receipt(
            transaction_hash=tx_hash, 
            status=TransactionStatus.ACCEPTED,
            retries=20,  # Increase from default 10 to 20 (60 seconds total)
            interval=3000  # 3 seconds between retries
        )
        receipt_id = receipt.id if hasattr(receipt, 'id') else ''
        logger.info(f"Transaction accepted: {tx_hash}, receipt_id={receipt_id}")
        return tx_hash, receipt_id  # type: ignore[attr-defined]
    except Exception as e:
        # Log warning but don't fail - transaction was submitted successfully
        # It may still be processing on the network
        logger.warning(f"Transaction submitted but not yet accepted: {tx_hash}")
        logger.warning(f"Transaction may still be processing. Error: {e}")
        # Return tx_hash anyway so scheduler can continue
        return tx_hash, ''


def add_symbol(client, contract_address: str, symbol: str, description: str) -> Tuple[str, str]:
    """
    Add a new symbol to the contract.
    
    Args:
        client: GenLayer client instance
        contract_address: Contract address
        symbol: Trading symbol (e.g., 'BTC', 'ETH')
        description: Description of the symbol
    
    Returns:
        Tuple of (transaction_hash, receipt_id)
    """
    symbol_clean = symbol.upper().strip()
    if not symbol_clean:
        raise ValueError("symbol cannot be empty")
    
    logger.info(f"Adding symbol: {symbol_clean}, description: {description}")
    
    try:
        tx_hash = client.write_contract(
            address=contract_address,
            function_name='add_symbol',
            args=[symbol_clean, description],
        )
        logger.info(f"Add symbol transaction submitted: {tx_hash}")
    except Exception as e:
        logger.error(f"Failed to submit add_symbol transaction: {e}", exc_info=True)
        raise
    
    try:
        receipt = client.wait_for_transaction_receipt(
            transaction_hash=tx_hash, 
            status=TransactionStatus.ACCEPTED,
            retries=20,
            interval=3000
        )
        receipt_id = receipt.id if hasattr(receipt, 'id') else ''
        logger.info(f"Add symbol transaction accepted: {tx_hash}, receipt_id={receipt_id}")
        return tx_hash, receipt_id  # type: ignore[attr-defined]
    except Exception as e:
        logger.warning(f"Add symbol transaction submitted but not yet accepted: {tx_hash}")
        logger.warning(f"Transaction may still be processing. Error: {e}")
        return tx_hash, ''

