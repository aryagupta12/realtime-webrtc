const CONFIG = {
    API_ENDPOINTS: {
        session: 'http://localhost:8888/session',
        weather: 'http://localhost:8888/weather',
        search: 'http://localhost:8888/search',
        realtime: 'https://api.openai.com/v1/realtime'
    },
    MODEL: 'gpt-4o-realtime-preview-2024-12-17',
    VOICE: 'echo',
    VOICES: ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'],
    INITIAL_MESSAGE: {
        text: 'My name is Geert and I live in Antwerp, Belgium.'
    },
    TOOLS: [{
        type: 'function',
        name: 'get_weather',
        description: 'Get current weather and 7-day forecast for any location on Earth. Includes temperature, humidity, precipitation, and wind speed.',
        parameters: {
            type: 'object',
            description: 'The location to get the weather for in English',
            properties: {
                location: { 
                    type: 'string',
                    description: 'The city or location name to get weather for'
                }
            },
            required: ['location']
        }
    },
    {
        type: 'function',
        name: 'search_web',
        description: 'Search the web for current information about any topic',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string' }
            },
            required: ['query']
        }
    }]
};

window.CONFIG = CONFIG; 