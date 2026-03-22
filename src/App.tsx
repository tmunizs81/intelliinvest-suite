import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useLicense } from "@/hooks/useLicense";
import AppLayout from "@/components/layout/AppLayout";
import BlockedScreen from "@/components/BlockedScreen";
import { lazy, Suspense } from "react";
import PWAInstallPrompt from "./components/PWAInstallPrompt";
import SessionExpiredModal from "./components/SessionExpiredModal";
import { Loader2 } from "lucide-react";

// Lazy load all pages for code splitting
const Index = lazy(() => import("./pages/Index"));
const Assets = lazy(() => import("./pages/Assets"));
const Analysis = lazy(() => import("./pages/Analysis"));
const AITrader = lazy(() => import("./pages/AITrader"));
const Taxes = lazy(() => import("./pages/Taxes"));
const Dividends = lazy(() => import("./pages/Dividends"));
const Reports = lazy(() => import("./pages/Reports"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const Login = lazy(() => import("./pages/Login"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const FamilyPortfolio = lazy(() => import("./pages/FamilyPortfolio"));
const Manual = lazy(() => import("./pages/Manual"));
const Comparator = lazy(() => import("./pages/Comparator"));

const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,       // 5 min — data stays fresh
      gcTime: 30 * 60 * 1000,         // 30 min — garbage collection
      refetchOnWindowFocus: false,    // don't refetch on tab focus
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { status, loading: licenseLoading, isBlocked } = useLicense();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (licenseLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isBlocked) return <BlockedScreen status={status} />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <PWAInstallPrompt />
      <BrowserRouter>
        <AuthProvider>
          <SessionExpiredModal />
          <Routes>
            {/* Protected routes with sidebar layout */}
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<Suspense fallback={<PageLoader />}><Index /></Suspense>} />
              <Route path="/assets" element={<Suspense fallback={<PageLoader />}><Assets /></Suspense>} />
              <Route path="/reports" element={<Suspense fallback={<PageLoader />}><Reports /></Suspense>} />
              <Route path="/analysis" element={<Suspense fallback={<PageLoader />}><Analysis /></Suspense>} />
              <Route path="/ai-trader" element={<Suspense fallback={<PageLoader />}><AITrader /></Suspense>} />
              <Route path="/taxes" element={<Suspense fallback={<PageLoader />}><Taxes /></Suspense>} />
              <Route path="/dividends" element={<Suspense fallback={<PageLoader />}><Dividends /></Suspense>} />
              <Route path="/settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
              <Route path="/family" element={<Suspense fallback={<PageLoader />}><FamilyPortfolio /></Suspense>} />
              <Route path="/comparator" element={<Suspense fallback={<PageLoader />}><Comparator /></Suspense>} />
              <Route path="/manual" element={<Suspense fallback={<PageLoader />}><Manual /></Suspense>} />
              <Route path="/asset/:ticker" element={<Suspense fallback={<PageLoader />}><Analysis /></Suspense>} />
            </Route>

            {/* Public routes */}
            <Route path="/login" element={<PublicRoute><Suspense fallback={<PageLoader />}><Login /></Suspense></PublicRoute>} />
            <Route path="/forgot-password" element={<PublicRoute><Suspense fallback={<PageLoader />}><ForgotPassword /></Suspense></PublicRoute>} />
            <Route path="/reset-password" element={<Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>} />
            <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFound /></Suspense>} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
