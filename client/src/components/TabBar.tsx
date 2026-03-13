import { NavLink, useLocation } from "react-router-dom";

// ─── Inline SVG icons ────────────────────────────────────────────────────────

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function InventoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
      <path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z" />
      <path d="M12 12v4M10 14h4" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
      <rect x="7" y="7" width="10" height="10" rx="1" />
      <path d="M7 12h10" />
    </svg>
  );
}

function JobsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
      <path d="M12 12v4M10 14h4" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TabBar() {
  const location = useLocation();
  const isScan = location.pathname === "/scan";

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `tab-item${isActive ? " active" : ""}`;

  return (
    <nav className="tab-bar">
      <NavLink to="/home" className={tabClass}>
        <HomeIcon />
        Home
      </NavLink>

      <NavLink to="/inventory" className={tabClass}>
        <InventoryIcon />
        Inventory
      </NavLink>

      {/* Centre scan button */}
      <NavLink to="/scan" style={{ textDecoration: "none" }}>
        <div className={`tab-scan-btn${isScan ? " ring-2 ring-white/20" : ""}`}>
          <ScanIcon />
        </div>
      </NavLink>

      <NavLink to="/jobs" className={tabClass}>
        <JobsIcon />
        Jobs
      </NavLink>

      <NavLink to="/more" className={tabClass}>
        <MoreIcon />
        More
      </NavLink>
    </nav>
  );
}
