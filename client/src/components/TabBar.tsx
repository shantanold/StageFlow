import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Icon } from "./b2";

const HomeIcon = () => <Icon.Home />;
const InventoryIcon = () => <Icon.Box />;
const ScanIcon = () => <Icon.Scan />;
const JobsIcon = () => <Icon.Briefcase />;
const MoreIcon = () => <Icon.More />;
const OrgsIcon = () => <Icon.Building />;
const ScheduleIcon = () => <Icon.Calendar />;
const SetsIcon = () => <Icon.Sets />;
const ReportsIcon = () => <Icon.Chart />;

// ─── Component ────────────────────────────────────────────────────────────────

export function TabBar() {
  const location = useLocation();
  const isScan = location.pathname === "/scan" || location.pathname.startsWith("/scan/");

  const { isAdminMode } = useAuth();

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `tab-item${isActive ? " active" : ""}`;
  const desktopTabClass = ({ isActive }: { isActive: boolean }) =>
    `tab-item tab-desktop-only${isActive ? " active" : ""}`;

  // Platform admins (outside any org) get a birds-eye set of tabs instead of
  // one org's Inventory / Scan / Jobs.
  if (isAdminMode) {
    return (
      <nav className="tab-bar" aria-label="Main">
        <div className="tab-brand">Stagemigo Admin</div>
        <NavLink to="/home" className={tabClass}>
          <HomeIcon />
          Overview
        </NavLink>
        <NavLink to="/admin/organizations" className={tabClass}>
          <OrgsIcon />
          Orgs
        </NavLink>
        <NavLink to="/admin/items" className={tabClass}>
          <InventoryIcon />
          Furniture
        </NavLink>
        <NavLink to="/admin/jobs" className={tabClass}>
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

  return (
    <nav className="tab-bar" aria-label="Main">
      <div className="tab-brand">Stagemigo</div>

      <NavLink to="/home" className={tabClass}>
        <HomeIcon />
        Home
      </NavLink>

      <NavLink to="/inventory" className={tabClass}>
        <InventoryIcon />
        Inventory
      </NavLink>

      <NavLink
        to="/scan"
        className={`tab-scan-link${isScan ? " active" : ""}`}
        aria-label="Scan"
      >
        <ScanIcon />
        <span className="tab-scan-label">Scan</span>
      </NavLink>

      <NavLink to="/jobs" className={tabClass}>
        <JobsIcon />
        Jobs
      </NavLink>

      {/* Desktop sidebar only — on mobile these live in the More tab. */}
      <NavLink to="/schedule" className={desktopTabClass}>
        <ScheduleIcon />
        Schedule
      </NavLink>

      <NavLink to="/sets" className={desktopTabClass}>
        <SetsIcon />
        Sets
      </NavLink>

      <NavLink to="/reports" className={desktopTabClass}>
        <ReportsIcon />
        Reports
      </NavLink>

      <NavLink to="/more" className={tabClass}>
        <MoreIcon />
        More
      </NavLink>
    </nav>
  );
}
