import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { getStoredSession, logout } from "../lib/auth";

const NAV_GROUPS = [
  {
    label: "Memory",
    items: [
      { to: "/",        label: "Dashboard", end: true },
      { to: "/vault",   label: "Vault" },
      { to: "/sessions",label: "Sessions" },
      { to: "/decisions",label: "Decisions" },
      { to: "/loops",   label: "Open Loops" },
    ],
  },
  {
    label: "Live",
    items: [
      { to: "/wire",  label: "Wire" },
      { to: "/tail",  label: "Live Tail" },
      { to: "/imp",   label: "IMP" },
    ],
  },
  {
    label: "Connectors",
    items: [
      { to: "/chat",   label: "ChatGPT" },
      { to: "/notion", label: "Notion" },
      { to: "/github", label: "GitHub" },
    ],
  },
  {
    label: "Work",
    items: [
      { to: "/tasks",      label: "Tasks" },
      { to: "/agents",     label: "Agents" },
      { to: "/dumbfiles",  label: "Dumb Files" },
    ],
  },
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = getStoredSession()?.user?.email;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  async function handleSignOut() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-950 text-slate-100">
      <aside className="fixed top-0 inset-x-0 z-50 shrink-0 bg-slate-900 border-b border-slate-800 md:sticky md:top-0 md:inset-x-auto md:z-auto md:w-56 md:h-screen md:self-start md:border-b-0 md:border-r md:flex md:flex-col">
        <div className="flex items-center justify-between px-4 py-4 md:py-5 md:border-b md:border-slate-800">
          <span className="text-base font-bold tracking-wide text-white">THE HUB</span>
          <button
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="md:hidden border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-500"
            aria-expanded={mobileMenuOpen}
            aria-controls="hub-navigation"
          >
            {mobileMenuOpen ? "Close" : "Menu"}
          </button>
        </div>

        <nav
          id="hub-navigation"
          className={`${mobileMenuOpen ? "flex" : "hidden"} flex-col overflow-y-auto border-t border-slate-800 bg-slate-900 md:flex md:flex-1 md:border-t-0 md:py-2`}
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="md:mb-1">
              <p className="px-4 pt-4 pb-1 text-xs font-semibold text-amber-400 uppercase tracking-wider md:px-3 md:pt-3">
                {group.label}
              </p>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={"end" in item ? item.end : undefined}
                  className={({ isActive }) =>
                    `px-4 py-2.5 text-sm whitespace-nowrap md:border-l-4 transition-colors block ${
                      isActive
                        ? "border-l-4 border-sky-400 bg-slate-800 text-white"
                        : "border-l-4 border-transparent text-slate-400 hover:text-white hover:bg-slate-800/60"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}

          <div className="px-4 py-4 border-t border-slate-800 md:hidden">
            <button
              onClick={handleSignOut}
              className="text-sm text-slate-400 hover:text-white underline underline-offset-4"
            >
              Sign out
            </button>
          </div>
        </nav>

        <div className="hidden md:block px-4 py-4 border-t border-slate-800">
          {email && <p className="text-xs text-slate-500 mb-2 break-all">{email}</p>}
          <button
            onClick={handleSignOut}
            className="text-sm text-slate-400 hover:text-white underline underline-offset-4"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 px-4 pb-4 pt-20 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
