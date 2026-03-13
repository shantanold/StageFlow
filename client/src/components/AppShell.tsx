import { Outlet } from "react-router-dom";
import { TabBar } from "./TabBar";

export function AppShell() {
  return (
    <div className="app-shell">
      <div className="page-scroll">
        <Outlet />
      </div>
      <TabBar />
    </div>
  );
}
