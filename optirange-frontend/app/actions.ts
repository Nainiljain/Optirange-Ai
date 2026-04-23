'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import { interpolateWaypoints, type ChargingStation } from '@/lib/tripUtils'
export type { ChargingStation } from '@/lib/tripUtils'
import { connectDB } from '@/lib/db'
import { User, EvData, HealthData, Trip, ServiceLog } from '@/lib/models'
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
  const firstName = formData.get('firstName') as string
  const lastName  = formData.get('lastName') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const confirm = formData.get('confirm') as string

  if (!firstName || !lastName || !email || !password) return { error: 'Please fill all fields' }
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
    firstName,
    lastName,
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

// ── Get current user profile (used by profile settings page) ──────────────
export async function getUserProfileAction() {
  const user = await getUser()
  if (!user) return null
  await connectDB()
  const full = await User.findById(user.id).select('firstName lastName name email profilePic role').lean() as any
  if (!full) return null
  
  let firstName = full.firstName;
  let lastName = full.lastName;
  if (!firstName && !lastName && full.name) {
    const parts = full.name.split(' ');
    firstName = parts[0] || '';
    lastName = parts.slice(1).join(' ') || '';
  }

  return {
    firstName:  firstName ?? '',
    lastName:   lastName ?? '',
    email:      full.email      ?? '',
    profilePic: full.profilePic ?? null,
    role:       (full.role as 'user' | 'admin') ?? 'user',
  }
}

