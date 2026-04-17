'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import { interpolateWaypoints, type ChargingStation } from '@/lib/tripUtils'
export type { ChargingStation } from '@/lib/tripUtils'
import { connectDB } from '@/lib/db'
import { User, EvData, HealthData, Trip } from '@/lib/models'
import { getUser, setUserSession, clearUserSession } from '@/lib/auth'

async function fileToBase64(file: any): Promise<string | null> {
  if (!file || typeof file === 'string' || !file.name || typeof file.arrayBuffer !== 'function' || file.size === 0) {
    return null;
  }
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    return `data:${file.type};base64,${buffer.toString('base64')}`;
  } catch (e) {
    console.error("Conversion failed", e);
    return null;
  }
}

export async function loginAction(prevState: any, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) return { error: 'Please fill all fields' }

  await connectDB()
  const user = await User.findOne({ email }).lean() as any

  if (!user) return { error: 'User not found' }

  const match = await bcrypt.compare(password, user.password)
  if (!match) return { error: 'Invalid password' }

  await setUserSession(user._id.toString())

  // Check if user has EV data
  const evData = await EvData.findOne({ userId: user._id }).lean()
  if (!evData) {
    redirect('/ev-setup')
  }

  // Check if user has health data
  const healthData = await HealthData.findOne({ userId: user._id }).lean()
  if (!healthData) {
    redirect('/health-setup')
  }

  redirect('/dashboard')
}

export async function registerAction(prevState: any, formData: FormData) {
  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const confirm = formData.get('confirm') as string

  if (!name || !email || !password) return { error: 'Please fill all fields' }
  if (password !== confirm) return { error: 'Passwords do not match' }
  if (password.length < 6) return { error: 'Password must be at least 6 characters' }

  await connectDB()
  const existingUser = await User.findOne({ email }).lean()
  if (existingUser) return { error: 'Email already registered' }

  const profilePicFile = formData.get('profilePic') as File | null

  // Server-side guard: reject images larger than 2 MB
  const MAX_PROFILE_PIC_SIZE = 2 * 1024 * 1024 // 2 MB
  if (profilePicFile && typeof profilePicFile !== 'string' && profilePicFile.size > MAX_PROFILE_PIC_SIZE) {
    return { error: 'Profile picture must be under 2 MB' }
  }

  const profilePicUrl = await fileToBase64(profilePicFile)

  const hash = await bcrypt.hash(password, 10)
  
  const newUser = await User.create({
    name,
    email,
    password: hash,
    profilePic: profilePicUrl
  })

  if (newUser && newUser._id) {
    await setUserSession(newUser._id.toString())
    redirect('/ev-setup')
  }

  return { error: 'Registration failed' }
}

