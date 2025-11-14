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
          error: 'Contract address not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local',
          contractAddress: contractAddress || 'not set',
          timestamp: new Date().toISOString()
        },
        { status: 503 }
      )
    }

    // Try to read from contract
    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Health check timeout after 10 seconds')), 10000)
      )
      
      const symbolsPromise = readContract('list_symbols', [])
      const symbols = await Promise.race([symbolsPromise, timeoutPromise]) as any
      
      const symbolCount = Array.isArray(symbols) ? symbols.length : 0
      
      return NextResponse.json({
        status: 'healthy',
        contractAddress,
        symbolCount,
        timestamp: new Date().toISOString(),
      })
    } catch (error: any) {
      // Provide more detailed error information
      const errorMessage = error?.message || String(error) || 'Failed to read contract'
      const errorString = errorMessage.toLowerCase()
      
      const isNetworkError = errorString.includes('network') || 
                            errorString.includes('fetch') || 
                            errorString.includes('econnrefused') ||
                            errorString.includes('timeout') ||
                            errorString.includes('failed to fetch')
      const isContractError = errorString.includes('contract') || 
                             errorString.includes('address') ||
                             errorString.includes('not found')
      
      console.error('[Health Check] Error:', errorMessage, error)
      
      return NextResponse.json(
        {
          status: 'unhealthy',
          error: errorMessage,
          errorType: isNetworkError ? 'network' : isContractError ? 'contract' : 'unknown',
          contractAddress,
          suggestion: isNetworkError 
            ? 'Check RPC URL configuration (NEXT_PUBLIC_GENLAYER_RPC_URL) and network connectivity'
            : isContractError
            ? 'Verify contract address is correct and deployed on GenLayer network'
            : 'Check browser console and server logs for more details',
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
        errorType: 'unknown',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}

