'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import { openDb } from '@/lib/db'
import { getUser, setUserSession, clearUserSession } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

async function uploadFile(file: any, prefix: string): Promise<string | null> {
  if (!file || typeof file === 'string' || !file.name || typeof file.arrayBuffer !== 'function' || file.size === 0) {
    return null
  }
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const dir = join(process.cwd(), 'public', 'uploads')
    await mkdir(dir, { recursive: true })
    const filename = `${prefix}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    await writeFile(join(dir, filename), buffer)
    return `/uploads/${filename}`
  } catch (e) {
    console.error("Upload failed", e)
    return null
  }
}

export async function loginAction(prevState: any, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) return { error: 'Please fill all fields' }

  const db = await openDb()
  const user = await db.get('SELECT * FROM users WHERE email = ?', [email])

  if (!user) return { error: 'User not found' }

  const match = await bcrypt.compare(password, user.password)
  if (!match) return { error: 'Invalid password' }

  await setUserSession(user.id)

  // Check if user has EV data
  const evData = await db.get('SELECT * FROM ev_data WHERE userId = ?', [user.id])
  if (!evData) {
    redirect('/ev-setup')
  }

  // Check if user has health data
  const healthData = await db.get('SELECT * FROM health_data WHERE userId = ?', [user.id])
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

  const db = await openDb()
  const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [email])
  if (existingUser) return { error: 'Email already registered' }

  const profilePicFile = formData.get('profilePic') as File | null
  const profilePicUrl = await uploadFile(profilePicFile, 'profile')

  const hash = await bcrypt.hash(password, 10)
  const result = await db.run(
    'INSERT INTO users (name, email, password, profilePic) VALUES (?, ?, ?, ?)',
    [name, email, hash, profilePicUrl]
  )

  if (result.lastID) {
    await setUserSession(result.lastID)
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

  const db = await openDb()

  const carPicFile = formData.get('carPic') as File | null
  let carPicUrl = await uploadFile(carPicFile, 'car')

  // check if exists
  const exists = await db.get('SELECT id, carPic FROM ev_data WHERE userId = ?', [user.id])
  
  if (exists) {
    if (!carPicUrl && exists.carPic) {
      carPicUrl = exists.carPic // Keep existing if not uploaded new
    }
    await db.run(
      `UPDATE ev_data SET make = ?, model = ?, batteryCapacity = ?, currentCharge = ?, rangeAtFull = ?, carPic = ? WHERE userId = ?`,
      [make, model, batteryCapacity, currentCharge, rangeAtFull, carPicUrl, user.id]
    )
  } else {
    await db.run(
      `INSERT INTO ev_data (userId, make, model, batteryCapacity, currentCharge, rangeAtFull, carPic) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user.id, make, model, batteryCapacity, currentCharge, rangeAtFull, carPicUrl]
    )
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

  const db = await openDb()
  const result = await db.run(
    `INSERT INTO trips (userId, startLocation, endLocation, distance, estimatedTime, batteryUsed, chargingStops) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [user.id, startLocation, endLocation, distance, estimatedTime, batteryUsed, chargingStops]
  )

  // Also deduct battery from current charge (simulate trip completion)
  // Optional depending on if they just "plan" or actually "log" the trip. Let's just create the trip for history.

  revalidatePath('/dashboard')
  revalidatePath('/trip-planner')
  return { success: true, tripId: result.lastID }
}

export async function deleteTripAction(tripId: number) {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const db = await openDb()
  await db.run('DELETE FROM trips WHERE id = ? AND userId = ?', [tripId, user.id])
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

  const db = await openDb()
  const exists = await db.get('SELECT id FROM health_data WHERE userId = ?', [user.id])
  
  if (exists) {
    await db.run(
      `UPDATE health_data SET age = ?, healthCondition = ?, preferredRestInterval = ? WHERE userId = ?`,
      [age, healthCondition, preferredRestInterval, user.id]
    )
  } else {
    await db.run(
      `INSERT INTO health_data (userId, age, healthCondition, preferredRestInterval) VALUES (?, ?, ?, ?)`,
      [user.id, age, healthCondition, preferredRestInterval]
    )
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