export async function logoutAction() {
  await clearUserSession()
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function saveEvData(prevState: any, formData: FormData) {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const make             = formData.get('make') as string
  const model            = formData.get('model') as string
  const nickname         = (formData.get('nickname') as string) || ''
  const batteryCapacity  = Number(formData.get('batteryCapacity'))
  const rangeAtFull      = Number(formData.get('rangeAtFull'))
  const editId           = formData.get('editId') as string | null
  const currentCharge    = batteryCapacity

  if (!make || !model || !batteryCapacity || !rangeAtFull) {
    return { error: 'Please fill all fields properly' }
  }

  await connectDB()

  const carPicFile = formData.get('carPic') as File | null
  let carPicUrl = await fileToBase64(carPicFile)

  if (editId) {
    // Editing an existing car
    const existing = await EvData.findOne({ _id: editId, userId: user.id })
    if (!existing) return { error: 'Car not found' }
    if (!carPicUrl && existing.carPic) carPicUrl = existing.carPic
    await EvData.updateOne(
      { _id: editId },
      { make, model, nickname, batteryCapacity, currentCharge, rangeAtFull, carPic: carPicUrl }
    )
  } else {
    // Always create a new car entry — supports multi-car garage
    await EvData.create({
      userId: user.id, make, model, nickname, batteryCapacity, currentCharge, rangeAtFull, carPic: carPicUrl
    })
  }

  revalidatePath('/dashboard')
  revalidatePath('/trip-planner')

  // Only redirect to health-setup if this is the very first car
  const carCount = await EvData.countDocuments({ userId: user.id })
  const hasHealth = await (await import('@/lib/models')).HealthData.findOne({ userId: user.id })
  if (carCount === 1 && !hasHealth) redirect('/health-setup')
  redirect('/dashboard')
}

export async function deleteEvAction(evId: string) {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  await connectDB()

  // Safety: ensure at least one car remains after delete
  const count = await EvData.countDocuments({ userId: user.id })
  if (count <= 1) return { error: 'You must keep at least one vehicle' }

  await EvData.deleteOne({ _id: evId, userId: user.id })

  revalidatePath('/dashboard')
  revalidatePath('/trip-planner')
  return { success: true }
}

export async function saveTripData(
  startLocation: string,
  endLocation: string,
  distance: number,
  estimatedTime: string,
  batteryUsed: number,
  chargingStops: number
) {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  await connectDB()
  
  const result = await Trip.create({
    userId: user.id, startLocation, endLocation, distance, estimatedTime, batteryUsed, chargingStops
  })

  revalidatePath('/dashboard')
  revalidatePath('/trip-planner')
  return { success: true, tripId: result._id.toString() }
}

export async function deleteTripAction(tripId: string) {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  await connectDB()
  await Trip.deleteOne({ _id: tripId, userId: user.id })
  
  revalidatePath('/dashboard')
  revalidatePath('/trip-planner')
}

export async function saveHealthData(prevState: any, formData: FormData) {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const age = Number(formData.get('age'))
  const healthCondition = formData.get('healthCondition') as string
  const preferredRestInterval = Number(formData.get('preferredRestInterval'))

  if (!age || !healthCondition || !preferredRestInterval) {
    return { error: 'Please fill all fields properly' }
  }

  await connectDB()
  const exists = await HealthData.findOne({ userId: user.id })
  
  if (exists) {
    await HealthData.updateOne(
      { userId: user.id },
      { age, healthCondition, preferredRestInterval }
    )
  } else {
    await HealthData.create({
      userId: user.id, age, healthCondition, preferredRestInterval
    })
  }

  revalidatePath('/dashboard')
  redirect('/dashboard')
}

// ── Google Polyline decoder ─────────────────────────────────────────────────
function decodePolyline(encoded: string): Array<{ lat: number; lon: number }> {
  const points: Array<{ lat: number; lon: number }> = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b: number, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lon: lng / 1e5 });
  }
  return points;
}

// ── Sample N evenly-spaced points from a polyline ──────────────────────────
function samplePolyline(
  points: Array<{ lat: number; lon: number }>,
  numSamples: number
): Array<{ lat: number; lon: number }> {
  if (points.length === 0 || numSamples === 0) return [];
  if (numSamples >= points.length) return points;
  const result: Array<{ lat: number; lon: number }> = [];
  for (let i = 1; i <= numSamples; i++) {
    const idx = Math.round((i / (numSamples + 1)) * (points.length - 1));
    result.push(points[idx]);
  }
  return result;
}

