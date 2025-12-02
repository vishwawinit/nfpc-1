'use client'

import { useState, Suspense, useEffect } from 'react'
import { DynamicWorkingDashboard } from '../components/pages/DynamicWorkingDashboard'
import { DailyStockSaleReport } from '../components/pages/DailyStockSaleReport'
import { StoreUserVisitReport } from '../components/pages/StoreUserVisitReport'
import { LMTDSecondaryReport } from '../components/pages/LMTDSecondaryReport'
import { CustomersReportUpdated as CustomersReport } from '../components/pages/CustomersReportUpdated'
import { ProductsReport } from '../components/pages/ProductsReport'
import { OrdersReport } from '../components/pages/OrdersReport'
import { ReturnsWastage } from '../components/pages/ReturnsWastage'
import {
  Menu,
  LayoutDashboard,
  Package,
  Users,
  MapPin,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  X,
  BarChart3,
  ShoppingCart,
  MessageSquare,
  AlertTriangle
} from 'lucide-react'

type PageType =
  | 'dashboard'
  | 'dailyStockSale'
  | 'storeUserVisit'
  | 'lmtdSecondary'
  | 'customersReport'
  | 'productsReport'
  | 'ordersReport'
  | 'returnsWastage'

interface MenuItem {
  id: PageType
  label: string
  icon: any
}

