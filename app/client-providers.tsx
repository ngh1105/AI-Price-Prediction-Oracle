'use client'

import dynamic from 'next/dynamic'

const Providers = dynamic(() => import('./providers').then(mod => ({ default: mod.Providers })), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '18px',
        color: '#7a7a7a',
      }}
    >
      Loading GenLayer client...
    </div>
  ),
})

export default Providers

