'use client'

import '@rainbow-me/rainbowkit/styles.css'
import { getDefaultConfig, RainbowKitProvider, darkTheme, lightTheme } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { studionet } from 'genlayer-js/chains'
import { useEffect } from 'react'
import { WagmiProvider, useAccount, useSwitchChain } from 'wagmi'

const rpcUrl = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || 'https://studio.genlayer.com/api'

const chain = {
  ...studionet,
  rpcUrls: { default: { http: [rpcUrl] } },
}

const projectId =
  (process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ||
    '0000000000000000000000000000000000000000000000000000000000000000').trim()

const wagmiConfig = getDefaultConfig({
  appName: 'AI Price Prediction Oracle',
  projectId,
  chains: [chain],
  ssr: true,
})

const queryClient = new QueryClient()

function AutoSwitchChain() {
  const { isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  useEffect(() => {
    if (!isConnected) return
    if (chainId === chain.id) return
    if (typeof window === 'undefined' || !(window as any).ethereum) return

    const ensure = async () => {
      try {
        await switchChain({ chainId: chain.id })
      } catch {
        const chainIdHex = `0x${chain.id.toString(16)}`
        try {
          await (window as any).ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: chainIdHex,
                chainName: chain.name,
                nativeCurrency: chain.nativeCurrency,
                rpcUrls: chain.rpcUrls.default.http,
                blockExplorerUrls: chain.blockExplorers?.default?.url ? [chain.blockExplorers.default.url] : [],
              },
            ],
          })
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chainIdHex }],
          })
        } catch {}
      }
    }

    ensure()
  }, [isConnected, chainId, switchChain])

  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={chain}
          theme={darkTheme({
            accentColor: '#10b981', // accent green
            accentColorForeground: '#000000',
            borderRadius: 'large',
            fontStack: 'system',
            overlayBlur: 'small',
          })}
          modalSize="compact"
        >
          <AutoSwitchChain />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

