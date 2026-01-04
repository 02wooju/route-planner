// src/MapComponent.jsx
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

  // Chat State
  const [chatInput, setChatInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [aiMessage, setAiMessage] = useState("Tell me what run you want!");

  // ---------------------------------------------------------
  // 🔑 API KEYS
  // ---------------------------------------------------------
  const ORS_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImNlZTY0MTcyNzkxNDRhODhiMGMzZjA2YTJmMmZiOTRiIiwiaCI6Im11cm11cjY0In0="; 
  
  // PASTE YOUR OPENAI KEY HERE (Starts with 'sk-...')
  const OPENAI_KEY = ""; 
  // ---------------------------------------------------------

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setPosition([pos.coords.latitude, pos.coords.longitude]),
        (err) => console.error(err)
      );
    }
  }, []);

  // --- THE BRAIN: OpenAI (ChatGPT) Connector ---
  const handleChatSubmit = async () => {
    if (!chatInput.trim()) return;
    setIsThinking(true);
    setAiMessage("Thinking...");

    if (!OPENAI_KEY.startsWith("sk-")) {
        setAiMessage("Error: Key must start with 'sk-'");
        setIsThinking(false);
        return;
    }

    const systemPrompt = `
      You are a running route API. Extract parameters from the user's request into valid JSON.
      
      Output Format:
      { 
        "distance_km": number (default 5), 
        "destination_name": string or null, 
        "preference": "road" or "trail" (default "road") 
      }
      
      Return ONLY the JSON object. No other text.
    `;

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo", // Fast and cheap model
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: chatInput }
                ],
                temperature: 0.7
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        const rawText = data.choices[0].message.content;
        console.log("ChatGPT Response:", rawText);

        // Surgical JSON Extraction (Just in case it chats)
        const jsonStart = rawText.indexOf('{');
        const jsonEnd = rawText.lastIndexOf('}');
        
        if (jsonStart === -1) throw new Error("No JSON found");

        const cleanJson = rawText.substring(jsonStart, jsonEnd + 1);
        const params = JSON.parse(cleanJson);
        
        console.log("Parsed Params:", params); 
        if (params.distance_km) setDistance(params.distance_km);
        executeRunPlan(params);

    } catch (error) {
        console.error("OpenAI Error:", error);
        setAiMessage(`Error: ${error.message}`);
        setIsThinking(false);
    }
  };

  // --- ROUTING LOGIC (Unchanged) ---
  const executeRunPlan = async (params) => {
    const profile = params.preference === 'road' ? 'foot-walking' : 'foot-hiking';
    if (params.destination_name) {
      setAiMessage(`Plotting run to ${params.destination_name}...`);
      await generateDestinationRoute(params.destination_name, profile);
    } else {
      setAiMessage(`Generating ${params.distance_km}km ${params.preference} loop...`);
      await generateLoopRoute(params.distance_km, profile);
    }
    setIsThinking(false);
  };

  const generateDestinationRoute = async (placeName, profile) => {
    try {
      const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${placeName}&viewbox=${position[1]-0.5},${position[0]+0.5},${position[1]+0.5},${position[0]-0.5}&bounded=1`;
      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json();
      if (!geoData.length) { setAiMessage(`Can't find ${placeName}`); return; }
      
      const { lat, lon } = geoData[0];
      const url = `https://api.openrouteservice.org/v2/directions/${profile}/geojson`;
      const body = { coordinates: [[position[1], position[0]], [parseFloat(lon), parseFloat(lat)], [position[1], position[0]]] };
      await fetchAndDraw(url, body);
    } catch (err) { console.error(err); setAiMessage("Routing failed."); }
  };

  const generateLoopRoute = async (dist, profile) => {
    const url = `https://api.openrouteservice.org/v2/directions/${profile}/geojson`;
    const body = {
      coordinates: [[position[1], position[0]]],
      options: { round_trip: { length: (dist || 5) * 1000, points: 3, seed: Math.floor(Math.random() * 10000) } }
    };
    await fetchAndDraw(url, body);
  };

  const fetchAndDraw = async (url, body) => {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': ORS_KEY.trim(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!data.features) throw new Error("No route");

        const coords = data.features[0].geometry.coordinates.map(c => [c[1], c[0]]);
        setRouteCoordinates(coords);
        const summary = data.features[0].properties.summary || (data.features[0].properties.segments && data.features[0].properties.segments[0]);
        if (summary) {
            setRouteStats({
                distance: (summary.distance / 1000).toFixed(2),
                duration: Math.round(summary.duration / 60)
            });
        }
    } catch (err) {
        console.error(err);
        setAiMessage("Route generation failed.");
    }
  };

  const downloadGPX = () => {
    if (routeCoordinates.length === 0) return;
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
      <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 1000, background: '#1a1a1a', color: 'white', padding: '15px', borderRadius: '12px', width: '320px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', fontFamily: 'Arial' }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#fc4c02', fontSize: '16px' }}>🤖 AI Assistant (ChatGPT)</h3>
        <div style={{ background: '#333', padding: '8px', borderRadius: '6px', marginBottom: '10px', fontSize: '13px', minHeight: '30px' }}>{isThinking ? <span style={{fontStyle:'italic', color:'#aaa'}}>Thinking...</span> : aiMessage}</div>
        <div style={{ display: 'flex', gap: '5px' }}>
            <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="e.g. 5km on main roads" onKeyDown={(e) => e.key === 'Enter' && handleChatSubmit()} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', fontSize:'13px' }} />
            <button onClick={handleChatSubmit} style={{ background: '#fc4c02', color: 'white', border: 'none', borderRadius: '6px', cursor:'pointer' }}>Go</button>
        </div>
      </div>

      <div style={{ position: 'absolute', top: '180px', right: '20px', zIndex: 1000, background: '#1a1a1a', color: 'white', padding: '20px', borderRadius: '12px', width: '320px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', fontFamily: 'Arial' }}>
        <h3 style={{ margin: '0 0 15px 0', fontSize: '18px' }}>🏃 Manual Control</h3>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}><span>Target Distance</span><span style={{color: '#fc4c02'}}>{distance} km</span></label>
          <input type="range" min="1" max="21" step="0.5" value={distance} onChange={(e) => setDistance(e.target.value)} style={{ width: '100%', cursor: 'pointer', accentColor: '#fc4c02' }} />
        </div>
        <button onClick={() => generateLoopRoute(distance, 'foot-hiking')} style={{ width: '100%', padding: '12px', background: '#fc4c02', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>Generate Loop</button>
        {routeStats && (
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
        <Marker position={position}><Popup>Start</Popup></Marker>
        {routeCoordinates.length > 0 && <Polyline positions={routeCoordinates} color="#fc4c02" weight={5} opacity={0.8} />}
      </MapContainer>
    </div>
  );
};

export default MapComponent;