export async function updateProfileAction(prevState: any, formData: FormData) {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const firstName = formData.get('firstName') as string
  const lastName  = formData.get('lastName') as string
  const email    = formData.get('email') as string
  const password = formData.get('password') as string | null
  const confirm  = formData.get('confirm') as string | null

  if (!firstName || !lastName || !email) return { error: 'Name and email are required' }

  await connectDB()

  // If the email changed, make sure it isn't already taken by another user
  if (email !== user.email) {
    const duplicate = await User.findOne({ email, _id: { $ne: user.id } }).lean()
    if (duplicate) return { error: 'Email is already in use by another account' }
  }

  // Build the update payload
  const updateData: Record<string, any> = { firstName, lastName, email }

  // Profile picture — respect existing 2 MB guard
  const profilePicFile = formData.get('profilePic') as File | null
  const MAX_PROFILE_PIC_SIZE = 2 * 1024 * 1024 // 2 MB
  if (profilePicFile && typeof profilePicFile !== 'string' && profilePicFile.size > MAX_PROFILE_PIC_SIZE) {
    return { error: 'Profile picture must be under 2 MB' }
  }
  const profilePicUrl = await fileToBase64(profilePicFile)
  if (profilePicUrl) {
    updateData.profilePic = profilePicUrl
  }

  // Password — only update if a new one was provided
  if (password && password.trim().length > 0) {
    if (password !== confirm) return { error: 'New passwords do not match' }
    if (password.length < 6) return { error: 'Password must be at least 6 characters' }
    updateData.password = await bcrypt.hash(password, 10)
  }

  await User.findByIdAndUpdate(user.id, { $set: updateData }, { new: true, runValidators: true })

  // Revalidate all routes that display user info (sidebar, header, etc.)
  revalidatePath('/dashboard')
  revalidatePath('/profile')
  revalidatePath('/', 'layout')

  return { success: true, message: 'Profile updated successfully' }
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

// ========================================================
// ML PREDICTION ENGINE — translated from Python prediction.py
// ========================================================

function calculateRange(battery: number, efficiency: number = 5) {
  return battery * efficiency;
}

function calculateStops(distance: number, rangeKm: number) {
  if (rangeKm === 0) return 0;
  return Math.max(0, Math.ceil(distance / rangeKm) - 1);
}

function healthCheck(fatigue: string, sleep: number) {
  if (sleep < 5) return '⚠️ Low sleep. Take frequent breaks.';
  if (fatigue === 'high') return '🚨 High fatigue. Avoid long driving.';
  return '✅ You are fit to drive.';
}

function predictML(data: { battery: number; distance: number; fatigue: string; sleep: number; driverMultiplier?: number }) {
  let rangeKm = calculateRange(data.battery);
  if (data.driverMultiplier) {
    rangeKm *= data.driverMultiplier;
  }
  const result: any = {};
  if (rangeKm >= data.distance) {
    result.status = 'Reachable'; result.charging_required = false; result.stops = 0;
  } else {
    result.status = 'Charging Needed'; result.charging_required = true;
    result.stops = calculateStops(data.distance, rangeKm);
  }
  result.estimated_range = rangeKm;
  result.health_advice = healthCheck(data.fatigue, data.sleep);
  return result;
}

export async function runMLPredictionDirect(
  batteryCapacityKwh: number,
  distanceMiles: number,
  weatherPenalty: number,
  healthData: { healthCondition?: string; preferredRestInterval?: number } | null
): Promise<{
  status: string; charging_required: boolean; stops: number;
  estimated_range_miles: number; health_advice: string; effective_range_miles: number;
}> {
  const user = await getUser();
  let driverMultiplier = 1.0;
  if (user) {
    const { calculateDriverEfficiency } = await import('@/lib/analysis');
    driverMultiplier = await calculateDriverEfficiency(user.id);
  }

  const baseRangeKm    = calculateRange(batteryCapacityKwh);
  const rangeKm        = baseRangeKm * driverMultiplier;
  const distanceKm     = distanceMiles * 1.60934;
  const effectiveRangeKm = rangeKm * (1 - weatherPenalty);

  const condition = healthData?.healthCondition || 'none';
  const fatigueLookup: Record<string, string> = {
    chronic_fatigue: 'high', back_pain: 'medium',
    pregnancy: 'medium', bladder: 'medium', none: 'low',
  };
  const fatigue = fatigueLookup[condition] || 'low';
  const sleep   = 7;

  const mlResult = predictML({ battery: batteryCapacityKwh, distance: distanceKm, fatigue, sleep, driverMultiplier });

  return {
    status:                 mlResult.status,
    charging_required:      mlResult.charging_required,
    stops:                  calculateStops(distanceKm, effectiveRangeKm),
    estimated_range_miles:  Math.round((mlResult.estimated_range / 1.60934) * (1 - weatherPenalty)),
    health_advice:          mlResult.health_advice,
    effective_range_miles:  Math.round(effectiveRangeKm / 1.60934),
  };
}

export async function runMLPredictionAction(
  battery: number, start: string, destination: string,
  sleep: number, fatigue: string
) {
  const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
  try {
    const user = await getUser();
    let driverMultiplier = 1.0;
    if (user) {
      const { calculateDriverEfficiency } = await import('@/lib/analysis');
      driverMultiplier = await calculateDriverEfficiency(user.id);
    }

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(start)}&destinations=${encodeURIComponent(destination)}&key=${GOOGLE_API_KEY}`
    );
    const data = await response.json();
    if (data.rows?.[0]?.elements?.[0]?.status === 'OK') {
      const distanceKm = data.rows[0].elements[0].distance.value / 1000;
      const prediction = predictML({ battery, distance: distanceKm, fatigue, sleep, driverMultiplier });
      return { success: true, distance: distanceKm, prediction };
    }
    return { error: 'Google API issue or route not found' };
  } catch (err: any) {
    return { error: err.message || 'Prediction failed' };
  }
}

export async function calculateTripData(
  startLat: number, startLon: number,
  destLat: number, destLon: number
) {
  const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

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

// ── Helper: sample N evenly-spaced real road points from Directions API legs ──
// Called server-side only — avoids sending large polylines to the client
async function sampleRouteWaypoints(
  startLat: number, startLon: number,
  destLat: number,  destLon: number,
  numPoints: number,
  apiKey: string
): Promise<Array<{ lat: number; lon: number }>> {
  // Straight-line fallback (used if Directions call fails or no API key)
  const fallback = () => {
    const pts: Array<{ lat: number; lon: number }> = [];
    for (let i = 1; i <= numPoints; i++) {
      const f = i / (numPoints + 1);
      pts.push({
        lat: startLat + (destLat - startLat) * f,
        lon: startLon + (destLon - startLon) * f,
      });
    }
    return pts;
  };

  if (!apiKey || apiKey.startsWith('YOUR_')) return fallback();

  try {
    const url =
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${startLat},${startLon}` +
      `&destination=${destLat},${destLon}` +
      `&key=${apiKey}`;

    const res  = await fetch(url);
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return fallback();

    // Collect all step end-points from all legs — these are ON actual roads
    const roadPoints: Array<{ lat: number; lon: number }> = [{ lat: startLat, lon: startLon }];
    (route.legs || []).forEach((leg: any) => {
      (leg.steps || []).forEach((step: any) => {
        if (step.end_location) {
          roadPoints.push({ lat: step.end_location.lat, lon: step.end_location.lng });
        }
      });
    });
    roadPoints.push({ lat: destLat, lon: destLon });

    if (roadPoints.length < 2) return fallback();

    // Sample numPoints evenly-spaced from the road points
    const result: Array<{ lat: number; lon: number }> = [];
    for (let i = 1; i <= numPoints; i++) {
      const idx = Math.round((i / (numPoints + 1)) * (roadPoints.length - 1));
      result.push(roadPoints[Math.min(idx, roadPoints.length - 1)]);
    }
    return result;
  } catch {
    return fallback();
  }
}

