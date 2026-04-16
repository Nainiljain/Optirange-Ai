"use client";

import { useState } from "react";
import {
  saveTripData, calculateTripData, runMLPredictionDirect,
  fetchNRCanStationsAction, getRouteWaypoints,
  saveRecentSearchAction, saveFavouriteAction, deleteFavouriteAction,
} from "@/app/actions";
import { type ChargingStation } from "@/lib/tripUtils";
import { type Stop, type RouteResult } from "@/lib/tripUtils";
import { Loader2, Navigation, Map, Brain, Zap } from "lucide-react";

// ── Sub-components ──────────────────────────────────────────────────────────────
import RouteFormInputs from "./components/RouteForm";
import SavedPlaces from "./components/SavedPlaces";
import VehicleSelector from "./components/VehicleSelector";
import LoadingState from "./components/LoadingState";
import TripResults from "./components/TripResults";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SavedLocation { id: string; label: string; type: string; address: string; lat: number; lon: number; }
interface RecentSearch  { address: string; lat: number; lon: number; }

// ─── Component ─────────────────────────────────────────────────────────────────

export default function TripPlannerClient({
  user, allEvData, initialEvData, healthData, savedLocations: initSaved, recentSearches: initRecent,
}: {
  user: any; allEvData: any[]; initialEvData: any; healthData: any;
  savedLocations: SavedLocation[]; recentSearches: RecentSearch[];
}) {
  // ── Car selector ─────────────────────────────────────────────────────────
  const [selectedCar, setSelectedCar]   = useState<any>(initialEvData);
  const [showCarPicker, setShowCarPicker] = useState(false);
  const multiCar = allEvData.length > 1;

  // ── Route inputs ─────────────────────────────────────────────────────────
  const [start, setStart]           = useState("");
  const [destination, setDestination] = useState("");
  const [startCoords, setStartCoords] = useState<{lat:number;lon:number}|null>(null);
  const [destCoords, setDestCoords]   = useState<{lat:number;lon:number}|null>(null);

  // ── Departure time ────────────────────────────────────────────────────────
  const [departureTime, setDepartureTime] = useState(() => {
    const now = new Date();
    now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
    return now.toTimeString().slice(0, 5); // "HH:MM"
  });
  const [departureDate, setDepartureDate] = useState(() =>
    new Date().toISOString().slice(0, 10) // "YYYY-MM-DD"
  );

  // ── Autocomplete ──────────────────────────────────────────────────────────
  const [startSugg, setStartSugg]       = useState<any[]>([]);
  const [destSugg, setDestSugg]         = useState<any[]>([]);
  const [showStartSugg, setShowStartSugg] = useState(false);
  const [showDestSugg, setShowDestSugg]   = useState(false);

  // ── Favourites & recent ───────────────────────────────────────────────────
  const [savedLocs, setSavedLocs]       = useState<SavedLocation[]>(initSaved);
  const [recentSearches]                = useState<RecentSearch[]>(initRecent);
  const [showSaveFavForm, setShowSaveFavForm] = useState<'start'|'dest'|null>(null);
  const [favLabel, setFavLabel]         = useState("");
  const [favType, setFavType]           = useState<'home'|'work'|'favourite'>('favourite');

  // ── Results & loading ─────────────────────────────────────────────────────
  const [loading, setLoading]       = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [batteryPct, setBatteryPct]   = useState<number|"">(80);
  const [weatherInfo, setWeatherInfo] = useState<any>(null);
  const [weatherPenalty, setWeatherPenalty] = useState(0);

  // ── Geocode ───────────────────────────────────────────────────────────────
  const geocodeSearch = async (query: string, setSugg: Function, setShow: Function) => {
    if (query.length < 3) { setSugg([]); return; }
    try {
      const res  = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(query)}&maxLocations=5`);
      const data = await res.json();
      setSugg(data.candidates || []);
      setShow(true);
    } catch {}
  };

  const resolveCoords = async (address: string, existing: {lat:number;lon:number}|null) => {
    if (existing) return existing;
    try {
      const res  = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(address)}&maxLocations=1`);
      const data = await res.json();
      const c    = data.candidates?.[0];
      if (c) return { lat: c.location.y, lon: c.location.x };
    } catch {}
    return null;
  };

  // ── Select a suggestion ───────────────────────────────────────────────────
  const selectStart = (address: string, lat: number, lon: number) => {
    setStart(address); setStartCoords({ lat, lon }); setShowStartSugg(false); setStartSugg([]);
  };
  const selectDest = (address: string, lat: number, lon: number) => {
    setDestination(address); setDestCoords({ lat, lon }); setShowDestSugg(false); setDestSugg([]);
  };

  // ── Save favourite (from SavedPlaces sub-component) ───────────────────────
  const handleSaveFav = async (address: string) => {
    const coord = showSaveFavForm === 'start' ? startCoords : destCoords;
    if (!address || !favLabel.trim()) return;

    let finalCoord = coord;
    if (!finalCoord && address) {
      try {
        const res = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(address)}&maxLocations=1`);
        const data = await res.json();
        const c = data.candidates?.[0];
        if (c) finalCoord = { lat: c.location.y, lon: c.location.x };
      } catch {}
    }
    if (!finalCoord) return;

    await saveFavouriteAction(favLabel.trim(), favType, address, finalCoord.lat, finalCoord.lon);
    const newLoc: SavedLocation = { id: Date.now().toString(), label: favLabel.trim(), type: favType, address, lat: finalCoord.lat, lon: finalCoord.lon };
    setSavedLocs(prev => favType === 'home' || favType === 'work'
      ? [...prev.filter(l => l.type !== favType), newLoc]
      : [...prev, newLoc]);
    setShowSaveFavForm(null); setFavLabel(''); setFavType('favourite');
  };

  const handleDeleteFav = async (id: string) => {
    await deleteFavouriteAction(id);
    setSavedLocs(prev => prev.filter(l => l.id !== id));
  };

  // ── Compute arrival time ──────────────────────────────────────────────────
  const computeArrival = (durationMins: number, chargingStops: number) => {
    const [h, m]   = departureTime.split(':').map(Number);
    const depDate  = new Date(departureDate);
    depDate.setHours(h, m, 0, 0);
    const chargingMins = chargingStops * 25;
    const totalMins    = durationMins + chargingMins;
    const arrival      = new Date(depDate.getTime() + totalMins * 60_000);
    return arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // ── Plan trip ─────────────────────────────────────────────────────────────
  const handlePlanTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setWeatherInfo(null); setWeatherPenalty(0);
    try {
      setLoadingStep("Resolving locations…");
      const sCoords = await resolveCoords(start, startCoords);
      const dCoords = await resolveCoords(destination, destCoords);
      if (!sCoords || !dCoords) { alert("Could not locate one of the addresses."); setLoading(false); return; }
      setStartCoords(sCoords); setDestCoords(dCoords);

      // Save both to recent searches
      await saveRecentSearchAction(start, sCoords.lat, sCoords.lon);
      await saveRecentSearchAction(destination, dCoords.lat, dCoords.lon);

      setLoadingStep("Fetching live weather data…");
      let wInfo = null; let wPenalty = 0;
      try {
        const wRes  = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${dCoords.lat}&longitude=${dCoords.lon}&current_weather=true`);
        const wData = await wRes.json();
        if (wData?.current_weather) {
          wInfo = wData.current_weather; setWeatherInfo(wInfo);
          if (wInfo.temperature < 10) wPenalty += 0.15;
          if (wInfo.temperature > 35) wPenalty += 0.10;
          if (wInfo.weathercode >= 50) wPenalty += 0.05;
          setWeatherPenalty(wPenalty);
        }
      } catch {}

      setLoadingStep("Calculating route via Google Maps…");
      const serverStats = await calculateTripData(sCoords.lat, sCoords.lon, dCoords.lat, dCoords.lon);
      const distance    = serverStats.drivingDistance;
      const timeHrs     = Math.floor(serverStats.durationMinutes / 60);
      const timeMins    = serverStats.durationMinutes % 60;
      const timeStr     = `${timeHrs}h ${timeMins}m`;

      setLoadingStep("Running ML prediction model…");
      const currentChargePct  = typeof batteryPct === "number" ? batteryPct : 80;
      const effectiveBattery  = (currentChargePct / 100) * selectedCar.batteryCapacity;
      const mlResult          = await runMLPredictionDirect(effectiveBattery, distance, wPenalty, healthData);
      const batteryUsed       = Math.min(effectiveBattery, distance / 4.5);
      const numStops          = mlResult.stops;
      const effectiveRange    = mlResult.effective_range_miles;

      let maxStretch = healthData?.preferredRestInterval || 120;
      if (["back_pain","pregnancy","bladder"].includes(healthData?.healthCondition)) maxStretch *= 0.9;

      setLoadingStep("Fetching real charging stations along your route…");
      const waypointCoords = numStops > 0
        ? await getRouteWaypoints(serverStats.polyline || [], sCoords.lat, sCoords.lon, dCoords.lat, dCoords.lon, numStops)
        : [];
      let nrcanStations: ChargingStation[][] = [];
      if (waypointCoords.length > 0) {
        try { nrcanStations = await fetchNRCanStationsAction(waypointCoords, sCoords, dCoords); } catch {}
      }

      // ── Haversine helper ────────────────────────────────────────────────
      const hKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      };

      const stops: Stop[] = [];
      let remainingDist = distance, currentRange = effectiveRange;
      for (let i = 0; i < numStops && remainingDist > 0; i++) {
        const distToStop  = Math.min(currentRange - 20, maxStretch);
        remainingDist    -= distToStop;
        if (remainingDist <= 0) break;
        const isRestStop  = distToStop === maxStretch && distToStop < (currentRange - 20);
        const fraction    = (i + 1) / (numStops + 1);
        const interpLat   = sCoords.lat + (dCoords.lat - sCoords.lat) * fraction;
        const interpLon   = sCoords.lon + (dCoords.lon - sCoords.lon) * fraction;
        const stationOpts = (nrcanStations[i] || []).filter(s => s.lat && s.lon && hKm(s.lat, s.lon, interpLat, interpLon) <= 300);
        const best        = isRestStop ? stationOpts[0] : stationOpts.find(s => s.dcFastPorts > 0) || stationOpts[0];
        stops.push({
          name:      best ? best.name : (isRestStop ? `Rest Stop ${i+1}` : `FastCharge Node ${i+1}`),
          location:  best ? `${best.address}${best.city ? ', '+best.city : ''}${best.province ? ', '+best.province : ''}` : `Near route milestone ${Math.floor(distance - remainingDist)} mi`,
          arriveWith: isRestStop ? `${Math.floor(((currentRange - distToStop) / effectiveRange) * 100)}%` : "15%",
          chargeTime: isRestStop ? "15 mins (Rest & top-up)" : "25 mins (Fast Charge)",
          chargeTo:   isRestStop ? "50%" : "80%",
          station:    best,
        });
        currentRange = isRestStop ? effectiveRange * 0.5 : effectiveRange * 0.8;
      }

      const arrivalTime = computeArrival(serverStats.durationMinutes, stops.length);

      const result: RouteResult = {
        distance, timeStr, batteryUsed, stops,
        startCoords: sCoords, destCoords: dCoords,
        distanceSource: serverStats.source,
        mlStatus: mlResult.status,
        mlHealthAdvice: mlResult.health_advice,
        mlEffectiveRange: mlResult.effective_range_miles,
        arrivalTime,
        departureTime: `${departureDate} ${departureTime}`,
      };

      setRouteResult(result);
      sessionStorage.setItem("currentRoute", JSON.stringify(result));
      await saveTripData(start, destination, distance, timeStr, batteryUsed, stops.length);
    } catch (err) { console.error(err); }
    finally { setLoading(false); setLoadingStep(""); }
  };

  // ── Google Maps embed ─────────────────────────────────────────────────────
  const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";
  const hasGoogleKey  = googleMapsKey && !googleMapsKey.startsWith("YOUR_");
  const getMapEmbedUrl = () => {
    if (!routeResult?.startCoords || !routeResult?.destCoords) return null;
    const { startCoords: sc, destCoords: dc } = routeResult;
    if (hasGoogleKey) {
      const wp = routeResult.stops.filter(s => s.station).map(s => `${s.station!.lat},${s.station!.lon}`).join("|");
      return `https://www.google.com/maps/embed/v1/directions?key=${googleMapsKey}&origin=${sc.lat},${sc.lon}&destination=${dc.lat},${dc.lon}${wp ? `&waypoints=${wp}` : ""}&mode=driving`;
    }
    return `https://www.openstreetmap.org/export/embed.html?bbox=${Math.min(sc.lon,dc.lon)-0.5},${Math.min(sc.lat,dc.lat)-0.5},${Math.max(sc.lon,dc.lon)+0.5},${Math.max(sc.lat,dc.lat)+0.5}&layer=mapnik`;
  };
  const mapEmbedUrl = routeResult ? getMapEmbedUrl() : null;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col xl:flex-row gap-8">

      {/* ── Left: Form ──────────────────────────────────────────────────── */}
      <div className="w-full xl:w-1/3 shrink-0 space-y-4">
        <div className="glass-panel p-6 rounded-2xl shadow-xl relative overflow-visible">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500" aria-hidden="true" />
          <form onSubmit={handlePlanTrip} className="space-y-5" aria-label="Trip planning form">

            {/* ── Saved places + route inputs ── */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-foreground/60 uppercase tracking-wider">Route Details</h3>

              <SavedPlaces
                savedLocs={savedLocs}
                showSaveFavForm={showSaveFavForm}
                favLabel={favLabel}
                favType={favType}
                start={start}
                destination={destination}
                startCoords={startCoords}
                destCoords={destCoords}
                onSelectDest={selectDest}
                onShowSaveFavForm={setShowSaveFavForm}
                onFavLabelChange={setFavLabel}
                onFavTypeChange={setFavType}
                onSaveFav={handleSaveFav}
                onDeleteFav={handleDeleteFav}
              />
            </div>

            {/* ── Route inputs + departure time ── */}
            <RouteFormInputs
              start={start}
              destination={destination}
              startSugg={startSugg}
              destSugg={destSugg}
              showStartSugg={showStartSugg}
              showDestSugg={showDestSugg}
              recentSearches={recentSearches}
              departureDate={departureDate}
              departureTime={departureTime}
              onStartChange={setStart}
              onDestinationChange={setDestination}
              onSelectStart={selectStart}
              onSelectDest={selectDest}
              onShowStartSugg={setShowStartSugg}
              onShowDestSugg={setShowDestSugg}
              onGeocode={geocodeSearch}
              onDepartureDateChange={setDepartureDate}
              onDepartureTimeChange={setDepartureTime}
              onShowSaveFavForm={setShowSaveFavForm}
              setStartSugg={setStartSugg}
              setDestSugg={setDestSugg}
            />

            <hr className="border-border" />

            {/* ── Vehicle selector + battery ── */}
            <VehicleSelector
              allEvData={allEvData}
              selectedCar={selectedCar}
              showCarPicker={showCarPicker}
              batteryPct={batteryPct}
              multiCar={multiCar}
              onTogglePicker={() => setShowCarPicker(v => !v)}
              onSelectCar={(car) => { setSelectedCar(car); setShowCarPicker(false); setRouteResult(null); setBatteryPct(80); }}
              onBatteryChange={setBatteryPct}
            />

            {/* ── Submit ── */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 py-4 px-4 rounded-xl shadow-lg shadow-blue-500/20 text-md font-bold text-white bg-blue-600 hover:bg-blue-500 transition-all disabled:opacity-50 group"
              aria-busy={loading}
            >
              {loading ? (
                <><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> {loadingStep || "Analyzing Route…"}</>
              ) : (
                <><Navigation className="h-5 w-5 group-hover:rotate-12 transition-transform" aria-hidden="true" /> Generate Eco Route</>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* ── Right: Results ───────────────────────────────────────────────── */}
      <div className="w-full xl:w-2/3">
        {loading ? (
          <LoadingState loadingStep={loadingStep} />
        ) : routeResult ? (
          <TripResults
            routeResult={routeResult}
            weatherInfo={weatherInfo}
            weatherPenalty={weatherPenalty}
            selectedCar={selectedCar}
            departureTime={departureTime}
            departureDate={departureDate}
            mapEmbedUrl={mapEmbedUrl}
          />
        ) : (
          <div className="glass-panel border-dashed p-12 rounded-3xl flex flex-col items-center justify-center min-h-[500px] text-center">
            <Map className="h-16 w-16 text-foreground/20 mb-6" aria-hidden="true" />
            <h3 className="text-2xl font-bold mb-3">Ready to Plan</h3>
            <p className="text-foreground/60 max-w-md mb-6">Enter your destination and we will craft the perfect route powered by our ML engine with live NRCan charging data.</p>
            <div className="flex gap-4 text-xs text-foreground/30 font-medium">
              <span className="flex items-center gap-1.5"><Brain className="w-4 h-4" aria-hidden="true" /> ML Prediction</span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1.5"><Zap className="w-4 h-4" aria-hidden="true" /> NRCan Stations</span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1.5"><Map className="w-4 h-4" aria-hidden="true" /> Google Maps Route</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
