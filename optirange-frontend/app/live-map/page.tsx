"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, Battery, Zap, Navigation, MapPin,
  Clock, Layers, RefreshCw, AlertCircle, ChevronRight,
  CheckCircle2, Car,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Stop {
  name: string;
  location: string;
  arriveWith: string;
  chargeTime: string;
  chargeTo: string;
  station?: { lat: number; lon: number; dcFastPorts?: number; level2Ports?: number; network?: string };
}

interface RouteResult {
  distance: number;
  timeStr: string;
  batteryUsed: number;
  stops: Stop[];
  startCoords: { lat: number; lon: number };
  destCoords:  { lat: number; lon: number };
  mlEffectiveRange?: number;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function LiveMapPage() {
  const mapRef        = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [route, setRoute]             = useState<RouteResult | null>(null);
  const [error, setError]             = useState("");
  const [activeStop, setActiveStop]   = useState<number | null>(null);
  const [isSatellite, setIsSatellite] = useState(true);  // satellite on by default
  const [tileLayer, setTileLayer]     = useState<any>(null);
  const [mapReady, setMapReady]       = useState(false);
  const markersRef = useRef<any[]>([]);

  // ── Load route from sessionStorage ────────────────────────────────────────
  useEffect(() => {
    const raw = sessionStorage.getItem("currentRoute");
    if (raw) {
      try { setRoute(JSON.parse(raw)); }
      catch { setError("Failed to parse route data."); }
    } else {
      setError("No active trip found. Please plan a trip first.");
    }
  }, []);

  // ── Fetch real driving polyline from Google Directions ────────────────────
  const fetchPolyline = useCallback(async (
    start: { lat: number; lon: number },
    dest:  { lat: number; lon: number },
    stops: Stop[]
  ): Promise<Array<[number, number]>> => {
    const key = (window as any).__GMAPS_KEY__;
    if (!key) return buildFallback(start, dest, stops);

    try {
      // Build waypoints from real station coords if available
      const waypoints = stops
        .filter(s => s.station?.lat && s.station?.lon)
        .map(s => `${s.station!.lat},${s.station!.lon}`)
        .join("|");

      const url =
        `https://maps.googleapis.com/maps/api/directions/json` +
        `?origin=${start.lat},${start.lon}` +
        `&destination=${dest.lat},${dest.lon}` +
        (waypoints ? `&waypoints=${waypoints}` : "") +
        `&key=${key}`;

      const res  = await fetch(`/api/directions-proxy?${new URLSearchParams({ origin: `${start.lat},${start.lon}`, destination: `${dest.lat},${dest.lon}`, waypoints, key })}`);
      if (!res.ok) throw new Error("proxy failed");
      const data = await res.json();
      const encoded = data?.routes?.[0]?.overview_polyline?.points;
      if (encoded) return decodePolyline(encoded);
    } catch { /* fall through */ }

    return buildFallback(start, dest, stops);
  }, []);

  // ── Straight-line fallback with stop interpolation ────────────────────────
  function buildFallback(
    start: { lat: number; lon: number },
    dest:  { lat: number; lon: number },
    stops: Stop[]
  ): Array<[number, number]> {
    const pts: Array<[number, number]> = [[start.lat, start.lon]];
    stops.forEach((s, i) => {
      if (s.station?.lat && s.station?.lon) {
        pts.push([s.station.lat, s.station.lon]);
      } else {
        const f = (i + 1) / (stops.length + 1);
        pts.push([start.lat + (dest.lat - start.lat) * f, start.lon + (dest.lon - start.lon) * f]);
      }
    });
    pts.push([dest.lat, dest.lon]);
    return pts;
  }

  // ── Google polyline decoder ────────────────────────────────────────────────
  function decodePolyline(encoded: string): Array<[number, number]> {
    const pts: Array<[number, number]> = [];
    let i = 0, lat = 0, lng = 0;
    while (i < encoded.length) {
      let b: number, shift = 0, result = 0;
      do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lat += result & 1 ? ~(result >> 1) : result >> 1;
      shift = 0; result = 0;
      do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lng += result & 1 ? ~(result >> 1) : result >> 1;
      pts.push([lat / 1e5, lng / 1e5]);
    }
    return pts;
  }

  // ── Initialise Leaflet map ────────────────────────────────────────────────
  useEffect(() => {
    if (!route || !mapRef.current || mapInstanceRef.current) return;

    const { startCoords: start, destCoords: dest, stops } = route;
    if (!start?.lat || !dest?.lat) {
      setError("Missing coordinates.");
      return;
    }

    // Inject Google Maps API key for client use
    const envKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";
    (window as any).__GMAPS_KEY__ = envKey;

    const loadLeaflet = () => {
      if (!(window as any).L) {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(css);

        const js = document.createElement("script");
        js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        js.async = true;
        js.onload = () => buildMap();
        document.head.appendChild(js);
      } else {
        buildMap();
      }
    };

    async function buildMap() {
      const L = (window as any).L;
      if (!L || !mapRef.current) return;

      const map = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView([start.lat, start.lon], 7);

      mapInstanceRef.current = map;

      // ── Satellite tile layer (Google hybrid via proxy) ─────────────────
      const satelliteLayer = L.tileLayer(
        "https://mt{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}",
        { subdomains: ["0","1","2","3"], attribution: "© Google", maxZoom: 20 }
      );

      // ── Street map fallback ────────────────────────────────────────────
      const streetLayer = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { attribution: "© OpenStreetMap contributors", maxZoom: 19 }
      );

      satelliteLayer.addTo(map);
      setTileLayer({ satellite: satelliteLayer, street: streetLayer, current: "satellite" });

      // ── Custom zoom control (bottom right) ────────────────────────────
      L.control.zoom({ position: "bottomright" }).addTo(map);

      // ── Proximity validator ────────────────────────────────────────────
      // Returns true only if the station coord is within maxKm of the
      // interpolated route position — prevents off-route stations (e.g. LA
      // stations appearing on a Toronto→Montreal route)
      function isNearRoute(
        stationLat: number, stationLon: number,
        interpLat: number, interpLon: number,
        maxKm = 300
      ): boolean {
        const R = 6371;
        const dLat = (stationLat - interpLat) * Math.PI / 180;
        const dLon = (stationLon - interpLon) * Math.PI / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(interpLat * Math.PI / 180) *
          Math.cos(stationLat * Math.PI / 180) *
          Math.sin(dLon / 2) ** 2;
        const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return distKm <= maxKm;
      }

      // ── Resolve each stop to a validated coordinate ────────────────────
      // Interpolated position = where the stop SHOULD be on the route
      // Station coord = only used if it's actually near that position
      const resolvedStops = stops.map((stop, idx) => {
        const fraction = (idx + 1) / (stops.length + 1);
        const interpLat = start.lat + (dest.lat - start.lat) * fraction;
        const interpLon = start.lon + (dest.lon - start.lon) * fraction;

        const hasStation = stop.station?.lat && stop.station?.lon;
        const stationIsNear = hasStation && isNearRoute(
          stop.station!.lat, stop.station!.lon,
          interpLat, interpLon
        );

        return {
          ...stop,
          lat: stationIsNear ? stop.station!.lat : interpLat,
          lon: stationIsNear ? stop.station!.lon : interpLon,
          stationValid: stationIsNear,
        };
      });

      // ── Start marker ──────────────────────────────────────────────────
      const startIcon = L.divIcon({
        html: `<div style="
          background:#3b82f6;color:white;width:36px;height:36px;border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 4px 12px rgba(59,130,246,0.6);border:3px solid white;
          font-weight:900;font-size:14px;font-family:sans-serif;">A</div>`,
        className: "", iconSize: [36, 36], iconAnchor: [18, 18],
      });
      L.marker([start.lat, start.lon], { icon: startIcon })
        .addTo(map)
        .bindPopup(`<div style="font-family:sans-serif;min-width:160px">
          <b style="color:#3b82f6">🚀 Starting Point</b><br/>
          <span style="font-size:12px;color:#666">Your journey begins here</span>
        </div>`);

      // ── Destination marker ─────────────────────────────────────────────
      const destIcon = L.divIcon({
        html: `<div style="
          background:#a855f7;color:white;width:36px;height:36px;border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 4px 12px rgba(168,85,247,0.6);border:3px solid white;
          font-weight:900;font-size:14px;font-family:sans-serif;">B</div>`,
        className: "", iconSize: [36, 36], iconAnchor: [18, 18],
      });
      L.marker([dest.lat, dest.lon], { icon: destIcon })
        .addTo(map)
        .bindPopup(`<div style="font-family:sans-serif;min-width:160px">
          <b style="color:#a855f7">🏁 Destination</b><br/>
          <span style="font-size:12px;color:#666">Your journey ends here</span>
        </div>`);

      // ── Charging stop markers (using validated coords) ─────────────────
      const newMarkers: any[] = [];
      resolvedStops.forEach((stop, idx) => {
        const stopIcon = L.divIcon({
          html: `<div style="
            background:#10b981;color:white;width:34px;height:34px;border-radius:50%;
            display:flex;align-items:center;justify-content:center;
            box-shadow:0 4px 12px rgba(16,185,129,0.6);border:3px solid white;
            font-size:16px;cursor:pointer;">⚡</div>`,
          className: "", iconSize: [34, 34], iconAnchor: [17, 17],
        });

        const marker = L.marker([stop.lat, stop.lon], { icon: stopIcon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family:sans-serif;min-width:200px;padding:4px">
              <b style="color:#10b981;font-size:14px">${stop.name}</b><br/>
              <span style="font-size:11px;color:#666">${stop.location}</span><br/><br/>
              <div style="display:flex;flex-direction:column;gap:4px;font-size:12px">
                <span>🔋 <b>Arrive at:</b> ${stop.arriveWith}</span>
                <span>⚡ <b>Charge to:</b> ${stop.chargeTo}</span>
                <span>⏱ <b>Duration:</b> ${stop.chargeTime}</span>
                ${stop.station?.dcFastPorts ? `<span>🔌 <b>DCFC:</b> ${stop.station.dcFastPorts} ports</span>` : ""}
                ${stop.station?.network ? `<span>🌐 <b>Network:</b> ${stop.station.network}</span>` : ""}
                ${!stop.stationValid ? `<span style="color:#f59e0b">📍 Estimated position on route</span>` : ""}
              </div>
            </div>
          `);

        marker.on("click", () => setActiveStop(idx));
        newMarkers.push({ marker, lat: stop.lat, lon: stop.lon });
      });
      markersRef.current = newMarkers;

      // ── Draw route line through validated stop positions ───────────────
      const polylinePts: Array<[number, number]> = [
        [start.lat, start.lon],
        ...resolvedStops.map(s => [s.lat, s.lon] as [number, number]),
        [dest.lat, dest.lon],
      ];

      // Outer glow line
      L.polyline(polylinePts, { color: "#1d4ed8", weight: 8, opacity: 0.3 }).addTo(map);
      // Main solid route line
      L.polyline(polylinePts, { color: "#3b82f6", weight: 5, opacity: 1 }).addTo(map);

      // ── Fit map to show entire route ───────────────────────────────────
      const allPoints: Array<[number, number]> = [
        [start.lat, start.lon],
        ...resolvedStops.map(s => [s.lat, s.lon] as [number, number]),
        [dest.lat, dest.lon],
      ];
      map.fitBounds(L.latLngBounds(allPoints), { padding: [60, 60] });
      setMapReady(true);
    }

    loadLeaflet();
  }, [route]);

  // ── Toggle satellite / street ─────────────────────────────────────────────
  const toggleLayer = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || !tileLayer) return;
    if (isSatellite) {
      map.removeLayer(tileLayer.satellite);
      tileLayer.street.addTo(map);
    } else {
      map.removeLayer(tileLayer.street);
      tileLayer.satellite.addTo(map);
    }
    setIsSatellite(v => !v);
  }, [isSatellite, tileLayer]);

  // ── Fly to stop ───────────────────────────────────────────────────────────
  const flyToStop = useCallback((idx: number) => {
    const map = mapInstanceRef.current;
    const m   = markersRef.current[idx];
    if (!map || !m) return;
    map.flyTo([m.lat, m.lon], 14, { animate: true, duration: 1.2 });
    m.marker.openPopup();
    setActiveStop(idx);
  }, []);

  const flyToOverview = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || !route) return;
    const { startCoords: s, destCoords: d, stops } = route;
    const pts: Array<[number, number]> = [
      [s.lat, s.lon],
      ...markersRef.current.map(m => [m.lat, m.lon] as [number, number]),
      [d.lat, d.lon],
    ];
    const L = (window as any).L;
    map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], animate: true, duration: 1 });
    setActiveStop(null);
  }, [route]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-black overflow-hidden">

      {/* ── Top bar ── */}
      <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%)" }}>
        <div className="flex items-center gap-3">
          <Link href="/trip-planner"
            className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl hover:bg-white/20 transition-colors border border-white/10">
            <ArrowLeft className="w-5 h-5 text-white" />
          </Link>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">Live Navigation</h1>
            {route && (
              <p className="text-white/60 text-xs">{route.distance} mi · {route.timeStr}</p>
            )}
          </div>
        </div>

        {route && (
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500/20 backdrop-blur-md border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" /> {route.stops.length} Stop{route.stops.length !== 1 ? "s" : ""}
            </div>
            <div className="bg-white/10 backdrop-blur-md border border-white/10 text-white/80 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> {route.timeStr}
            </div>
          </div>
        )}
      </div>

      {/* ── Map ── */}
      <div className="flex-1 relative w-full">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-background z-50">
            <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
            <p className="text-xl font-bold mb-2 text-foreground">Navigation Error</p>
            <p className="text-foreground/60 mb-6 max-w-md">{error}</p>
            <Link href="/trip-planner" className="px-6 py-3 bg-blue-500 text-white rounded-xl font-bold">
              Back to Planner
            </Link>
          </div>
        ) : (
          <div ref={mapRef} className="w-full h-full" style={{ zIndex: 1 }} />
        )}

        {!error && !route && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-50">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        )}

        {/* ── Layer toggle button ── */}
        {mapReady && (
          <button
            onClick={toggleLayer}
            className="absolute top-20 right-4 z-40 flex items-center gap-2 bg-black/70 backdrop-blur-md border border-white/20 text-white px-3 py-2 rounded-xl text-xs font-semibold hover:bg-black/90 transition-all"
          >
            <Layers className="w-4 h-4" />
            {isSatellite ? "Street" : "Satellite"}
          </button>
        )}

        {/* ── Overview button ── */}
        {mapReady && (
          <button
            onClick={flyToOverview}
            className="absolute top-32 right-4 z-40 flex items-center gap-2 bg-black/70 backdrop-blur-md border border-white/20 text-white px-3 py-2 rounded-xl text-xs font-semibold hover:bg-black/90 transition-all"
          >
            <Navigation className="w-4 h-4" /> Overview
          </button>
        )}
      </div>

      {/* ── Bottom panel ── */}
      {route && mapReady && (
        <div className="absolute bottom-0 left-0 right-0 z-40"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, transparent 100%)" }}>
          <div className="px-4 pb-6 pt-8">

            {/* Route summary row */}
            <div className="flex items-center gap-3 mb-4 overflow-x-auto pb-1 scrollbar-hide">
              {/* Start chip */}
              <div className="flex items-center gap-2 bg-blue-500/20 border border-blue-500/30 px-3 py-2 rounded-xl shrink-0">
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-black">A</div>
                <span className="text-white text-xs font-semibold">Start</span>
              </div>

              {/* Stop chips */}
              {route.stops.map((stop, idx) => (
                <button key={idx} onClick={() => flyToStop(idx)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl shrink-0 border transition-all ${
                    activeStop === idx
                      ? "bg-emerald-500/30 border-emerald-500/60 scale-105"
                      : "bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20"
                  }`}>
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <span className="text-white text-xs font-semibold truncate max-w-[100px]">
                    Stop {idx + 1}
                  </span>
                  <ChevronRight className="w-3 h-3 text-white/40" />
                </button>
              ))}

              {/* Destination chip */}
              <div className="flex items-center gap-2 bg-purple-500/20 border border-purple-500/30 px-3 py-2 rounded-xl shrink-0">
                <div className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center text-white text-xs font-black">B</div>
                <span className="text-white text-xs font-semibold">Destination</span>
              </div>
            </div>

            {/* Active stop detail card */}
            {activeStop !== null && route.stops[activeStop] && (
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 mb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-emerald-500/20 rounded-xl shrink-0">
                      <Zap className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm">{route.stops[activeStop].name}</p>
                      <p className="text-white/50 text-xs mt-0.5">{route.stops[activeStop].location}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-white/70">
                        <span>🔋 Arrive {route.stops[activeStop].arriveWith}</span>
                        <span>⚡ Charge to {route.stops[activeStop].chargeTo}</span>
                        <span>⏱ {route.stops[activeStop].chargeTime}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setActiveStop(null)} className="text-white/40 hover:text-white text-lg leading-none">✕</button>
                </div>
              </div>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/8 backdrop-blur-md border border-white/10 rounded-xl p-3 text-center">
                <p className="text-white/50 text-xs mb-1">Distance</p>
                <p className="text-white font-bold text-base">{route.distance} mi</p>
              </div>
              <div className="bg-white/8 backdrop-blur-md border border-white/10 rounded-xl p-3 text-center">
                <p className="text-white/50 text-xs mb-1">Duration</p>
                <p className="text-white font-bold text-base">{route.timeStr}</p>
              </div>
              <div className="bg-white/8 backdrop-blur-md border border-white/10 rounded-xl p-3 text-center">
                <p className="text-white/50 text-xs mb-1">Charge Stops</p>
                <p className="text-white font-bold text-base">{route.stops.length}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
