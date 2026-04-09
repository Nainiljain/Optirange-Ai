import Link from "next/link"
import { redirect } from "next/navigation"
import { Zap, Map, Battery, Clock, ChevronRight, Activity, Calendar, ArrowRight, Settings2, LogOut } from "lucide-react"
import { getUser } from "@/lib/auth"
import { connectDB } from "@/lib/db"
import { EvData, HealthData, Trip } from "@/lib/models"
import { logoutAction } from "@/app/actions"

export default async function Dashboard() {
  const user = await getUser()
  if (!user) {
    redirect('/login')
  }

  await connectDB()
  const evData = await EvData.findOne({ userId: user.id }).lean() as any
  if (!evData) {
    redirect('/ev-setup')
  }

  const healthData = await HealthData.findOne({ userId: user.id }).lean() as any
  if (!healthData) {
    redirect('/health-setup')
  }

  const trips = await Trip.find({ userId: user.id }).sort({ createdAt: -1 }).limit(5).lean() as any[]

  const totalInteractions = trips.length
  const totalDistance = trips.reduce((acc, t) => acc + t.distance, 0).toFixed(0)
  const totalBatteryUsed = trips.reduce((acc, t) => acc + t.batteryUsed, 0).toFixed(1)

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans selection:bg-blue-500/30">
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-card/50 backdrop-blur-xl p-6 z-20">
        <Link href="/" className="flex items-center gap-2 mb-12 hover:opacity-80 transition-opacity">
          <Zap className="h-6 w-6 text-blue-500" />
          <span className="text-xl font-bold tracking-tight">OptiRange</span>
        </Link>

        <nav className="flex-1 space-y-2">
          <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-blue-500/10 text-blue-500 font-medium border border-blue-500/20">
            <Activity className="h-5 w-5" />
            Overview
          </Link>
          <Link href="/trip-planner" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors">
            <Map className="h-5 w-5" />
            Trip Planner
          </Link>
          <Link href="/ev-setup" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors">
            <Settings2 className="h-5 w-5" />
            Car Setup
          </Link>
          <Link href="/health-setup" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors">
            <Activity className="h-5 w-5" />
            Health Profile
          </Link>
        </nav>

        <div className="mt-auto">
          <form action={logoutAction} className="mt-4">
            <button className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-red-500 hover:bg-red-500/10 transition-colors">
              <LogOut className="h-5 w-5" />
              Sign Out
            </button>
          </form>
          <div className="flex items-center gap-3 p-3 mt-4 rounded-xl bg-secondary border border-border">
            {user.profilePic ? (
              <img src={user.profilePic} alt={user.name} className="w-10 h-10 rounded-full object-cover shrink-0 border border-border" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
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

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto relative">
        <div className="absolute top-[-100px] right-[-100px] w-[500px] h-[500px] bg-blue-500/10 blur-[120px] rounded-full pointer-events-none" />

        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between mb-8 relative z-10">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Zap className="h-6 w-6 text-blue-500" />
            <span className="text-xl font-bold">OptiRange</span>
          </Link>
          <form action={logoutAction}>
            <button className="text-sm text-red-500 font-medium bg-red-500/10 px-3 py-1.5 rounded-lg">Logout</button>
          </form>
        </div>

        <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-10 gap-4 relative z-10">
          <div className="flex items-center gap-4">
            {evData.carPic && (
              <img src={evData.carPic} alt="Car" className="w-16 h-16 rounded-2xl object-cover border border-border shadow-sm hidden sm:block" />
            )}
            <div>
              <h1 className="text-3xl font-bold mb-1">Welcome back, {user.name.split(' ')[0]}</h1>
              <p className="text-foreground/60 flex items-center gap-2 mt-1">
                <CarBadge make={evData.make} model={evData.model} />
                Current Charge: {evData.currentCharge} / {evData.batteryCapacity} kWh
              </p>
            </div>
          </div>
          <Link
            href="/trip-planner"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-500/25 font-medium"
          >
            <Map className="h-4 w-4" />
            New Trip Plan
          </Link>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 relative z-10">
          <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
            <div className="absolute right-0 top-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all" />
            <div className="flex items-center justify-between mb-4 relative z-10">
              <h3 className="text-sm font-semibold text-foreground/60">Total Distance Logged</h3>
              <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                <Map className="h-5 w-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 relative z-10">
              <p className="text-3xl font-bold">{totalDistance}</p>
              <span className="text-sm text-foreground/50">km</span>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
            <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all" />
            <div className="flex items-center justify-between mb-4 relative z-10">
              <h3 className="text-sm font-semibold text-foreground/60">Energy Consumed</h3>
              <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                <Battery className="h-5 w-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 relative z-10">
              <p className="text-3xl font-bold">{totalBatteryUsed}</p>
              <span className="text-sm text-foreground/50">kWh</span>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
            <div className="absolute right-0 top-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all" />
            <div className="flex items-center justify-between mb-4 relative z-10">
              <h3 className="text-sm font-semibold text-foreground/60">Completed Trips</h3>
              <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500">
                <Activity className="h-5 w-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 relative z-10">
              <p className="text-3xl font-bold">{totalInteractions}</p>
              <span className="text-sm text-foreground/50">trips</span>
            </div>
          </div>
        </div>

        {/* Recent Trips */}
        <div className="relative z-10 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">Recent Trips Activity</h2>
            <Link href="/trip-planner" className="text-sm text-blue-500 hover:text-blue-400 font-medium flex items-center transition-colors">
              All History <ChevronRight className="h-4 w-4 ml-1" />
            </Link>
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="divide-y divide-border">
              {trips.length > 0 ? trips.map((trip: any) => (
                <div key={trip._id.toString()} className="p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4 hover:bg-secondary/50 transition-colors">
                  <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="p-3 bg-background rounded-xl border border-border">
                      <Map className="h-6 w-6 text-blue-500" />
                    </div>
                    <div>
                      <p className="font-semibold flex items-center gap-2 text-sm sm:text-base">
                        {trip.startLocation} <ArrowRight className="h-4 w-4 text-foreground/40" /> {trip.endLocation}
                      </p>
                      <p className="text-sm text-foreground/60 mt-0.5">
                        {new Date(trip.createdAt).toLocaleDateString()} • {trip.distance} km • {trip.estimatedTime}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500">
                      Completed
                    </span>
                    <span className="text-xs font-medium text-foreground/50">
                      {trip.batteryUsed.toFixed(1)} kWh used
                    </span>
                  </div>
                </div>
              )) : (
                <div className="p-12 text-center flex flex-col items-center justify-center">
                  <Map className="h-12 w-12 text-foreground/20 mb-4" />
                  <p className="text-lg font-semibold mb-2">No trips recorded</p>
                  <p className="text-foreground/60 text-sm max-w-sm mb-6">Start planning your journeys and they will appear here dynamically.</p>
                  <Link href="/trip-planner" className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-blue-500/20">
                    Plan First Trip
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function CarBadge({ make, model }: { make: string, model: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
      <Battery className="w-3 h-3" />
      {make} {model}
    </span>
  )
}
