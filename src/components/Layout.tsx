import { NavLink, Outlet, useNavigate } from "react-router-dom";
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
      { to: "/room",  label: "Room" },
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
  const email = getStoredSession()?.user?.email;

  async function handleSignOut() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-950 text-slate-100">
      <aside className="md:w-52 md:min-h-screen shrink-0 bg-slate-900 border-b md:border-b-0 md:border-r border-slate-800 flex md:flex-col">
        <div className="px-4 py-4 md:py-5 border-r md:border-r-0 md:border-b border-slate-800">
          <span className="text-base font-bold tracking-wide text-white">THE HUB</span>
        </div>

        <nav className="flex md:flex-col flex-1 overflow-x-auto overflow-y-auto md:py-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="md:mb-1">
              <p className="hidden md:block px-3 pt-3 pb-1 text-xs font-semibold text-slate-600 uppercase tracking-wider">
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
                        ? "border-sky-400 bg-slate-800 text-white md:border-l-4"
                        : "border-transparent text-slate-400 hover:text-white hover:bg-slate-800/60 md:border-l-4 md:border-transparent"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
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
          className="md:hidden px-4 py-3 text-sm text-slate-400 hover:text-white border-l border-slate-800"
        >
          Sign out
        </button>
      </aside>

      <main className="flex-1 min-w-0 p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
