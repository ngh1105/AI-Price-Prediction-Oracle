import { NextResponse } from 'next/server'
import { getClient, getContractAddress } from '@/lib/glClient'
import { readContract } from '@/lib/contract'

export async function GET() {
  try {
    const contractAddress = getContractAddress()
    
    // Check if contract address is valid
    if (!contractAddress || contractAddress === '0x1111111111111111111111111111111111111111') {
      return NextResponse.json(
        { 
          status: 'unhealthy', 
          error: 'Contract address not configured',
          timestamp: new Date().toISOString()
        },
        { status: 503 }
      )
    }

    // Try to read from contract
    try {
      const symbols = await readContract('list_symbols', [])
      const symbolCount = Array.isArray(symbols) ? symbols.length : 0
      
      return NextResponse.json({
        status: 'healthy',
        contractAddress,
        symbolCount,
        timestamp: new Date().toISOString(),
      })
    } catch (error: any) {
      return NextResponse.json(
        {
          status: 'unhealthy',
          error: error?.message || 'Failed to read contract',
          contractAddress,
          timestamp: new Date().toISOString(),
        },
        { status: 503 }
      )
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}

