// UI Management
class UI {
    static elements = {
        startButton: document.getElementById('startButton'),
        stopButton: document.getElementById('stopButton'),
        clearButton: document.getElementById('clearButton'),
        transcript: document.getElementById('transcript'),
        status: document.getElementById('status'),
        error: document.getElementById('error'),
        imageContainer: document.getElementById('imageContainer'),
        contentWrapper: document.querySelector('.content-wrapper')
    };

    static updateStatus(message) {
        this.elements.status.textContent = message;
    }

    static showError(message) {
        this.elements.error.style.display = 'block';
        this.elements.error.textContent = message;
    }

    static hideError() {
        this.elements.error.style.display = 'none';
    }

    static updateTranscript(message, type = 'assistant') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;
        messageDiv.textContent = message;
        
        if (this.elements.transcript.firstChild) {
            this.elements.transcript.insertBefore(messageDiv, this.elements.transcript.firstChild);
        } else {
            this.elements.transcript.appendChild(messageDiv);
        }
    }

    static clearConversation() {
        this.elements.transcript.innerHTML = '';
        this.elements.imageContainer.innerHTML = '';
        this.elements.contentWrapper.classList.remove('with-image');
        this.updateStatus('Ready to start');
    }

    static updateButtons(isConnected) {
        this.elements.startButton.disabled = isConnected;
        this.elements.stopButton.disabled = !isConnected;
    }

    static displayImage(imageUrl, imageSource, query) {
        if (!imageUrl) {
            this.elements.contentWrapper.classList.remove('with-image');
            return;
        }

        this.elements.contentWrapper.classList.add('with-image');
        const imageWrapper = document.createElement('div');
        imageWrapper.className = 'image-wrapper';
        
        const img = document.createElement('img');
        img.className = 'search-image';
        img.alt = query;
        
        const loadingDiv = document.createElement('div');
        loadingDiv.textContent = 'Loading image...';
        loadingDiv.className = 'image-loading';
        imageWrapper.appendChild(loadingDiv);
        
        img.onload = () => {
            loadingDiv.remove();
            imageWrapper.appendChild(img);
            const caption = document.createElement('div');
            caption.className = 'image-caption';
            caption.innerHTML = `
                Image related to: ${query}<br>
                <a href="${imageSource}" target="_blank">Image source</a>
            `;
            imageWrapper.appendChild(caption);
        };
        
        img.onerror = () => {
            loadingDiv.textContent = 'Failed to load image';
            loadingDiv.className = 'image-error';
        };
        
        img.src = imageUrl;
        this.elements.imageContainer.innerHTML = '';
        this.elements.imageContainer.appendChild(imageWrapper);
    }
}

// Error Handler
class ErrorHandler {
    static handle(error, context) {
        console.error(`Error in ${context}:`, error);
        UI.showError(`Error ${context}: ${error.message}`);
    }
}

// Message Handler
class MessageHandler {
    static async handleTranscript(message) {
        const transcript = message.response?.output?.[0]?.content?.[0]?.transcript;
        if (transcript) {
            UI.updateTranscript(transcript);
        }
    }

    static async handleWeatherFunction(output) {
        try {
            const args = JSON.parse(output.arguments);
            const response = await fetch(`${CONFIG.API_ENDPOINTS.weather}/${encodeURIComponent(args.location)}`);
            const data = await response.json();
            
            // Format the current weather information
            const currentWeather = `
Current Weather in ${args.location}:
• Temperature: ${data.temperature}°${data.unit_temperature}
• Humidity: ${data.humidity}%
• Precipitation: ${data.precipitation}${data.unit_precipitation}
• Wind Speed: ${data.wind_speed}${data.unit_wind}
            `.trim();

            // Format the forecast information
            const forecast = data.forecast_daily.map(day => `
${new Date(day.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}:
• High: ${day.max_temp}°${data.unit_temperature}
• Low: ${day.min_temp}°${data.unit_temperature}
• Precipitation: ${day.precipitation}${data.unit_precipitation}
            `.trim()).join('\n\n');

            // Combine current weather and forecast
            const fullWeatherReport = `
${currentWeather}

7-Day Forecast:
${forecast}
            `.trim();
            
            UI.updateTranscript(currentWeather, 'function-result');
            
            return {
                temperature: data.temperature,
                humidity: data.humidity,
                precipitation: data.precipitation,
                wind_speed: data.wind_speed,
                forecast_daily: data.forecast_daily,
                current_time: data.current_time,
                location: args.location
            };
        } catch (error) {
            ErrorHandler.handle(error, 'Weather Function');
            return null;
        }
    }

    static async handleSearchFunction(output) {
        try {
            const args = JSON.parse(output.arguments);
            const response = await fetch(`${CONFIG.API_ENDPOINTS.search}/${encodeURIComponent(args.query)}`);
            const data = await response.json();
            
            UI.updateTranscript(
                `Search Results:
                    ${data.title}
                    ${data.snippet}`,
                'function-result'
            );
            UI.displayImage(data.image_url, data.image_source, args.query);
            
            return {
                title: data.title,
                snippet: data.snippet,
                source: data.source,
                image_url: data.image_url,
                image_source: data.image_source
            };
        } catch (error) {
            ErrorHandler.handle(error, 'Search Function');
            return null;
        }
    }
}