export async function calculateTripData(
  startLat: number, startLon: number,
  destLat: number, destLon: number
) {
  const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

  // ── Primary: Google Maps Directions API — gives real distance + route polyline ──
  if (GOOGLE_API_KEY && !GOOGLE_API_KEY.startsWith('YOUR_')) {
    try {
      const url =
        `https://maps.googleapis.com/maps/api/directions/json` +
        `?origin=${startLat},${startLon}` +
        `&destination=${destLat},${destLon}` +
        `&key=${GOOGLE_API_KEY}`;

      const res  = await fetch(url);
      const data = await res.json();
      const route = data?.routes?.[0];
      const leg   = route?.legs?.[0];

      if (leg?.distance && leg?.duration) {
        const drivingDistance = Math.round(leg.distance.value / 1609.34); // metres → miles
        const durationMinutes = Math.round(leg.duration.value / 60);

        // Decode the overview polyline to get actual road points
        const encoded  = route.overview_polyline?.points || '';
        const polyline = encoded ? decodePolyline(encoded) : [];

        return { drivingDistance, durationMinutes, source: 'google_maps', polyline };
      }
    } catch (e) {
      console.error('[calculateTripData] Directions API error, falling back to Haversine:', e);
    }
  }

  // ── Fallback: Haversine + driving-distance multiplier ──
  const R = 3958.8;
  const dLat = (destLat - startLat) * (Math.PI / 180);
  const dLon = (destLon - startLon) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(startLat * (Math.PI / 180)) *
      Math.cos(destLat * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;
  const crowFliesDistance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  let drivingDistance = Math.round(crowFliesDistance * 1.25);
  if (drivingDistance < 1) drivingDistance = 1;
  const durationMinutes = Math.round((drivingDistance / 55) * 60);
  return { drivingDistance, durationMinutes, source: 'haversine', polyline: [] as Array<{ lat: number; lon: number }> };
}

// ── Public helper: pick N charging-stop search centres from a route polyline ─
// Called from TripPlannerClient — takes the decoded polyline and samples
// evenly-spaced real road points to use as NRCan query centres.
export async function getRouteWaypoints(
  polyline: Array<{ lat: number; lon: number }>,
  startLat: number, startLon: number,
  destLat: number, destLon: number,
  numStops: number
): Promise<Array<{ lat: number; lon: number }>> {
  if (numStops === 0) return [];

  // If we have a real polyline, sample it; otherwise fall back to linear interpolation
  if (polyline && polyline.length > 2) {
    return samplePolyline(polyline, numStops);
  }

  // Linear interpolation fallback (no Google key / no polyline)
  const waypoints: Array<{ lat: number; lon: number }> = [];
  for (let i = 1; i <= numStops; i++) {
    const fraction = i / (numStops + 1);
    waypoints.push({
      lat: startLat + (destLat - startLat) * fraction,
      lon: startLon + (destLon - startLon) * fraction,
    });
  }
  return waypoints;
}

// ========================================================
// TRANSLATED PYTHON PREDICTION ML ENGINE
// ========================================================

function calculateRange(battery: number, efficiency: number = 5) {
    return battery * efficiency;
}

function calculateStops(distance: number, rangeKm: number) {
    if (rangeKm === 0) return 0;
    return Math.max(0, Math.ceil(distance / rangeKm) - 1);
}

function healthCheck(fatigue: string, sleep: number) {
    if (sleep < 5) {
        return "⚠️ Low sleep. Take frequent breaks.";
    } else if (fatigue === "high") {
        return "🚨 High fatigue. Avoid long driving.";
    } else {
        return "✅ You are fit to drive.";
    }
}

function predictML(data: { battery: number, distance: number, fatigue: string, sleep: number }) {
    const rangeKm = calculateRange(data.battery);
    const result: any = {};
    
    if (rangeKm >= data.distance) {
        result.status = "Reachable";
        result.charging_required = false;
        result.stops = 0;
    } else {
        result.status = "Charging Needed";
        result.charging_required = true;
        result.stops = calculateStops(data.distance, rangeKm);
    }
    
    result.estimated_range = rangeKm;
    result.health_advice = healthCheck(data.fatigue, data.sleep);
    
    return result;
}

export async function runMLPredictionAction(
    battery: number, 
    start: string, 
    destination: string, 
    sleep: number, 
    fatigue: string
) {
    // Keep the existing hardcoded API key from the python project
    const GOOGLE_API_KEY = "AIzaSyCKiutF3dUkcr06Vp9pti-ZQzzLvSAuwjI"; 
    
    try {
        const response = await fetch(
            `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(start)}&destinations=${encodeURIComponent(destination)}&key=${GOOGLE_API_KEY}`
        );
        const data = await response.json();
        
        if (data.rows && data.rows.length > 0 && data.rows[0].elements && data.rows[0].elements.length > 0 && data.rows[0].elements[0].status === "OK") {
            const distanceMeters = data.rows[0].elements[0].distance.value;
            const distanceKm = distanceMeters / 1000;
            
            const prediction = predictML({ battery, distance: distanceKm, fatigue, sleep });
            
            // Revalidate to ensure UI updates optionally, not strictly required here
            return { success: true, distance: distanceKm, prediction };
        } else {
            return { error: "Google API issue or route not found" };
        }
    } catch(err: any) {
        return { error: err.message || "Prediction failed" };
    }
}


// ========================================================
// ML PREDICTION — directly called from TripPlannerClient
// Takes distance in miles (converted to km internally) and
// returns ML model output including health advice
// ========================================================

export async function runMLPredictionDirect(
  batteryCapacityKwh: number,
  distanceMiles: number,
  weatherPenalty: number,
  healthData: { healthCondition?: string; preferredRestInterval?: number } | null
): Promise<{
  status: string;
  charging_required: boolean;
  stops: number;
  estimated_range_miles: number;
  health_advice: string;
  effective_range_miles: number;
}> {
  // Convert EV battery capacity + efficiency to estimated range in km
  // Standard EV efficiency: ~5 km/kWh average  
  const rangeKm = calculateRange(batteryCapacityKwh);
  const distanceKm = distanceMiles * 1.60934;

  // Apply weather penalty to effective range
  const effectiveRangeKm = rangeKm * (1 - weatherPenalty);

  // Health-based fatigue proxy from health profile
  const condition = healthData?.healthCondition || 'none';
  const fatigueLookup: Record<string, string> = {
    chronic_fatigue: 'high',
    back_pain: 'medium',
    pregnancy: 'medium',
    bladder: 'medium',
    none: 'low',
  };
  const fatigue = fatigueLookup[condition] || 'low';

  // Default healthy sleep hours
  const sleep = 7;

  const mlResult = predictML({
    battery: batteryCapacityKwh,
    distance: distanceKm,
    fatigue,
    sleep,
  });

  return {
    status: mlResult.status,
    charging_required: mlResult.charging_required,
    stops: calculateStops(distanceKm, effectiveRangeKm),
    estimated_range_miles: Math.round((mlResult.estimated_range / 1.60934) * (1 - weatherPenalty)),
    health_advice: mlResult.health_advice,
    effective_range_miles: Math.round(effectiveRangeKm / 1.60934),
  };
}


// ========================================================
// NRCan CHARGING STATIONS — real-world station data from
// Natural Resources Canada federal EV station database
// No API key required. Covers all of Canada.
// Fallback to NREL AFDC (DEMO_KEY) for US-side routes.
// ========================================================

export async function fetchNRCanStationsAction(
  waypoints: Array<{ lat: number; lon: number }>,
  routeStart?: { lat: number; lon: number },
  routeDest?:  { lat: number; lon: number }
): Promise<ChargingStation[][]> {
  const results: ChargingStation[][] = [];
  // Track station IDs used across ALL stops — prevents same station appearing twice
  const usedIds = new Set<string>();

  // ── Route bounding box ──────────────────────────────────────────────────
  // Stations outside this box are rejected — prevents e.g. LA stations
  // appearing on a Toronto→Montreal route. Padding = 2° (~220 km) each side.
  const PADDING = 2.0;
  const boxMinLat = routeStart && routeDest ? Math.min(routeStart.lat, routeDest.lat) - PADDING : -90;
  const boxMaxLat = routeStart && routeDest ? Math.max(routeStart.lat, routeDest.lat) + PADDING :  90;
  const boxMinLon = routeStart && routeDest ? Math.min(routeStart.lon, routeDest.lon) - PADDING : -180;
  const boxMaxLon = routeStart && routeDest ? Math.max(routeStart.lon, routeDest.lon) + PADDING :  180;

  const inBoundingBox = (lat: number, lon: number) =>
    lat >= boxMinLat && lat <= boxMaxLat &&
    lon >= boxMinLon && lon <= boxMaxLon;

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    let candidates: ChargingStation[] = [];

    // ── Primary: NREL AFDC (US + Canada, larger dataset, better dedup support) ──
    try {
      const nrelKey = process.env.NREL_API_KEY || 'DEMO_KEY';
      // Fetch 15 candidates so we have enough to skip already-used stations
      const nrelUrl =
        `https://developer.nrel.gov/api/alt-fuel-stations/v1.json` +
        `?api_key=${nrelKey}&fuel_type=ELEC` +
        `&latitude=${wp.lat}&longitude=${wp.lon}` +
        `&radius=50&limit=15&status=E`;

      const nrelRes = await fetch(nrelUrl, { cache: 'no-store' });

      if (nrelRes.ok) {
        const nrelData = await nrelRes.json();
        const raw: any[] = nrelData?.fuel_stations || [];
        candidates = raw
          .map((s: any) => ({
            id:          `nrel-${s.id}`,
            name:        s.station_name || 'Charging Station',
            address:     s.street_address || '',
            city:        s.city || '',
            province:    s.state || '',
            lat:         s.latitude,
            lon:         s.longitude,
            level2Ports: s.ev_level2_evse_num || 0,
            dcFastPorts: s.ev_dc_fast_num || 0,
            network:     s.ev_network || 'Unknown',
          }))
          // Prefer DCFC stations first, then by number of ports
          .filter((s: ChargingStation) => inBoundingBox(s.lat, s.lon))
          .sort((a: ChargingStation, b: ChargingStation) =>
            b.dcFastPorts - a.dcFastPorts || b.level2Ports - a.level2Ports
          );
      }
    } catch (e) {
      console.error(`[NREL] Stop ${i + 1} error:`, e);
    }

    // ── Fallback: NRCan (Canada-only) if NREL returned nothing ───────────────
    if (candidates.length === 0) {
      try {
        const nrcanUrl =
          `${process.env.NRCAN_EVCS_URL || 'https://chargepoints.ped.nrcan.gc.ca/api/crs/fmt/json'}` +
          `?lang=en&lat=${wp.lat}&lng=${wp.lon}&dist=50`;
        const nrcanRes = await fetch(nrcanUrl, { cache: 'no-store' });
        if (nrcanRes.ok) {
          const nrcanData = await nrcanRes.json();
          const raw: any[] = nrcanData?.fuel_stations || [];
          candidates = raw
            .filter((s: any) => s.latitude && s.longitude)
            .filter((s: any) => inBoundingBox(parseFloat(s.latitude), parseFloat(s.longitude)))
            .map((s: any) => ({
              id:          `nrcan-${s.id || s.hy_objectid}`,
              name:        s.station_name || s.name || 'Charging Station',
              address:     s.street_address || s.address || '',
              city:        s.city || '',
              province:    s.state || s.province || '',
              lat:         parseFloat(s.latitude),
              lon:         parseFloat(s.longitude),
              level2Ports: parseInt(s.ev_level2_evse_num) || 0,
              dcFastPorts: parseInt(s.ev_dc_fast_num) || 0,
              network:     s.ev_network || s.owner_type_code || 'Unknown',
            }))
            .sort((a: ChargingStation, b: ChargingStation) =>
              b.dcFastPorts - a.dcFastPorts
            );
        }
      } catch (e) {
        console.error(`[NRCan] Stop ${i + 1} error:`, e);
      }
    }

    // ── Deduplicate: skip stations already assigned to a previous stop ────────
    const unique = candidates.filter(s => !usedIds.has(s.id));

    // Pick best 3 unique stations for this stop
    const chosen = unique.slice(0, 3);

    // If no unique stations found at all, allow reuse as absolute last resort
    if (chosen.length === 0 && candidates.length > 0) {
      chosen.push(candidates[0]);
    }

    // Mark the top pick as used so subsequent stops won't repeat it
    if (chosen.length > 0) {
      usedIds.add(chosen[0].id);
    }

    results.push(chosen);
  }

  return results;
}

