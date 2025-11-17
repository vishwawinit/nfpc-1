'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default function DiagnosePage() {
  const [step, setStep] = useState(1)
  const [results, setResults] = useState<any>({})
  const [loading, setLoading] = useState(false)

  const runDiagnostic = async (url: string, name: string) => {
    setLoading(true)
    try {
      const response = await fetch(url)
      const data = await response.json()
      setResults((prev: any) => ({ ...prev, [name]: { status: response.status, data } }))
      return data
    } catch (error: any) {
      setResults((prev: any) => ({ ...prev, [name]: { status: 'error', error: error.message } }))
      return null
    } finally {
      setLoading(false)
    }
  }

  const step1 = async () => {
    await runDiagnostic('/api/verify-database-structure', 'dbStructure')
    setStep(2)
  }

  const step2 = async () => {
    const dbData = results.dbStructure?.data
    if (dbData?.availableDateRange) {
      const { minDate, maxDate } = dbData.availableDateRange
      const mid = new Date((new Date(minDate).getTime() + new Date(maxDate).getTime()) / 2)
      const testStart = mid.toISOString().split('T')[0]
      const testEnd = maxDate
      
      await runDiagnostic(`/api/daily-sales/debug?startDate=${testStart}&endDate=${testEnd}`, 'debug')
    }
    setStep(3)
  }

  const step3 = async () => {
    const debugData = results.debug?.data
    if (debugData?.availableDateRange) {
      const { minDate, maxDate } = debugData.availableDateRange
      const mid = new Date((new Date(minDate).getTime() + new Date(maxDate).getTime()) / 2)
      const testStart = mid.toISOString().split('T')[0]
      const testEnd = maxDate
      
      await Promise.all([
        runDiagnostic(`/api/daily-sales/summary?startDate=${testStart}&endDate=${testEnd}`, 'summary'),
        runDiagnostic(`/api/daily-sales/trend?startDate=${testStart}&endDate=${testEnd}`, 'trend'),
        runDiagnostic(`/api/daily-sales/products?startDate=${testStart}&endDate=${testEnd}`, 'products'),
        runDiagnostic(`/api/daily-sales/stores?startDate=${testStart}&endDate=${testEnd}`, 'stores'),
      ])
    }
    setStep(4)
  }

  useEffect(() => {
    step1()
  }, [])

  const StatusBadge = ({ status }: { status: number | string }) => {
    if (status === 200) return <Badge className="bg-green-500">✓ OK</Badge>
    if (status === 'error') return <Badge className="bg-red-500">✗ Error</Badge>
    if (status >= 500) return <Badge className="bg-red-500">✗ {status}</Badge>
    return <Badge className="bg-yellow-500">⚠ {status}</Badge>
  }

  return (
    <div className="p-8 space-y-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold">🔍 System Diagnostic</h1>
      <p className="text-gray-600">Running automated tests to identify data issues...</p>

      {/* Progress */}
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`h-2 flex-1 rounded ${step >= s ? 'bg-blue-500' : 'bg-gray-200'}`} />
        ))}
      </div>

      {/* Step 1: Database Structure */}
      <Card className={step >= 1 ? '' : 'opacity-50'}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Step 1: Database Structure Check
            {results.dbStructure && <StatusBadge status={results.dbStructure.status} />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {results.dbStructure?.data ? (
            <div className="space-y-2">
              <p><strong>Transaction Table:</strong> {results.dbStructure.data.transactionTable?.using}</p>
              <p><strong>Total Records:</strong> {results.dbStructure.data.dataStats?.total_records?.toLocaleString()}</p>
              <p><strong>Date Range:</strong> {results.dbStructure.data.availableDateRange?.minDate} to {results.dbStructure.data.availableDateRange?.maxDate}</p>
              <p><strong>Unique Dates:</strong> {results.dbStructure.data.availableDateRange?.uniqueDates}</p>
              
              {results.dbStructure.data.recommendations?.map((rec: string, i: number) => (
                <p key={i} className="text-sm">{rec}</p>
              ))}

              {step === 1 && (
                <Button onClick={step2} className="mt-4">Continue to Step 2 →</Button>
              )}
            </div>
          ) : (
            <p>Loading...</p>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Query Test */}
      {step >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Step 2: Query Test
              {results.debug && <StatusBadge status={results.debug.status} />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {results.debug?.data ? (
              <div className="space-y-2">
                <p><strong>Test Date Range:</strong> {results.debug.data.params?.startDate} to {results.debug.data.params?.endDate}</p>
                <p><strong>Records in Range:</strong> {results.debug.data.recordsInRange?.toLocaleString()}</p>
                
                {results.debug.data.summaryData && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                    <div className="p-3 bg-blue-50 rounded">
                      <p className="text-xs text-gray-600">Orders</p>
                      <p className="text-xl font-bold">{results.debug.data.summaryData.orders}</p>
                    </div>
                    <div className="p-3 bg-green-50 rounded">
                      <p className="text-xs text-gray-600">Stores</p>
                      <p className="text-xl font-bold">{results.debug.data.summaryData.stores}</p>
                    </div>
                    <div className="p-3 bg-purple-50 rounded">
                      <p className="text-xs text-gray-600">Users</p>
                      <p className="text-xl font-bold">{results.debug.data.summaryData.users}</p>
                    </div>
                    <div className="p-3 bg-orange-50 rounded">
                      <p className="text-xs text-gray-600">Sales</p>
                      <p className="text-xl font-bold">{results.debug.data.summaryData.totalSales?.toFixed(0)}</p>
                    </div>
                  </div>
                )}

                {results.debug.data.recommendations?.map((rec: string, i: number) => (
                  <p key={i} className="text-sm">{rec}</p>
                ))}

                {step === 2 && (
                  <Button onClick={step3} className="mt-4">Continue to Step 3 →</Button>
                )}
              </div>
            ) : (
              <p>Loading...</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: API Endpoint Tests */}
      {step >= 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 3: API Endpoint Tests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {['summary', 'trend', 'products', 'stores'].map((api) => (
                <div key={api} className="flex items-center justify-between p-3 border rounded">
                  <span className="font-medium">/api/daily-sales/{api}</span>
                  {results[api] ? (
                    <>
                      <StatusBadge status={results[api].status} />
                      {results[api].data && (
                        <span className="text-sm text-gray-600">
                          {api === 'summary' && `${results[api].data.totalOrders || 0} orders`}
                          {api === 'trend' && `${results[api].data.trend?.length || 0} days`}
                          {api === 'products' && `${results[api].data.products?.length || 0} products`}
                          {api === 'stores' && `${results[api].data.stores?.length || 0} stores`}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-400">Waiting...</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Final Results */}
      {step >= 4 && (
        <Card className="border-green-500 bg-green-50">
          <CardHeader>
            <CardTitle>✅ Diagnostic Complete</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <h3 className="font-bold text-lg">Summary:</h3>
              
              {results.dbStructure?.data?.dataStats?.total_records > 0 ? (
                <div className="space-y-2">
                  <p className="text-green-600">✓ Database has {results.dbStructure.data.dataStats.total_records.toLocaleString()} records</p>
                  
                  {results.debug?.data?.recordsInRange > 0 ? (
                    <>
                      <p className="text-green-600">✓ Queries return data successfully</p>
                      
                      {results.summary?.data?.totalOrders > 0 ? (
                        <div className="p-4 bg-white rounded border-2 border-green-500">
                          <p className="font-bold text-green-600 mb-2">🎉 ALL SYSTEMS WORKING!</p>
                          <p className="text-sm">Your database and APIs are functioning correctly.</p>
                          <p className="text-sm mt-2"><strong>Recommended Date Range:</strong></p>
                          <p className="text-sm font-mono bg-gray-100 p-2 rounded mt-1">
                            {results.debug.data.params.startDate} to {results.debug.data.params.endDate}
                          </p>
                          <p className="text-sm mt-2 text-gray-600">Use this date range in the Daily Sales Report page.</p>
                          <Button 
                            className="mt-4"
                            onClick={() => window.location.href = '/'}>
                            Go to Dashboard →
                          </Button>
                        </div>
                      ) : (
                        <div className="p-4 bg-yellow-50 rounded border-2 border-yellow-500">
                          <p className="font-bold text-yellow-700">⚠️ APIs return empty data</p>
                          <p className="text-sm">Data exists but summary shows 0 values. This might be a column mapping issue.</p>
                          <Button 
                            className="mt-4"
                            onClick={() => {
                              const dbgData = JSON.stringify(results.debug?.data, null, 2)
                              navigator.clipboard.writeText(dbgData)
                              alert('Debug data copied! Please paste this in your message.')
                            }}>
                            Copy Debug Info
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="p-4 bg-yellow-50 rounded border-2 border-yellow-500">
                      <p className="font-bold text-yellow-700">⚠️ No data in test date range</p>
                      <p className="text-sm">Database has records but not in the tested dates.</p>
                      <p className="text-sm mt-2"><strong>Available dates:</strong> {results.dbStructure.data.availableDateRange?.minDate} to {results.dbStructure.data.availableDateRange?.maxDate}</p>
                      <p className="text-sm mt-2 text-gray-600">Pick a date range between these dates on the Daily Sales page.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-red-50 rounded border-2 border-red-500">
                  <p className="font-bold text-red-700">❌ No data in database</p>
                  <p className="text-sm">The database table exists but contains no records.</p>
                  <p className="text-sm mt-2">Please check if data has been imported/loaded.</p>
                </div>
              )}

              <details className="mt-4">
                <summary className="cursor-pointer font-bold">View Raw Diagnostic Data</summary>
                <pre className="mt-2 p-4 bg-gray-100 rounded overflow-auto text-xs max-h-96">
                  {JSON.stringify(results, null, 2)}
                </pre>
              </details>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg">
            <p className="text-lg">Running diagnostic...</p>
          </div>
        </div>
      )}
    </div>
  )
}

