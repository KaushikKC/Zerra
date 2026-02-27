import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Landing from './pages/Landing'
import Pay from './pages/Pay'
import Review from './pages/Review'
import Progress from './pages/Progress'
import Success from './pages/Success'

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
          path="/review"
          element={
            <AppLayout>
              <Review />
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
      </Routes>
    </BrowserRouter>
  )
}
