import Link from "next/link"
import { Zap, Map, Activity, Settings2, LogOut, Wrench, Shield } from "lucide-react"
import { logoutAction } from "@/app/actions"

/** Sidebar navigation items — single source of truth for all authenticated pages */
const NAV_ITEMS = [
  { href: "/dashboard",    label: "Overview",       icon: Activity,  page: "dashboard"    as const },
  { href: "/trip-planner", label: "Trip Planner",   icon: Map,       page: "trip-planner" as const },
  { href: "/service",      label: "Service Logs",   icon: Wrench,    page: "service"      as const },
  { href: "/ev-setup",     label: "Add Vehicle",    icon: Settings2, page: "ev-setup"     as const },
  { href: "/health-setup", label: "Health Profile", icon: Activity,  page: "health-setup" as const },
] as const

interface AppSidebarProps {
  activePage: "dashboard" | "trip-planner" | "service" | "ev-setup" | "health-setup" | "profile" | "admin"
  user: {
    firstName:  string
    lastName:   string
    email:      string
    profilePic?: string | null
    /** RBAC role — controls Admin Portal link visibility */
    role?: "user" | "admin"
  }
}

/**
 * Shared sidebar used across all authenticated pages.
 * Provides navigation, user card, conditional admin link, and logout.
 */
export default function AppSidebar({ activePage, user }: AppSidebarProps) {
  const isAdmin = user.role === "admin"

  return (
    <aside
      className="hidden md:flex w-64 flex-col border-r border-border bg-card/50 backdrop-blur-xl p-6 z-20"
      aria-label="Sidebar"
    >
      {/* ── Brand ── */}
      <Link href="/" className="flex items-center gap-2 mb-6 hover:opacity-80 transition-opacity">
        <Zap className="h-6 w-6 text-blue-500" aria-hidden="true" />
        <span className="text-xl font-bold tracking-tight">OptiRange</span>
      </Link>

      {/* ── User Profile Card ── */}
      <Link
        href="/profile"
        className="flex items-center gap-3 p-3 mb-6 rounded-xl border border-transparent hover:bg-secondary hover:border-border transition-all group"
        aria-label="Go to profile settings"
      >
        {user.profilePic ? (
          <img
            src={user.profilePic}
            alt={`${user.firstName}'s profile photo`}
            className="w-10 h-10 rounded-full object-cover shrink-0 border border-border"
          />
        ) : (
          <div
            className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <span className="font-semibold text-blue-500">{user.firstName.charAt(0)}</span>
          </div>
        )}
        <div className="overflow-hidden flex-1">
          <p className="text-sm font-medium truncate flex items-center gap-1.5">
            {user.firstName} {user.lastName}
            {isAdmin && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/20 uppercase tracking-wide">
                Admin
              </span>
            )}
          </p>
          <p className="text-xs text-foreground/50 truncate">{user.email}</p>
        </div>
      </Link>

      {/* ── Main Navigation ── */}
      <nav className="flex-1 space-y-1" aria-label="Main navigation">
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

        {/* ── Admin Portal link — only for admins ── */}
        {isAdmin && (
          <>
            <div className="my-3 border-t border-border" role="separator" />
            <Link
              href="/admin"
              aria-current={activePage === "admin" ? "page" : undefined}
              className={
                activePage === "admin"
                  ? "flex items-center gap-3 px-3 py-2.5 rounded-xl bg-violet-500/10 text-violet-400 font-medium border border-violet-500/20"
                  : "flex items-center gap-3 px-3 py-2.5 rounded-xl text-violet-400/70 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
              }
              id="admin-portal-nav-link"
            >
              <Shield className="h-5 w-5" aria-hidden="true" />
              Admin Portal
            </Link>
          </>
        )}
      </nav>

      {/* ── Footer: Logout ── */}
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
      </div>
    </aside>
  )
}
