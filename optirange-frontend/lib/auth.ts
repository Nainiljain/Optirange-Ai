import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'
import { connectDB } from './db'
import { User } from './models'

const JWT_SECRET = process.env.JWT_SECRET || 'optirange-super-secret-key-2026'

export async function signToken(payload: any) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

export async function verifyToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET) as any
  } catch (error) {
    return null
  }
}

export async function getUser() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth-token')
  
  if (!token?.value) {
    return null
  }

  const decoded = await verifyToken(token.value)
  if (!decoded || !decoded.id) {
    return null
  }

  await connectDB()
  
  let user;
  try {
    user = await User.findById(decoded.id).select('_id firstName lastName name email profilePic role').lean() as any;
  } catch (err) {
    // Gracefully handle SQLite "1" IDs crashing MongoDB ObjectID casting
    return null;
  }
  
  if (!user) return null

  let firstName = user.firstName;
  let lastName = user.lastName;
  if (!firstName && !lastName && user.name) {
    const parts = user.name.split(' ');
    firstName = parts[0] || '';
    lastName = parts.slice(1).join(' ') || '';
  }

  // Return a fully serialised plain object — safe to pass to Client Components
  return {
    id:         user._id.toString(),
    _id:        user._id.toString(),
    firstName:  firstName ?? '',
    lastName:   lastName  ?? '',
    email:      user.email      ?? '',
    profilePic: user.profilePic ?? null,
    // RBAC: expose role so layouts can gate admin-only routes/UI
    role:       (user.role as 'user' | 'admin') ?? 'user',
  }
}

export async function clearUserSession() {
  const cookieStore = await cookies()
  cookieStore.delete('auth-token')
}

export async function setUserSession(userId: string | number) {
  const token = await signToken({ id: userId.toString() })
  const cookieStore = await cookies()
  cookieStore.set('auth-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/'
  })
}