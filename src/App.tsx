import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Activity } from "./pages/Activity";
import { Dashboard } from "./pages/Dashboard";
import { Landing } from "./pages/Landing";
import { LoopDetail } from "./pages/LoopDetail";
import { NewLoop } from "./pages/NewLoop";
import { Settings } from "./pages/Settings";

/**
 * Routing.
 *
 * The landing page sells the product; everything under /app is the workspace
 * where outcomes are handed over and watched.
 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/app"
        element={
          <AppShell>
            <Dashboard />
          </AppShell>
        }
      />
      <Route
        path="/app/new"
        element={
          <AppShell>
            <NewLoop />
          </AppShell>
        }
      />
      <Route
        path="/app/loops/:id"
        element={
          <AppShell>
            <LoopDetail />
          </AppShell>
        }
      />
      <Route
        path="/app/activity"
        element={
          <AppShell>
            <Activity />
          </AppShell>
        }
      />
      <Route
        path="/app/settings"
        element={
          <AppShell>
            <Settings />
          </AppShell>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
