'use client'

import { useActionState } from 'react'
import { registerAction } from '@/app/actions'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Mail, Lock, User, AlertCircle, ArrowRight } from 'lucide-react'

const initialState = { error: '' }

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(registerAction, initialState)

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-500/20 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-500/20 rounded-full blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md z-10"
      >
        <div className="glass-panel p-8 rounded-3xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500" />
          
          <div className="text-center mb-8">
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.2 }}
              className="inline-flex items-center justify-center p-4 bg-purple-500/10 rounded-2xl mb-4"
            >
              <User className="w-8 h-8 text-purple-500" />
            </motion.div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Create Account</h1>
            <p className="text-sm text-foreground/60">Join to optimize your EV journey</p>
          </div>

          <form action={formAction} className="space-y-4">
            {state?.error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 p-3 bg-red-500/10 text-red-500 rounded-xl text-sm"
              >
                <AlertCircle className="w-4 h-4" />
                <span>{state.error}</span>
              </motion.div>
            )}

            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-foreground/40" />
              <input
                type="text"
                name="name"
                required
                placeholder="Full Name"
                className="w-full bg-background/50 border border-border rounded-xl px-12 py-3.5 outline-none focus:ring-2 focus:ring-purple-500 transition-all"
              />
            </div>

            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-foreground/40" />
              <input
                type="email"
                name="email"
                required
                placeholder="Email Address"
                className="w-full bg-background/50 border border-border rounded-xl px-12 py-3.5 outline-none focus:ring-2 focus:ring-purple-500 transition-all"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-foreground/40" />
              <input
                type="password"
                name="password"
                required
                placeholder="Password"
                className="w-full bg-background/50 border border-border rounded-xl px-12 py-3.5 outline-none focus:ring-2 focus:ring-purple-500 transition-all"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-foreground/40" />
              <input
                type="password"
                name="confirm"
                required
                placeholder="Confirm Password"
                className="w-full bg-background/50 border border-border rounded-xl px-12 py-3.5 outline-none focus:ring-2 focus:ring-purple-500 transition-all font-medium"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                <User className="w-4 h-4 text-purple-500" /> Profile Picture (Optional)
              </label>
              <input
                type="file"
                name="profilePic"
                accept="image/*"
                className="w-full bg-background/50 border border-border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 transition-all font-medium file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-purple-500/10 file:text-purple-500 hover:file:bg-purple-500/20"
              />
            </div>

            <button
              disabled={isPending}
              className="w-full flex items-center justify-center gap-2 mt-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl py-4 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              {isPending ? 'Creating...' : 'Sign Up'}
              {!isPending && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>

          <p className="text-center mt-6 text-sm text-foreground/60">
            Already have an account?{' '}
            <Link href="/login" className="text-purple-500 font-semibold hover:underline">
              Sign in Instead
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
