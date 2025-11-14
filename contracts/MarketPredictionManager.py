# { "Depends": "py-genlayer:test" }

from dataclasses import dataclass
import json
import typing

from genlayer import TreeMap, allow_storage, gl, u32, u64, u8


@allow_storage
@dataclass
class SymbolConfig:
    description: str
    is_active: bool


@allow_storage
@dataclass
class PredictionRecord:
    prediction_id: str
    symbol: str
    timeframe: str  # "1h", "4h", "12h", "24h", "7d", "30d"
    counter: u64
    predicted_price: str
    outlook: str
    confidence: u8
    summary: str
    reasoning: str
    key_events_json: str
    sources_json: str
    raw_context: str


class MarketPredictionManager(gl.Contract):
    symbols: TreeMap[str, SymbolConfig]
    symbol_counters: TreeMap[str, u64]  # Legacy: for backward compatibility (24h only)
    symbol_latest_prediction: TreeMap[str, str]  # Legacy: for backward compatibility (24h only)
    # New: timeframe-specific storage
    symbol_timeframe_counters: TreeMap[str, u64]  # Key: "SYMBOL-TIMEFRAME"
    symbol_timeframe_latest: TreeMap[str, str]  # Key: "SYMBOL-TIMEFRAME", Value: prediction_id
    predictions: TreeMap[str, PredictionRecord]
    max_history: u32

    def __init__(self, default_history_window: int = 168):
        if default_history_window <= 0:
            default_history_window = 168
        self.max_history = u32(default_history_window)

    @gl.public.write
    def add_symbol(self, symbol: str, description: str) -> None:
        key = symbol.upper().strip()
        if len(key) == 0:
            raise ValueError("symbol cannot be empty")
        if key in self.symbols:
            raise ValueError("symbol already exists")

        self.symbols[key] = SymbolConfig(description=description, is_active=True)
        self.symbol_counters[key] = u64(0)

    @gl.public.write
    def update_symbol_status(self, symbol: str, is_active: bool) -> None:
        key = symbol.upper().strip()
        config = self.symbols.get(key)
        if config is None:
            raise ValueError("symbol not registered")
        config.is_active = is_active
        self.symbols[key] = config

    @gl.public.write
    def set_max_history(self, history_window: int) -> None:
        if history_window <= 0:
            raise ValueError("history_window must be positive")
        self.max_history = u32(history_window)

    @gl.public.write
    def request_update(self, symbol: str, context_json: str, timeframe: str = "24h") -> str:
        key = symbol.upper().strip()
        if key not in self.symbols:
            raise ValueError("symbol not registered")
        if len(context_json.strip()) == 0:
            raise ValueError("context_json required")

        # Validate timeframe
        tf = timeframe.lower().strip()
        valid_timeframes = ["1h", "4h", "12h", "24h", "7d", "30d"]
        if tf not in valid_timeframes:
            raise ValueError(f"invalid timeframe. Must be one of: {valid_timeframes}")

        config = self.symbols[key]
        if not config.is_active:
            raise ValueError("symbol inactive")

        payload = self._execute_prediction(key, tf, context_json)

        # Use timeframe-specific counter
        tf_key = f"{key}-{tf}"
        counter = int(self.symbol_timeframe_counters.get(tf_key, u64(0)))
        next_counter = counter + 1
        prediction_id = f"{key}-{tf}-{next_counter}"

        record = self._build_record(
            prediction_id=prediction_id,
            symbol=key,
            timeframe=tf,
            counter=u64(next_counter),
            payload=payload,
            context_json=context_json,
        )

        # Store in timeframe-specific storage
        self.predictions[prediction_id] = record
        self.symbol_timeframe_counters[tf_key] = u64(next_counter)
        self.symbol_timeframe_latest[tf_key] = prediction_id

        # Also update legacy storage for backward compatibility (24h only)
        if tf == "24h":
            self.symbol_counters[key] = u64(next_counter)
            self.symbol_latest_prediction[key] = prediction_id

        # History trimming per timeframe
        max_keep = int(self.max_history)
        if max_keep > 0 and next_counter > max_keep:
            remove_index = next_counter - max_keep
            remove_id = f"{key}-{tf}-{remove_index}"
            if remove_id in self.predictions:
                del self.predictions[remove_id]

        return prediction_id

    def _execute_prediction(self, symbol: str, timeframe: str, context_json: str) -> typing.Dict[str, typing.Any]:
        # Map timeframe to human-readable duration
        timeframe_map = {
            "1h": "1 hour",
            "4h": "4 hours",
            "12h": "12 hours",
            "24h": "24 hours",
            "7d": "7 days",
            "30d": "30 days"
        }
        duration = timeframe_map.get(timeframe, "24 hours")
        
        # Adjust analysis focus based on timeframe
        if timeframe in ["1h", "4h"]:
            timeframe_guidance = "For this short-term timeframe, focus primarily on technical indicators, momentum, order flow, and immediate market sentiment. Short-term price movements are more influenced by technical patterns, support/resistance levels, and intraday trading activity."
        elif timeframe in ["12h", "24h"]:
            timeframe_guidance = "For this medium-term timeframe, balance technical analysis with fundamental factors. Consider both short-term momentum and emerging market trends, news events, and sentiment shifts that could impact price within this window."
        else:  # 7d, 30d
            timeframe_guidance = "For this longer-term timeframe, emphasize fundamental analysis, macroeconomic trends, structural market changes, and major news events. Technical indicators are less reliable over longer periods, so focus on broader market dynamics, adoption trends, and fundamental catalysts."
        
        task = f"""You are an expert market analyst combining technical analysis with fundamental market factors. Use the supplied JSON context to forecast the price of {symbol} {duration} from now.

TIMEFRAME GUIDANCE:
{timeframe_guidance}

ANALYSIS REQUIREMENTS:
1. TECHNICAL ANALYSIS: If technical_indicators are provided, analyze RSI, MACD, Moving Averages, Support/Resistance levels, price patterns, and trend direction to identify momentum and potential reversal signals.
2. FUNDAMENTAL ANALYSIS: Consider market news, macroeconomic trends, sentiment indicators, and on-chain data to understand broader market dynamics.
3. TREND ANALYSIS: Evaluate current market trends, price action patterns, and how technical signals align with fundamental drivers.
4. SYNTHESIS: Combine technical indicators with market news, trends, and sentiment to form a comprehensive prediction.

Return ONLY valid JSON with the following keys:
- predicted_price: string (free-form numeric value and currency, e.g. "43750.25 USD")
- confidence: integer 0-100
- outlook: one of ["bullish","bearish","neutral"]
- summary: short paragraph (<= 240 chars) combining technical signals with market trends and news
- reasoning: detailed paragraph list (400-900 chars) explaining:
  * Technical indicators analysis (RSI levels, MACD signals, MA crossovers, support/resistance if available)
  * Market trends and price action interpretation
  * Fundamental factors (news impact, sentiment, macro trends)
  * How technical signals align or conflict with market news and trends
  * Timeframe-specific considerations (why this prediction is appropriate for {duration})
- key_events: array of up to 5 short strings describing major drivers (include both technical signals like "RSI oversold", "MACD bullish crossover" AND market events/news)
- sources: array of up to 5 human-readable references (URLs or descriptors)
Do not include markdown. JSON must be minified."""

        criteria = """
Output must be strict JSON object.
confidence must be 0-100.
outlook must be bullish, bearish, or neutral.
reasoning must include both technical indicator analysis (if available) AND fundamental factors (news, trends, sentiment).
key_events should include both technical signals (e.g., "RSI oversold", "MACD bullish crossover", "Price above MA20") and fundamental catalysts (macro news, market trends, sentiment shifts, liquidity events).
sources should cite URLs or clear identifiers.
"""

        def provide_context():
            return context_json

        result = gl.eq_principle.prompt_non_comparative(provide_context, task=task, criteria=criteria)

        # Clean the result - remove any trailing whitespace, newlines, or extra characters
        cleaned = result.strip()
        
        # If result is a quoted JSON string, unquote it first
        if cleaned.startswith('"') and cleaned.endswith('"'):
            try:
                cleaned = json.loads(cleaned)  # Unwrap quoted JSON string
                if isinstance(cleaned, str):
                    cleaned = cleaned.strip()
                else:
                    # If it's already parsed, re-serialize
                    cleaned = json.dumps(cleaned, separators=(',', ':'))
            except:
                # If unquoting fails, remove quotes manually
                if len(cleaned) > 2:
                    cleaned = cleaned[1:-1]
        
        # Remove trailing newlines and extra closing braces
        cleaned = cleaned.rstrip()
        # Remove trailing }\n} pattern
        while cleaned.endswith('\n}') or (cleaned.endswith('}') and cleaned.count('}') > cleaned.count('{')):
            # Find the last complete JSON object
            last_brace = cleaned.rfind('}')
            if last_brace > 0:
                test_json = cleaned[:last_brace + 1]
                try:
                    json.loads(test_json)
                    cleaned = test_json
                    break
                except:
                    cleaned = cleaned[:last_brace].rstrip()
            else:
                break
        
        # Try to parse the cleaned JSON
        try:
            parsed = json.loads(cleaned)
        except Exception as exc:
            # Try to find JSON object in the string if it's embedded
            import re
            # More robust regex to find JSON object
            json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', cleaned, re.DOTALL)
            if json_match:
                try:
                    parsed = json.loads(json_match.group(0))
                except:
                    raise ValueError(f"prediction JSON parse error: {exc}. Raw result (first 500 chars): {result[:500]}")
            else:
                raise ValueError(f"prediction JSON parse error: {exc}. Raw result (first 500 chars): {result[:500]}")

        if not isinstance(parsed, dict):
            raise ValueError("prediction must be JSON object")
        return parsed

    def _build_record(
        self,
        prediction_id: str,
        symbol: str,
        timeframe: str,
        counter: u64,
        payload: typing.Dict[str, typing.Any],
        context_json: str,
    ) -> PredictionRecord:
        predicted_price = str(payload.get("predicted_price", "")).strip()
        if len(predicted_price) == 0:
            raise ValueError("predicted_price missing")

        raw_confidence = payload.get("confidence", 0)
        try:
            confidence_int = int(raw_confidence)
        except Exception as exc:
            raise ValueError(f"invalid confidence value: {exc}")
        if confidence_int < 0:
            confidence_int = 0
        if confidence_int > 100:
            confidence_int = 100

        outlook = str(payload.get("outlook", "neutral")).lower()
        if outlook not in ("bullish", "bearish", "neutral"):
            outlook = "neutral"

        summary = str(payload.get("summary", ""))[:512]
        reasoning = str(payload.get("reasoning", ""))[:2048]

        events = payload.get("key_events", [])
        key_events_json = "[]"
        if isinstance(events, list):
            trimmed_events = []
            for item in events[:5]:
                trimmed_events.append(str(item)[:160])
            key_events_json = json.dumps(trimmed_events)

        sources = payload.get("sources", [])
        sources_json = "[]"
        if isinstance(sources, list):
            trimmed_sources = []
            for item in sources[:5]:
                trimmed_sources.append(str(item)[:256])
            sources_json = json.dumps(trimmed_sources)

        return PredictionRecord(
            prediction_id=prediction_id,
            symbol=symbol,
            timeframe=timeframe,
            counter=counter,
            predicted_price=predicted_price,
            outlook=outlook,
            confidence=u8(confidence_int),
            summary=summary,
            reasoning=reasoning,
            key_events_json=key_events_json,
            sources_json=sources_json,
            raw_context=context_json[:4096],
        )

    @gl.public.view
    def get_symbol_config(self, symbol: str) -> TreeMap[str, str]:
        key = symbol.upper().strip()
        config = self.symbols.get(key)
        if config is None:
            raise ValueError("symbol not registered")

        counter = int(self.symbol_counters.get(key, u64(0)))
        latest = self.symbol_latest_prediction.get(key, "")

        info = gl.storage.inmem_allocate(TreeMap[str, str])
        info["symbol"] = key
        info["description"] = config.description
        info["is_active"] = "true" if config.is_active else "false"
        info["total_updates"] = str(counter)
        info["latest_prediction_id"] = latest
        return info

    @gl.public.view
    def list_symbols(self) -> typing.List[str]:
        result: typing.List[str] = []
        for symbol in self.symbols:
            result.append(symbol)
        return result

    @gl.public.view
    def get_latest_prediction(self, symbol: str) -> TreeMap[str, str]:
        key = symbol.upper().strip()
        prediction_id = self.symbol_latest_prediction.get(key)
        if prediction_id is None:
            raise ValueError("no predictions recorded")
        record = self.predictions.get(prediction_id)
        if record is None:
            raise ValueError("prediction missing")
        return self._record_to_map(record)

    @gl.public.view
    def get_prediction_history(self, symbol: str, limit: int = 10) -> typing.List[TreeMap[str, str]]:
        if limit <= 0:
            raise ValueError("limit must be positive")

        key = symbol.upper().strip()
        counter = int(self.symbol_counters.get(key, u64(0)))
        if counter == 0:
            raise ValueError("no predictions recorded")

        max_entries = min(limit, counter, int(self.max_history) if int(self.max_history) > 0 else limit)

        history: typing.List[TreeMap[str, str]] = []
        current = counter
        collected = 0

        while current >= 1 and collected < max_entries:
            prediction_id = f"{key}-24h-{current}"  # Updated to include timeframe
            record = self.predictions.get(prediction_id)
            if record is not None:
                history.append(self._record_to_map(record))
                collected += 1
            current -= 1

        return history

    @gl.public.view
    def get_latest_prediction_by_timeframe(self, symbol: str, timeframe: str) -> TreeMap[str, str]:
        """Get latest prediction for a specific symbol and timeframe"""
        key = symbol.upper().strip()
        tf = timeframe.lower().strip()
        
        # Validate timeframe
        valid_timeframes = ["1h", "4h", "12h", "24h", "7d", "30d"]
        if tf not in valid_timeframes:
            raise ValueError(f"invalid timeframe. Must be one of: {valid_timeframes}")
        
        tf_key = f"{key}-{tf}"
        prediction_id = self.symbol_timeframe_latest.get(tf_key)
        if prediction_id is None:
            raise ValueError(f"no predictions recorded for {symbol} {timeframe}")
        
        record = self.predictions.get(prediction_id)
        if record is None:
            raise ValueError("prediction missing")
        return self._record_to_map(record)

    @gl.public.view
    def get_all_timeframe_predictions(self, symbol: str) -> TreeMap[str, TreeMap[str, str]]:
        """Get latest prediction for all timeframes of a symbol"""
        key = symbol.upper().strip()
        result = gl.storage.inmem_allocate(TreeMap[str, TreeMap[str, str]])
        
        for tf in ["1h", "4h", "12h", "24h", "7d", "30d"]:
            tf_key = f"{key}-{tf}"
            prediction_id = self.symbol_timeframe_latest.get(tf_key)
            if prediction_id:
                record = self.predictions.get(prediction_id)
                if record:
                    result[tf] = self._record_to_map(record)
        
        return result

    def _record_to_map(self, record: PredictionRecord) -> TreeMap[str, str]:
        data = gl.storage.inmem_allocate(TreeMap[str, str])
        data["prediction_id"] = record.prediction_id
        data["symbol"] = record.symbol
        data["timeframe"] = record.timeframe
        data["counter"] = str(int(record.counter))
        data["predicted_price"] = record.predicted_price
        data["outlook"] = record.outlook
        data["confidence"] = str(int(record.confidence))
        data["summary"] = record.summary
        data["reasoning"] = record.reasoning
        data["key_events_json"] = record.key_events_json
        data["sources_json"] = record.sources_json
        data["raw_context"] = record.raw_context
        return data

