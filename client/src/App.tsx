import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppShell } from "./components/AppShell";

// Auth pages
import { Login }    from "./pages/Login";
import { Register } from "./pages/Register";

// Tab pages
import { Home }      from "./pages/Home";
import { Inventory } from "./pages/Inventory";
import { Scan }      from "./pages/Scan";
import { Jobs }      from "./pages/Jobs";
import { More }      from "./pages/More";

// Inventory sub-pages
import { ItemDetail } from "./pages/inventory/ItemDetail";
import { AddItem }    from "./pages/inventory/AddItem";

// Sets sub-pages
import { Sets }        from "./pages/sets/Sets";
import { SetDetail }   from "./pages/sets/SetDetail";

// Jobs
import { CreateJob }   from "./pages/jobs/CreateJob";
import { JobDetail }   from "./pages/jobs/JobDetail";

// Labels
import { PrintLabels } from "./pages/labels/PrintLabels";

// Scan sub-pages
import { QuickScan }  from "./pages/scan/QuickScan";
import { ScanOut }    from "./pages/scan/ScanOut";
import { ScanReturn } from "./pages/scan/ScanReturn";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected — wrapped in AppShell (tab bar) */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/home"                  element={<Home />} />
              <Route path="/inventory"             element={<Inventory />} />
              <Route path="/inventory/new"         element={<AddItem />} />
              <Route path="/inventory/:id"         element={<ItemDetail />} />
              <Route path="/scan"                  element={<Scan />} />
              <Route path="/scan/quick"            element={<QuickScan />} />
              <Route path="/scan/out/:jobId"       element={<ScanOut />} />
              <Route path="/scan/return/:jobId"    element={<ScanReturn />} />
              <Route path="/jobs"                  element={<Jobs />} />
              <Route path="/jobs/new"              element={<CreateJob />} />
              <Route path="/jobs/:id"              element={<JobDetail />} />
              <Route path="/more"                  element={<More />} />
              <Route path="/sets"                  element={<Sets />} />
              <Route path="/sets/:id"              element={<SetDetail />} />
              <Route path="/labels"                element={<PrintLabels />} />
            </Route>
          </Route>

          <Route path="/"  element={<Navigate to="/home"  replace />} />
          <Route path="*"  element={<Navigate to="/home"  replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
