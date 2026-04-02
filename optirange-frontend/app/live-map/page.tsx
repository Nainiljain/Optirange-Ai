"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Battery, RefreshCw, AlertCircle } from "lucide-react";

export default function LiveMapPage() {
    const mapRef = useRef<HTMLDivElement>(null);
    const [route, setRoute] = useState<any>(null);
    const [error, setError] = useState<string>("");

    useEffect(() => {
        const routeData = sessionStorage.getItem('currentRoute');
        if (routeData) {
            try {
                setRoute(JSON.parse(routeData));
            } catch (e) {
                setError("Failed to parse route data.");
            }
        } else {
            setError("No active trip found.");
        }
    }, []);

    useEffect(() => {
        if (!route || !mapRef.current) return;

        // Load Leaflet dynamically
        if (!(window as any).L) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);

            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.async = true;
            document.head.appendChild(script);

            script.onload = initMap;
        } else {
            initMap();
        }

        function initMap() {
            const L = (window as any).L;
            if (!L) return;

            // Clear previous map if any dynamically created
            if (mapRef.current && (mapRef.current as any)._leaflet_id) {
                return; // Already initialized
            }

            const start = route.startCoords;
            const dest = route.destCoords;
            const stops = route.stops || [];

            if (!start || !dest || !start.lat || !dest.lat) {
                setError("Missing coordinates for accurate mapping. Ensure both inputs generated valid coordinates.");
                return;
            }

            const map = L.map(mapRef.current).setView([start.lat, start.lon], 6);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(map);

            // Custom Start Marker
            const startIcon = L.divIcon({
                html: `<div style="background-color: #3b82f6; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.3); border: 2px solid white; font-weight: bold;"><span>A</span></div>`,
                className: '', iconSize: [30, 30], iconAnchor: [15, 15]
            });
            L.marker([start.lat, start.lon], { icon: startIcon }).addTo(map).bindPopup("<b>Starting Location</b>");
            
            // Custom Destination Marker
            const destIcon = L.divIcon({
                html: `<div style="background-color: #a855f7; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.3); border: 2px solid white; font-weight: bold;"><span>B</span></div>`,
                className: '', iconSize: [30, 30], iconAnchor: [15, 15]
            });
            L.marker([dest.lat, dest.lon], { icon: destIcon }).addTo(map).bindPopup("<b>Destination</b>");

            // Bounds to automatically zoom out and frame the route perfectly
            const bounds = L.latLngBounds([start.lat, start.lon], [dest.lat, dest.lon]);

            const latlngs = [
                [start.lat, start.lon],
            ];

            // Distribute charging stops along the line geographically
            if (stops.length > 0) {
                stops.forEach((stop: any, index: number) => {
                    // Interpolate a physical coordinate roughly between A and B
                    const fraction = (index + 1) / (stops.length + 1);
                    const lat = start.lat + (dest.lat - start.lat) * fraction;
                    const lon = start.lon + (dest.lon - start.lon) * fraction;
                    
                    latlngs.push([lat, lon]);

                    // Custom Charging Station Icon
                    const chargeIcon = L.divIcon({
                        html: `<div style="background-color: #10b981; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.3); border: 2px solid white; font-weight: bold;"><span>⚡</span></div>`,
                        className: '',
                        iconSize: [30, 30],
                        iconAnchor: [15, 15]
                    });

                    L.marker([lat, lon], { icon: chargeIcon })
                        .addTo(map)
                        .bindPopup(`<div style="font-family:sans-serif;">
                            <b style="color:#10b981">${stop.name}</b><br/>
                            <span style="font-size:12px; color:gray">${stop.location}</span><br/><br/>
                            <b>Arrive with:</b> ${stop.arriveWith}<br/>
                            <b>Charge to:</b> ${stop.chargeTo}<br/>
                            <b>Duration:</b> ${stop.chargeTime}
                        </div>`);
                });
            }

            latlngs.push([dest.lat, dest.lon]);

            // Draw driving route indicator line
            L.polyline(latlngs, { color: '#3b82f6', weight: 4, dashArray: '10, 10' }).addTo(map);
            
            // Adjust map view properly
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [route]);

    return (
        <div className="flex flex-col h-screen bg-background">
            <div className="glass-panel border-b border-border p-4 flex items-center justify-between z-10 shrink-0">
                <div className="flex items-center gap-4">
                    <Link href="/trip-planner" className="p-2 bg-secondary rounded-xl hover:bg-secondary/80 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <h1 className="text-xl font-bold">Live Navigation</h1>
                </div>
                {route && (
                    <div className="flex items-center gap-4 text-sm font-semibold">
                        <span className="text-foreground/60">{route.distance} mi</span>
                        <span className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-lg flex items-center gap-1"><Battery className="w-4 h-4"/> Stops: {route.stops.length}</span>
                    </div>
                )}
            </div>

            <div className="flex-1 relative w-full h-full bg-secondary/50">
                {error ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-50">
                        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                        <p className="text-xl font-bold mb-2">Navigation Error</p>
                        <p className="text-foreground/60 mb-6 max-w-md">{error}</p>
                        <Link href="/trip-planner" className="px-6 py-3 bg-blue-500 text-white rounded-xl font-bold">Go back to Planner</Link>
                    </div>
                ) : (
                    <div ref={mapRef} className="w-full h-full" style={{ zIndex: 1 }} />
                )}
                
                {!error && !route && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-50">
                        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                    </div>
                )}
            </div>
        </div>
    );
}
