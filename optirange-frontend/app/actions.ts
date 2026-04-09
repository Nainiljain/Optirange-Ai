'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
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
  redirect('/')
}

export async function saveEvData(prevState: any, formData: FormData) {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const make = formData.get('make') as string
  const model = formData.get('model') as string
  const batteryCapacity = Number(formData.get('batteryCapacity'))
  const rangeAtFull = Number(formData.get('rangeAtFull'))
  const currentCharge = batteryCapacity // Start at full charge by default

  if (!make || !model || !batteryCapacity || !rangeAtFull) {
    return { error: 'Please fill all fields properly' }
  }

  await connectDB()

  const carPicFile = formData.get('carPic') as File | null
  let carPicUrl = await fileToBase64(carPicFile)

  const exists = await EvData.findOne({ userId: user.id })
  
  if (exists) {
    if (!carPicUrl && exists.carPic) {
      carPicUrl = exists.carPic // Keep existing if not uploaded new
    }
    await EvData.updateOne(
      { userId: user.id },
      { make, model, batteryCapacity, currentCharge, rangeAtFull, carPic: carPicUrl }
    )
  } else {
    await EvData.create({
      userId: user.id, make, model, batteryCapacity, currentCharge, rangeAtFull, carPic: carPicUrl
    })
  }

  revalidatePath('/dashboard')
  redirect('/health-setup')
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

export async function calculateTripData(
  startLat: number, startLon: number, 
  destLat: number, destLon: number
) {
  // Haversine formula to mathematically compute exact spherical earth distance
  const R = 3958.8; // Radius of the Earth in miles
  const dLat = (destLat - startLat) * (Math.PI / 180);
  const dLon = (destLon - startLon) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(startLat * (Math.PI / 180)) * Math.cos(destLat * (Math.PI / 180)) * 
            Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  const crowFliesDistance = R * c; 
  
  // Driving distances naturally curve and route. Applying standard ~25% detour multiplier makes it incredibly accurate
  let drivingDistance = Math.round(crowFliesDistance * 1.25);
  if (drivingDistance < 1) drivingDistance = 1;

  // Assuming average travel speeds factoring in highways vs local (approx 55mph average)
  const durationMinutes = Math.round((drivingDistance / 55) * 60);

  return { drivingDistance, durationMinutes };
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

export async function runPredictionAction(
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

