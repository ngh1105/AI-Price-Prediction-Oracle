import { createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import type { GenLayerClient } from 'genlayer-js/types'

export function getGenLayerClient(provider?: any): GenLayerClient<any> {
  const rpcUrl = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || 'https://studio.genlayer.com/api'
  const chain = {
    ...studionet,
    rpcUrls: { default: { http: [rpcUrl] } },
  }

  return createClient({
    chain,
    provider,
  })
}

