import { createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import type { EIP1193Provider } from 'viem'

const resolveEndpoint = () => process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || 'https://studio.genlayer.com/api'

let client = createClient({
  chain: studionet,
  endpoint: resolveEndpoint(),
})

export function getClient() {
  return client
}

export function attachSigner(provider?: EIP1193Provider, address?: `0x${string}`) {
  client = createClient({
    chain: studionet,
    endpoint: resolveEndpoint(),
    provider,
    account: address,
  })
}