function HomePageContent() {
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard')
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  
  // Date state to prevent hydration mismatch
  const [currentDate, setCurrentDate] = useState<{
    fullDate: string
    weekday: string
    day: string
  }>({
    fullDate: '',
    weekday: '',
    day: ''
  })

  // Set date only on client side after hydration
  useEffect(() => {
    const now = new Date()
    setCurrentDate({
      fullDate: now.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }),
      weekday: now.toLocaleDateString('en-US', { weekday: 'long' }),
      day: now.toLocaleDateString('en-US', { day: 'numeric' })
    })
  }, [])

  const menuItems: MenuItem[] = [
    { id: 'dailyStockSale' as PageType, label: 'Daily Sales Report', icon: TrendingUp },
    { id: 'customersReport' as PageType, label: 'Customers Report', icon: Users },
    { id: 'returnsWastage' as PageType, label: 'Returns and Wastage', icon: AlertTriangle },
    { id: 'lmtdSecondary' as PageType, label: 'LMTD Secondary Sales Vs MTD', icon: BarChart3 },
    { id: 'storeUserVisit' as PageType, label: 'Store User Visit Report', icon: MapPin },
    { id: 'productsReport' as PageType, label: 'Products Report', icon: Package },
    { id: 'ordersReport' as PageType, label: 'Orders Report', icon: ShoppingCart },
  ]

  return (
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar - Desktop */}
        <aside
          className={`hidden md:flex flex-col bg-[#1e293b] border-r border-gray-700 shadow-lg transition-all duration-300 ease-in-out ${
            sidebarExpanded ? 'w-80' : 'w-20'
          }`}
        >
          {/* Sidebar Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-700 bg-[#1e293b]">
            {sidebarExpanded && (
              <div>
                <h1 className="text-xl font-bold text-white">
                  NFPC Analytics
                </h1>
                <p className="text-xs text-gray-400 mt-0.5">Reports Dashboard</p>
              </div>
            )}
            <button
              onClick={() => setSidebarExpanded(!sidebarExpanded)}
              className="p-2 hover:bg-slate-700 rounded-lg transition-all duration-200 ml-auto text-gray-400 hover:text-white"
              title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarExpanded ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
            </button>
          </div>

          {/* Sidebar Menu */}
          <nav className="flex-1 overflow-y-auto py-3 px-2">
            {/* Dashboard */}
            <button
              onClick={() => setCurrentPage('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 mb-2 rounded-lg transition-all duration-200 font-medium ${
                currentPage === 'dashboard'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-gray-300 hover:bg-slate-700/50'
              }`}
              title={!sidebarExpanded ? 'Dashboard' : ''}
            >
              <LayoutDashboard size={20} className="flex-shrink-0" />
              {sidebarExpanded && (
                <span className="text-sm font-semibold">Dashboard</span>
              )}
            </button>

            {/* Divider */}
            {sidebarExpanded && (
              <div className="my-3 border-t border-gray-700"></div>
            )}

            {/* Menu Items */}
            {menuItems.map((item) => {
              const ItemIcon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentPage(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 mb-1 rounded-lg transition-all duration-200 font-medium ${
                    currentPage === item.id
                      ? 'bg-slate-700 text-white shadow-sm'
                      : 'text-gray-300 hover:bg-slate-700/50'
                  }`}
                  title={!sidebarExpanded ? item.label : ''}
                >
                  <ItemIcon size={20} className="flex-shrink-0" />
                  {sidebarExpanded && (
                    <span className="text-sm font-semibold">{item.label}</span>
                  )}
                </button>
              )
            })}

            {/* AI Assistant - Under Orders Report */}
            <a
              href="/ask-ai"
              className="w-full flex items-center gap-3 px-4 py-3 mb-1 rounded-lg transition-all duration-200 font-medium text-gray-300 hover:bg-slate-700/50"
              title={!sidebarExpanded ? 'AI Assistant' : ''}
            >
              <svg className="flex-shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path>
                <path d="M5 3v4"></path>
                <path d="M19 17v4"></path>
                <path d="M3 5h4"></path>
                <path d="M17 19h4"></path>
              </svg>
              {sidebarExpanded && (
                <span className="text-sm font-semibold">AI Assistant</span>
              )}
            </a>
          </nav>

          {/* Sidebar Footer */}
          <div className="p-4 border-t border-gray-700 bg-[#1e293b]">
            <div className="text-xs text-gray-400 text-center">
              {sidebarExpanded ? (
                <div>
                  <div className="font-semibold text-gray-200">
                    {currentDate.fullDate || 'Loading...'}
                  </div>
                  <div className="mt-1 text-gray-400">
                    {currentDate.weekday || 'Loading...'}
                  </div>
                </div>
              ) : (
                <div className="font-semibold text-gray-200">
                  {currentDate.day || '...'}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="md:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-lg hover:bg-gray-100"
        >
          <Menu size={24} />
        </button>

        {/* Mobile Sidebar Overlay */}
        {mobileSidebarOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-black bg-opacity-50" onClick={() => setMobileSidebarOpen(false)} />
        )}

        {/* Mobile Sidebar */}
        <aside
          className={`md:hidden fixed left-0 top-0 bottom-0 z-50 w-80 bg-[#1e293b] shadow-2xl transform transition-transform duration-300 ${
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Mobile Sidebar Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-700 bg-[#1e293b]">
            <div>
              <h1 className="text-xl font-bold text-white">
                NFPC Analytics
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">Reports Dashboard</p>
            </div>
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-gray-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          {/* Mobile Menu Items */}
          <nav className="flex-1 overflow-y-auto py-3 px-2">
            <button
              onClick={() => {
                setCurrentPage('dashboard')
                setMobileSidebarOpen(false)
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 mb-2 rounded-lg transition-all font-medium ${
                currentPage === 'dashboard'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-gray-300 hover:bg-slate-700/50'
              }`}
            >
              <LayoutDashboard size={20} className="flex-shrink-0" />
              <span className="text-sm font-semibold">Dashboard</span>
            </button>

            <div className="my-3 border-t border-gray-700"></div>

            {/* Mobile Menu Items */}
            {menuItems.map((item) => {
              const ItemIcon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentPage(item.id)
                    setMobileSidebarOpen(false)
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 mb-1 rounded-lg transition-all font-medium ${
                    currentPage === item.id
                      ? 'bg-slate-700 text-white shadow-sm'
                      : 'text-gray-300 hover:bg-slate-700/50'
                  }`}
                >
                  <ItemIcon size={20} className="flex-shrink-0" />
                  <span className="text-sm font-semibold">{item.label}</span>
                </button>
              )
            })}

            {/* AI Assistant - Under Orders Report */}
            <a
              href="/ask-ai"
              className="w-full flex items-center gap-3 px-4 py-3 mb-1 rounded-lg transition-all font-medium text-gray-300 hover:bg-slate-700/50"
              onClick={() => setMobileSidebarOpen(false)}
            >
              <svg className="flex-shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path>
                <path d="M5 3v4"></path>
                <path d="M19 17v4"></path>
                <path d="M3 5h4"></path>
                <path d="M17 19h4"></path>
              </svg>
              <span className="text-sm font-semibold">AI Assistant</span>
            </a>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto bg-slate-50">
          {currentPage === 'dashboard' && <DynamicWorkingDashboard />}
          {currentPage === 'dailyStockSale' && <DailyStockSaleReport />}
          {currentPage === 'storeUserVisit' && <StoreUserVisitReport />}
          {currentPage === 'lmtdSecondary' && <LMTDSecondaryReport />}
          {currentPage === 'customersReport' && <CustomersReport />}
          {currentPage === 'productsReport' && <ProductsReport />}
          {currentPage === 'ordersReport' && <OrdersReport />}
          {currentPage === 'returnsWastage' && <ReturnsWastage />}
        </main>
      </div>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <HomePageContent />
    </Suspense>
  )
}