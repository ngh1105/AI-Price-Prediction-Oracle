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
    cachedAccount = createAccount(privateKey)
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
  cachedAccount = createAccount(privateKey)
  
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
 */
export function exportPrivateKey(): string {
  if (typeof window === 'undefined') {
    throw new Error('Private key export only available in browser')
  }
  return getOrCreatePrivateKey()
}

/**
 * Import private key from backup
 */
export function importPrivateKey(privateKey: string): void {
  if (typeof window === 'undefined') {
    throw new Error('Private key import only available in browser')
  }

  // Validate private key format
  if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
    throw new Error('Invalid private key format. Must be 0x followed by 64 hex characters.')
  }

  // Test if private key is valid by creating account
  try {
    const testAccount = createAccount(privateKey)
    console.log('[glClientPrivateKey] Valid private key, address:', testAccount.address)
  } catch (error) {
    throw new Error('Invalid private key: ' + (error as Error).message)
  }

  // Store private key
  const STORAGE_KEY = 'genlayer_app_private_key'
  localStorage.setItem(STORAGE_KEY, privateKey)
  
  // Clear cache to force recreation with new key
  cachedClient = null
  cachedAccount = null
  
  console.log('[glClientPrivateKey] Private key imported successfully')
}

/**
 * Clear private key and client cache
 */
export function clearPrivateKeyCache() {
  cachedClient = null
  cachedAccount = null
}

/**
 * Check if private key exists in storage
 */
export function hasPrivateKey(): boolean {
  if (typeof window === 'undefined') return false
  const STORAGE_KEY = 'genlayer_app_private_key'
  return localStorage.getItem(STORAGE_KEY) !== null
}

