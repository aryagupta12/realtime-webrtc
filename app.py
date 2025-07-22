from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx
from pydantic import BaseModel
import os
from dotenv import load_dotenv
import random

import logging

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Example usage of logger
logger.info("Logging is set up.")


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
load_dotenv(override=True)

# Get API key from environment variable
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
# OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY")
SERPER_API_KEY = os.getenv("SERPER_API_KEY")
REALTIME_SESSION_URL = os.getenv("REALTIME_SESSION_URL")

# this is the openai url: https://api.openai.com/v1/realtime/sessions
logger.info(f"REALTIME_SESSION_URL: {REALTIME_SESSION_URL}")

if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY not found in environment variables")
if not SERPER_API_KEY:
    raise ValueError("SERPER_API_KEY not found in environment variables")
if not REALTIME_SESSION_URL:
    raise ValueError("REALTIME_SESSION_URL not found in environment variables")

class SessionResponse(BaseModel):
    session_id: str
    token: str

class WeatherResponse(BaseModel):
    temperature: float
    humidity: float
    precipitation: float
    wind_speed: float
    unit_temperature: str = "celsius"
    unit_precipitation: str = "mm"
    unit_wind: str = "km/h"
    forecast_daily: list
    current_time: str
    latitude: float
    longitude: float
    location_name: str
    weather_code: int

class SearchResponse(BaseModel):
    title: str
    snippet: str
    source: str
    image_url: str | None = None
    image_source: str | None = None

@app.get("/session")
async def get_session(voice: str = "echo"):
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                REALTIME_SESSION_URL,
                headers={
                    'Authorization': f'Bearer {OPENAI_API_KEY}',
                    'Content-Type': 'application/json'
                },
                json={
                    "model": "gpt-4o-realtime-preview",
                    "voice": voice,
                    "instructions": """
                    You are a helpful assistant that can answer questions and help with tasks.
                    You have access to real-time weather data and web search capabilities.
                    When asked about the weather, provide the current temperature and humidity. Provide more information when asked.
                    When asked about a forecast, provide it but say ranging from x to y degrees over the days.
                    Never answer in markdown format. Plain text only with no markdown.
                    """
                }
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error occurred: {e.response.status_code}")
        return JSONResponse(status_code=e.response.status_code, content={"error": str(e)})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": "Internal Server Error", "details": str(e)})

@app.get("/weather/{location}")
async def get_weather(location: str):
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
            location_name = geocoding_data["results"][0]["name"]
            
            # Get weather data with more parameters
            weather_response = await client.get(
                f"https://api.open-meteo.com/v1/forecast"
                f"?latitude={lat}&longitude={lon}"
                f"&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code"
                f"&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code"
                f"&timezone=auto"
                f"&forecast_days=7"
            )
            weather_data = weather_response.json()
            
            # Extract current weather
            current = weather_data["current"]
            daily = weather_data["daily"]
            
            # Create daily forecast array
            forecast = []
            for i in range(len(daily["time"])):
                forecast.append({
                    "date": daily["time"][i],
                    "max_temp": daily["temperature_2m_max"][i],
                    "min_temp": daily["temperature_2m_min"][i],
                    "precipitation": daily["precipitation_sum"][i],
                    "weather_code": daily["weather_code"][i]
                })
            
            return WeatherResponse(
                temperature=current["temperature_2m"],
                humidity=current["relative_humidity_2m"],
                precipitation=current["precipitation"],
                wind_speed=current["wind_speed_10m"],
                forecast_daily=forecast,
                current_time=current["time"],
                latitude=lat,
                longitude=lon,
                location_name=location_name,
                weather_code=current["weather_code"]
            )
            
    except Exception as e:
        logger.error(f"Error getting weather data: {str(e)}")
        return JSONResponse(status_code=500, content={"error": f"Could not get weather data: {str(e)}"})

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
        logger.error(f"Error performing search: {str(e)}")
        return JSONResponse(status_code=500, content={"error": f"Could not perform search: {str(e)}"})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8888) 