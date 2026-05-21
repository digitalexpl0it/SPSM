import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { SolarThrobber } from "./components/SolarThrobber";
import { useAuth } from "./lib/auth";
import { DashboardPage } from "./pages/DashboardPage";
import { InvertersPage } from "./pages/InvertersPage";
import { LoginPage } from "./pages/LoginPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SystemPage } from "./pages/SystemPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <SolarThrobber label="Loading…" />
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireSetup({ children }: { children: React.ReactNode }) {
  const { setupRequired } = useAuth();
  if (setupRequired) return <Navigate to="/settings" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route
          path="/"
          element={
            <RequireSetup>
              <DashboardPage />
            </RequireSetup>
          }
        />
        <Route
          path="/inverters"
          element={
            <RequireSetup>
              <InvertersPage />
            </RequireSetup>
          }
        />
        <Route
          path="/system"
          element={
            <RequireSetup>
              <SystemPage />
            </RequireSetup>
          }
        />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
