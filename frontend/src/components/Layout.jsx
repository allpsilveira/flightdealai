import { Outlet } from "react-router-dom";
import GlobalHeader from "./GlobalHeader";

export default function Layout() {
  return (
    <div className="flex flex-col min-h-screen bg-sand-50 dark:bg-zinc-950">
      <GlobalHeader />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