// ── Keep legacy export so existing imports still compile ───────────────────────
export async function getRouteWaypoints(
  polyline: Array<{ lat: number; lon: number }>,
  startLat: number, startLon: number,
  destLat: number,  destLon: number,
  numStops: number
): Promise<Array<{ lat: number; lon: number }>> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
  return sampleRouteWaypoints(startLat, startLon, destLat, destLon, numStops, apiKey);
}

// ── Unified action: fetch real charging stations along the route ───────────────
// Gets its own road-accurate waypoints via Directions API — never interpolates
// straight-line points that may fall in lakes or off-road.
export async function fetchNRCanStationsAction(
  waypoints: Array<{ lat: number; lon: number }>,
  routeStart?: { lat: number; lon: number },
  routeDest?:  { lat: number; lon: number }
): Promise<ChargingStation[][]> {
  if (waypoints.length === 0) return [];

  const numStops = waypoints.length;

  // ── Haversine distance helper ─────────────────────────────────────────────
  const hKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 +
      Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  // ── Ideal stop positions along the route (straight-line fractions) ─────────
  // Used only for assigning collected stations to stops — NOT for querying
  const idealPositions = Array.from({ length: numStops }, (_, i) => {
    const s = routeStart || waypoints[0];
    const d = routeDest  || waypoints[waypoints.length - 1];
    const f = (i + 1) / (numStops + 1);
    return { lat: s.lat + (d.lat - s.lat) * f, lon: s.lon + (d.lon - s.lon) * f };
  });

  // ── Bounding box of the full route with generous padding ─────────────────
  const s = routeStart || waypoints[0];
  const d = routeDest  || waypoints[waypoints.length - 1];
  const PADDING  = 3.0; // ~330 km — wide enough to catch any highway detours
  const boxMinLat = Math.min(s.lat, d.lat) - PADDING;
  const boxMaxLat = Math.max(s.lat, d.lat) + PADDING;
  const boxMinLon = Math.min(s.lon, d.lon) - PADDING;
  const boxMaxLon = Math.max(s.lon, d.lon) + PADDING;
  const inBox = (lat: number, lon: number) =>
    lat >= boxMinLat && lat <= boxMaxLat && lon >= boxMinLon && lon <= boxMaxLon;

  // ── Strategy: query multiple points along the route, collect all stations ──
  // Sample 5 evenly-spaced points regardless of numStops to cover the corridor
  const NUM_QUERY_PTS = Math.max(numStops * 2, 5);
  const queryPts = Array.from({ length: NUM_QUERY_PTS }, (_, i) => {
    const f = (i + 1) / (NUM_QUERY_PTS + 1);
    return { lat: s.lat + (d.lat - s.lat) * f, lon: s.lon + (d.lon - s.lon) * f };
  });
  // Also add the actual start/dest midpoints as fallback query points
  queryPts.push({ lat: (s.lat + d.lat) / 2, lon: (s.lon + d.lon) / 2 });

  // ── Collect ALL stations from every query point ────────────────────────────
  const allStationsMap = new Map<string, ChargingStation>();

  const nrelKey = process.env.NREL_API_KEY || 'DEMO_KEY';

  await Promise.all(queryPts.map(async (qp) => {
    // NREL query with 150km radius per point to ensure coverage
    try {
      const url =
        `https://developer.nrel.gov/api/alt-fuel-stations/v1.json` +
        `?api_key=${nrelKey}&fuel_type=ELEC` +
        `&latitude=${qp.lat}&longitude=${qp.lon}` +
        `&radius=150&limit=30&status=E`;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        (data?.fuel_stations || []).forEach((st: any) => {
          if (!st.latitude || !st.longitude) return;
          if (!inBox(st.latitude, st.longitude)) return;
          const id = `nrel-${st.id}`;
          if (!allStationsMap.has(id)) {
            allStationsMap.set(id, {
              id,
              name:        st.station_name   || 'Charging Station',
              address:     st.street_address || '',
              city:        st.city           || '',
              province:    st.state          || '',
              lat:         st.latitude,
              lon:         st.longitude,
              level2Ports: st.ev_level2_evse_num || 0,
              dcFastPorts: st.ev_dc_fast_num     || 0,
              network:     st.ev_network         || 'Unknown',
            });
          }
        });
      }
    } catch {}

    // NRCan query (Canada stations)
    try {
      const url =
        `${process.env.NRCAN_EVCS_URL || 'https://chargepoints.ped.nrcan.gc.ca/api/crs/fmt/json'}` +
        `?lang=en&lat=${qp.lat}&lng=${qp.lon}&dist=150`;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        (data?.fuel_stations || []).forEach((st: any) => {
          if (!st.latitude || !st.longitude) return;
          const lat = parseFloat(st.latitude), lon = parseFloat(st.longitude);
          if (!inBox(lat, lon)) return;
          const id = `nrcan-${st.id || st.hy_objectid}`;
          if (!allStationsMap.has(id)) {
            allStationsMap.set(id, {
              id,
              name:        st.station_name || st.name || 'Charging Station',
              address:     st.street_address || st.address || '',
              city:        st.city      || '',
              province:    st.state     || st.province || '',
              lat, lon,
              level2Ports: parseInt(st.ev_level2_evse_num) || 0,
              dcFastPorts: parseInt(st.ev_dc_fast_num)     || 0,
              network:     st.ev_network || st.owner_type_code || 'Unknown',
            });
          }
        });
      }
    } catch {}
  }));

  const allStations = Array.from(allStationsMap.values());
  console.log(`[Stations] Collected ${allStations.length} unique stations along the corridor`);

  if (allStations.length === 0) {
    // Nothing found at all — return empty arrays
    return Array.from({ length: numStops }, () => []);
  }

  // ── Assign stations to stops greedily by proximity ─────────────────────────
  // For each stop (in order), pick the closest unused station to the ideal position
  const usedIds = new Set<string>();
  const results: ChargingStation[][] = [];

  for (let i = 0; i < numStops; i++) {
    const ideal = idealPositions[i];

    // Sort all available (unused) stations by distance to this stop's ideal position
    const sorted = allStations
      .filter(st => !usedIds.has(st.id))
      .map(st => ({ st, dist: hKm(st.lat, st.lon, ideal.lat, ideal.lon) }))
      .sort((a, b) => {
        // Prefer DCFC over L2, then by distance
        if (b.st.dcFastPorts !== a.st.dcFastPorts) return b.st.dcFastPorts - a.st.dcFastPorts;
        return a.dist - b.dist;
      });

    // Give each stop a geographic window — stations should be within the right
    // third of the route, not way behind or ahead
    const routeLenKm = hKm(s.lat, s.lon, d.lat, d.lon) * 1.3; // rough driving dist
    const windowKm   = routeLenKm / (numStops + 1) * 1.5; // 1.5x segment length

    // Try to find a station within the window first, fall back to nearest overall
    const windowMatches = sorted.filter(x => x.dist <= windowKm);
    const candidates    = (windowMatches.length > 0 ? windowMatches : sorted).slice(0, 3);

    candidates.forEach(c => usedIds.add(c.st.id));
    results.push(candidates.map(c => c.st));
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


// ============================================================
// SERVICE LOGS — EV Maintenance Tracker
// ============================================================

/** Fetch all service logs for the current user (newest first). */
export async function getServiceLogsAction() {
  const user = await getUser()
  if (!user) return []
  await connectDB()
  const logs = await ServiceLog.find({ userId: user.id })
    .sort({ date: -1 })
    .lean() as any[]
  return logs.map((l: any) => ({
    id:          l._id.toString(),
    evId:        l.evId.toString(),
    serviceType: l.serviceType,
    date:        l.date instanceof Date ? l.date.toISOString() : String(l.date),
    cost:        l.cost ?? null,
    notes:       l.notes ?? '',
    createdAt:   l.createdAt instanceof Date ? l.createdAt.toISOString() : String(l.createdAt),
  }))
}

/** Create a new service log entry. */
export async function createServiceLogAction(prevState: any, formData: FormData) {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const evId       = formData.get('evId')       as string
  const serviceType = formData.get('serviceType') as string
  const dateStr    = formData.get('date')        as string
  const costRaw    = formData.get('cost')        as string
  const notes      = formData.get('notes')       as string | null

  if (!evId || !serviceType || !dateStr) {
    return { error: 'Vehicle, service type, and date are required' }
  }

  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return { error: 'Invalid date' }

  const cost = costRaw ? parseFloat(costRaw) : undefined
  if (cost !== undefined && (isNaN(cost) || cost < 0)) {
    return { error: 'Cost must be a positive number' }
  }

  await connectDB()

  // Verify the EV belongs to this user
  const ev = await EvData.findOne({ _id: evId, userId: user.id }).lean()
  if (!ev) return { error: 'Vehicle not found' }

  const log = await ServiceLog.create({
    userId: user.id, evId, serviceType, date, cost, notes: notes || '',
  })

  revalidatePath('/service')
  revalidatePath('/dashboard')
  return { success: true, id: log._id.toString() }
}

/** Update an existing service log entry. */
export async function updateServiceLogAction(prevState: any, formData: FormData) {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const logId      = formData.get('logId')       as string
  const serviceType = formData.get('serviceType') as string
  const dateStr    = formData.get('date')        as string
  const costRaw    = formData.get('cost')        as string
  const notes      = formData.get('notes')       as string | null

  if (!logId || !serviceType || !dateStr) {
    return { error: 'Log ID, service type, and date are required' }
  }

  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return { error: 'Invalid date' }

  const cost = costRaw ? parseFloat(costRaw) : undefined
  if (cost !== undefined && (isNaN(cost) || cost < 0)) {
    return { error: 'Cost must be a positive number' }
  }

  await connectDB()

  // Ensure ownership
  const existing = await ServiceLog.findOne({ _id: logId, userId: user.id }).lean()
  if (!existing) return { error: 'Service log not found' }

  await ServiceLog.updateOne(
    { _id: logId },
    { $set: { serviceType, date, cost, notes: notes || '' } }
  )

  revalidatePath('/service')
  revalidatePath('/dashboard')
  return { success: true }
}

/** Delete a service log entry. Ownership-checked. */
export async function deleteServiceLogAction(logId: string) {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  await connectDB()
  await ServiceLog.deleteOne({ _id: logId, userId: user.id })

  revalidatePath('/service')
  revalidatePath('/dashboard')
  return { success: true }
}

// ============================================================
// ADMIN PORTAL — platform-level management (admin role only)
// ============================================================

/** Guard helper: resolves the current user and asserts admin role. */
async function requireAdmin() {
  const user = await getUser()
  if (!user) throw new Error('Unauthorized')
  if (user.role !== 'admin') throw new Error('Forbidden: admin access required')
  return user
}

/** Return a paginated list of all users (admin only). */
export async function adminGetUsersAction(page = 1, limit = 20) {
  try {
    await requireAdmin()
  } catch (e: any) {
    return { error: e.message }
  }
  await connectDB()
  const skip  = (page - 1) * limit
  const total = await User.countDocuments()
  const users = await User.find()
    .select('_id firstName lastName email role createdAt')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean() as any[]

  return {
    users: users.map((u: any) => ({
      id:        u._id.toString(),
      firstName: u.firstName ?? '',
      lastName:  u.lastName  ?? '',
      email:     u.email,
      role:      u.role ?? 'user',
      createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt),
    })),
    total,
    page,
    limit,
  }
}

