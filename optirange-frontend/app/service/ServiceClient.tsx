'use client'

import { useState, useTransition, useOptimistic, useActionState } from 'react'
import {
  Wrench, Car, Plus, Trash2, CalendarDays, DollarSign,
  FileText, ChevronRight, Loader2, AlertCircle, CheckCircle2,
  ClipboardList, Gauge, X,
} from 'lucide-react'
import { createServiceLogAction, deleteServiceLogAction } from '@/app/actions'
import { motion, AnimatePresence } from 'framer-motion'

// ── Types ────────────────────────────────────────────────────────────────────

export interface Car {
  id: string
  nickname: string
  make: string
  model: string
  batteryCapacity: number
  carPic: string | null
}

export interface ServiceLogEntry {
  id: string
  evId: string
  serviceType: string
  date: string
  cost: number | null
  notes: string
  createdAt: string
}

interface Props {
  cars: Car[]
  initialLogs: ServiceLogEntry[]
}

// ── Constants ────────────────────────────────────────────────────────────────

const SERVICE_TYPES = [
  'Tire Rotation', 'Battery Check', 'Software Update',
  'Brake Inspection', 'Cabin Filter', 'Coolant Service',
  'Wheel Alignment', 'Wiper Replacement', 'Other',
]

const TYPE_COLORS: Record<string, string> = {
  'Battery Check':    'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  'Tire Rotation':    'text-blue-400 bg-blue-400/10 border-blue-400/20',
  'Software Update':  'text-purple-400 bg-purple-400/10 border-purple-400/20',
  'Brake Inspection': 'text-red-400 bg-red-400/10 border-red-400/20',
  'Cabin Filter':     'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  'Coolant Service':  'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
  'Wheel Alignment':  'text-indigo-400 bg-indigo-400/10 border-indigo-400/20',
  'Wiper Replacement':'text-pink-400 bg-pink-400/10 border-pink-400/20',
  'Other':            'text-foreground/60 bg-foreground/5 border-border',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function carDisplayName(car: Car) {
  return car.nickname || `${car.make} ${car.model}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

// ── Main Component ────────────────────────────────────────────────────────────

const addInitialState = { error: '', success: false }

export default function ServiceClient({ cars, initialLogs }: Props) {
  const [selectedCarId, setSelectedCarId] = useState<string>(cars[0]?.id ?? '')
  const [logs, setLogs] = useState<ServiceLogEntry[]>(initialLogs)
  const [showForm, setShowForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [addState, addAction, isAdding] = useActionState(
    async (prev: any, formData: FormData) => {
      const result = await createServiceLogAction(prev, formData)
      if (result?.success) {
        // Optimistically append; a real refresh would come from revalidatePath
        const newLog: ServiceLogEntry = {
          id:          result.id,
          evId:        formData.get('evId') as string,
          serviceType: formData.get('serviceType') as string,
          date:        new Date(formData.get('date') as string).toISOString(),
          cost:        formData.get('cost') ? parseFloat(formData.get('cost') as string) : null,
          notes:       (formData.get('notes') as string) || '',
          createdAt:   new Date().toISOString(),
        }
        setLogs(prev => [newLog, ...prev])
        setShowForm(false)
      }
      return result
    },
    addInitialState
  )

  const handleDelete = (logId: string) => {
    startTransition(async () => {
      setDeletingId(logId)
      await deleteServiceLogAction(logId)
      setLogs(prev => prev.filter(l => l.id !== logId))
      setDeletingId(null)
    })
  }

  const selectedCar = cars.find(c => c.id === selectedCarId)
  const carLogs = logs.filter(l => l.evId === selectedCarId)
  const totalCost = carLogs.reduce((s, l) => s + (l.cost ?? 0), 0)

  return (
    <>
      {/* ── Page Header ── */}
      <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-10 gap-4 relative z-10">
        <div>
          <h1 className="text-3xl font-bold mb-1 flex items-center gap-3">
            <span className="inline-flex p-2.5 bg-orange-500/10 rounded-xl">
              <Wrench className="h-7 w-7 text-orange-400" aria-hidden="true" />
            </span>
            Service Logs
          </h1>
          <p className="text-foreground/50 mt-1 text-sm">
            Track maintenance history and costs across your entire fleet.
          </p>
        </div>

        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-orange-500/25 font-semibold shrink-0"
          id="add-service-log-btn"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Log Service
        </button>
      </header>

      <div className="relative z-10 grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-6">
        {/* ── Vehicle Selector Panel ── */}
        <aside aria-label="Vehicle selector">
          <div className="glass-panel rounded-2xl p-4 sticky top-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-foreground/40 mb-3 px-1">
              My Vehicles
            </h2>
            <ul className="space-y-2" role="listbox" aria-label="Select a vehicle">
              {cars.map(car => {
                const isActive = car.id === selectedCarId
                const logCount = logs.filter(l => l.evId === car.id).length
                return (
                  <li key={car.id}>
                    <button
                      role="option"
                      aria-selected={isActive}
                      onClick={() => { setSelectedCarId(car.id); setShowForm(false) }}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all group ${
                        isActive
                          ? 'bg-orange-500/10 border border-orange-500/25 text-orange-400'
                          : 'hover:bg-foreground/5 border border-transparent text-foreground/70 hover:text-foreground'
                      }`}
                      id={`vehicle-tab-${car.id}`}
                    >
                      {car.carPic ? (
                        <img
                          src={car.carPic}
                          alt={carDisplayName(car)}
                          className="w-10 h-10 rounded-lg object-cover shrink-0 border border-border"
                        />
                      ) : (
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                          isActive ? 'bg-orange-500/20' : 'bg-foreground/5'
                        }`}>
                          <Car className="w-5 h-5" aria-hidden="true" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{carDisplayName(car)}</p>
                        <p className="text-xs text-foreground/40 truncate">
                          {car.make} {car.model}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-md ${
                          isActive ? 'bg-orange-500/20 text-orange-400' : 'bg-foreground/5 text-foreground/40'
                        }`}>
                          {logCount}
                        </span>
                        <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isActive ? 'text-orange-400 rotate-90' : 'text-foreground/20'}`} />
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </aside>

        {/* ── Main Content Panel ── */}
        <section aria-label={`Service logs for ${selectedCar ? carDisplayName(selectedCar) : 'selected vehicle'}`}>

          {/* Stats row */}
          {selectedCar && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
              <div className="glass-panel rounded-2xl p-4 flex items-center gap-3">
                <div className="p-2 bg-orange-500/10 rounded-lg">
                  <ClipboardList className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-xs text-foreground/40 font-medium">Total Services</p>
                  <p className="text-2xl font-bold">{carLogs.length}</p>
                </div>
              </div>
              <div className="glass-panel rounded-2xl p-4 flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-foreground/40 font-medium">Total Spent</p>
                  <p className="text-2xl font-bold">
                    ${totalCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
              <div className="glass-panel rounded-2xl p-4 flex items-center gap-3 col-span-2 sm:col-span-1">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Gauge className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-foreground/40 font-medium">Battery</p>
                  <p className="text-2xl font-bold">{selectedCar.batteryCapacity} <span className="text-sm font-normal text-foreground/40">kWh</span></p>
                </div>
              </div>
            </div>
          )}

          {/* ── Add Service Form ── */}
          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ opacity: 0, y: -16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.98 }}
                transition={{ duration: 0.25 }}
                className="glass-panel rounded-2xl p-6 mb-6 border border-orange-500/20 relative overflow-hidden"
                id="add-service-form-panel"
              >
                {/* Gradient accent */}
                <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400" />

                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <Plus className="w-5 h-5 text-orange-400" />
                    Log New Service
                  </h3>
                  <button
                    onClick={() => setShowForm(false)}
                    className="p-1.5 rounded-lg hover:bg-foreground/10 text-foreground/40 hover:text-foreground transition-colors"
                    aria-label="Close form"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Error/success feedback */}
                <AnimatePresence mode="wait">
                  {addState?.error && (
                    <motion.div
                      key={addState.error}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 p-3 mb-4 bg-red-500/10 text-red-400 rounded-xl text-sm font-medium"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {addState.error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <form action={addAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Hidden vehicle id */}
                  <input type="hidden" name="evId" value={selectedCarId} />

                  {/* Service Type */}
                  <div className="space-y-1.5">
                    <label htmlFor="svc-type" className="text-xs font-semibold text-foreground/60 flex items-center gap-1.5 uppercase tracking-wide">
                      <Wrench className="w-3.5 h-3.5 text-orange-400" /> Service Type
                    </label>
                    <select
                      id="svc-type"
                      name="serviceType"
                      required
                      defaultValue=""
                      className="w-full bg-background/60 border border-border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500 transition-all text-sm font-medium appearance-none"
                    >
                      <option value="" disabled>Select a type…</option>
                      {SERVICE_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {/* Date */}
                  <div className="space-y-1.5">
                    <label htmlFor="svc-date" className="text-xs font-semibold text-foreground/60 flex items-center gap-1.5 uppercase tracking-wide">
                      <CalendarDays className="w-3.5 h-3.5 text-blue-400" /> Service Date
                    </label>
                    <input
                      id="svc-date"
                      type="date"
                      name="date"
                      required
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      className="w-full bg-background/60 border border-border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium"
                    />
                  </div>

                  {/* Cost */}
                  <div className="space-y-1.5">
                    <label htmlFor="svc-cost" className="text-xs font-semibold text-foreground/60 flex items-center gap-1.5 uppercase tracking-wide">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Cost (optional)
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40 text-sm">$</span>
                      <input
                        id="svc-cost"
                        type="number"
                        name="cost"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="w-full bg-background/60 border border-border rounded-xl pl-8 pr-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm font-medium"
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <label htmlFor="svc-notes" className="text-xs font-semibold text-foreground/60 flex items-center gap-1.5 uppercase tracking-wide">
                      <FileText className="w-3.5 h-3.5 text-purple-400" /> Notes (optional)
                    </label>
                    <textarea
                      id="svc-notes"
                      name="notes"
                      rows={2}
                      placeholder="Any additional details about this service visit…"
                      className="w-full bg-background/60 border border-border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 transition-all text-sm font-medium resize-none"
                    />
                  </div>

                  {/* Submit */}
                  <div className="sm:col-span-2 flex justify-end gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="px-5 py-2.5 rounded-xl border border-border text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isAdding}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-60 text-white font-semibold text-sm transition-all shadow-lg shadow-orange-500/20"
                      id="submit-service-log-btn"
                    >
                      {isAdding ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                      ) : (
                        <><CheckCircle2 className="w-4 h-4" /> Save Log</>
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Log List ── */}
          <div className="glass-panel rounded-2xl overflow-hidden">
            {/* List header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-bold text-base flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-orange-400" />
                {selectedCar ? carDisplayName(selectedCar) : 'Vehicle'} — History
              </h2>
              {carLogs.length > 0 && (
                <span className="text-xs text-foreground/40 font-medium">
                  {carLogs.length} record{carLogs.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {carLogs.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-4">
                  <Wrench className="w-8 h-8 text-orange-400/60" />
                </div>
                <h3 className="font-bold text-lg mb-1">No service records yet</h3>
                <p className="text-sm text-foreground/40 max-w-xs">
                  Start tracking your EV's maintenance history. Click{' '}
                  <strong className="text-orange-400">Log Service</strong> to add your first entry.
                </p>
                <button
                  onClick={() => setShowForm(true)}
                  className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 font-semibold text-sm transition-all border border-orange-500/20"
                >
                  <Plus className="w-4 h-4" /> Add First Record
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-border" aria-label="Service log entries">
                <AnimatePresence initial={false}>
                  {carLogs.map((log, idx) => {
                    const chipCls = TYPE_COLORS[log.serviceType] ?? TYPE_COLORS['Other']
                    return (
                      <motion.li
                        key={log.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20, height: 0 }}
                        transition={{ duration: 0.2, delay: idx * 0.03 }}
                        className="flex items-start gap-4 px-6 py-4 hover:bg-foreground/2 transition-colors group"
                        id={`service-log-${log.id}`}
                      >
                        {/* Icon */}
                        <div className={`mt-0.5 p-2 rounded-lg border shrink-0 ${chipCls}`}>
                          <Wrench className="w-4 h-4" aria-hidden="true" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${chipCls}`}>
                              {log.serviceType}
                            </span>
                            <span className="text-xs text-foreground/40 flex items-center gap-1">
                              <CalendarDays className="w-3 h-3" />
                              {fmtDate(log.date)}
                            </span>
                            {log.cost !== null && (
                              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-0.5">
                                <DollarSign className="w-3 h-3" />
                                {log.cost.toFixed(2)}
                              </span>
                            )}
                          </div>
                          {log.notes && (
                            <p className="text-sm text-foreground/50 mt-1.5 leading-relaxed">
                              {log.notes}
                            </p>
                          )}
                        </div>

                        {/* Delete */}
                        <button
                          onClick={() => handleDelete(log.id)}
                          disabled={deletingId === log.id}
                          className="shrink-0 p-1.5 rounded-lg text-foreground/20 hover:text-red-400 hover:bg-red-400/10 transition-all opacity-0 group-hover:opacity-100"
                          aria-label={`Delete service log from ${fmtDate(log.date)}`}
                          id={`delete-log-${log.id}`}
                        >
                          {deletingId === log.id
                            ? <Loader2 className="w-4 h-4 animate-spin text-foreground/40" />
                            : <Trash2 className="w-4 h-4" />
                          }
                        </button>
                      </motion.li>
                    )
                  })}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  )
}
