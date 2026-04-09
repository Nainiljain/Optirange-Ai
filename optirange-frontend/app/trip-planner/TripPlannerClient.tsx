"use client";

import { useState } from "react";
import {
  saveTripData,
  calculateTripData,
  runMLPredictionDirect,
  fetchNRCanStationsAction,
} from "@/app/actions";
import {
  interpolateWaypoints,
  type ChargingStation,
} from "@/lib/tripUtils";
import {
  MapPin, Navigation, Battery, Activity, Loader2,
  Zap, Car, Map, CloudRain, Thermometer, Cloud, Brain, ShieldCheck,
  CheckCircle2, Info, ChevronDown, ChevronUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────

import { type Stop, type RouteResult } from "@/lib/tripUtils";

// ─── Component ────────────────────────────────────────────────────────────────

export default function TripPlannerClient({
  user, allEvData, initialEvData, healthData,
}: {
  user: any;
  allEvData: any[];       // all cars for this user
  initialEvData: any;     // pre-selected car (from ?carId or most recent)
  healthData: any;
}) {
  // ── Car selector state ────────────────────────────────────────────────────
  const [selectedCar, setSelectedCar] = useState<any>(initialEvData);
  const [showCarPicker, setShowCarPicker] = useState(false);
  const multiCar = allEvData.length > 1;

  const [start, setStart] = useState("");
  const [destination, setDestination] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [batteryPct, setBatteryPct] = useState<number | "">(80);
  const [isStarting, setIsStarting] = useState(false);

  const [startSuggestions, setStartSuggestions] = useState<any[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<any[]>([]);
  const [showStartSugg, setShowStartSugg] = useState(false);
  const [showDestSugg, setShowDestSugg] = useState(false);
  const [startCoords, setStartCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [destCoords, setDestCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [weatherInfo, setWeatherInfo] = useState<any>(null);
  const [weatherPenalty, setWeatherPenalty] = useState<number>(0);

  // When user switches car, reset result and battery slider
  const handleSelectCar = (car: any) => {
    setSelectedCar(car);
    setShowCarPicker(false);
    setRouteResult(null);
    setBatteryPct(80);
  };

  const handleSearch = async (query: string, setSugg: Function, setShow: Function) => {
    if (query.length < 3) { setSugg([]); return; }
    try {
      const res = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(query)}&maxLocations=5`);
      const data = await res.json();
      setSugg(data.candidates || []);
      setShow(true);
    } catch (e) { console.error("Geocoding error", e); }
  };

  const resolveCoords = async (address: string, existing: { lat: number; lon: number } | null) => {
    if (existing) return existing;
    try {
      const res = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(address)}&maxLocations=1`);
      const data = await res.json();
      const c = data.candidates?.[0];
      if (c) return { lat: c.location.y, lon: c.location.x };
    } catch (e) { console.error(e); }
    return null;
  };

  const handlePlanTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setWeatherInfo(null);
    setWeatherPenalty(0);

    try {
      setLoadingStep("Resolving locations…");
      const sCoords = await resolveCoords(start, startCoords);
      const dCoords = await resolveCoords(destination, destCoords);

      if (!sCoords || !dCoords) {
        alert("Could not locate one of the addresses. Please select from the dropdown.");
        setLoading(false);
        return;
      }
      setStartCoords(sCoords);
      setDestCoords(dCoords);

      // Weather
      setLoadingStep("Fetching live weather data…");
      let wInfo = null;
      let wPenalty = 0;
      try {
        const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${dCoords.lat}&longitude=${dCoords.lon}&current_weather=true`);
        const wData = await wRes.json();
        if (wData?.current_weather) {
          wInfo = wData.current_weather;
          setWeatherInfo(wInfo);
          if (wInfo.temperature < 10) wPenalty += 0.15;
          if (wInfo.temperature > 35) wPenalty += 0.10;
          if (wInfo.weathercode >= 50) wPenalty += 0.05;
          setWeatherPenalty(wPenalty);
        }
      } catch (e) { console.error("Weather fetch:", e); }

      // Google Maps Distance
      setLoadingStep("Calculating route via Google Maps…");
      const serverStats = await calculateTripData(sCoords.lat, sCoords.lon, dCoords.lat, dCoords.lon);
      const distance = serverStats.drivingDistance;
      const timeHrs = Math.floor(serverStats.durationMinutes / 60);
      const timeMins = serverStats.durationMinutes % 60;
      const timeStr = `${timeHrs}h ${timeMins}m`;

      // ML Prediction Engine
      setLoadingStep("Running ML prediction model…");
      const currentChargePct = typeof batteryPct === "number" ? batteryPct : 80;
      const effectiveBattery = (currentChargePct / 100) * selectedCar.batteryCapacity;
      const mlResult = await runMLPredictionDirect(effectiveBattery, distance, wPenalty, healthData);

      const batteryUsed = Math.min(effectiveBattery, distance / 4.5);
      const numStops = mlResult.stops;
      const effectiveRange = mlResult.effective_range_miles;

      let maxStretch = healthData?.preferredRestInterval || 120;
      if (["back_pain","pregnancy","bladder"].includes(healthData?.healthCondition)) {
        maxStretch = maxStretch * 0.9;
      }

      // NRCan Charging Stations
      setLoadingStep("Fetching real charging stations from NRCan…");
      const waypointCoords = numStops > 0
        ? interpolateWaypoints(sCoords.lat, sCoords.lon, dCoords.lat, dCoords.lon, numStops)
        : [];

      let nrcanStations: ChargingStation[][] = [];
      if (waypointCoords.length > 0) {
        try { nrcanStations = await fetchNRCanStationsAction(waypointCoords); }
        catch (e) { console.error("NRCan:", e); }
      }

      // Build stops
      const stops: Stop[] = [];
      let remainingDist = distance;
      let currentRange = effectiveRange;

      for (let i = 0; i < numStops && remainingDist > 0; i++) {
        const distToStop = Math.min(currentRange - 20, maxStretch);
        remainingDist -= distToStop;
        if (remainingDist <= 0) break;

        const isRestStop = distToStop === maxStretch && distToStop < (currentRange - 20);
        const chargeTo = isRestStop ? "50%" : "80%";
        const chargeTime = isRestStop ? "15 mins (Rest & top-up)" : "25 mins (Fast Charge)";

        const stationOptions = nrcanStations[i] || [];
        const bestStation = isRestStop
          ? stationOptions[0]
          : stationOptions.find(s => s.dcFastPorts > 0) || stationOptions[0];

        stops.push({
          name: bestStation ? bestStation.name : (isRestStop ? `Rest Stop ${i+1}` : `FastCharge Node ${i+1}`),
          location: bestStation
            ? `${bestStation.address}${bestStation.city ? ', ' + bestStation.city : ''}${bestStation.province ? ', ' + bestStation.province : ''}`
            : `Near route milestone ${Math.floor(distance - remainingDist)} mi`,
          arriveWith: isRestStop ? `${Math.floor(((currentRange - distToStop) / effectiveRange) * 100)}%` : "15%",
          chargeTime,
          chargeTo,
          station: bestStation,
        });
        currentRange = isRestStop ? effectiveRange * 0.5 : effectiveRange * 0.8;
      }

      const result: RouteResult = {
        distance, timeStr, batteryUsed, stops,
        startCoords: sCoords, destCoords: dCoords,
        distanceSource: serverStats.source,
        mlStatus: mlResult.status,
        mlHealthAdvice: mlResult.health_advice,
        mlEffectiveRange: mlResult.effective_range_miles,
      };

      setRouteResult(result);
      sessionStorage.setItem("currentRoute", JSON.stringify(result));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  // Google Maps embed
  const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";
  const hasGoogleKey = googleMapsKey && !googleMapsKey.startsWith("YOUR_");

  const getMapEmbedUrl = () => {
    if (!routeResult?.startCoords || !routeResult?.destCoords) return null;
    const { startCoords: sc, destCoords: dc } = routeResult;
    if (hasGoogleKey) {
      const wp = routeResult.stops.filter(s => s.station).map(s => `${s.station!.lat},${s.station!.lon}`).join("|");
      return `https://www.google.com/maps/embed/v1/directions?key=${googleMapsKey}&origin=${sc.lat},${sc.lon}&destination=${dc.lat},${dc.lon}${wp ? `&waypoints=${wp}` : ""}&mode=driving`;
    }
    return `https://www.openstreetmap.org/export/embed.html?bbox=${Math.min(sc.lon, dc.lon)-0.5},${Math.min(sc.lat, dc.lat)-0.5},${Math.max(sc.lon, dc.lon)+0.5},${Math.max(sc.lat, dc.lat)+0.5}&layer=mapnik`;
  };

  const mapEmbedUrl = routeResult ? getMapEmbedUrl() : null;

  return (
    <div className="flex flex-col xl:flex-row gap-8">
      {/* ── Left: Form ──────────────────────────────────────────────────── */}
      <div className="w-full xl:w-1/3 shrink-0">
        <div className="glass-panel p-6 rounded-2xl shadow-xl relative overflow-visible">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500" />
          <form onSubmit={handlePlanTrip} className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-foreground/60 uppercase tracking-wider">Route Details</h3>
              <div className="space-y-3 relative z-50">
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-500" />
                  <input type="text" required placeholder="Starting location" value={start}
                    onFocus={() => { if (startSuggestions.length) setShowStartSugg(true); }}
                    onBlur={() => setTimeout(() => setShowStartSugg(false), 200)}
                    onChange={e => { setStart(e.target.value); handleSearch(e.target.value, setStartSuggestions, setShowStartSugg); }}
                    className="w-full bg-background/50 border border-border rounded-xl px-12 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                  />
                  <AnimatePresence>
                    {showStartSugg && startSuggestions.length > 0 && (
                      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-50">
                        {startSuggestions.map((s, i) => (
                          <div key={i} onClick={() => { setStart(s.address); setStartCoords({ lat: s.location.y, lon: s.location.x }); setShowStartSugg(false); }}
                            className="px-4 py-3 hover:bg-secondary cursor-pointer border-b border-border last:border-0">
                            <p className="font-bold text-sm truncate">{s.address.split(",")[0]}</p>
                            <p className="text-xs text-foreground/50 truncate">{s.address.split(",").slice(1).join(",").trim()}</p>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <div className="relative z-40">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-500" />
                  <input type="text" required placeholder="Destination" value={destination}
                    onFocus={() => { if (destSuggestions.length) setShowDestSugg(true); }}
                    onBlur={() => setTimeout(() => setShowDestSugg(false), 200)}
                    onChange={e => { setDestination(e.target.value); handleSearch(e.target.value, setDestSuggestions, setShowDestSugg); }}
                    className="w-full bg-background/50 border border-border rounded-xl px-12 py-3.5 outline-none focus:ring-2 focus:ring-purple-500 transition-all font-medium"
                  />
                  <AnimatePresence>
                    {showDestSugg && destSuggestions.length > 0 && (
                      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-50">
                        {destSuggestions.map((s, i) => (
                          <div key={i} onClick={() => { setDestination(s.address); setDestCoords({ lat: s.location.y, lon: s.location.x }); setShowDestSugg(false); }}
                            className="px-4 py-3 hover:bg-secondary cursor-pointer border-b border-border last:border-0">
                            <p className="font-bold text-sm truncate">{s.address.split(",")[0]}</p>
                            <p className="text-xs text-foreground/50 truncate">{s.address.split(",").slice(1).join(",").trim()}</p>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
            <hr className="border-border" />

            {/* ── Car Selector ──────────────────────────────────────── */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-foreground/60 uppercase tracking-wider">
                {multiCar ? "Select Vehicle" : "Active Vehicle"}
              </h3>

              {/* Selected car display / dropdown trigger */}
              <div
                onClick={() => multiCar && setShowCarPicker(v => !v)}
                className={`p-4 bg-secondary/50 rounded-xl border transition-all ${
                  multiCar
                    ? "border-blue-500/30 cursor-pointer hover:border-blue-500/60 hover:bg-secondary"
                    : "border-border cursor-default"
                }`}
              >
                <div className="flex items-center gap-3">
                  {selectedCar.carPic ? (
                    <img src={selectedCar.carPic} alt="Car"
                      className="w-12 h-12 rounded-lg object-cover shrink-0 border border-border" />
                  ) : (
                    <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-lg shrink-0">
                      <Car className="w-5 h-5" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {selectedCar.nickname && (
                      <p className="text-xs font-bold text-blue-400 truncate">{selectedCar.nickname}</p>
                    )}
                    <p className="font-bold truncate">{selectedCar.make} {selectedCar.model}</p>
                    <p className="text-xs text-foreground/50 mt-0.5">
                      {selectedCar.batteryCapacity} kWh · {selectedCar.rangeAtFull} km range
                    </p>
                  </div>
                  {multiCar && (
                    <div className="text-foreground/40 shrink-0">
                      {showCarPicker ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  )}
                </div>
              </div>

              {/* Car picker dropdown */}
              <AnimatePresence>
                {showCarPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
                  >
                    <p className="px-4 pt-3 pb-2 text-xs font-bold text-foreground/40 uppercase tracking-wider">
                      Choose a vehicle
                    </p>
                    {allEvData.map((car: any) => (
                      <div
                        key={car._id}
                        onClick={() => handleSelectCar(car)}
                        className={`px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors border-t border-border hover:bg-secondary ${
                          selectedCar._id === car._id ? "bg-blue-500/10" : ""
                        }`}
                      >
                        {car.carPic ? (
                          <img src={car.carPic} alt="Car" className="w-10 h-10 rounded-lg object-cover shrink-0 border border-border" />
                        ) : (
                          <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg shrink-0">
                            <Car className="w-4 h-4" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          {car.nickname && <p className="text-xs text-blue-400 font-semibold truncate">{car.nickname}</p>}
                          <p className="font-semibold text-sm truncate">{car.make} {car.model}</p>
                          <p className="text-xs text-foreground/40">{car.batteryCapacity} kWh · {car.rangeAtFull} km</p>
                        </div>
                        {selectedCar._id === car._id && (
                          <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                        )}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Battery slider — always shown below car selector */}
              <div className="p-4 bg-secondary/30 rounded-xl border border-border space-y-2">
                <div className="flex justify-between text-sm items-center">
                  <span className="text-foreground/60 font-semibold">Current Charge (%)</span>
                  <input
                    type="number" required min="1" max="100" value={batteryPct}
                    onChange={e => setBatteryPct(e.target.value === "" ? "" : parseInt(e.target.value))}
                    className="w-20 bg-background border border-border rounded-lg text-center font-bold text-blue-500 py-1.5 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="80"
                  />
                </div>
                <input
                  type="range" min="1" max="100" value={batteryPct || 80}
                  onChange={e => setBatteryPct(parseInt(e.target.value))}
                  className="w-full h-2 bg-border rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <p className="text-xs text-foreground/40 text-right font-medium">
                  Est: {typeof batteryPct === "number"
                    ? ((batteryPct / 100) * selectedCar.batteryCapacity).toFixed(1)
                    : "0.0"} kWh available
                </p>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full flex justify-center items-center gap-2 py-4 px-4 rounded-xl shadow-lg shadow-blue-500/20 text-md font-bold text-white bg-blue-600 hover:bg-blue-500 transition-all disabled:opacity-50 group">
              {loading ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> {loadingStep || "Analyzing Route…"}</>
              ) : (
                <><Navigation className="h-5 w-5 group-hover:rotate-12 transition-transform" /> Generate Eco Route</>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* ── Right: Results ───────────────────────────────────────────────── */}
      <div className="w-full xl:w-2/3">
        {loading ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="glass-panel border-dashed p-12 rounded-3xl flex flex-col items-center justify-center min-h-[500px]">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl animate-pulse" />
              <Zap className="h-12 w-12 text-blue-500 animate-bounce relative z-10" />
            </div>
            <p className="text-lg font-semibold animate-pulse text-foreground/80">{loadingStep || "Planning your route…"}</p>
            <div className="mt-6 flex gap-3 text-sm text-foreground/40">
              <span className="flex items-center gap-1.5"><Brain className="w-4 h-4" /> ML Engine</span>
              <span>·</span>
              <span className="flex items-center gap-1.5"><Zap className="w-4 h-4" /> NRCan Stations</span>
              <span>·</span>
              <span className="flex items-center gap-1.5"><Map className="w-4 h-4" /> Google Maps</span>
            </div>
          </motion.div>
        ) : routeResult ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

            {/* ML Health Advisory */}
            {routeResult.mlHealthAdvice && (
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                className={`p-4 rounded-xl border flex items-start gap-3 ${
                  routeResult.mlHealthAdvice.includes("🚨") ? "bg-red-500/10 border-red-500/30 text-red-400"
                  : routeResult.mlHealthAdvice.includes("⚠️") ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"}`}>
                <Brain className="w-5 h-5 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider mb-0.5 opacity-70">ML Health Advisory</p>
                  <p className="font-semibold text-sm">{routeResult.mlHealthAdvice}</p>
                </div>
              </motion.div>
            )}

            {/* Map */}
            <div className="h-[380px] glass-panel rounded-3xl relative overflow-hidden">
              {weatherInfo && (
                <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                  className="absolute top-4 left-4 bg-background/90 backdrop-blur-xl border border-border p-3 rounded-xl flex items-center gap-3 shadow-xl z-20">
                  <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
                    {weatherInfo.weathercode >= 50 ? <CloudRain className="w-5 h-5" /> : <Thermometer className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-xs text-foreground/50 font-bold uppercase tracking-wider mb-0.5">Dest. Weather</p>
                    <p className="font-bold text-sm">{weatherInfo.temperature}°C <span className="text-foreground/60 font-medium">· {weatherInfo.windspeed} km/h</span></p>
                    {weatherPenalty > 0 && <p className="text-xs text-rose-500 font-semibold">−{(weatherPenalty * 100).toFixed(0)}% range penalty</p>}
                  </div>
                </motion.div>
              )}
              <div className="absolute top-4 right-4 z-20 bg-background/80 backdrop-blur-md border border-border px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5">
                {routeResult.distanceSource === "google_maps"
                  ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Google Maps</>
                  : <><Info className="w-3.5 h-3.5 text-yellow-500" /> Haversine estimate</>}
              </div>
              {mapEmbedUrl ? (
                <iframe src={mapEmbedUrl} className="w-full h-full border-0" allowFullScreen loading="lazy" title="Route Map" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-background/30">
                  <div className="absolute inset-0 opacity-10 mix-blend-overlay" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)", backgroundSize: "32px 32px" }} />
                  <div className="absolute top-1/2 left-1/4 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.8)] z-10"><div className="w-2 h-2 bg-white rounded-full" /></div>
                  <div className="absolute top-1/4 right-1/4 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.8)] z-10"><MapPin className="w-3 h-3 text-white" /></div>
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                    <path d="M 25% 50% Q 35% 20% 45% 40% T 65% 30% T 75% 25%" stroke="rgba(59,130,246,0.6)" strokeWidth="4" fill="none" strokeDasharray="10 10" />
                  </svg>
                </div>
              )}
              <div className="absolute bottom-4 left-4 right-4 bg-background/90 backdrop-blur-xl border border-border p-4 rounded-2xl flex items-center justify-between shadow-2xl z-20">
                <div className="flex items-center gap-5">
                  <div><p className="text-xs text-foreground/50 font-semibold mb-0.5">Distance</p><p className="font-bold text-lg">{routeResult.distance} mi</p></div>
                  <div className="w-px h-8 bg-border hidden md:block" />
                  <div className="hidden md:block"><p className="text-xs text-foreground/50 font-semibold mb-0.5">Duration</p><p className="font-bold text-lg">{routeResult.timeStr}</p></div>
                  <div className="w-px h-8 bg-border hidden lg:block" />
                  <div className="hidden lg:block"><p className="text-xs text-foreground/50 font-semibold mb-0.5">ML Range</p><p className="font-bold text-lg text-blue-400">{routeResult.mlEffectiveRange} mi</p></div>
                  <div className="w-px h-8 bg-border hidden lg:block" />
                  <div className="hidden lg:block"><p className="text-xs text-foreground/50 font-semibold mb-0.5">Stops</p><p className="font-bold text-lg">{routeResult.stops.length}</p></div>
                </div>
                <button type="button" disabled={isStarting} onClick={async () => {
                  setIsStarting(true);
                  try {
                    await saveTripData(start, destination, routeResult.distance, routeResult.timeStr, routeResult.batteryUsed, routeResult.stops.length);
                    window.location.href = "/live-map";
                  } catch (e) {
                    console.error(e);
                    setIsStarting(false);
                  }
                }}
                  className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 px-5 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 shrink-0 disabled:opacity-50">
                  {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="h-4 w-4" />} Start Trip
                </button>
              </div>
            </div>

            {/* Status badges */}
            <div className="flex gap-3 flex-wrap">
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border ${routeResult.mlStatus === "Reachable" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-orange-500/10 text-orange-400 border-orange-500/30"}`}>
                <Brain className="w-4 h-4" /> ML: {routeResult.mlStatus}
              </div>
              {weatherPenalty > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border bg-rose-500/10 text-rose-400 border-rose-500/30">
                  <Cloud className="w-4 h-4" /> Weather −{(weatherPenalty * 100).toFixed(0)}% range
                </div>
              )}
              <div className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border bg-blue-500/10 text-blue-400 border-blue-500/30">
                <Zap className="w-4 h-4" /> {routeResult.distanceSource === "google_maps" ? "Live Google Maps" : "Haversine estimate"}
              </div>
            </div>

            {/* Stops */}
            {routeResult.stops.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-xl flex items-center gap-2"><Zap className="text-yellow-500" /> Required Charging Stops</h3>
                  <span className="text-xs text-foreground/40 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> NRCan verified
                  </span>
                </div>
                {routeResult.stops.map((stop, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                    className="glass-panel p-5 rounded-2xl hover:bg-secondary/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-xl mt-0.5 shrink-0 ${stop.station ? "bg-emerald-500/10 text-emerald-500" : "bg-blue-500/10 text-blue-500"}`}>
                          <Battery className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold">{stop.name}</h4>
                            {stop.station && <span className="text-xs bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold">NRCan</span>}
                          </div>
                          <p className="text-sm text-foreground/60 mt-0.5">{stop.location}</p>
                          {stop.station && (
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-foreground/40 font-medium">
                              {stop.station.dcFastPorts > 0 && <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-yellow-500" /> {stop.station.dcFastPorts} DCFC</span>}
                              {stop.station.level2Ports > 0 && <span className="flex items-center gap-1"><Battery className="w-3 h-3 text-blue-400" /> {stop.station.level2Ports} L2</span>}
                              {stop.station.network && <span>{stop.station.network}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-emerald-500">{stop.chargeTime}</p>
                        <p className="text-xs text-foreground/50 mt-0.5">Charge to {stop.chargeTo}</p>
                        <p className="text-xs text-foreground/40 mt-0.5">Arrive at {stop.arriveWith}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="glass-panel p-8 rounded-2xl flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center mb-4">
                  <Activity className="h-8 w-8" />
                </div>
                <h3 className="font-bold text-xl mb-2">Direct Journey Possible</h3>
                <p className="text-foreground/60 max-w-md">
                  Your {selectedCar.make} {selectedCar.model} has enough charge to reach the destination.
                  ML-verified effective range: <strong className="text-foreground">{routeResult.mlEffectiveRange} mi</strong>
                  {weatherPenalty > 0 && ` (after ${(weatherPenalty * 100).toFixed(0)}% weather adjustment)`}.
                </p>
              </div>
            )}
          </motion.div>
        ) : (
          <div className="glass-panel border-dashed p-12 rounded-3xl flex flex-col items-center justify-center min-h-[500px] text-center">
            <Map className="h-16 w-16 text-foreground/20 mb-6" />
            <h3 className="text-2xl font-bold mb-3">Ready to Plan</h3>
            <p className="text-foreground/60 max-w-md mb-6">Enter your destination and we will craft the perfect route powered by our ML engine with live NRCan charging data.</p>
            <div className="flex gap-4 text-xs text-foreground/30 font-medium">
              <span className="flex items-center gap-1.5"><Brain className="w-4 h-4" /> ML Prediction</span>
              <span>·</span>
              <span className="flex items-center gap-1.5"><Zap className="w-4 h-4" /> NRCan Stations</span>
              <span>·</span>
              <span className="flex items-center gap-1.5"><Map className="w-4 h-4" /> Google Maps Route</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
