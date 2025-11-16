/**
 * Accuracy calculation utilities for prediction analysis
 */

export interface PredictionWithPrice {
  predicted_price: string
  generated_at?: number | string
  timeframe?: string
  confidence?: number | string
  outlook?: string
  // New fields for on-chain accuracy tracking
  actual_price?: string
  accuracy_score?: number | string
  is_expired?: boolean | string
}

export interface AccuracyMetrics {
  accuracy: number // 0-100, inverse of error percentage
  error: number // Percentage error
  absoluteError: number // Absolute price difference
  relativeError: number // Relative error (0-1)
}

export interface SymbolAccuracyStats {
  symbol: string
  timeframe?: string
  totalPredictions: number
  averageAccuracy: number
  medianAccuracy: number
  bestAccuracy: number
  worstAccuracy: number
  mae: number // Mean Absolute Error (percentage)
  rmse: number // Root Mean Squared Error (percentage)
  mape: number // Mean Absolute Percentage Error
  predictionsWithAccuracy: number
}

/**
 * Parse predicted price from string format (e.g., "43750.25 USD")
 */
export function parsePredictedPrice(predictedPrice: string): number | null {
  if (!predictedPrice || predictedPrice === 'N/A USD' || predictedPrice.includes('N/A')) {
    return null
  }
  const match = predictedPrice.match(/[\d,]+\.?\d*/)
  if (match) {
    const price = parseFloat(match[0].replace(/,/g, ''))
    if (!isNaN(price) && price > 0) return price
  }
  return null
}

/**
 * Calculate accuracy metrics for a single prediction
 */
export function calculateAccuracy(
  predictedPrice: number,
  actualPrice: number
): AccuracyMetrics {
  const absoluteError = Math.abs(predictedPrice - actualPrice)
  const relativeError = absoluteError / actualPrice
  const error = relativeError * 100 // Percentage error
  const accuracy = Math.max(0, 100 - error) // Inverse of error, capped at 0

  return {
    accuracy,
    error,
    absoluteError,
    relativeError,
  }
}

/**
 * Calculate accuracy for a prediction given current price
 * Priority: Use on-chain accuracy_score if available, otherwise calculate from prices
 */
export function calculatePredictionAccuracy(
  prediction: PredictionWithPrice,
  currentPrice: number | null
): AccuracyMetrics | null {
  // Priority 1: Use on-chain accuracy_score if available
  if (prediction.accuracy_score !== undefined && prediction.accuracy_score !== null) {
    const onChainAccuracy = typeof prediction.accuracy_score === 'string' 
      ? parseFloat(prediction.accuracy_score) 
      : prediction.accuracy_score
    if (!isNaN(onChainAccuracy) && onChainAccuracy >= 0 && onChainAccuracy <= 100) {
      // Use actual_price if available, otherwise use currentPrice for error calculation
      const actual = prediction.actual_price 
        ? parsePredictedPrice(prediction.actual_price)
        : currentPrice
      
      if (actual && actual > 0) {
        const predicted = parsePredictedPrice(prediction.predicted_price)
        if (predicted !== null) {
          const absoluteError = Math.abs(predicted - actual)
          const relativeError = absoluteError / actual
          const error = relativeError * 100
          
          return {
            accuracy: onChainAccuracy,
            error,
            absoluteError,
            relativeError,
          }
        }
      }
    }
  }
  
  // Priority 2: Calculate from current price
  if (!currentPrice || currentPrice <= 0) {
    return null
  }

  const predicted = parsePredictedPrice(prediction.predicted_price)
  if (predicted === null) {
    return null
  }

  return calculateAccuracy(predicted, currentPrice)
}

/**
 * Calculate comprehensive accuracy statistics for a symbol
 * Uses on-chain accuracy_score when available, falls back to calculating from prices
 */
