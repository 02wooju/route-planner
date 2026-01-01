import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- Icon Fix ---
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// --- Helper Component to Recenter Map ---
function RecenterMap({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 14);
  }, [center, map]);
  return null;
}

const MapComponent = () => {
  const [position, setPosition] = useState(null); 
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [distance, setDistance] = useState(5); // Default 5km
  const [routeStats, setRouteStats] = useState(null); // To store actual distance/time
  
  // ---------------------------------------------------------
  // 1. PASTE YOUR KEY HERE (Ensure no extra spaces!)
  // ---------------------------------------------------------
  const API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImNlZTY0MTcyNzkxNDRhODhiMGMzZjA2YTJmMmZiOTRiIiwiaCI6Im11cm11cjY0In0="; 

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

  const generateRoute = async () => {
    if (!position || !API_KEY) {
        alert("Please wait for location or check your API Key.");
        return;
    }

    const seed = Math.floor(Math.random() * 10000);
    const startPoint = [position[1], position[0]]; // [Lon, Lat]

    // Changed to 'foot-hiking' for better loop finding
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
              length: 5000, // 5km
              points: 3, 
              seed: seed
            }
          }
        })
      });

      const data = await response.json();

      // --- ERROR HANDLING ---
      if (!response.ok) {
        // This will pop up the EXACT reason the server failed
        alert(`Error: ${data.error ? JSON.stringify(data.error) : "Unknown Error"}`);
        console.error("Full Error:", data);
        return;
      }
      
      const rawCoords = data.features[0].geometry.coordinates;
      const leafletCoords = rawCoords.map(coord => [coord[1], coord[0]]);
      
      setRouteCoordinates(leafletCoords);
      console.log("Route generated successfully!");

    } catch (error) {
      console.error("Network Error:", error);
      alert("Network Error: Check console for details.");
    }
  };

  if (!position) return <div style={{textAlign: 'center', marginTop: '20px'}}>Locating you...</div>;

  return (
    <div style={{ position: 'relative' }}>
      
      <div style={{
        position: 'absolute', 
        top: '20px', 
        right: '20px', 
        zIndex: 1000, 
        background: 'white', 
        padding: '10px', 
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
      }}>
        <button onClick={generateRoute} style={{ fontSize: '16px', padding: '8px 16px', cursor: 'pointer' }}>
          Generate 5km Run
        </button>
      </div>

      <MapContainer center={position} zoom={13} style={{ height: "100vh", width: "100vw" }}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RecenterMap center={position} />
        <Marker position={position}><Popup>Start Here</Popup></Marker>
        
        {routeCoordinates.length > 0 && (
          <Polyline positions={routeCoordinates} color="red" weight={5} />
        )}
      </MapContainer>
    </div>
  );
};

export default MapComponent;