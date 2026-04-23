import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { EvData, ServiceLog } from '@/lib/models'
import AppSidebar from '@/app/components/AppSidebar'
import MobileHeader from '@/app/components/MobileHeader'
import ServiceClient from './ServiceClient'

export const metadata = {
  title: 'Service Logs | OptiRange AI',
  description: 'Track and manage EV maintenance history across all your vehicles.',
}

export default async function ServicePage() {
  const user = await getUser()
  if (!user) redirect('/login')

  await connectDB()

  // Fetch all vehicles for the user
  const rawCars = await EvData.find({ userId: user.id }).sort({ createdAt: 1 }).lean() as any[]
  if (rawCars.length === 0) redirect('/ev-setup')

  const cars = rawCars.map((c: any) => ({
    id:              c._id.toString(),
    nickname:        c.nickname  || '',
    make:            c.make      || '',
    model:           c.model     || '',
    batteryCapacity: c.batteryCapacity || 0,
    carPic:          c.carPic    || null,
  }))

  // Pre-load all service logs for this user (client will filter by selected car)
  const rawLogs = await ServiceLog.find({ userId: user.id })
    .sort({ date: -1 })
    .lean() as any[]

  const logs = rawLogs.map((l: any) => ({
    id:          l._id.toString(),
    evId:        l.evId.toString(),
    serviceType: l.serviceType as string,
    date:        (l.date instanceof Date ? l.date : new Date(l.date)).toISOString(),
    cost:        l.cost ?? null,
    notes:       l.notes ?? '',
    createdAt:   (l.createdAt instanceof Date ? l.createdAt : new Date(l.createdAt)).toISOString(),
  }))

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans selection:bg-orange-500/30">
      {/* ── Sidebar ── */}
      <AppSidebar
        activePage="service"
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
        {/* Ambient glow */}
        <div
          className="absolute top-[-100px] right-[-100px] w-[500px] h-[500px] bg-orange-500/10 blur-[140px] rounded-full pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="absolute bottom-[-80px] left-[-80px] w-[400px] h-[400px] bg-amber-500/8 blur-[120px] rounded-full pointer-events-none"
          aria-hidden="true"
        />

        {/* Mobile header */}
        <MobileHeader />

        {/* Client-side interactive section */}
        <ServiceClient cars={cars} initialLogs={logs} />
      </main>
    </div>
  )
}
