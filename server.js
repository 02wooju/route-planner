// server.js
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    // Connect to Ollama (running locally on your computer)
    const response = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "llama3", // Ensure you have downloaded this model!
            prompt: prompt,
            stream: false,
            format: "json"
        })
    });

    const data = await response.json();
    
    // Check if Ollama gave an error
    if (data.error) {
        throw new Error(data.error);
    }

    // Send the response back to your React app
    res.json(data.response); 

  } catch (error) {
    console.error("Ollama Error:", error);
    res.status(500).json({ error: "Failed to connect to Local AI. Is Ollama running?" });
  }
});

app.listen(3001, () => {
  console.log('🦙 Local AI Proxy running on http://localhost:3001');
});