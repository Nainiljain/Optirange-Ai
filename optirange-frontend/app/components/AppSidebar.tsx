import Link from "next/link"
import { Zap, Map, Activity, Settings2, LogOut } from "lucide-react"
import { logoutAction } from "@/app/actions"

/** Sidebar navigation items — single source of truth for both pages */
const NAV_ITEMS = [
  { href: "/dashboard",    label: "Overview",       icon: Activity, page: "dashboard" as const },
  { href: "/trip-planner", label: "Trip Planner",   icon: Map,      page: "trip-planner" as const },
  { href: "/ev-setup",     label: "Add Vehicle",    icon: Settings2, page: "ev-setup" as const },
  { href: "/health-setup", label: "Health Profile",  icon: Activity, page: "health-setup" as const },
] as const

interface AppSidebarProps {
  activePage: "dashboard" | "trip-planner" | "ev-setup" | "health-setup"
  user: { name: string; email: string; profilePic?: string | null }
}

/**
 * Shared sidebar used across dashboard and trip-planner pages.
 * Provides consistent navigation, user card, and logout action.
 */
export default function AppSidebar({ activePage, user }: AppSidebarProps) {
  return (
    <aside
      className="hidden md:flex w-64 flex-col border-r border-border bg-card/50 backdrop-blur-xl p-6 z-20"
      aria-label="Sidebar"
    >
      {/* ── Brand ── */}
      <Link href="/" className="flex items-center gap-2 mb-12 hover:opacity-80 transition-opacity">
        <Zap className="h-6 w-6 text-blue-500" aria-hidden="true" />
        <span className="text-xl font-bold tracking-tight">OptiRange</span>
      </Link>

      {/* ── Navigation ── */}
      <nav className="flex-1 space-y-2" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const isActive = item.page === activePage
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "flex items-center gap-3 px-3 py-2.5 rounded-xl bg-blue-500/10 text-blue-500 font-medium border border-blue-500/20"
                  : "flex items-center gap-3 px-3 py-2.5 rounded-xl text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
              }
            >
              <Icon className="h-5 w-5" aria-hidden="true" /> {item.label}
            </Link>
          )
        })}
      </nav>

      {/* ── Footer: Logout + User card ── */}
      <div className="mt-auto">
        <form action={logoutAction} className="mt-4">
          <button
            type="submit"
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-red-500 hover:bg-red-500/10 transition-colors"
            aria-label="Sign out of your account"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" /> Sign Out
          </button>
        </form>

        <div className="flex items-center gap-3 p-3 mt-4 rounded-xl bg-secondary border border-border">
          {user.profilePic ? (
            <img
              src={user.profilePic}
              alt={`${user.name}'s profile photo`}
              className="w-10 h-10 rounded-full object-cover shrink-0 border border-border"
            />
          ) : (
            <div
              className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              <span className="font-semibold text-blue-500">{user.name.charAt(0)}</span>
            </div>
          )}
          <div className="overflow-hidden">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-foreground/50 truncate">{user.email}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
