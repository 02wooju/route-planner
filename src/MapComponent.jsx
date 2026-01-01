// src/MapComponent.jsx
import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- Icon Fix (Standard Leaflet Hack) ---
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// --- Helper Component to Recenter Map on Location Change ---
function RecenterMap({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 14);
  }, [center, map]);
  return null;
}

const MapComponent = () => {
  // State for user location, route data, and UI controls
  const [position, setPosition] = useState(null); 
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  
  // New State: Distance Slider (default 5km) and Route Stats
  const [distance, setDistance] = useState(5); 
  const [routeStats, setRouteStats] = useState(null);

  // ---------------------------------------------------------
  // 🔽 YOUR API KEY IS PRE-FILLED HERE 🔽
  // ---------------------------------------------------------
  const API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImNlZTY0MTcyNzkxNDRhODhiMGMzZjA2YTJmMmZiOTRiIiwiaCI6Im11cm11cjY0In0="; 

  // 1. Get User Location on Load
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setPosition([latitude, longitude]);
        },
        (err) => console.error("Error getting location:", err)
      );
    }
  }, []);

  // --- New Helper: Calculate Distance from Coordinates (The Fallback) ---
  const calculateStatsFromCoords = (coords) => {
    let totalDistMeters = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = L.latLng(coords[i][0], coords[i][1]);
      const p2 = L.latLng(coords[i+1][0], coords[i+1][1]);
      totalDistMeters += p1.distanceTo(p2);
    }
    
    // Assume walking/hiking speed approx 5km/h (83 meters/min)
    const durationMins = Math.round(totalDistMeters / 83);
    
    return {
      distance: (totalDistMeters / 1000).toFixed(2),
      duration: durationMins
    };
  };

  // 2. Generate Route Logic (Updated)
  const generateRoute = async () => {
    if (!position || !API_KEY) {
        alert("Please wait for location or check your API Key.");
        return;
    }

    const seed = Math.floor(Math.random() * 10000);
    const startPoint = [position[1], position[0]]; 
    const targetDistance = distance * 1000; 

    const url = 'https://api.openrouteservice.org/v2/directions/foot-hiking/geojson';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': API_KEY.trim(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          coordinates: [startPoint],
          options: {
            round_trip: {
              length: targetDistance,
              points: 3, 
              seed: seed 
            }
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(`Error: ${data.error ? JSON.stringify(data.error) : "Unknown Error"}`);
        return;
      }
      
      // 1. Parse Coordinates
      const rawCoords = data.features[0].geometry.coordinates;
      const leafletCoords = rawCoords.map(coord => [coord[1], coord[0]]);
      setRouteCoordinates(leafletCoords);

      // 2. Get Stats (Try API first, Fallback to Manual Math)
      const props = data.features[0].properties;
      const summary = props.summary || (props.segments && props.segments[0]);

      if (summary && summary.distance) {
        // API gave us stats
        setRouteStats({
            distance: (summary.distance / 1000).toFixed(2),
            duration: Math.round(summary.duration / 60)
        });
      } else {
        // API failed stats -> Calculate manually from the line
        console.warn("API stats missing, calculating manually...");
        const manualStats = calculateStatsFromCoords(leafletCoords);
        setRouteStats(manualStats);
      }

      console.log("Route generated successfully!");

    } catch (error) {
      console.error("Network Error:", error);
      alert("Network Error: Check console for details.");
    }
  };

  // 3. Download GPX Function
  const downloadGPX = () => {
    if (routeCoordinates.length === 0) return;

    let gpxData = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MyRouteApp">
  <trk>
    <name>Run ${routeStats ? routeStats.distance : distance}km</name>
    <trkseg>
`;

    routeCoordinates.forEach(coord => {
      // Leaflet is [Lat, Lon], GPX expects lat="..." lon="..."
      gpxData += `      <trkpt lat="${coord[0]}" lon="${coord[1]}"></trkpt>\n`;
    });

    gpxData += `    </trkseg>
  </trk>
</gpx>`;

    const blob = new Blob([gpxData], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `route-${routeStats ? routeStats.distance : distance}km.gpx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Loading State
  if (!position) return <div style={{textAlign: 'center', marginTop: '50px', fontSize: '18px'}}>Locating you...</div>;

  return (
    <div style={{ position: 'relative' }}>
      
      {/* --- Control Panel Card --- */}
      <div style={{
        position: 'absolute', 
        top: '20px', 
        right: '20px', 
        zIndex: 1000, 
        background: 'white', 
        padding: '20px', 
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        width: '300px',
        fontFamily: 'Arial, sans-serif'
      }}>
        <h3 style={{ margin: '0 0 15px 0', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          🏃 Route Builder
        </h3>
        
        {/* Distance Slider */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>
            <span>Target Distance</span>
            <span style={{color: '#fc4c02'}}>{distance} km</span>
          </label>
          <input 
            type="range" 
            min="1" 
            max="21" 
            step="0.5"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            style={{ width: '100%', cursor: 'pointer', accentColor: '#fc4c02' }}
          />
        </div>

        <button 
          onClick={generateRoute} 
          style={{ 
            width: '100%', 
            padding: '12px', 
            background: '#fc4c02', // Strava Orange
            color: 'white', 
            border: 'none', 
            borderRadius: '8px', 
            fontSize: '16px',
            cursor: 'pointer',
            fontWeight: 'bold',
            transition: 'background 0.2s'
          }}
          onMouseOver={(e) => e.target.style.background = '#e34402'}
          onMouseOut={(e) => e.target.style.background = '#fc4c02'}
        >
          Generate Route
        </button>

        {/* Stats Display & Download */}
        {routeStats && (
          <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #eee' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', textAlign: 'center', marginBottom: '15px' }}>
              <div>
                <div style={{fontSize: '12px', color: '#666', marginBottom: '4px'}}>ACTUAL DISTANCE</div>
                <div style={{fontSize: '18px', fontWeight: 'bold'}}>{routeStats.distance} <span style={{fontSize:'12px'}}>km</span></div>
              </div>
              <div>
                <div style={{fontSize: '12px', color: '#666', marginBottom: '4px'}}>EST. TIME</div>
                <div style={{fontSize: '18px', fontWeight: 'bold'}}>{routeStats.duration} <span style={{fontSize:'12px'}}>min</span></div>
              </div>
            </div>

            <button 
                onClick={downloadGPX}
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  background: 'white', 
                  color: '#333', 
                  border: '1px solid #ccc', 
                  borderRadius: '6px', 
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontWeight: '500'
                }}
            >
                📥 Download GPX
            </button>
          </div>
        )}
      </div>

      {/* --- Map --- */}
      <MapContainer center={position} zoom={13} style={{ height: "100vh", width: "100vw" }}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <RecenterMap center={position} />
        
        <Marker position={position}>
          <Popup>Start Location</Popup>
        </Marker>

        {routeCoordinates.length > 0 && (
          <Polyline positions={routeCoordinates} color="#fc4c02" weight={5} opacity={0.8} />
        )}

      </MapContainer>
    </div>
  );
};

export default MapComponent;