import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthProvider";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { ScrollToTop } from "@/components/ScrollToTop";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";

// Cada rota vira um arquivo próprio: quem abre o login não baixa mais a sala
// de reunião, os gráficos e o renderizador de markdown junto (auditoria P2
// item 19). A divisão por rota se soma ao manualChunks do vite.config.ts.
const LoginPage = lazy(() => import("./pages/LoginPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const MeetingsPage = lazy(() => import("./pages/MeetingsPage"));
const MeetingDetailPage = lazy(() => import("./pages/MeetingDetailPage"));
const ActionItemsPage = lazy(() => import("./pages/ActionItemsPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const ContactsPage = lazy(() => import("./pages/ContactsPage"));
const RecordingsPage = lazy(() => import("./pages/RecordingsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const MeetingRoomPage = lazy(() => import("./pages/MeetingRoomPage"));
const JoinMeetingPage = lazy(() => import("./pages/JoinMeetingPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const RedefinirSenhaPage = lazy(() => import("./pages/RedefinirSenhaPage"));
import { AppHooks } from "./components/AppHooks";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const queryClient = new QueryClient();

/** Exibido enquanto o arquivo da rota é buscado. */
const CarregandoRota = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <ScrollToTop />
              <AppHooks />
              <Suspense fallback={<CarregandoRota />}>
                <Routes>
                <Route path="/login" element={<LoginPage />} />
                {/* Pública de propósito: o link do e-mail traz uma sessão de
                    recuperação, e o ProtectedRoute mandaria para o onboarding. */}
                <Route path="/redefinir-senha" element={<RedefinirSenhaPage />} />
                {/* Onboarding wizard (full-screen, no sidebar) */}
                <Route
                  path="/onboarding"
                  element={
                    <ProtectedRoute>
                      <OnboardingPage />
                    </ProtectedRoute>
                  }
                />
                {/* Full-screen meeting room (no sidebar/topbar) */}
                <Route
                  path="/meetings/:id/room"
                  element={
                    <ProtectedRoute>
                      <MeetingRoomPage />
                    </ProtectedRoute>
                  }
                />
                {/* Public guest join page */}
                <Route path="/join/:id" element={<JoinMeetingPage />} />
                <Route
                  element={
                    <ProtectedRoute>
                      <AppLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/meetings" element={<MeetingsPage />} />
                  <Route path="/meetings/:id" element={<MeetingDetailPage />} />
                  <Route path="/action-items" element={<ActionItemsPage />} />
                  <Route path="/contacts" element={<ContactsPage />} />
                  <Route path="/recordings" element={<RecordingsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
                <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
