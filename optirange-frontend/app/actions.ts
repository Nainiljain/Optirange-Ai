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
  redirect('/login')
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

export async function getEvByIdAction(editId: string) {
  const user = await getUser()
  if (!user) return null
  await connectDB()
  const ev = await EvData.findOne({ _id: editId, userId: user.id }).lean() as any
  if (!ev) return null
  return { ...ev, _id: ev._id.toString(), userId: ev.userId.toString() }
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
  const sleepStatus = formData.get('sleepStatus') as string || ''
  const otherChallenges = formData.get('otherChallenges') as string || ''

  if (!age || !healthCondition || !preferredRestInterval) {
    return { error: 'Please fill all fields properly' }
  }

  await connectDB()
  const exists = await HealthData.findOne({ userId: user.id })
  
  if (exists) {
    await HealthData.updateOne(
      { userId: user.id },
      { age, healthCondition, preferredRestInterval, sleepStatus, otherChallenges }
    )
  } else {
    await HealthData.create({
      userId: user.id, age, healthCondition, preferredRestInterval, sleepStatus, otherChallenges
    })
  }

  revalidatePath('/dashboard')
  redirect('/dashboard')
}

export async function getHealthDataAction() {
  const user = await getUser()
  if (!user) return null
  await connectDB()
  const data = await HealthData.findOne({ userId: user.id }).lean() as any
  if (!data) return { name: user.name, isExisting: false }
  return { ...data, _id: data._id.toString(), userId: data.userId.toString(), name: user.name, isExisting: true }
}

export async function calculateTripData(
  startLat: number, startLon: number, 
  destLat: number, destLon: number
) {
  const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

  // ── Primary: Google Maps Distance Matrix API (real driving distance + duration) ──
  if (GOOGLE_API_KEY && !GOOGLE_API_KEY.startsWith('YOUR_')) {
    try {
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${startLat},${startLon}&destinations=${destLat},${destLon}&key=${GOOGLE_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      const elem = data?.rows?.[0]?.elements?.[0];
      if (elem?.status === 'OK') {
        const drivingDistance = Math.round(elem.distance.value / 1609.34); // metres → miles
        const durationMinutes = Math.round(elem.duration.value / 60);
        return { drivingDistance, durationMinutes, source: 'google_maps' };
      }
    } catch (e) {
      console.error('[calculateTripData] Google Maps API error, falling back to Haversine:', e);
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
  return { drivingDistance, durationMinutes, source: 'haversine' };
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
  waypoints: Array<{ lat: number; lon: number }>
): Promise<ChargingStation[][]> {
  const results: ChargingStation[][] = [];

  for (const wp of waypoints) {
    const stationsAtWaypoint: ChargingStation[] = [];

    // ── Primary: NRCan EVCS (Canadian stations) ──────────────────────────────
    try {
      const nrcanUrl =
        `${process.env.NRCAN_EVCS_URL || 'https://chargepoints.ped.nrcan.gc.ca/api/crs/fmt/json'}` +
        `?lang=en&lat=${wp.lat}&lng=${wp.lon}&dist=25`;

      const nrcanRes = await fetch(nrcanUrl, { next: { revalidate: 3600 } });

      if (nrcanRes.ok) {
        const nrcanData = await nrcanRes.json();
        const rawStations: any[] = nrcanData?.fuel_stations || [];

        // Prefer DCFC stations, sort by distance, take top 3
        const sorted = rawStations
          .filter((s: any) => s.latitude && s.longitude)
          .map((s: any) => ({
            id: `nrcan-${s.id || s.hy_objectid}`,
            name: s.station_name || s.name || 'Charging Station',
            address: s.street_address || s.address || '',
            city: s.city || '',
            province: s.state || s.province || '',
            lat: parseFloat(s.latitude),
            lon: parseFloat(s.longitude),
            level2Ports: parseInt(s.ev_level2_evse_num) || 0,
            dcFastPorts: parseInt(s.ev_dc_fast_num) || 0,
            network: s.ev_network || s.owner_type_code || 'Unknown',
            distanceKm: s.distance ? parseFloat(s.distance) : undefined,
          }))
          .sort((a: any, b: any) => (b.dcFastPorts - a.dcFastPorts));

        stationsAtWaypoint.push(...sorted.slice(0, 3));
      }
    } catch (e) {
      console.error('[NRCan] Fetch error:', e);
    }

    // ── Fallback: NREL AFDC (US + Canada) ────────────────────────────────────
    if (stationsAtWaypoint.length === 0) {
      try {
        const nrelKey = process.env.NREL_API_KEY || 'DEMO_KEY';
        const nrelUrl =
          `https://developer.nrel.gov/api/alt-fuel-stations/v1.json` +
          `?api_key=${nrelKey}&fuel_type=ELEC&latitude=${wp.lat}&longitude=${wp.lon}` +
          `&radius=15&limit=3&ev_level=dc_fast&status=E`;

        const nrelRes = await fetch(nrelUrl, { next: { revalidate: 3600 } });

        if (nrelRes.ok) {
          const nrelData = await nrelRes.json();
          const raw: any[] = nrelData?.fuel_stations || [];

          stationsAtWaypoint.push(
            ...raw.map((s: any) => ({
              id: `nrel-${s.id}`,
              name: s.station_name || 'Charging Station',
              address: s.street_address || '',
              city: s.city || '',
              province: s.state || '',
              lat: s.latitude,
              lon: s.longitude,
              level2Ports: s.ev_level2_evse_num || 0,
              dcFastPorts: s.ev_dc_fast_num || 0,
              network: s.ev_network || 'Unknown',
            }))
          );
        }
      } catch (e) {
        console.error('[NREL] Fetch error:', e);
      }
    }

    results.push(stationsAtWaypoint);
  }

  return results;
}

// interpolateWaypoints moved to @/lib/tripUtils — import from there