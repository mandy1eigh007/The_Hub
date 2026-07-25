import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { getStoredSession, logout } from "../lib/auth";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/vault", label: "Vault" },
  { to: "/sessions", label: "Sessions" },
  { to: "/decisions", label: "Decisions" },
  { to: "/loops", label: "Open Loops" },
];

export default function Layout() {
  const navigate = useNavigate();
  const email = getStoredSession()?.user?.email;

  async function handleSignOut() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-950 text-slate-100">
      <aside className="md:w-56 md:min-h-screen shrink-0 bg-slate-900 border-b md:border-b-0 md:border-r border-slate-800 flex md:flex-col">
        <div className="px-4 py-4 md:py-6 border-r md:border-r-0 md:border-b border-slate-800">
          <span className="text-lg font-bold tracking-wide text-white">THE HUB</span>
        </div>
        <nav className="flex md:flex-col flex-1 overflow-x-auto">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `px-4 py-3 text-sm whitespace-nowrap border-l-2 md:border-l-4 transition-colors ${
                  isActive
                    ? "border-sky-400 bg-slate-800 text-white"
                    : "border-transparent text-slate-400 hover:text-white hover:bg-slate-800"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
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
        <button
          onClick={handleSignOut}
          className="md:hidden px-4 py-3 text-sm text-slate-400 hover:text-white"
        >
          Sign out
        </button>
      </aside>
      <main className="flex-1 min-w-0 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
