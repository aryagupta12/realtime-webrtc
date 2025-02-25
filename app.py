from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
from pydantic import BaseModel
import os
from dotenv import load_dotenv
import random

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load environment variables
load_dotenv()

# Get API key from environment variable
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
SERPER_API_KEY = os.getenv("SERPER_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY not found in environment variables")
if not SERPER_API_KEY:
    raise ValueError("SERPER_API_KEY not found in environment variables")

class SessionResponse(BaseModel):
    session_id: str
    token: str

class WeatherResponse(BaseModel):
    temperature: float
    unit: str

class SearchResponse(BaseModel):
    title: str
    snippet: str
    source: str
    image_url: str | None = None
    image_source: str | None = None

@app.get("/session")
async def get_session():
    async with httpx.AsyncClient() as client:
        response = await client.post(
            'https://api.openai.com/v1/realtime/sessions',
            headers={
                'Authorization': f'Bearer {OPENAI_API_KEY}',
                'Content-Type': 'application/json'
            },
            json={
                "model": "gpt-4o-realtime-preview-2024-12-17",
                "voice": "echo"
            }
        )
        return response.json()

@app.get("/weather/{location}")
async def get_weather(location: str):
    # First get coordinates for the location
    try:
        async with httpx.AsyncClient() as client:
            # Get coordinates for location
            geocoding_response = await client.get(
                f"https://geocoding-api.open-meteo.com/v1/search?name={location}&count=1"
            )
            geocoding_data = geocoding_response.json()
            
            if not geocoding_data.get("results"):
                return {"error": f"Could not find coordinates for {location}"}
                
            lat = geocoding_data["results"][0]["latitude"]
            lon = geocoding_data["results"][0]["longitude"]
            
            # Get weather data
            weather_response = await client.get(
                f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m"
            )
            weather_data = weather_response.json()
            
            temperature = weather_data["current"]["temperature_2m"]
            return WeatherResponse(temperature=temperature, unit="celsius")
            
    except Exception as e:
        return {"error": f"Could not get weather data: {str(e)}"}

@app.get("/search/{query}")
async def search_web(query: str):
    try:
        async with httpx.AsyncClient() as client:
            # Get regular search results
            response = await client.post(
                "https://google.serper.dev/search",
                headers={"X-API-KEY": SERPER_API_KEY},
                json={"q": query}
            )
            
            data = response.json()
            
            # Get image search results with larger size
            image_response = await client.post(
                "https://google.serper.dev/images",
                headers={"X-API-KEY": SERPER_API_KEY},
                json={
                    "q": query,
                    "gl": "us",
                    "hl": "en",
                    "autocorrect": True
                }
            )
            
            image_data = image_response.json()
            
            if "organic" in data and len(data["organic"]) > 0:
                result = data["organic"][0]  # Get the first result
                image_result = None
                
                # Find first valid image
                if "images" in image_data:
                    for img in image_data["images"]:
                        if img.get("imageUrl") and (
                            img["imageUrl"].endswith(('.jpg', '.jpeg', '.png', '.gif', '.webp')) or 
                            'images' in img["imageUrl"].lower()
                        ):
                            image_result = img
                            break
                
                return SearchResponse(
                    title=result.get("title", ""),
                    snippet=result.get("snippet", ""),
                    source=result.get("link", ""),
                    image_url=image_result["imageUrl"] if image_result else None,
                    image_source=image_result["source"] if image_result else None
                )
            else:
                return {"error": "No results found"}
                
    except Exception as e:
        return {"error": f"Could not perform search: {str(e)}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8888) 