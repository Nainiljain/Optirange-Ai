import { redirect } from "next/navigation"
import { MapPin } from "lucide-react"
import { getUser } from "@/lib/auth"
import { connectDB } from "@/lib/db"
import { EvData, HealthData } from "@/lib/models"
import { getSavedLocationsAction, getRecentSearchesAction } from "@/app/actions"
import AppSidebar from "@/app/components/AppSidebar"
import TripPlannerClient from "./TripPlannerClient"

/**
 * Trip Planner server page.
 *
 * Next.js 16 change: `searchParams` is a Promise and must be awaited
 * before accessing its properties.
 */
export default async function TripPlanner({
  searchParams,
}: {
  searchParams: Promise<{ carId?: string }>
}) {
  const user = await getUser()
  if (!user) redirect('/login')

  await connectDB()

  // Fetch ALL cars for this user
  const allCars = await EvData.find({ userId: user.id }).sort({ createdAt: 1 }).lean() as any[]
  if (allCars.length === 0) redirect('/ev-setup')

  const healthData = await HealthData.findOne({ userId: user.id }).lean() as any
  if (!healthData) redirect('/health-setup')

  // Await searchParams (Next.js 16 async API)
  const resolvedParams = await searchParams

  // Determine initially selected car: ?carId param → matching car → else last added
  const requestedId = resolvedParams?.carId
  const initialCar  = requestedId
    ? (allCars.find((c: any) => c._id.toString() === requestedId) ?? allCars[allCars.length - 1])
    : allCars[allCars.length - 1]

  // Serialise ObjectIds to strings for client props
  const serialisedCars    = allCars.map((c: any) => ({ ...c, _id: c._id.toString(), userId: c.userId.toString() }))
  const serialisedInitial = { ...initialCar, _id: initialCar._id.toString(), userId: initialCar.userId.toString() }
  const serialisedHealth  = healthData ? { ...healthData, _id: healthData._id.toString(), userId: healthData.userId.toString() } : null
  const serialisedUser    = { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, profilePic: user.profilePic ?? null }

  // Fetch saved locations and recent searches
  const savedLocations  = await getSavedLocationsAction()
  const recentSearches  = await getRecentSearchesAction()

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans selection:bg-blue-500/30">
      {/* ── Sidebar ── */}
      <AppSidebar
        activePage="trip-planner"
        user={{ firstName: user.firstName, lastName: user.lastName, email: user.email, profilePic: user.profilePic ?? null, role: user.role }}
      />

      {/* ── Main ── */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto relative" id="main-content">
        <div className="absolute top-[-100px] left-[-100%] w-[1000px] h-[1000px] bg-purple-500/10 blur-[150px] rounded-full pointer-events-none" aria-hidden="true" />

        <header className="mb-8 md:mb-10 flex items-center gap-4 relative z-10">
          <div className="p-4 bg-purple-500/10 rounded-2xl border border-purple-500/20 shadow-lg" aria-hidden="true">
            <MapPin className="h-8 w-8 text-purple-500" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-black mb-1 tracking-tight">Intelligent Trip Planner</h1>
            <p className="text-foreground/60 font-medium">
              {allCars.length > 1
                ? `${allCars.length} vehicles available — select the one you want to drive`
                : `Planning with your ${initialCar.make} ${initialCar.model}`}
            </p>
          </div>
        </header>

        <div className="relative z-10">
          <TripPlannerClient
            user={serialisedUser}
            allEvData={serialisedCars}
            initialEvData={serialisedInitial}
            healthData={serialisedHealth}
            savedLocations={savedLocations}
            recentSearches={recentSearches}
          />
        </div>
      </main>
    </div>
  )
}
