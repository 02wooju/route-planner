// server.js
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- CONFIGURATION ---
const app = express();
const PORT = process.env.PORT || 3000; // Cloud hosts set their own PORT
const GEMINI_API_KEY = process.env.GEMINI_KEY; // We will set this in the Cloud Dashboard

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// --- SERVE STATIC FRONTEND (Production Magic) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Serve the "dist" folder (where React builds to)
app.use(express.static(path.join(__dirname, 'dist')));

// --- 1. CLOUD AI LANE (Gemini) ---
app.post('/api/chat', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    // Check if Key exists
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "Server missing API Key" });
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Clean up Gemini's markdown formatting if it exists
    const cleanJson = text.replace(/```json|```/g, '').trim();
    
    res.json(cleanJson); 

  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({ error: "Cloud AI Failed" });
  }
});

// --- 2. MAP LANE (OpenRouteService Proxy) ---
app.post('/api/route', async (req, res) => {
    try {
        const { url, body, key } = req.body;
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
        res.status(500).json({ error: "Map Proxy Failed" });
    }
});

// --- CATCH-ALL (For React Router) ---
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Cloud Server running on port ${PORT}`);
});