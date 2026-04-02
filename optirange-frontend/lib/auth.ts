import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'
import { openDb } from './db'

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

  const db = await openDb()
  const user = await db.get('SELECT id, name, email, profilePic FROM users WHERE id = ?', [decoded.id])
  
  if (!user) return null
  return user
}

export async function clearUserSession() {
  const cookieStore = await cookies()
  cookieStore.delete('auth-token')
}

export async function setUserSession(userId: number) {
  const token = await signToken({ id: userId })
  const cookieStore = await cookies()
  cookieStore.set('auth-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/'
  })
}
