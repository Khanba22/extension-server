const https = require('https');
const http = require('http');

require('dotenv').config();

const PING_INTERVAL = 3 * 60 * 1000; // 3 minutes in milliseconds
const SERVER_URL = process.env.SERVER_URL;

function pingServer() {
    const protocol = SERVER_URL.startsWith('https') ? https : http;
    
    protocol.get(`${SERVER_URL}/health`, (res) => {
        const { statusCode } = res;
        if (statusCode === 200) {
            console.log(`[${new Date().toISOString()}] Health check successful`);
        } else {
            console.error(`[${new Date().toISOString()}] Health check failed with status: ${statusCode}`);
        }
    }).on('error', (err) => {
        console.error(`[${new Date().toISOString()}] Health check error:`, err.message);
    });
}

// Start the ping interval
console.log(`Starting health check ping every ${PING_INTERVAL/1000} seconds`);
setInterval(pingServer, PING_INTERVAL);

// Execute first ping immediately
pingServer();