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
  // 
  // IMPORTANT: GenLayerJS SDK expects window.ethereum to be available for signing.
  // If we're using wagmi's provider wrapper, we need to ensure window.ethereum is set.
  const clientConfig: any = {
    chain: studionet,
    endpoint: resolveEndpoint(),
    account: address, // String address for MetaMask signing
  }
  
  // If provider is provided from wagmi, it should be using window.ethereum under the hood
  // But GenLayerJS SDK may need direct access to window.ethereum
  // Let's ensure window.ethereum is available
  if (typeof window !== 'undefined') {
    // If provider is provided and has request method, it's likely from wagmi
    // wagmi's walletClient.request should delegate to window.ethereum
    // But GenLayerJS SDK may need direct access, so we ensure window.ethereum exists
    if (provider && typeof provider.request === 'function') {
      // wagmi's provider is a wrapper - the actual provider should be window.ethereum
      // GenLayerJS SDK will auto-detect window.ethereum when account is a string
      console.log('[attachSigner] Creating client with address for MetaMask signing')
      console.log('[attachSigner] SDK will auto-detect window.ethereum for signing')
    }
  }
  
  cachedClient = createClient(clientConfig)
  
  // According to GenLayerJS docs, should initialize consensus before interacting with contracts
  // However, this is async and we can't make attachSigner async
  // So we'll initialize it lazily when needed, or call it explicitly before first write
  // For now, we'll skip it and let the SDK handle it automatically if needed
}

// Clear cache (useful for testing or when provider changes)
export function clearClientCache() {
  cachedClient = null
  cachedProvider = undefined
  cachedAddress = undefined
}

/**
 * Get or create local account (private key) for automatic transaction signing
 * This account is created automatically when the app loads and stored in localStorage
 * It's used for write operations (add symbol, submit prediction) to avoid MetaMask approval
 */
function getOrCreateLocalAccount(): Account {
  if (cachedLocalAccount) {
    return cachedLocalAccount
  }

  if (typeof window === 'undefined') {
    throw new Error('Local account only available in browser')
  }

  const STORAGE_KEY = 'genlayer_local_account_private_key'
  let privateKey = localStorage.getItem(STORAGE_KEY)

  if (!privateKey) {
    // Generate new private key automatically
    privateKey = generatePrivateKey()
    localStorage.setItem(STORAGE_KEY, privateKey)
    console.log('[glClient] Auto-generated local account private key')
    
    // Dispatch event for UI to show account address (optional)
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
 */
export function getLocalClient() {
  if (cachedLocalClient && cachedLocalAccount) {
    return cachedLocalClient
  }

  const account = getOrCreateLocalAccount()
  
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
 */
export function getLocalAccountAddress(): `0x${string}` {
  const account = getOrCreateLocalAccount()
  return account.address as `0x${string}`
}

/**
 * Check if local account exists
 */
export function hasLocalAccount(): boolean {
  if (typeof window === 'undefined') return false
  const STORAGE_KEY = 'genlayer_local_account_private_key'
  return localStorage.getItem(STORAGE_KEY) !== null
}

