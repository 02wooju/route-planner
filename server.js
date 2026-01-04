// server.js
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// 1. AI LANE (Talks to Ollama)
app.post('/api/chat', async (req, res) => {
  try {
    const { prompt } = req.body;
    console.log("🦙 AI Request received...");
    
    const response = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "llama3",
            prompt: prompt,
            stream: false,
            format: "json"
        })
    });

    const data = await response.json();
    res.json(data.response); 

  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({ error: "Local AI Failed" });
  }
});

// 2. MAP LANE (Talks to OpenRouteService) - YOU WERE MISSING THIS!
app.post('/api/route', async (req, res) => {
    try {
        const { url, body, key } = req.body;
        console.log("🗺️ Map Request proxied...");

        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Authorization': key, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        res.json(data);

    } catch (error) {
        console.error("Map Proxy Error:", error);
        res.status(500).json({ error: "Map Request Failed" });
    }
});

app.listen(3001, () => {
  console.log('✅ Proxy Server Running (AI + Maps) on http://localhost:3001');
});