/** Promote or demote a user's role (admin only). */
export async function adminSetUserRoleAction(targetUserId: string, role: 'user' | 'admin') {
  try {
    await requireAdmin()
  } catch (e: any) {
    return { error: e.message }
  }
  if (!['user', 'admin'].includes(role)) return { error: 'Invalid role' }
  await connectDB()
  await User.findByIdAndUpdate(targetUserId, { $set: { role } })
  revalidatePath('/admin')
  return { success: true }
}

/** Return aggregate service log stats across all users (admin only). */
export async function adminGetServiceStatsAction() {
  try {
    await requireAdmin()
  } catch (e: any) {
    return { error: e.message }
  }
  await connectDB()
  const [totalLogs, totalCostAgg, byType] = await Promise.all([
    ServiceLog.countDocuments(),
    ServiceLog.aggregate([{ $group: { _id: null, total: { $sum: '$cost' } } }]),
    ServiceLog.aggregate([{ $group: { _id: '$serviceType', count: { $sum: 1 } } }]),
  ])
  return {
    totalLogs,
    totalCost: totalCostAgg[0]?.total ?? 0,
    byType:    byType.map((b: any) => ({ serviceType: b._id, count: b.count })),
  }
}

/**
 * Aggregate platform-wide stats for the Admin Portal dashboard.
 * Strictly guarded — throws Forbidden if caller is not an admin.
 */