// interpolateWaypoints moved to @/lib/tripUtils — import from there


// ========================================================
// SAVED LOCATIONS — Home, Work, Favourites
// ========================================================

export async function getSavedLocationsAction() {
  const user = await getUser()
  if (!user) return []
  await connectDB()
  const { SavedLocation } = await import('@/lib/models')
  const locs = await SavedLocation.find({ userId: user.id }).sort({ createdAt: 1 }).lean() as any[]
  return locs.map((l: any) => ({
    id:      l._id.toString(),
    label:   l.label,
    type:    l.type,
    address: l.address,
    lat:     l.lat,
    lon:     l.lon,
  }))
}

export async function saveFavouriteAction(
  label: string,
  type: 'home' | 'work' | 'favourite',
  address: string,
  lat: number,
  lon: number
) {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }
  await connectDB()
  const { SavedLocation } = await import('@/lib/models')
  // Home and Work are singletons — upsert; Favourites always create new
  if (type === 'home' || type === 'work') {
    await SavedLocation.findOneAndUpdate(
      { userId: user.id, type },
      { label, address, lat, lon },
      { upsert: true }
    )
  } else {
    await SavedLocation.create({ userId: user.id, label, type, address, lat, lon })
  }
  revalidatePath('/trip-planner')
  return { success: true }
}

