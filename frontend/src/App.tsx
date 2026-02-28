import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Landing from './pages/Landing'
import Pay from './pages/Pay'
import Progress from './pages/Progress'
import Success from './pages/Success'
import PaymentFailed from './pages/PaymentFailed'
import MerchantDashboard from './pages/MerchantDashboard'
import Storefront from './pages/Storefront'
import Receipt from './pages/Receipt'
import SubscriptionAuth from './pages/SubscriptionAuth'

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-fin-bg">
      <Navbar />
      <main>{children}</main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/pay"
          element={
            <AppLayout>
              <Pay />
            </AppLayout>
          }
        />
        <Route
          path="/progress/:jobId"
          element={
            <AppLayout>
              <Progress />
            </AppLayout>
          }
        />
        <Route
          path="/success/:jobId"
          element={
            <AppLayout>
              <Success />
            </AppLayout>
          }
        />
        <Route
          path="/failed/:jobId"
          element={
            <AppLayout>
              <PaymentFailed />
            </AppLayout>
          }
        />
        <Route
          path="/merchant"
          element={
            <AppLayout>
              <MerchantDashboard />
            </AppLayout>
          }
        />
        <Route
          path="/store/:slug"
          element={
            <AppLayout>
              <Storefront />
            </AppLayout>
          }
        />
        <Route
          path="/receipt/:jobId"
          element={
            <AppLayout>
              <Receipt />
            </AppLayout>
          }
        />
        <Route
          path="/subscribe/:subscriptionId"
          element={
            <AppLayout>
              <SubscriptionAuth />
            </AppLayout>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
