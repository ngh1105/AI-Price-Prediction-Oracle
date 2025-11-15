import { createClient, createAccount, generatePrivateKey } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import type { EIP1193Provider } from 'viem'
import type { Account } from 'genlayer-js/types'

const resolveEndpoint = () => process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || 'https://studio.genlayer.com/api'

// Singleton GenLayer client for consistency across reads/writes
// Cache client instances to avoid recreating them
let cachedClient: ReturnType<typeof createClient> | null = null
let cachedProvider: EIP1193Provider | undefined = undefined
let cachedAddress: `0x${string}` | undefined = undefined

// Local account (private key) for automatic transaction signing
let cachedLocalAccount: Account | null = null
let cachedLocalClient: ReturnType<typeof createClient> | null = null

export function getClient() {
  // Return cached client if available and no provider/address change
  if (cachedClient && !cachedProvider && !cachedAddress) {
    return cachedClient
  }
  
  // Create new client only if needed
  if (!cachedClient) {
    cachedClient = createClient({ chain: studionet, endpoint: resolveEndpoint() })
  }
  
  return cachedClient
}

export function attachSigner(provider?: EIP1193Provider, address?: `0x${string}`) {
  // Only recreate client if provider or address changed
  if (cachedProvider === provider && cachedAddress === address && cachedClient) {
    return // No change, reuse existing client
  }
  
  // Update cache
  cachedProvider = provider
  cachedAddress = address
  
  // According to GenLayerJS docs:
  // - For MetaMask/external wallets: pass just the address string as 'account'
  // - The SDK will automatically use window.ethereum if available
  // - For direct signing with private key: pass account object from createAccount()
  // 
  // However, when using wagmi's walletClient, the provider object may be a wrapper
  // around window.ethereum. The SDK needs window.ethereum to be directly accessible.
  const clientConfig: any = {
    chain: studionet,
    endpoint: resolveEndpoint(),
    account: address, // String address for MetaMask signing
  }
  
  // Include provider in clientConfig if provided
  if (provider) {
    clientConfig.provider = provider
  }
  
  // Fallback: ensure window.ethereum is available if SDK truly requires a global
  // This is gated behind typeof window check and provider existence
  if (typeof window !== 'undefined' && provider && typeof provider.request === 'function') {
    // If SDK requires window.ethereum as a global, set it as fallback
    // Note: GenLayerJS SDK should work with provider in config, but this is a safety net
    if (!(window as any).ethereum && provider) {
      console.log('[attachSigner] Setting window.ethereum as fallback for SDK compatibility')
      ;(window as any).ethereum = provider
    }
  }
  
  cachedClient = createClient(clientConfig)
  
  // According to GenLayerJS docs, should initialize consensus before interacting with contracts
  // However, this is async and we can't make attachSigner async
  // So we'll initialize it lazily when needed, or call it explicitly before first write
  // For now, we'll skip it and let the SDK handle it automatically if needed
}

/**
 * Delete local account (private key) from localStorage and clear caches
 * This removes the persisted private key and resets in-memory caches
 */
export function deleteLocalAccount() {
  if (typeof window === 'undefined') return
  
  const STORAGE_KEY = 'genlayer_local_account_private_key'
  localStorage.removeItem(STORAGE_KEY)
  cachedLocalAccount = null
  cachedLocalClient = null
  console.log('[glClient] Local account deleted from storage and cache cleared')
}

// Clear cache (useful for testing or when provider changes)
export function clearClientCache() {
  cachedClient = null
  cachedProvider = undefined
  cachedAddress = undefined
  
  // Also clear local account cache and storage
  deleteLocalAccount()
}

/**
 * Get or create local account (private key) for automatic transaction signing
 * This account is stored in localStorage (unencrypted) and used for write operations
 * 
 * SECURITY WARNING: Private key is stored unencrypted in localStorage.
 * For production, implement passphrase-based encryption (see README).
 * 
 * @param requireConsent - If true, will throw if user hasn't consented (UI should handle consent first)
 */
function getOrCreateLocalAccount(requireConsent: boolean = false): Account {
  if (cachedLocalAccount) {
    return cachedLocalAccount
  }

  if (typeof window === 'undefined') {
    throw new Error('Local account only available in browser')
  }

  const STORAGE_KEY = 'genlayer_local_account_private_key'
  const CONSENT_KEY = 'genlayer_local_account_consent_given'
  let privateKey = localStorage.getItem(STORAGE_KEY)

  if (!privateKey) {
    // Check if user has consented (if consent is required)
    if (requireConsent) {
      const hasConsented = localStorage.getItem(CONSENT_KEY) === 'true'
      if (!hasConsented) {
        throw new Error('User consent required before creating local account. Please show consent UI first.')
      }
    }
    
    // Generate new private key
    privateKey = generatePrivateKey()
    localStorage.setItem(STORAGE_KEY, privateKey)
    localStorage.setItem(CONSENT_KEY, 'true') // Mark consent as given
    console.log('[glClient] Generated new local account private key (user consent given)')
    
    // Dispatch event for UI to show account address
    if (typeof window !== 'undefined') {
      const account = createAccount(privateKey as `0x${string}`)
      window.dispatchEvent(new CustomEvent('localAccountCreated', { 
        detail: { address: account.address } 
      }))
    }
  }

  cachedLocalAccount = createAccount(privateKey as `0x${string}`)
  console.log('[glClient] Local account address:', cachedLocalAccount.address)
  return cachedLocalAccount
}

/**
 * Get client with local account (private key) for write operations
 * This is faster than MetaMask because it doesn't require user approval
 * 
 * @param requireConsent - If true, will throw if user hasn't consented
 */
export function getLocalClient(requireConsent: boolean = false) {
  if (cachedLocalClient && cachedLocalAccount) {
    return cachedLocalClient
  }

  const account = getOrCreateLocalAccount(requireConsent)
  
  cachedLocalClient = createClient({
    chain: studionet,
    endpoint: resolveEndpoint(),
    account: account, // Account object for direct signing
  })

  console.log('[glClient] Created local client with account:', account.address)
  return cachedLocalClient
}

/**
 * Get local account address (for display in UI)
 * This will create the account if it doesn't exist (with consent check)
 */
export function getLocalAccountAddress(requireConsent: boolean = false): `0x${string}` {
  const account = getOrCreateLocalAccount(requireConsent)
  return account.address as `0x${string}`
}

/**
 * Check if user has consented to local account creation
 */
export function hasLocalAccountConsent(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('genlayer_local_account_consent_given') === 'true'
}

/**
 * Mark user consent for local account creation
 */
export function setLocalAccountConsent(consented: boolean) {
  if (typeof window === 'undefined') return
  if (consented) {
    localStorage.setItem('genlayer_local_account_consent_given', 'true')
  } else {
    localStorage.removeItem('genlayer_local_account_consent_given')
    // Also delete the account if consent is revoked
    deleteLocalAccount()
  }
}

/**
 * Check if local account exists
 */
export function hasLocalAccount(): boolean {
  if (typeof window === 'undefined') return false
  const STORAGE_KEY = 'genlayer_local_account_private_key'
  return localStorage.getItem(STORAGE_KEY) !== null
}