export async function adminGetSystemStatsAction() {
  try {
    await requireAdmin()
  } catch (e: any) {
    return { error: e.message as string }
  }
  await connectDB()

  const [
    totalUsers,
    totalEVs,
    totalTrips,
    totalServiceLogs,
    totalServiceCostAgg,
    recentUsers,
  ] = await Promise.all([
    User.countDocuments(),
    EvData.countDocuments(),
    Trip.countDocuments(),
    ServiceLog.countDocuments(),
    ServiceLog.aggregate([{ $group: { _id: null, total: { $sum: '$cost' } } }]),
    // 10 most recently registered users for the "New Users" table
    User.find()
      .select('_id firstName lastName email role createdAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  ])

  return {
    totalUsers,
    totalEVs,
    totalTrips,
    totalServiceLogs,
    totalServiceCost: totalServiceCostAgg[0]?.total ?? 0,
    recentUsers: (recentUsers as any[]).map((u: any) => ({
      id:        u._id.toString(),
      firstName: u.firstName ?? '',
      lastName:  u.lastName  ?? '',
      email:     u.email,
      role:      (u.role ?? 'user') as 'user' | 'admin',
      createdAt: u.createdAt instanceof Date
        ? u.createdAt.toISOString()
        : String(u.createdAt),
    })),
  }
}
