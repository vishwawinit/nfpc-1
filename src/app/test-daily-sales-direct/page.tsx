'use client'

import { useEffect, useState } from 'react'

export default function TestDailySalesPage() {
  const [status, setStatus] = useState<string>('Testing...')
  const [results, setResults] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const testAPIs = async () => {
      const tests = [
        {
          name: 'Test Query (Simple COUNT)',
          url: '/api/daily-sales/test-query?startDate=2025-07-13&endDate=2025-11-17'
        },
        {
          name: 'Summary API',
          url: '/api/daily-sales/summary?startDate=2025-07-13&endDate=2025-11-17'
        },
        {
          name: 'Stores API',
          url: '/api/daily-sales/stores?startDate=2025-07-13&endDate=2025-11-17&limit=10'
        }
      ]

      const testResults: any[] = []

      for (const test of tests) {
        setStatus(`Testing: ${test.name}`)
        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 15000)
          
          const startTime = Date.now()
          const response = await fetch(test.url, { signal: controller.signal })
          const endTime = Date.now()
          clearTimeout(timeout)
          
          const data = await response.json()
          
          testResults.push({
            name: test.name,
            url: test.url,
            status: response.status,
            success: response.ok,
            executionTime: `${endTime - startTime}ms`,
            data: data
          })
        } catch (err) {
          testResults.push({
            name: test.name,
            url: test.url,
            status: 'ERROR',
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error'
          })
        }
      }

      setResults(testResults)
      setStatus('Tests Complete')
    }

    testAPIs()
  }, [])

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Daily Sales API Direct Test</h1>
      
      <div className="mb-4 p-4 bg-blue-100 rounded">
        <p className="font-semibold">Status: {status}</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 rounded text-red-800">
          <p className="font-semibold">Error:</p>
          <pre className="text-sm mt-2 whitespace-pre-wrap">{error}</pre>
        </div>
      )}

      {results && (
        <div className="space-y-4">
          {results.map((result: any, index: number) => (
            <div
              key={index}
              className={`p-4 rounded border-2 ${
                result.success
                  ? 'bg-green-50 border-green-500'
                  : 'bg-red-50 border-red-500'
              }`}
            >
              <h3 className="font-bold text-lg mb-2">{result.name}</h3>
              <p className="text-sm text-gray-600 mb-2">{result.url}</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="font-semibold">Status:</span> {result.status}
                </div>
                <div>
                  <span className="font-semibold">Time:</span> {result.executionTime}
                </div>
              </div>
              {result.error && (
                <div className="mt-2 p-2 bg-red-200 rounded">
                  <p className="font-semibold text-red-800">Error:</p>
                  <p className="text-sm text-red-700">{result.error}</p>
                </div>
              )}
              {result.data && (
                <details className="mt-2">
                  <summary className="cursor-pointer font-semibold">View Response Data</summary>
                  <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-96">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

