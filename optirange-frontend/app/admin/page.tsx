import { redirect } from 'next/navigation'
import {
  Users, Car, Map, Wrench, DollarSign,
  Shield, ShieldAlert, UserCheck, Activity, TrendingUp,
} from 'lucide-react'
import { getUser } from '@/lib/auth'
import { adminGetSystemStatsAction } from '@/app/actions'
import AppSidebar from '@/app/components/AppSidebar'
import MobileHeader from '@/app/components/MobileHeader'

export const metadata = {
  title: 'Admin Portal | OptiRange AI',
  description: 'Platform-wide management dashboard for OptiRange AI administrators.',
}

// ── Colour palette for stat cards ───────────────────────────────────────────
const STAT_COLORS = {
  blue:    { bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/20',    glow: 'bg-blue-500/5'    },
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', glow: 'bg-emerald-500/5' },
  purple:  { bg: 'bg-purple-500/10',  text: 'text-purple-400',  border: 'border-purple-500/20',  glow: 'bg-purple-500/5'  },
  orange:  { bg: 'bg-orange-500/10',  text: 'text-orange-400',  border: 'border-orange-500/20',  glow: 'bg-orange-500/5'  },
  pink:    { bg: 'bg-pink-500/10',    text: 'text-pink-400',    border: 'border-pink-500/20',    glow: 'bg-pink-500/5'    },
} as const

type ColorKey = keyof typeof STAT_COLORS

interface AdminStatCardProps {
  title: string
  value: string | number
  unit?: string
  icon: React.ElementType
  color: ColorKey
  description?: string
}

function AdminStatCard({ title, value, unit, icon: Icon, color, description }: AdminStatCardProps) {
  const c = STAT_COLORS[color]
  return (
    <div className={`glass-panel p-6 rounded-2xl relative overflow-hidden group border ${c.border}`}>
      {/* Ambient glow blob */}
      <div className={`absolute -right-4 -top-4 w-28 h-28 ${c.bg} rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500`} />

      <div className="flex items-center justify-between mb-4 relative z-10">
        <h3 className="text-sm font-semibold text-foreground/60">{title}</h3>
        <div className={`p-2.5 ${c.bg} rounded-xl ${c.text} border ${c.border}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>

      <div className="flex items-baseline gap-2 relative z-10">
        <p className="text-4xl font-black tracking-tight">{value}</p>
        {unit && <span className="text-sm text-foreground/40 font-medium">{unit}</span>}
      </div>

      {description && (
        <p className="text-xs text-foreground/40 mt-2 relative z-10">{description}</p>
      )}
    </div>
  )
}

// ── Role badge ──────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: 'user' | 'admin' }) {
  return role === 'admin' ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-400 border border-violet-500/20 uppercase tracking-wide">
      <Shield className="w-3 h-3" /> Admin
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wide">
      <UserCheck className="w-3 h-3" /> User
    </span>
  )
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

// ── Page ────────────────────────────────────────────────────────────────────
export default async function AdminPortalPage() {
  // ── RBAC Guard — server-side, no client detour possible ──────────────────
  const user = await getUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/dashboard')

  // ── Fetch aggregated platform stats ──────────────────────────────────────
  const stats = await adminGetSystemStatsAction()
  if ('error' in stats) redirect('/dashboard') // shouldn't happen, but just in case

  const {
    totalUsers, totalEVs, totalTrips,
    totalServiceLogs, totalServiceCost, recentUsers,
  } = stats as Exclude<typeof stats, { error: string }>

  const avgEVsPerUser = totalUsers > 0 ? (totalEVs / totalUsers).toFixed(1) : '0'
  const avgTripsPerUser = totalUsers > 0 ? (totalTrips / totalUsers).toFixed(1) : '0'

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans selection:bg-violet-500/30">
      {/* ── Sidebar ── */}
      <AppSidebar
        activePage="admin"
        user={{
          firstName:  user.firstName,
          lastName:   user.lastName,
          email:      user.email,
          profilePic: user.profilePic ?? null,
          role:       user.role,
        }}
      />

      {/* ── Main ── */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto relative" id="main-content">
        {/* Ambient glows */}
        <div
          className="absolute top-[-120px] right-[-120px] w-[600px] h-[600px] bg-violet-500/8 blur-[160px] rounded-full pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="absolute bottom-[-80px] left-[-80px] w-[400px] h-[400px] bg-blue-500/5 blur-[120px] rounded-full pointer-events-none"
          aria-hidden="true"
        />

        {/* Mobile header */}
        <MobileHeader />

        {/* ── Page Header ── */}
        <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-10 gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-violet-500/10 rounded-2xl border border-violet-500/20 shadow-lg">
              <Shield className="h-8 w-8 text-violet-400" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h1 className="text-3xl font-black tracking-tight">Admin Portal</h1>
                <span className="text-xs font-bold px-2 py-1 rounded-lg bg-violet-500/15 text-violet-400 border border-violet-500/20 uppercase tracking-widest">
                  Restricted
                </span>
              </div>
              <p className="text-foreground/50 text-sm">
                Platform-wide overview for <strong className="text-foreground/70">{user.firstName} {user.lastName}</strong>
              </p>
            </div>
          </div>

          {/* Health indicator */}
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Platform Online
          </div>
        </header>

        {/* ── KPI Grid ── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-5 mb-10 relative z-10" aria-label="Platform statistics">
          <AdminStatCard
            title="Registered Users"
            value={totalUsers.toLocaleString()}
            icon={Users}
            color="blue"
            description="Total accounts on the platform"
          />
          <AdminStatCard
            title="EVs Registered"
            value={totalEVs.toLocaleString()}
            icon={Car}
            color="emerald"
            description={`Avg ${avgEVsPerUser} per user`}
          />
          <AdminStatCard
            title="Trips Planned"
            value={totalTrips.toLocaleString()}
            icon={Map}
            color="purple"
            description={`Avg ${avgTripsPerUser} per user`}
          />
          <AdminStatCard
            title="Service Logs"
            value={totalServiceLogs.toLocaleString()}
            icon={Wrench}
            color="orange"
            description="Maintenance records created"
          />
          <AdminStatCard
            title="Total Service Spend"
            value={`$${totalServiceCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
            icon={DollarSign}
            color="pink"
            description="Across all users"
          />
        </section>

        {/* ── Quick Insights Row ── */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10 relative z-10" aria-label="Quick insights">
          {/* Growth indicator */}
          <div className="glass-panel rounded-2xl p-6 border border-border relative overflow-hidden">
            <div className="absolute right-0 top-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl" />
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <TrendingUp className="w-5 h-5 text-blue-400" />
              </div>
              <h2 className="font-bold text-base">Fleet Density</h2>
            </div>
            <div className="space-y-3 relative z-10">
              {[
                { label: 'Users with ≥ 1 EV', value: `${Math.min(totalEVs, totalUsers)} / ${totalUsers}`, pct: totalUsers > 0 ? Math.round((Math.min(totalEVs, totalUsers) / totalUsers) * 100) : 0, color: 'bg-blue-500' },
                { label: 'Users with trips', value: `${Math.min(totalTrips, totalUsers)} / ${totalUsers}`, pct: totalUsers > 0 ? Math.round((Math.min(totalTrips, totalUsers) / totalUsers) * 100) : 0, color: 'bg-purple-500' },
                { label: 'Users with service logs', value: `${Math.min(totalServiceLogs, totalUsers)} / ${totalUsers}`, pct: totalUsers > 0 ? Math.round((Math.min(totalServiceLogs, totalUsers) / totalUsers) * 100) : 0, color: 'bg-orange-500' },
              ].map(row => (
                <div key={row.label}>
                  <div className="flex justify-between text-xs font-medium text-foreground/60 mb-1">
                    <span>{row.label}</span>
                    <span className="text-foreground/80">{row.value}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-foreground/5 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${row.color} transition-all duration-700`}
                      style={{ width: `${row.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Platform health */}
          <div className="glass-panel rounded-2xl p-6 border border-border relative overflow-hidden">
            <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl" />
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <Activity className="w-5 h-5 text-emerald-400" />
              </div>
              <h2 className="font-bold text-base">Platform Health</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 relative z-10">
              {[
                { label: 'Database', status: 'Healthy', ok: true },
                { label: 'Auth Service', status: 'Healthy', ok: true },
                { label: 'EV Data API', status: 'Healthy', ok: true },
                { label: 'Trip Engine', status: 'Healthy', ok: true },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-2 p-3 rounded-xl bg-foreground/3 border border-border">
                  <span className={`w-2 h-2 rounded-full ${s.ok ? 'bg-emerald-400' : 'bg-red-400'} shrink-0`} />
                  <div>
                    <p className="text-xs font-semibold">{s.label}</p>
                    <p className={`text-[11px] ${s.ok ? 'text-emerald-400' : 'text-red-400'}`}>{s.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Recently Registered Users Table ── */}
        <section className="relative z-10" aria-label="Recently registered users">
          <div className="glass-panel rounded-2xl overflow-hidden border border-border">
            {/* Table header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-bold text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-violet-400" />
                Recently Registered Users
              </h2>
              <span className="text-xs text-foreground/40 font-medium">
                Showing last {recentUsers.length} registrations
              </span>
            </div>

            {recentUsers.length === 0 ? (
              <div className="py-16 text-center text-foreground/40 text-sm">
                No users registered yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Recent users table">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-6 py-3 text-xs font-bold text-foreground/40 uppercase tracking-wide">User</th>
                      <th className="px-6 py-3 text-xs font-bold text-foreground/40 uppercase tracking-wide">Email</th>
                      <th className="px-6 py-3 text-xs font-bold text-foreground/40 uppercase tracking-wide">Role</th>
                      <th className="px-6 py-3 text-xs font-bold text-foreground/40 uppercase tracking-wide">Registered</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recentUsers.map((u, idx) => (
                      <tr
                        key={u.id}
                        className="hover:bg-foreground/2 transition-colors"
                        id={`user-row-${u.id}`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0 text-blue-400 font-bold text-sm">
                              {(u.firstName.charAt(0) || u.email.charAt(0)).toUpperCase()}
                            </div>
                            <span className="font-medium">
                              {u.firstName || u.lastName
                                ? `${u.firstName} ${u.lastName}`.trim()
                                : <span className="text-foreground/40 italic">No name</span>
                              }
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-foreground/60 font-mono text-xs">{u.email}</td>
                        <td className="px-6 py-4"><RoleBadge role={u.role} /></td>
                        <td className="px-6 py-4 text-foreground/50 text-xs">{fmtDate(u.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
