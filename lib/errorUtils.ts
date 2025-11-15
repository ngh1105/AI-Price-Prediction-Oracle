/**
 * Error message utilities for better user experience
 */

export interface ErrorInfo {
  message: string
  suggestion?: string
  category: 'network' | 'wallet' | 'contract' | 'api' | 'validation' | 'unknown'
  retryable: boolean
}

export function parseError(error: any): ErrorInfo {
  const errorMessage = error?.message || String(error) || 'An unknown error occurred'
  const errorString = errorMessage.toLowerCase()

  // Network errors
  if (
    errorString.includes('network') ||
    errorString.includes('fetch') ||
    errorString.includes('econnrefused') ||
    errorString.includes('timeout') ||
    errorString.includes('failed to fetch') ||
    errorString.includes('networkerror')
  ) {
    return {
      message: 'Network connection error',
      suggestion: 'Please check your internet connection and try again. If the problem persists, the service may be temporarily unavailable.',
      category: 'network',
      retryable: true,
    }
  }

  // Wallet errors
  if (
    errorString.includes('wallet') ||
    errorString.includes('user rejected') ||
    errorString.includes('user denied') ||
    errorString.includes('rejected') ||
    errorString.includes('no account') ||
    errorString.includes('connect your wallet')
  ) {
    return {
      message: 'Wallet connection issue',
      suggestion: 'Please connect your wallet and ensure it is unlocked. If you rejected the transaction, please try again and approve it.',
      category: 'wallet',
      retryable: true,
    }
  }

  // Contract errors
  if (
    errorString.includes('contract') ||
    errorString.includes('address') ||
    errorString.includes('not found') ||
    errorString.includes('invalid contract') ||
    errorString.includes('symbol not registered') ||
    errorString.includes('symbol already exists')
  ) {
    return {
      message: 'Contract interaction error',
      suggestion: 'Please verify that the contract address is correct and the contract is deployed. If adding a symbol, it may already exist.',
      category: 'contract',
      retryable: false,
    }
  }

  // API errors
  if (
    errorString.includes('api') ||
    errorString.includes('rate limit') ||
    errorString.includes('429') ||
    errorString.includes('500') ||
    errorString.includes('failed to generate context')
  ) {
    return {
      message: 'API service error',
      suggestion: 'The API service may be temporarily unavailable or rate-limited. Please wait a moment and try again.',
      category: 'api',
      retryable: true,
    }
  }

  // Validation errors
  if (
    errorString.includes('invalid') ||
    errorString.includes('required') ||
    errorString.includes('validation') ||
    errorString.includes('must be') ||
    errorString.includes('cannot be empty')
  ) {
    return {
      message: 'Validation error',
      suggestion: 'Please check your input and ensure all required fields are filled correctly.',
      category: 'validation',
      retryable: false,
    }
  }

  // Transaction timeout (not really an error, but needs special handling)
  if (
    errorString.includes('not accepted') ||
    errorString.includes('not yet accepted') ||
    errorString.includes('timeout') ||
    errorString.includes('still processing')
  ) {
    return {
      message: 'Transaction is processing',
      suggestion: 'Your transaction has been submitted but is still being processed by the network. This is normal and may take a few moments. Please wait and refresh the page.',
      category: 'network',
      retryable: false,
    }
  }

  // Default unknown error
  return {
    message: errorMessage.length > 100 ? errorMessage.substring(0, 100) + '...' : errorMessage,
    suggestion: 'An unexpected error occurred. Please try again. If the problem persists, check the console for more details.',
    category: 'unknown',
    retryable: true,
  }
}

export function formatErrorForToast(error: any): { title: string; description?: string } {
  const errorInfo = parseError(error)
  
  return {
    title: errorInfo.message,
    description: errorInfo.suggestion,
  }
}

