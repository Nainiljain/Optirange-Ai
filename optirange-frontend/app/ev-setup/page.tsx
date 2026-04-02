'use client'

import { useActionState } from 'react'
import { saveEvData } from '@/app/actions'
import { motion } from 'framer-motion'
import { Car, Zap, Battery, Activity, ArrowRight, AlertCircle, Settings2 } from 'lucide-react'

const initialState = { error: '' }

export default function EvSetupPage() {
  const [state, formAction, isPending] = useActionState(saveEvData, initialState)

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-emerald-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-500/10 rounded-full blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-2xl z-10"
      >
        <div className="glass-panel p-8 md:p-12 rounded-3xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 via-teal-500 to-blue-500" />
          
          <div className="text-center mb-10">
            <motion.div 
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', delay: 0.2 }}
              className="inline-flex items-center justify-center p-5 bg-emerald-500/10 rounded-2xl mb-4"
            >
              <Settings2 className="w-10 h-10 text-emerald-500" />
            </motion.div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">Configure Your EV</h1>
            <p className="text-base text-foreground/60 max-w-md mx-auto">
              Please provide your electric vehicle specifications so we can give you accurate routing and charging estimates.
            </p>
          </div>

          <form action={formAction} className="space-y-6">
            {state?.error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 p-4 bg-red-500/10 text-red-500 rounded-xl text-sm font-semibold"
              >
                <AlertCircle className="w-5 h-5" />
                <span>{state.error}</span>
              </motion.div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                  <Car className="w-4 h-4 text-emerald-500" /> Make (Brand)
                </label>
                <input
                  type="text"
                  name="make"
                  required
                  placeholder="e.g. Tesla"
                  className="w-full bg-background/50 border border-border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                  <Car className="w-4 h-4 text-emerald-500" /> Model
                </label>
                <input
                  type="text"
                  name="model"
                  required
                  placeholder="e.g. Model 3 Long Range"
                  className="w-full bg-background/50 border border-border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                  <Battery className="w-4 h-4 text-blue-500" /> Battery Capacity
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    name="batteryCapacity"
                    required
                    placeholder="e.g. 75"
                    className="w-full bg-background/50 border border-border rounded-xl px-4 py-3 pr-16 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground/40 font-semibold text-sm">kWh</span>
                </div>
              </div>


              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-500" /> Range at Full Charge
                </label>
                <div className="relative">
                  <input
                    type="number"
                    name="rangeAtFull"
                    required
                    placeholder="e.g. 350"
                    className="w-full bg-background/50 border border-border rounded-xl px-4 py-3 pr-16 outline-none focus:ring-2 focus:ring-purple-500 transition-all font-medium"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground/40 font-semibold text-sm">km</span>
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                  <Car className="w-4 h-4 text-emerald-500" /> Vehicle Picture (Optional)
                </label>
                <input
                  type="file"
                  name="carPic"
                  accept="image/*"
                  className="w-full bg-background/50 border border-border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-emerald-500/10 file:text-emerald-500 hover:file:bg-emerald-500/20"
                />
              </div>
            </div>

            <button
              disabled={isPending}
              className="w-full flex items-center justify-center gap-2 mt-8 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-xl py-4 font-semibold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed group shadow-lg shadow-emerald-500/20"
            >
              {isPending ? 'Saving Configuration...' : 'Save & Continue'}
              {!isPending && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
