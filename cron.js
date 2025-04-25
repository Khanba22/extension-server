const https = require('https');
const http = require('http');

require('dotenv').config();
const SERVER_URL = process.env.SERVER_URL;


function pingServer() {
    const protocol = SERVER_URL.startsWith('https') ? https : http;

    protocol.get(`${SERVER_URL}/`, (res) => {
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

// Execute first ping immediately
module.exports = pingServer;