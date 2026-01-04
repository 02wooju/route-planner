import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- STANDARD START/END ICON ---
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// --- 1. WAYPOINT ICON (Solid White - Click to Remove) ---
const DragIcon = L.divIcon({
  className: 'custom-drag-icon',
  html: `<div style="background-color: white; border: 2px solid #fc4c02; width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.5); cursor: pointer;"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

// --- 2. GHOST ICON (Semi-transparent - Drag to Add) ---
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
  const [distance, setDistance] = useState(5); 
  const [statusMsg, setStatusMsg] = useState("");

  const [waypoints, setWaypoints] = useState([]); // The list of all White Dots
  const [hoverPos, setHoverPos] = useState(null); // The Ghost Dot position

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

  const getPointAtDistance = (lat, lon, distKm, bearing) => {
    const R = 6371; 
    const latRad = (lat * Math.PI) / 180;
    const lonRad = (lon * Math.PI) / 180;
    const brngRad = (bearing * Math.PI) / 180;
    const lat2 = Math.asin(Math.sin(latRad) * Math.cos(distKm/R) + Math.cos(latRad) * Math.sin(distKm/R) * Math.cos(brngRad));
    const lon2 = lonRad + Math.atan2(Math.sin(brngRad) * Math.sin(distKm/R) * Math.cos(latRad), Math.cos(distKm/R) - Math.sin(latRad) * Math.sin(lat2));
    return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
  };

  const generateSquarePoints = (targetDist, modifier = 4.8) => {
    const sideLen = targetDist / modifier; 
    const startAngle = Math.floor(Math.random() * 4) * 90; 

    const c1 = getPointAtDistance(position[0], position[1], sideLen, startAngle);
    const c2 = getPointAtDistance(c1[0], c1[1], sideLen, startAngle + 90);
    const c3 = getPointAtDistance(c2[0], c2[1], sideLen, startAngle + 180);
    
    const newWaypoints = [
        [position[1], position[0]], 
        [c1[1], c1[0]],             
        [c2[1], c2[0]],             
        [c3[1], c3[0]],             
        [position[1], position[0]]  
    ];

    setWaypoints(newWaypoints); 
    fetchRouteFromWaypoints(newWaypoints, targetDist, modifier, 1); 
  };

  const fetchRouteFromWaypoints = async (points, targetDist = null, modifier = 4.8, attempt = 1) => {
    if(attempt === 1 && targetDist) setStatusMsg("Calculating...");

    const body = { coordinates: points, preference: "shortest" };

    try {
        const response = await fetch("http://localhost:3001/api/route", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: `https://api.openrouteservice.org/v2/directions/foot-walking/geojson`, body: body, key: ORS_KEY })
        });
        const data = await response.json();
        if (!data.features) throw new Error("No route");

        const summary = data.features[0].properties.summary;
        const actualDist = summary.distance / 1000;

        if (targetDist && Math.abs(actualDist - targetDist) > (targetDist * 0.15) && attempt <= 3) {
            const errorRatio = actualDist / targetDist;
            const newModifier = modifier * errorRatio; 
            setStatusMsg(`Refining Size (Attempt ${attempt + 1})...`);
            generateSquarePoints(targetDist, newModifier);
            return;
        }

        const coords = data.features[0].geometry.coordinates.map(c => [c[1], c[0]]);
        setRouteCoordinates(coords);
        setRouteStats({
            distance: actualDist.toFixed(2),
            duration: Math.round(summary.duration / 60)
        });
        setStatusMsg("");

    } catch (error) {
        console.error(error);
        setStatusMsg("Route failed.");
    }
  };

  // --- GOOGLE MAPS FEATURE 1: DRAG TO ADD ---
  const handleGhostDragEnd = (e) => {
    const newPoint = e.target.getLatLng();
    const newPointArr = [newPoint.lng, newPoint.lat];

    // Figure out WHERE on the line to insert this point
    let bestIndex = 1;
    let minAddedDist = Infinity;

    for (let i = 0; i < waypoints.length - 1; i++) {
        const A = L.latLng(waypoints[i][1], waypoints[i][0]);
        const B = L.latLng(waypoints[i+1][1], waypoints[i+1][0]);
        const detour = A.distanceTo(newPoint) + newPoint.distanceTo(B);
        
        if (detour < minAddedDist) {
            minAddedDist = detour;
            bestIndex = i + 1;
        }
    }

    const updatedWaypoints = [
        ...waypoints.slice(0, bestIndex),
        newPointArr,
        ...waypoints.slice(bestIndex)
    ];

    setWaypoints(updatedWaypoints);
    setHoverPos(null); 
    fetchRouteFromWaypoints(updatedWaypoints);
  };

  // --- GOOGLE MAPS FEATURE 2: CLICK TO REMOVE (REVERT) ---
  const handleWaypointClick = (index) => {
    // Prevent deleting Start or End points
    if (index === 0 || index === waypoints.length - 1) {
        alert("Cannot remove Start/End point.");
        return;
    }

    // Remove the point from array
    const updatedWaypoints = waypoints.filter((_, i) => i !== index);
    
    setWaypoints(updatedWaypoints);
    fetchRouteFromWaypoints(updatedWaypoints);
  };

  const handleWaypointDrag = (index, newLatLng) => {
    const updatedWaypoints = [...waypoints];
    updatedWaypoints[index] = [newLatLng.lng, newLatLng.lat];
    setWaypoints(updatedWaypoints);
    fetchRouteFromWaypoints(updatedWaypoints); 
  };

  const downloadGPX = () => {
    if (routeCoordinates.length === 0) return;
    let gpx = `<?xml version="1.0"?><gpx version="1.1" creator="MyRouteApp"><trk><name>Run</name><trkseg>`;
    routeCoordinates.forEach(c => gpx += `<trkpt lat="${c[0]}" lon="${c[1]}"></trkpt>`);
    gpx += `</trkseg></trk></gpx>`;
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `run_route.gpx`;
    link.click();
  };

  if (!position) return <div style={{color:'white', background:'#222', height:'100vh', display:'flex', alignItems:'center', justifyContent:'center'}}>Locating you...</div>;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 1000, background: '#1a1a1a', color: 'white', padding: '20px', borderRadius: '12px', width: '320px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', fontFamily: 'Arial' }}>
        <h3 style={{ margin: '0 0 15px 0', fontSize: '18px' }}>🟥 Square Loop Planner</h3>
        <div style={{fontSize:'13px', color:'#aaa', marginBottom:'15px', lineHeight: '1.4'}}>
            <b>Google Maps Editor:</b><br/>
            • 🖱️ <b>Drag</b> the line to create a new point.<br/>
            • ❌ <b>Click</b> a white point to delete it (revert).
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>
            <span>Target Distance</span>
            <span style={{color: '#fc4c02'}}>{distance} km</span>
          </label>
          <input 
            type="range" min="1" max="21" step="0.5" value={distance}
            onChange={(e) => setDistance(e.target.value)}
            style={{ width: '100%', cursor: 'pointer', accentColor: '#fc4c02' }}
          />
        </div>

        <button 
          onClick={() => generateSquarePoints(distance)} 
          style={{ width: '100%', padding: '12px', background: '#fc4c02', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Generate Box Loop
        </button>

        {statusMsg && <div style={{marginTop:'10px', color:'#aaa', fontSize:'12px', textAlign:'center'}}>{statusMsg}</div>}

        {routeStats && !statusMsg && (
          <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #444' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', textAlign: 'center', marginBottom: '15px' }}>
              <div><div style={{fontSize: '12px', color: '#aaa'}}>DISTANCE</div><div style={{fontSize: '18px', fontWeight: 'bold'}}>{routeStats.distance} <span style={{fontSize:'12px'}}>km</span></div></div>
              <div><div style={{fontSize: '12px', color: '#aaa'}}>TIME</div><div style={{fontSize: '18px', fontWeight: 'bold'}}>{routeStats.duration} <span style={{fontSize:'12px'}}>min</span></div></div>
            </div>
            <button onClick={downloadGPX} style={{ width: '100%', padding: '8px', background: '#333', color: 'white', border: '1px solid #555', borderRadius: '6px', cursor:'pointer' }}>📥 Download GPX</button>
          </div>
        )}
      </div>

      <MapContainer center={position} zoom={13} style={{ height: "100vh", width: "100vw" }}>
        <TileLayer attribution='&copy; OSM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <RecenterMap center={position} />
        
        <Marker position={position} icon={DefaultIcon}><Popup>Start/End</Popup></Marker>

        {/* 1. ROUTE LINE (Detects Hover) */}
        {routeCoordinates.length > 0 && (
            <Polyline 
                positions={routeCoordinates} 
                color="#fc4c02" 
                weight={6} 
                opacity={0.8} 
                eventHandlers={{
                    mousemove: (e) => setHoverPos(e.latlng)
                }}
            />
        )}

        {/* 2. GHOST MARKER (Drag to Create) */}
        {hoverPos && (
            <Marker
                position={hoverPos}
                icon={GhostIcon}
                draggable={true}
                eventHandlers={{
                    dragend: handleGhostDragEnd
                }}
            />
        )}

        {/* 3. WAYPOINTS (Click to Delete, Drag to Move) */}
        {waypoints.map((wp, index) => {
            if (index === 0 || index === waypoints.length - 1) return null;
            return (
                <Marker 
                    key={index}
                    position={[wp[1], wp[0]]}
                    draggable={true}
                    icon={DragIcon}
                    eventHandlers={{
                        dragend: (e) => handleWaypointDrag(index, e.target.getLatLng()),
                        click: (e) => handleWaypointClick(index) // CLICK TO DELETE!
                    }}
                >
                   <Popup>Click to remove this point</Popup> 
                </Marker>
            )
        })}

      </MapContainer>
    </div>
  );
};

export default MapComponent;