export async function deleteFavouriteAction(id: string) {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }
  await connectDB()
  const { SavedLocation } = await import('@/lib/models')
  await SavedLocation.deleteOne({ _id: id, userId: user.id })
  revalidatePath('/trip-planner')
  return { success: true }
}

// ========================================================
// RECENT SEARCHES
// ========================================================

export async function saveRecentSearchAction(address: string, lat: number, lon: number) {
  const user = await getUser()
  if (!user) return
  await connectDB()
  const { RecentSearch } = await import('@/lib/models')
  // Remove duplicate if same address already saved
  await RecentSearch.deleteOne({ userId: user.id, address })
  await RecentSearch.create({ userId: user.id, address, lat, lon })
  // Keep only last 8 recent searches per user
  const all = await RecentSearch.find({ userId: user.id }).sort({ usedAt: -1 }).lean()
  if (all.length > 8) {
    const toDelete = all.slice(8).map((r: any) => r._id)
    await RecentSearch.deleteMany({ _id: { $in: toDelete } })
  }
}

export async function getRecentSearchesAction() {
  const user = await getUser()
  if (!user) return []
  await connectDB()
  const { RecentSearch } = await import('@/lib/models')
  const searches = await RecentSearch.find({ userId: user.id }).sort({ usedAt: -1 }).limit(8).lean() as any[]
  return searches.map((s: any) => ({
    address: s.address,
    lat:     s.lat,
    lon:     s.lon,
  }))
}


// ── Get single EV by ID (used by ev-setup edit mode) ─────────────────────────
export async function getEvByIdAction(evId: string) {
  const user = await getUser()
  if (!user) return null
  await connectDB()
  const ev = await EvData.findOne({ _id: evId, userId: user.id }).lean() as any
  if (!ev) return null
  return {
    id:              ev._id.toString(),
    make:            ev.make            || '',
    model:           ev.model           || '',
    nickname:        ev.nickname        || '',
    batteryCapacity: ev.batteryCapacity || 0,
    rangeAtFull:     ev.rangeAtFull     || 0,
    carPic:          ev.carPic          || null,
  }
}


// ── Get current user's health data (used by health-setup edit mode) ───────────
export async function getHealthDataAction() {
  const user = await getUser()
  if (!user) return null
  await connectDB()
  const h = await HealthData.findOne({ userId: user.id }).lean() as any
  if (!h) return null
  return {
    age:                   h.age                   ?? '',
    healthCondition:       h.healthCondition       ?? 'none',
    preferredRestInterval: h.preferredRestInterval ?? 120,
  }
}