// WebRTC Manager
class WebRTCManager {
    constructor() {
        this.peerConnection = null;
        this.audioStream = null;
        this.dataChannel = null;
    }

    async setupAudio() {
        const audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        this.peerConnection.ontrack = e => audioEl.srcObject = e.streams[0];
        
        this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.peerConnection.addTrack(this.audioStream.getTracks()[0]);
    }

    setupDataChannel() {
        this.dataChannel = this.peerConnection.createDataChannel('oai-events');
        this.dataChannel.onopen = () => this.onDataChannelOpen();
        this.dataChannel.addEventListener('message', (event) => this.handleMessage(event));
    }

    async handleMessage(event) {
        try {
            const message = JSON.parse(event.data);
            console.log('Received message:', message);
            
            if (message.type === 'response.done') {
                await MessageHandler.handleTranscript(message);
                const output = message.response?.output?.[0];
                if (output?.type === 'function_call' && output?.call_id) {
                    let result;
                    if (output.name === 'get_weather') {
                        result = await MessageHandler.handleWeatherFunction(output);
                    } else if (output.name === 'search_web') {
                        result = await MessageHandler.handleSearchFunction(output);
                    }
                    
                    if (result) {
                        this.sendFunctionOutput(output.call_id, result);
                        this.sendResponseCreate();
                    }
                }
            }
        } catch (error) {
            ErrorHandler.handle(error, 'Message Processing');
        }
    }

    sendMessage(message) {
        if (this.dataChannel?.readyState === 'open') {
            this.dataChannel.send(JSON.stringify(message));
            console.log('Sent message:', message);
        }
    }

    sendSessionUpdate() {
        this.sendMessage({
            type: 'session.update',
            session: {
                tools: CONFIG.TOOLS,
                tool_choice: 'auto'
            }
        });
    }

    sendInitialMessage() {
        this.sendMessage({
            type: 'conversation.item.create',
            previous_item_id: null,
            item: {
                id: 'msg_' + Date.now(),
                type: 'message',
                role: 'user',
                content: [{
                    type: 'input_text',
                    text: CONFIG.INITIAL_MESSAGE.text
                }]
            }
        });
    }

    sendFunctionOutput(callId, data) {
        this.sendMessage({
            type: 'conversation.item.create',
            item: {
                type: 'function_call_output',
                call_id: callId,
                output: JSON.stringify(data)
            }
        });
    }

    sendResponseCreate() {
        this.sendMessage({ type: 'response.create' });
    }

    onDataChannelOpen() {
        this.sendSessionUpdate();
        this.sendInitialMessage();
    }

    cleanup() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
        }
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
    }
}

// Main Application
class App {
    constructor() {
        this.webrtc = null;
        this.bindEvents();
    }

    bindEvents() {
        UI.elements.startButton.addEventListener('click', () => this.init());
        UI.elements.stopButton.addEventListener('click', () => this.stop());
        UI.elements.clearButton.addEventListener('click', () => UI.clearConversation());
        document.addEventListener('DOMContentLoaded', () => UI.updateStatus('Ready to start'));
    }

    async init() {
        UI.elements.startButton.disabled = true;
        
        try {
            UI.updateStatus('Initializing...');
            
            const tokenResponse = await fetch(CONFIG.API_ENDPOINTS.session);
            const data = await tokenResponse.json();
            const EPHEMERAL_KEY = data.client_secret.value;

            this.webrtc = new WebRTCManager();
            this.webrtc.peerConnection = new RTCPeerConnection();
            await this.webrtc.setupAudio();
            this.webrtc.setupDataChannel();

            const offer = await this.webrtc.peerConnection.createOffer();
            await this.webrtc.peerConnection.setLocalDescription(offer);

            const sdpResponse = await fetch(`${CONFIG.API_ENDPOINTS.realtime}?model=${CONFIG.MODEL}`, {
                method: 'POST',
                body: offer.sdp,
                headers: {
                    Authorization: `Bearer ${EPHEMERAL_KEY}`,
                    'Content-Type': 'application/sdp'
                },
            });

            const answer = {
                type: 'answer',
                sdp: await sdpResponse.text(),
            };
            await this.webrtc.peerConnection.setRemoteDescription(answer);

            UI.updateStatus('Connected');
            UI.updateButtons(true);
            UI.hideError();

        } catch (error) {
            UI.updateButtons(false);
            ErrorHandler.handle(error, 'Initialization');
            UI.updateStatus('Failed to connect');
        }
    }

    stop() {
        if (this.webrtc) {
            this.webrtc.cleanup();
            this.webrtc = null;
        }
        UI.updateButtons(false);
        UI.updateStatus('Ready to start');
    }
}

// Initialize the application
const app = new App(); 