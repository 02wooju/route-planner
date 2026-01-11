import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- ICONS ---
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Draggable White Dot
const DragIcon = L.divIcon({
  className: 'custom-drag-icon',
  html: `<div style="background-color: white; border: 2px solid #fc4c02; width: 12px; height: 12px; border-radius: 50%; cursor: pointer;"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

// Ghost Dot (Hover)
const GhostIcon = L.divIcon({
  className: 'custom-ghost-icon',
  html: `<div style="background-color: rgba(255, 255, 255, 0.6); border: 2px solid #fc4c02; width: 12px; height: 12px; border-radius: 50%; cursor: grab;"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

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
  const [routeStats, setRouteStats] = useState(null);
  
  // UI State
  const [distance, setDistance] = useState(5);
  const [statusMsg, setStatusMsg] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  
  // NEW: Collapsible State
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Route State (Draggable)
  const [waypoints, setWaypoints] = useState([]); 
  const [hoverPos, setHoverPos] = useState(null); 

  // Dynamic API URL for Dev vs Prod
  const API_BASE = import.meta.env.DEV ? "http://localhost:3001" : "";
  
  // ---------------------------------------------------------
  // 🔑 YOUR API KEY 
  // ---------------------------------------------------------
  const ORS_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImNlZTY0MTcyNzkxNDRhODhiMGMzZjA2YTJmMmZiOTRiIiwiaCI6Im11cm11cjY0In0="; 
  // ---------------------------------------------------------

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setPosition([pos.coords.latitude, pos.coords.longitude]),
        (err) => console.error(err)
      );
    }
  }, []);

  // --- 1. THE AI ARCHITECT ---
  const generateAiLoop = async () => {
    if (!position) return;
    setIsGenerating(true);
    setStatusMsg("AI is designing...");

    const prompt = `
      You are a Route Architect. Design a unique running loop of ${distance}km.
      Output JSON ONLY:
      {
        "sides": number (3, 4, or 5),
        "bearing": number (0-360),
        "description": "short string"
      }
    `;

    try {
        const response = await fetch(`${API_BASE}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: prompt })
        });

        const rawData = await response.json();
        
        let aiDecision;
        if (typeof rawData === 'string') {
            try { aiDecision = JSON.parse(rawData); } 
            catch (e) { aiDecision = { sides: 4, bearing: 0, description: "Standard Loop" }; }
        } else {
            aiDecision = rawData;
        }

        setStatusMsg(`Plan: ${aiDecision.description || "Custom Loop"}`);
        generatePolygon(distance, aiDecision.sides || 4, aiDecision.bearing || 0);

    } catch (err) {
        console.error("AI Error:", err);
        setStatusMsg("AI Offline. Using Math.");
        generatePolygon(distance, 4, Math.floor(Math.random() * 360)); 
    } finally {
        setIsGenerating(false);
    }
  };

  // --- 2. THE GEOMETRY BUILDER ---
  const getPointAtDistance = (lat, lon, distKm, bearing) => {
    const R = 6371; 
    const latRad = (lat * Math.PI) / 180;
    const lonRad = (lon * Math.PI) / 180;
    const brngRad = (bearing * Math.PI) / 180;
    const lat2 = Math.asin(Math.sin(latRad) * Math.cos(distKm/R) + Math.cos(latRad) * Math.sin(distKm/R) * Math.cos(brngRad));
    const lon2 = lonRad + Math.atan2(Math.sin(brngRad) * Math.sin(distKm/R) * Math.cos(latRad), Math.cos(distKm/R) - Math.sin(latRad) * Math.sin(lat2));
    return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
  };

  const generatePolygon = (dist, sides, startAngle, attempt = 1) => {
    const modifier = sides === 3 ? 3.5 : (sides === 4 ? 4.8 : 5.5);
    const adjustedModifier = modifier + (attempt * 0.1); 
    const sideLen = dist / adjustedModifier;
    const turnAngle = 360 / sides; 

    let currentPoint = [position[1], position[0]]; 
    let currentAngle = startAngle;
    
    const newWaypoints = [[position[1], position[0]]]; 

    for(let i=0; i < sides - 1; i++) {
        const next = getPointAtDistance(currentPoint[1], currentPoint[0], sideLen, currentAngle);
        newWaypoints.push([next[1], next[0]]); 
        currentPoint = [next[1], next[0]];
        currentAngle = (currentAngle + turnAngle) % 360;
    }

    newWaypoints.push([position[1], position[0]]); 
    
    setWaypoints(newWaypoints);
    fetchRouteFromWaypoints(newWaypoints, dist, adjustedModifier, attempt, { sides, startAngle });
  };

  // --- 3. ROBUST ROUTER ---
  const fetchRouteFromWaypoints = async (points, targetDist = null, modifier = 4.8, attempt = 1, shapeParams = null) => {
    const body = { coordinates: points, preference: "shortest" };

    try {
        const response = await fetch(`${API_BASE}/api/route`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: `https://api.openrouteservice.org/v2/directions/foot-walking/geojson`, body: body, key: ORS_KEY })
        });
        const data = await response.json();
        
        if (data.error || !data.features) {
            console.warn(`Attempt ${attempt} Failed:`, data);
            if (attempt <= 4 && shapeParams) {
                setStatusMsg(`Path blocked. Spinning shape (Attempt ${attempt+1})...`);
                generatePolygon(targetDist, shapeParams.sides, shapeParams.startAngle + 45, attempt + 1);
                return;
            }
            throw new Error("No route found.");
        }

        const summary = data.features[0].properties.summary;
        const actualDist = summary.distance / 1000;

        if (targetDist && Math.abs(actualDist - targetDist) > (targetDist * 0.15) && attempt <= 3 && shapeParams) {
            const errorRatio = actualDist / targetDist;
            const newModifier = modifier * errorRatio; 
            setStatusMsg(`Refining Distance (Attempt ${attempt + 1})...`);
            generatePolygon(targetDist, shapeParams.sides, shapeParams.startAngle, attempt + 1);
        } else {
             setStatusMsg(""); 
        }

        const coords = data.features[0].geometry.coordinates.map(c => [c[1], c[0]]);
        setRouteCoordinates(coords);
        setRouteStats({ distance: actualDist.toFixed(2), duration: Math.round(summary.duration / 60) });

    } catch (error) {
        console.error(error);
        setStatusMsg("Route failed. Try dragging points manually.");
    }
  };

  // --- 4. EDITOR LOGIC ---
  const handleGhostDragEnd = (e) => {
    const newPoint = e.target.getLatLng();
    const newPointArr = [newPoint.lng, newPoint.lat];
    let bestIndex = 1;
    let minAddedDist = Infinity;
    for (let i = 0; i < waypoints.length - 1; i++) {
        const A = L.latLng(waypoints[i][1], waypoints[i][0]);
        const B = L.latLng(waypoints[i+1][1], waypoints[i+1][0]);
        const detour = A.distanceTo(newPoint) + newPoint.distanceTo(B);
        if (detour < minAddedDist) { minAddedDist = detour; bestIndex = i + 1; }
    }
    const updated = [...waypoints.slice(0, bestIndex), newPointArr, ...waypoints.slice(bestIndex)];
    setWaypoints(updated);
    setHoverPos(null); 
    fetchRouteFromWaypoints(updated);
  };

  const handleWaypointDrag = (index, newLatLng) => {
    const updated = [...waypoints];
    updated[index] = [newLatLng.lng, newLatLng.lat];
    setWaypoints(updated);
    fetchRouteFromWaypoints(updated); 
  };

  const handleWaypointClick = (index) => {
    if (index === 0 || index === waypoints.length - 1) return;
    const updated = waypoints.filter((_, i) => i !== index);
    setWaypoints(updated);
    fetchRouteFromWaypoints(updated);
  };

  const downloadGPX = () => {
    if (!routeCoordinates.length) return;
    let gpx = `<?xml version="1.0"?><gpx version="1.1" creator="MyRouteApp"><trk><name>Run</name><trkseg>`;
    routeCoordinates.forEach(c => gpx += `<trkpt lat="${c[0]}" lon="${c[1]}"></trkpt>`);
    gpx += `</trkseg></trk></gpx>`;
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `route.gpx`;
    link.click();
  };

  if (!position) return <div style={{color:'white', background:'#222', height:'100vh', display:'flex', alignItems:'center', justifyContent:'center'}}>Locating you...</div>;

  return (
    <div style={{ position: 'relative' }}>
      
      {/* --- COLLAPSIBLE PANEL CONTAINER --- */}
      <div style={{ 
          position: 'fixed', // Fixed keeps it on top even if map scrolls (rare but safer)
          top: '20px', 
          // If collapsed, move it -320px off screen. If open, show at 20px from right.
          right: isCollapsed ? '-320px' : '20px', 
          zIndex: 1000, 
          transition: 'right 0.3s ease-in-out', // Smooth sliding animation
          display: 'flex',
          alignItems: 'flex-start'
      }}>
        
        {/* 1. THE TOGGLE TAB (The Black Tab with 3 lines) */}
        <div 
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{
                width: '40px',
                height: '40px',
                backgroundColor: '#1a1a1a',
                borderRadius: '8px 0 0 8px', // Round only left corners
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '4px',
                boxShadow: '-2px 2px 5px rgba(0,0,0,0.3)', // Shadow to separate from map
                position: 'relative',
                left: '1px' // Slight overlap to prevent gap
            }}
        >
            {/* Hamburger Icon (3 White Lines) */}
            <div style={{ width: '20px', height: '3px', background: 'white', borderRadius: '2px' }}></div>
            <div style={{ width: '20px', height: '3px', background: 'white', borderRadius: '2px' }}></div>
            <div style={{ width: '20px', height: '3px', background: 'white', borderRadius: '2px' }}></div>
        </div>

        {/* 2. THE MAIN PANEL CONTENT */}
        <div style={{ 
            background: '#1a1a1a', 
            color: 'white', 
            padding: '20px', 
            borderRadius: '0 0 12px 12px', // Bottom corners rounded
            // Top-left is sharp to match tab, Top-right rounded
            borderTopRightRadius: '12px',
            borderBottomLeftRadius: '12px',
            width: '320px', 
            maxWidth: '80vw', // Prevents overflow on small phones
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)', 
            fontFamily: 'Arial' 
        }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', display:'flex', alignItems:'center', gap:'10px' }}>
                🏃 AI Loop Generator
            </h3>
            
            <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>
                <span>Target Distance</span>
                <span style={{color: '#fc4c02'}}>{distance} km</span>
            </label>
            <input type="range" min="1" max="21" step="0.5" value={distance} onChange={(e) => setDistance(e.target.value)} style={{ width: '100%', cursor: 'pointer', accentColor: '#fc4c02' }} />
            </div>
            
            <button onClick={generateAiLoop} disabled={isGenerating} style={{ width: '100%', padding: '12px', background: isGenerating ? '#555' : '#fc4c02', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: isGenerating ? 'wait' : 'pointer' }}>
            {isGenerating ? 'AI Designing...' : 'Generate AI Loop'}
            </button>
            
            {statusMsg && <div style={{marginTop:'10px', color:'#aaa', fontSize:'12px', textAlign:'center', fontStyle:'italic'}}>{statusMsg}</div>}
            
            {routeStats && (
            <div style={{ marginTop:'20px', paddingTop: '15px', borderTop: '1px solid #444' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', textAlign: 'center', marginBottom: '15px' }}>
                <div><div style={{fontSize: '12px', color: '#aaa'}}>DISTANCE</div><div style={{fontSize: '18px', fontWeight: 'bold'}}>{routeStats.distance} <span style={{fontSize:'12px'}}>km</span></div></div>
                <div><div style={{fontSize: '12px', color: '#aaa'}}>TIME</div><div style={{fontSize: '18px', fontWeight: 'bold'}}>{routeStats.duration} <span style={{fontSize:'12px'}}>min</span></div></div>
                </div>
                <button onClick={downloadGPX} style={{ width: '100%', padding: '8px', background: '#333', color: 'white', border: '1px solid #555', borderRadius: '6px', cursor:'pointer' }}>📥 Download GPX</button>
                <div style={{marginTop:'10px', fontSize:'11px', color:'#777', textAlign:'center'}}>Drag line to edit • Click points to remove</div>
            </div>
            )}
        </div>

      </div>

      <MapContainer center={position} zoom={13} style={{ height: "100vh", width: "100vw" }}>
        <TileLayer attribution='&copy; OSM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <RecenterMap center={position} />
        <Marker position={position} icon={DefaultIcon}><Popup>Start</Popup></Marker>
        {routeCoordinates.length > 0 && <Polyline positions={routeCoordinates} color="#fc4c02" weight={6} opacity={0.8} eventHandlers={{ mousemove: (e) => setHoverPos(e.latlng) }} />}
        {hoverPos && <Marker position={hoverPos} icon={GhostIcon} draggable={true} eventHandlers={{ dragend: handleGhostDragEnd }} />}
        {waypoints.map((wp, index) => {
            if (index === 0 || index === waypoints.length - 1) return null;
            return <Marker key={index} position={[wp[1], wp[0]]} draggable={true} icon={DragIcon} eventHandlers={{ dragend: (e) => handleWaypointDrag(index, e.target.getLatLng()), click: (e) => handleWaypointClick(index) }} />;
        })}
      </MapContainer>
    </div>
  );
};

export default MapComponent;