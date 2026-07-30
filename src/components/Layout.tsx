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
      { to: "/room",  label: "Room" },
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
      <aside className="fixed top-3 inset-x-3 z-50 shrink-0 overflow-hidden rounded-[24px] border border-[rgba(226,232,240,0.16)] bg-[rgba(22,7,30,0.4)] shadow-2xl shadow-black/30 backdrop-blur-[5px] md:inset-y-3 md:left-3 md:right-auto md:z-40 md:h-auto md:w-64 md:flex md:flex-col">
        <div className="flex items-center justify-between border-b border-[rgba(226,232,240,0.16)] px-4 py-4 md:py-5">
          <NavLink
            to="/"
            end
            className="text-base font-bold tracking-wide text-white hover:text-violet-200"
          >
            THE HUB
          </NavLink>
          <button
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="md:hidden border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-500"
            aria-expanded={mobileMenuOpen}
            aria-controls="hub-navigation"
          >
            {mobileMenuOpen ? "Close" : "Index"}
          </button>
        </div>

        <nav
          id="hub-navigation"
          className={`${mobileMenuOpen ? "flex" : "hidden"} flex-col overflow-y-auto bg-transparent md:flex md:flex-1 md:py-3`}
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
            <div key={group.label} className="md:mb-1">
              <p className="px-4 pt-4 pb-1 text-xs font-semibold text-amber-400 uppercase tracking-wider md:px-4 md:pt-3">
                {group.label}
              </p>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `block whitespace-nowrap px-4 py-2.5 text-sm transition-colors md:border-l-4 ${
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

          <div className="px-4 py-4 border-t border-slate-800 md:hidden">
            <button
              onClick={handleSignOut}
              className="text-sm text-slate-400 hover:text-white underline underline-offset-4"
            >
              Sign out
            </button>
          </div>
        </nav>

        <div className="hidden border-t border-[rgba(226,232,240,0.16)] px-4 py-4 md:block">
          {email && <p className="text-xs text-slate-500 mb-2 break-all">{email}</p>}
          <button
            onClick={handleSignOut}
            className="text-sm text-slate-400 hover:text-white underline underline-offset-4"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 px-4 pb-4 pt-24 md:ml-72 md:min-h-screen md:px-6 md:py-6">
        <Outlet />
      </main>
    </div>
  );
}
