/**
 * Alternative implementation using private key instead of MetaMask
 * This allows automatic transaction signing without user approval
 */

import { createClient, createAccount, generatePrivateKey } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import type { Account } from 'genlayer-js/types'

const resolveEndpoint = () => process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || 'https://studio.genlayer.com/api'

// Singleton GenLayer client for private key approach
let cachedClient: ReturnType<typeof createClient> | null = null
let cachedAccount: Account | null = null

/**
 * Generate a new private key using genlayer-js utility
 * This is a wrapper around genlayer-js's generatePrivateKey
 */
function generateNewPrivateKey(): string {
  // Use genlayer-js's built-in generatePrivateKey function
  return generatePrivateKey()
}

/**
 * Get or create private key from localStorage
 * In production, consider encrypting the private key
 */
function getOrCreatePrivateKey(): string {
  if (typeof window === 'undefined') {
    throw new Error('Private key storage only available in browser')
  }

  const STORAGE_KEY = 'genlayer_app_private_key'
  let privateKey = localStorage.getItem(STORAGE_KEY)

  if (!privateKey) {
    // Generate new private key
    privateKey = generateNewPrivateKey()
    localStorage.setItem(STORAGE_KEY, privateKey)
    console.log('[glClientPrivateKey] Generated new private key')
    
    // Show backup prompt to user (should be handled by UI)
    // You might want to emit an event or use a callback here
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('privateKeyGenerated', { 
        detail: { privateKey } 
      }))
    }
  }

  return privateKey
}

/**
 * Get the account address from private key
 */
export function getAccountAddress(): `0x${string}` {
  if (!cachedAccount) {
    const privateKey = getOrCreatePrivateKey()
    cachedAccount = createAccount(privateKey as `0x${string}`)
  }
  return cachedAccount.address as `0x${string}`
}

/**
 * Get or create GenLayer client with private key
 */
export function getClientWithPrivateKey() {
  if (cachedClient && cachedAccount) {
    return cachedClient
  }

  const privateKey = getOrCreatePrivateKey()
  cachedAccount = createAccount(privateKey as `0x${string}`)
  
  cachedClient = createClient({
    chain: studionet,
    endpoint: resolveEndpoint(),
    account: cachedAccount, // Account object, not string
  })

  console.log('[glClientPrivateKey] Created client with private key account:', cachedAccount.address)
  return cachedClient
}

/**
 * Export private key for backup (should be encrypted in production)
 * 
 * SECURITY WARNING: This returns the raw, unencrypted private key.
 * In production, implement passphrase-based encryption before export.
 * 
 * @param requireConfirmation - If true, requires user confirmation via confirm() dialog
 */
export function exportPrivateKey(requireConfirmation: boolean = true): string {
  if (typeof window === 'undefined') {
    throw new Error('Private key export only available in browser')
  }
  
  if (requireConfirmation) {
    const confirmed = window.confirm(
      '⚠️ SECURITY WARNING\n\n' +
      'You are about to export your unencrypted private key.\n\n' +
      'This is a HOT WALLET key stored in your browser.\n' +
      'Anyone with access to this key can control your account.\n\n' +
      'Do you want to continue?'
    )
    if (!confirmed) {
      throw new Error('Private key export cancelled by user')
    }
  }
  
  return getOrCreatePrivateKey()
}

/**
 * Import private key from backup
 * 
 * SECURITY WARNING: This stores the private key unencrypted in localStorage.
 * In production, implement passphrase-based encryption before import.
 * 
 * @param privateKey - The private key to import
 * @param requireConfirmation - If true, requires user confirmation via confirm() dialog
 */
export function importPrivateKey(privateKey: string, requireConfirmation: boolean = true): void {
  if (typeof window === 'undefined') {
    throw new Error('Private key import only available in browser')
  }

  // Validate private key format
  if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
    throw new Error('Invalid private key format. Must be 0x followed by 64 hex characters.')
  }

  // Test if private key is valid by creating account
  let testAccount: Account
  try {
    testAccount = createAccount(privateKey as `0x${string}`)
    console.log('[glClientPrivateKey] Valid private key, address:', testAccount.address)
  } catch (error) {
    throw new Error('Invalid private key: ' + (error as Error).message)
  }

  if (requireConfirmation) {
    const confirmed = window.confirm(
      '⚠️ SECURITY WARNING\n\n' +
      'You are about to import a private key into this browser.\n\n' +
      'This will store the key UNENCRYPTED in localStorage.\n' +
      'Anyone with access to this browser can control the account.\n\n' +
      'Account address: ' + testAccount.address + '\n\n' +
      'Do you want to continue?'
    )
    if (!confirmed) {
      throw new Error('Private key import cancelled by user')
    }
  }

  // Store private key
  const STORAGE_KEY = 'genlayer_app_private_key'
  localStorage.setItem(STORAGE_KEY, privateKey)
  
  // Clear cache to force recreation with new key
  cachedClient = null
  cachedAccount = null
  
  console.log('[glClientPrivateKey] Private key imported successfully')
}

// TODO: Implement optional production encryption (password or WebCrypto)
// This should encrypt the private key before storing in localStorage
// and decrypt it when needed for signing operations
// Config flag: ENABLE_PRIVATE_KEY_ENCRYPTION (default: false)

/**
 * Clear private key and client cache (in-memory only)
 * Note: This does NOT remove the private key from localStorage.
 * Use clearStoredPrivateKey() to also remove from storage.
 */
export function clearPrivateKeyCache() {
  cachedClient = null
  cachedAccount = null
}

/**
 * Clear stored private key from localStorage and clear caches
 * This completely removes the private key from storage
 */
export function clearStoredPrivateKey() {
  if (typeof window === 'undefined') return
  
  const STORAGE_KEY = 'genlayer_app_private_key'
  localStorage.removeItem(STORAGE_KEY)
  clearPrivateKeyCache()
  console.log('[glClientPrivateKey] Stored private key removed from localStorage')
}

/**
 * Check if private key exists in storage
 */
export function hasPrivateKey(): boolean {
  if (typeof window === 'undefined') return false
  const STORAGE_KEY = 'genlayer_app_private_key'
  return localStorage.getItem(STORAGE_KEY) !== null
}

