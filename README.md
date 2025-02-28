# OpenAI Real-time WebRTC Demo

A real-time audio chat application using OpenAI's realtime audio API with WebRTC. Ask about the weather in any location and get real-time responses using Open-Meteo API.

**Notes:** 

- work in progress
- does not work with Azure OpenAI just yet; you need an OpenAI account and topped up on credits
- WebRTC API is in preview (as of 2025-02-28)



## Features

- Real-time audio streaming
- Live transcription
- Weather function integration with Open-Meteo API
- Google search integration (requires SERPER_API_KEY)
- WebRTC communication
- FastAPI backend to get a ephemeral session token and to get weather data

## Setup

1. Clone the repository
2. Create a virtual environment: `python -m venv .venv`
3. Activate it: 
   - Windows: `.venv\Scripts\activate`
   - Unix/macOS: `source .venv/bin/activate`
4. Install dependencies: `pip install -r requirements.txt`
5. Create `.env` file with your OpenAI API key:   

```bash
OPENAI_API_KEY=your-key-here
SERPER_API_KEY=your-key-here
REALTIME_SESSION_URL=https://api.openai.com/v1/realtime/sessions
```

Notes: 

- Go to https://serper.dev/ and get your API key.
- Go to https://openai.com and get your API key.
- The realtime session URL for Azure OpenAI will be different; only OpenAI is supported for now



## Running

1. Start server: `python app.py`
2. Open index.html in a browser (Tip: use live server extension for VSCode)
3. Click Start and allow microphone access
4. Try asking: "What's the weather like in Amsterdam?"

## Files

- app.py: FastAPI backend server
- index.html: Frontend interface
- config.js: Configuration for the frontend
- app.js: Frontend logic
- requirements.txt: Python dependencies
- test.http: API endpoint tests
- .env: Environment variables (create this)