export function calculateSymbolAccuracyStats(
  symbol: string,
  predictions: PredictionWithPrice[],
  currentPrice: number | null,
  timeframe?: string
): SymbolAccuracyStats | null {
  if (predictions.length === 0) {
    return null
  }

  const accuracies: number[] = []
  const errors: number[] = []
  const absoluteErrors: number[] = []

  for (const pred of predictions) {
    // Try to use on-chain accuracy_score first
    if (pred.accuracy_score !== undefined && pred.accuracy_score !== null && pred.accuracy_score !== '0') {
      const onChainAccuracy = typeof pred.accuracy_score === 'string' 
        ? parseFloat(pred.accuracy_score) 
        : pred.accuracy_score
      if (!isNaN(onChainAccuracy) && onChainAccuracy >= 0 && onChainAccuracy <= 100) {
        // Use actual_price if available for error calculation
        const actual = pred.actual_price 
          ? parsePredictedPrice(pred.actual_price)
          : currentPrice
        const predicted = parsePredictedPrice(pred.predicted_price)
        
        if (actual && actual > 0 && predicted !== null) {
          const absoluteError = Math.abs(predicted - actual)
          const error = (absoluteError / actual) * 100
          accuracies.push(onChainAccuracy)
          errors.push(error)
          absoluteErrors.push(absoluteError)
          continue
        }
      }
    }
    
    // Fallback to calculating from current price
    const metrics = calculatePredictionAccuracy(pred, currentPrice)
    if (metrics) {
      accuracies.push(metrics.accuracy)
      errors.push(metrics.error)
      absoluteErrors.push(metrics.absoluteError)
    }
  }

  if (accuracies.length === 0) {
    return null
  }

  // Sort for median calculation
  const sortedAccuracies = [...accuracies].sort((a, b) => a - b)
  const sortedErrors = [...errors].sort((a, b) => a - b)

  // Mean calculations
  const averageAccuracy = accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length
  const medianAccuracy = sortedAccuracies.length % 2 === 0
    ? (sortedAccuracies[sortedAccuracies.length / 2 - 1] + sortedAccuracies[sortedAccuracies.length / 2]) / 2
    : sortedAccuracies[Math.floor(sortedAccuracies.length / 2)]

  // MAE (Mean Absolute Error) - percentage
  const mae = errors.reduce((sum, e) => sum + Math.abs(e), 0) / errors.length

  // RMSE (Root Mean Squared Error) - percentage
  const rmse = Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / errors.length)

  // MAPE (Mean Absolute Percentage Error)
  const mape = currentPrice && currentPrice > 0
    ? absoluteErrors.reduce((sum, ae) => {
        const relative = ae / currentPrice
        return sum + relative
      }, 0) / absoluteErrors.length * 100
    : 0

  return {
    symbol,
    timeframe,
    totalPredictions: predictions.length,
    averageAccuracy,
    medianAccuracy,
    bestAccuracy: sortedAccuracies[sortedAccuracies.length - 1],
    worstAccuracy: sortedAccuracies[0],
    mae,
    rmse,
    mape,
    predictionsWithAccuracy: accuracies.length,
  }
}

/**
 * Calculate accuracy for multiple symbols and return leaderboard
 */
export function calculateLeaderboard(
  symbolStats: Array<{ symbol: string; predictions: PredictionWithPrice[]; currentPrice: number | null; timeframe?: string }>
): SymbolAccuracyStats[] {
  const stats: SymbolAccuracyStats[] = []

  for (const { symbol, predictions, currentPrice, timeframe } of symbolStats) {
    const stat = calculateSymbolAccuracyStats(symbol, predictions, currentPrice, timeframe)
    if (stat && stat.predictionsWithAccuracy > 0) {
      stats.push(stat)
    }
  }

  // Sort by average accuracy (descending)
  return stats.sort((a, b) => b.averageAccuracy - a.averageAccuracy)
}

/**
 * Filter predictions by timeframe
 */
export function filterPredictionsByTimeframe(
  predictions: PredictionWithPrice[],
  timeframe: string
): PredictionWithPrice[] {
  return predictions.filter(p => p.timeframe === timeframe)
}

/**
 * Get best and worst predictions
 */
export function getBestWorstPredictions(
  predictions: PredictionWithPrice[],
  currentPrice: number | null
): { best: PredictionWithPrice & { accuracy: number } | null; worst: PredictionWithPrice & { accuracy: number } | null } {
  if (!currentPrice || predictions.length === 0) {
    return { best: null, worst: null }
  }

  let best: (PredictionWithPrice & { accuracy: number }) | null = null
  let worst: (PredictionWithPrice & { accuracy: number }) | null = null
  let bestAccuracy = -1
  let worstAccuracy = 101

  for (const pred of predictions) {
    const metrics = calculatePredictionAccuracy(pred, currentPrice)
    if (metrics) {
      if (metrics.accuracy > bestAccuracy) {
        bestAccuracy = metrics.accuracy
        best = { ...pred, accuracy: metrics.accuracy }
      }
      if (metrics.accuracy < worstAccuracy) {
        worstAccuracy = metrics.accuracy
        worst = { ...pred, accuracy: metrics.accuracy }
      }
    }
  }

  return { best, worst }
}

