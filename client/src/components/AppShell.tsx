import { Outlet } from "react-router-dom";
import { TabBar } from "./TabBar";

export function AppShell() {
  return (
    <div className="app-shell">
      <TabBar />
      <div className="page-scroll">
        <div className="page-scroll-inner">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
