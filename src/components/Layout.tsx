import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { getStoredSession, logout } from "../lib/auth";

const NAV_GROUPS = [
  {
    label: "Today",
    items: [
      { to: "/tasks", label: "Tasks" },
      { to: "/tail", label: "Live Tail" },
      { to: "/agents", label: "Agents" },
    ],
  },
  {
    label: "Conversations",
    items: [
      { to: "/wire",  label: "Wire" },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { to: "/vault", label: "Vault" },
      { to: "/sessions", label: "Sessions" },
      { to: "/decisions", label: "Decisions" },
      { to: "/loops", label: "Open Loops" },
      { to: "/imp", label: "IMP" },
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
    label: "Tools",
    items: [
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
    <div className="min-h-screen bg-[#08060d] text-slate-100">
      <aside className="fixed top-3 inset-x-3 z-50 shrink-0 overflow-hidden rounded-[24px] border border-[rgba(226,232,240,0.16)] bg-[rgba(22,7,30,0.4)] shadow-2xl shadow-black/30 backdrop-blur-[5px] min-[480px]:inset-y-3 min-[480px]:left-3 min-[480px]:right-auto min-[480px]:z-40 min-[480px]:h-auto min-[480px]:w-48 min-[480px]:flex min-[480px]:flex-col sm:w-56 md:w-64">
        <div className="flex items-center justify-between border-b border-[rgba(226,232,240,0.16)] px-4 py-4 min-[480px]:py-5">
          <NavLink
            to="/"
            end
            className="text-base font-bold tracking-wide text-white hover:text-violet-200"
          >
            THE HUB
          </NavLink>
          <button
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="min-[480px]:hidden border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-500"
            aria-expanded={mobileMenuOpen}
            aria-controls="hub-navigation"
          >
            {mobileMenuOpen ? "Close" : "Index"}
          </button>
        </div>

        <nav
          id="hub-navigation"
          className={`${mobileMenuOpen ? "flex" : "hidden"} flex-col overflow-y-auto bg-transparent min-[480px]:flex min-[480px]:flex-1 min-[480px]:py-3`}
        >
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `mx-3 mb-2 block border px-3 py-3 text-sm font-semibold uppercase tracking-[0.14em] transition-colors ${
                isActive
                  ? "border-violet-300/60 bg-violet-400/15 text-white"
                  : "border-[rgba(226,232,240,0.16)] bg-white/[0.04] text-slate-200 hover:border-violet-300/50 hover:bg-white/[0.08] hover:text-white"
              }`
            }
          >
            Home
          </NavLink>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="min-[480px]:mb-1">
              <p className="px-4 pt-4 pb-1 text-xs font-semibold text-amber-400 uppercase tracking-wider min-[480px]:px-4 min-[480px]:pt-3">
                {group.label}
              </p>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `block whitespace-nowrap px-4 py-2.5 text-sm transition-colors min-[480px]:border-l-4 ${
                      isActive
                        ? "border-l-4 border-violet-300 bg-violet-400/15 text-white"
                        : "border-l-4 border-transparent text-slate-300 hover:bg-white/[0.06] hover:text-white"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}

          <div className="px-4 py-4 border-t border-slate-800 min-[480px]:hidden">
            <button
              onClick={handleSignOut}
              className="text-sm text-slate-400 hover:text-white underline underline-offset-4"
            >
              Sign out
            </button>
          </div>
        </nav>

        <div className="hidden border-t border-[rgba(226,232,240,0.16)] px-4 py-4 min-[480px]:block">
          {email && <p className="text-xs text-slate-500 mb-2 break-all">{email}</p>}
          <button
            onClick={handleSignOut}
            className="text-sm text-slate-400 hover:text-white underline underline-offset-4"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 px-4 pb-4 pt-24 min-[480px]:ml-52 min-[480px]:min-h-screen min-[480px]:px-6 min-[480px]:py-6 sm:ml-64 md:ml-72">
        <Outlet />
      </main>
    </div>
  );
}
