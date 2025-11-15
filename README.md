# AI Price Prediction Oracle

<div align="center">

![GenLayer](https://img.shields.io/badge/GenLayer-Intelligent%20Contract-blue)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Python](https://img.shields.io/badge/Python-3.12+-blue)
![License](https://img.shields.io/badge/License-MIT-green)

**AI-powered cryptocurrency price prediction oracle built on GenLayer**

[Features](#-features) • [Quick Start](#-quick-start) • [Architecture](#-architecture) • [Documentation](#-documentation)

</div>

---

## 📖 Overview

AI Price Prediction Oracle is a decentralized prediction system that leverages **GenLayer's Intelligent Contracts** to provide AI-powered 24-hour price forecasts for cryptocurrencies. The system combines technical analysis, fundamental market data, and AI reasoning to generate accurate predictions with confidence scores and detailed explanations.

### Key Highlights

- 🤖 **AI-Powered Predictions**: Uses GenLayer's Equivalence Principle for non-deterministic LLM-based price forecasting
- 📊 **Technical Analysis**: Integrates RSI, MACD, Moving Averages, Support/Resistance levels, and trend analysis
- 📰 **Fundamental Analysis**: Incorporates market news, sentiment indicators, and macroeconomic trends
- 🔄 **Auto-Updates**: Backend scheduler automatically updates predictions every 15 minutes
- 🎯 **Multi-Symbol Support**: Track unlimited symbols with automatic symbol detection
- 🎨 **Modern UI**: Glassmorphism design with real-time updates and interactive charts

---

## ✨ Features

### Core Functionality
- ✅ **Symbol Management**: Add and manage cryptocurrency symbols via frontend
- ✅ **AI Predictions**: 24-hour price forecasts with confidence scores (0-100)
- ✅ **Outlook Classification**: Bullish, Bearish, or Neutral market outlook
- ✅ **Detailed Reasoning**: Comprehensive explanations combining technical and fundamental analysis
- ✅ **Prediction History**: Timeline view of past predictions with accuracy tracking
- ✅ **Price Charts**: Visual representation of current vs predicted prices
- ✅ **Symbol Comparison**: Side-by-side comparison of multiple symbols

### Technical Features
- ✅ **Auto-Symbol Detection**: Automatically detects new symbols without backend code changes
- ✅ **Multi-API Support**: Primary Binance API with CoinGecko fallback
- ✅ **Rate Limit Handling**: Exponential backoff retry logic for API calls
- ✅ **News Filtering**: Symbol-specific news headlines with intelligent filtering
- ✅ **Real-time Updates**: Auto-refresh every 60 seconds on frontend
- ✅ **Auto-Signing**: Local account for fast transactions without MetaMask approval
- ✅ **Wallet Integration**: RainbowKit/Wagmi for seamless wallet connection (optional)

### Data Sources
- **Price Data**: Binance API (primary), CoinGecko (fallback)
- **Technical Indicators**: RSI, MACD, MA7, MA20, Support/Resistance, Trend
- **News Headlines**: CryptoCompare API with symbol-specific filtering
- **Market Context**: Real-time price, 24h change, volume, and market trends

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Prediction   │  │   History    │  │  Comparison  │     │
│  │    Card       │  │   Timeline    │  │    View      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Wallet Connection (RainbowKit/Wagmi)         │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                         │
                         │ genlayer-js
                         │
┌───────────────────────▼─────────────────────────────────────┐
│         GenLayer Intelligent Contract                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │     MarketPredictionManager.py                         │  │
│  │  • Symbol Registry                                     │  │
│  │  • Prediction Storage                                  │  │
│  │  • AI Analysis (Equivalence Principle)                │  │
│  │  • History Management                                  │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                         │
                         │ genlayer-py
                         │
┌───────────────────────▼─────────────────────────────────────┐
│              Backend Scheduler (Python)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Context    │  │ Transaction  │  │  Scheduler   │      │
│  │   Builder    │  │    Sender    │  │   (15 min)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  External APIs: Binance, CoinGecko, CryptoCompare     │ │
│  └───────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.12+ (for backend)
- **GenLayer Account** and API access
- **Wallet** (MetaMask, WalletConnect, etc.) - Optional, local account auto-created for faster transactions

### ⚠️ Security Notice: Local Account Storage

The app uses a **local account (private key)** stored in browser `localStorage` for faster transactions. 

**Important Security Considerations:**
- Private key is stored **UNENCRYPTED** in `localStorage`
- This is a **HOT WALLET** - anyone with browser access can control the account
- **Recommended for development/testing only**
- For production, either:
  - Use MetaMask wallet (more secure)
  - Implement passphrase-based encryption (see TODO in code)
  - Use hardware wallet integration

**User Consent:** The app will prompt for consent before creating a local account. You can decline and use MetaMask instead.

### 1. Clone Repository

```bash
git clone https://github.com/ngh1105/AI-Price-Prediction-Oracle.git
cd AI-Price-Prediction-Oracle
```

### 2. Frontend Setup

```bash
# Install dependencies
npm install

# Create environment file
# Create .env.local file in the root directory with:
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYourDeployedContract
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_wc_project_id

# Or copy from example (if .env.example exists):
# cp .env.example .env.local
# Then edit .env.local with your actual values

# Run development server
npm run dev
```

Frontend will be available at `http://localhost:3000`

### 3. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows:
.venv\Scripts\activate
# Linux/Mac:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create environment file
# Create .env file with:
PRIVATE_KEY=0xYourPrivateKey
CONTRACT_ADDRESS=0xYourDeployedContract
GENLAYER_RPC_URL=https://studio.genlayer.com/api
# Optional: Whitelist symbols (leave empty to update all symbols from contract)
SYMBOLS=BTC,ETH,SOL
UPDATE_INTERVAL_SECONDS=900

# Run scheduler
python -m src.scheduler
```

### 4. Deploy Contract

Deploy the `MarketPredictionManager` contract to GenLayer:

```bash
# Using genlayer-js (from frontend directory)
# Or using genlayer-py (from backend directory)
```

See [Deployment Guide](#-deployment) for detailed instructions.

---

## 📁 Project Structure

```
ai-price-prediction/
├── contracts/
│   └── MarketPredictionManager.py    # GenLayer Intelligent Contract
│
├── app/                              # Next.js Frontend
│   ├── api/
│   │   └── generate-context/         # API route for context generation
│   ├── components/
│   │   ├── PredictionCard.tsx        # Main prediction display
│   │   ├── PredictionHistory.tsx     # History timeline
│   │   ├── PriceChart.tsx            # Price visualization
│   │   ├── SymbolComparison.tsx      # Multi-symbol comparison
│   │   ├── SymbolManagerDialog.tsx   # Add new symbols
│   │   └── SkeletonLoader.tsx        # Loading states
│   ├── page.tsx                      # Main dashboard
│   ├── providers.tsx                 # Wallet providers
│   └── globals.css                    # Global styles
│
├── backend/                          # Python Backend
│   ├── src/
│   │   ├── context_builder.py        # Market data aggregation
│   │   ├── scheduler.py              # Update scheduler
│   │   └── tx_sender.py              # Transaction handling
│   ├── scripts/                      # Utility scripts
│   └── requirements.txt              # Python dependencies
│
├── lib/                              # Shared utilities
│   ├── contract.ts                   # Contract interaction
│   ├── genlayer.ts                   # GenLayer client
│   └── utils.ts                      # Helper functions
│
└── public/                           # Static assets
```

---

## 📚 Documentation

### Contract Methods

#### Write Methods

- `add_symbol(symbol: str, description: str)` - Register a new symbol
- `request_update(symbol: str, context_json: str)` - Submit prediction update
- `update_symbol_status(symbol: str, is_active: bool)` - Enable/disable symbol
- `set_max_history(history_window: int)` - Configure history retention

#### View Methods

- `list_symbols()` - Get all registered symbols
- `get_symbol_config(symbol: str)` - Get symbol configuration
- `get_latest_prediction(symbol: str)` - Get latest prediction
- `get_prediction_history(symbol: str, limit: int)` - Get prediction history

### API Endpoints

#### Frontend API Routes

- `GET /api/generate-context?symbol=BTC` - Generate market context for a symbol

### Environment Variables

#### Frontend (.env.local)

```env
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_project_id
```

#### Backend (.env)

```env
PRIVATE_KEY=0x...
CONTRACT_ADDRESS=0x...
GENLAYER_RPC_URL=https://studio.genlayer.com/api
SYMBOLS=BTC,ETH,SOL          # Optional: Whitelist (empty = all symbols)
UPDATE_INTERVAL_SECONDS=900  # Default: 15 minutes
```

---

## 🎯 Usage Guide

### Adding a New Symbol

1. Click "Add Symbol" button (no wallet connection needed!)
2. Enter symbol code (e.g., `BTC`, `ETH`, `DOGE`)
3. Enter description (optional)
4. Click "Add Symbol"
5. Transaction is signed automatically using local account (fast, no approval needed)
6. The system will automatically generate the first prediction

**Note**: The app automatically creates a local account (private key) when you first open it. This account is used for write operations (add symbol, submit predictions) to provide a faster experience without requiring MetaMask approval for each transaction.

### Viewing Predictions

- **Main View**: Select a symbol from the sidebar to view its latest prediction
- **History Tab**: View timeline of past predictions with accuracy metrics
- **Comparison Tab**: Compare predictions across multiple symbols

### Understanding Predictions

- **Predicted Price**: AI forecast for 24 hours from now
- **Confidence**: 0-100 score indicating prediction certainty
- **Outlook**: Bullish (↑), Bearish (↓), or Neutral (→)
- **Summary**: Brief overview of key factors
- **Reasoning**: Detailed analysis combining technical and fundamental factors
- **Key Events**: Major drivers affecting the prediction
- **Sources**: Data sources and references

---

## 🔧 Configuration

### Backend Scheduler

The scheduler automatically reads all symbols from the contract and updates them:

- **With SYMBOLS in .env**: Only updates whitelisted symbols
- **Without SYMBOLS in .env**: Updates ALL symbols from contract

This allows you to add symbols via frontend without modifying backend code.

### Update Interval

Default: 15 minutes (900 seconds)

Change via `UPDATE_INTERVAL_SECONDS` in backend `.env`

### History Retention

Default: 168 predictions per symbol

Configure via `set_max_history()` contract method

---

## 🚢 Deployment

### 1. Deploy Contract

```bash
# Using genlayer-js
import { createClient } from 'genlayer-js'
import { readFileSync } from 'fs'

const client = createClient({ rpcUrl: 'https://studio.genlayer.com/api' })
const contractCode = readFileSync('./contracts/MarketPredictionManager.py', 'utf-8')

const address = await client.deployContract({
  code: contractCode,
  args: [168] // max_history default
})
```

### 2. Deploy Frontend

#### Vercel (Recommended)

```bash
npm install -g vercel
vercel
```

#### Other Platforms

```bash
npm run build
npm start
```

### 3. Deploy Backend

Run scheduler on a server or cloud platform:

```bash
# Using systemd (Linux)
# Create /etc/systemd/system/price-oracle.service

# Using Docker
docker build -t price-oracle-backend .
docker run -d --env-file .env price-oracle-backend
```

---

## 🚀 Deployment

### Deploy lên Vercel

Xem file [VERCEL_DEPLOY.md](./VERCEL_DEPLOY.md) để biết chi tiết cách deploy.

**Lưu ý quan trọng**: Vercel không tự động đọc file `.env.local`. Bạn **PHẢI** cấu hình Environment Variables trong Vercel Dashboard:

1. Vào Vercel Dashboard → Project → Settings → Environment Variables
2. Thêm các biến sau:
   - `NEXT_PUBLIC_CONTRACT_ADDRESS`
   - `NEXT_PUBLIC_GENLAYER_RPC_URL`
   - `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`
3. Redeploy project để áp dụng thay đổi

---

## 🛠️ Tech Stack

### Frontend
- **Next.js 15** - React framework
- **TypeScript** - Type safety
- **TailwindCSS** - Styling
- **Framer Motion** - Animations
- **RainbowKit/Wagmi** - Wallet integration
- **Recharts** - Data visualization
- **TanStack Query** - Data fetching
- **genlayer-js** - GenLayer SDK

### Backend
- **Python 3.12+** - Runtime
- **genlayer-py** - GenLayer SDK
- **httpx** - HTTP client
- **schedule** - Task scheduling
- **python-dotenv** - Environment management

### Contract
- **GenLayer Intelligent Contract** - AI-powered smart contract
- **Equivalence Principle** - Non-deterministic validation

### APIs
- **Binance API** - Primary price/OHLC data
- **CoinGecko API** - Fallback price data
- **CryptoCompare API** - News headlines

---

## 📊 Features in Detail

### Technical Analysis

The system calculates and analyzes:

- **RSI (Relative Strength Index)**: 14-period RSI for overbought/oversold conditions
- **MACD Signal**: Difference between MA7 and MA20
- **Moving Averages**: 7-day and 20-day moving averages
- **Support/Resistance**: Recent high/low levels
- **Trend Direction**: Bullish, Bearish, or Neutral based on price position relative to MAs
- **Price Position**: Distance from support/resistance levels

### News Filtering

- Symbol-specific news headlines
- Intelligent filtering by symbol name variations
- Fallback to general market news if needed
- Avoids confusion from other coin mentions

### Auto-Detection

New symbols are automatically detected:

- **Binance**: Tries `{SYMBOL}USDT` pattern
- **CoinGecko**: Tries lowercase symbol name
- **News**: Uses symbol variations for filtering

No backend code changes required!

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript/Python best practices
- Add comments for complex logic
- Update documentation for new features
- Test thoroughly before submitting PR

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **GenLayer** - For the Intelligent Contract platform
- **Binance** - For reliable price data APIs
- **CoinGecko** - For comprehensive market data
- **CryptoCompare** - For news aggregation

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/ngh1105/AI-Price-Prediction-Oracle/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ngh1105/AI-Price-Prediction-Oracle/discussions)

---

## 🗺️ Roadmap

- [x] Multi-timeframe predictions (1h, 4h, 12h, 24h, 7d, 30d)
- [ ] Prediction accuracy tracking and leaderboard
- [ ] User alerts and notifications
- [ ] Advanced analytics dashboard
- [ ] API access for third-party integrations
- [ ] Mobile app support
- [ ] Prediction marketplace and staking

---

<div align="center">

**Built with ❤️ using GenLayer**

[⭐ Star this repo](https://github.com/ngh1105/AI-Price-Prediction-Oracle) if you find it helpful!

</div>
