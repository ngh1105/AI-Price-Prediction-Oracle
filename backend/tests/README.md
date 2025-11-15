# Backend Tests

Unit tests for the backend modules.

## Running Tests

```bash
# From backend directory
cd backend
python -m pytest tests/ -v

# Or using unittest
python -m unittest discover tests -v
```

## Test Coverage

- `test_context_builder.py`: Tests for market context generation
  - Price fetching (Binance and CoinGecko fallback)
  - Context structure validation
  - JSON validity

- `test_tx_sender.py`: Tests for transaction sending
  - Client initialization
  - Client caching
  - Symbol list normalization
  - Contract health checks

## Adding New Tests

1. Create test file in `backend/tests/`
2. Follow naming convention: `test_<module_name>.py`
3. Use unittest or pytest
4. Mock external dependencies (API calls, network requests)

## Example Test Structure

```python
import unittest
from unittest.mock import patch, MagicMock

from src.your_module import your_function

class TestYourModule(unittest.TestCase):
    @patch('src.your_module.external_dependency')
    def test_your_function(self, mock_dep):
        mock_dep.return_value = MagicMock()
        result = your_function('input')
        self.assertEqual(result, 'expected')
```

