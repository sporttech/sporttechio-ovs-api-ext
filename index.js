require('dotenv').config();
const EventSource = require('eventsource');
const express = require('express');
const app = express();
const port = 3000;

const serviceUrl = process.env.SERVICE_URL;
if (!serviceUrl) {
    throw new Error('SERVICE_URL environment variable is not set.');
}

const eventSource = new EventSource(serviceUrl);

let latestData = null;

eventSource.onmessage = function(event) {
    latestData = JSON.parse(event.data);
    console.log('New data received:', latestData);
};

eventSource.onerror = function(err) {
    console.error('EventSource failed:', err);
};

app.get('/data', (req, res) => {
    if (latestData) {
        res.json(latestData);
    } else {
        res.status(204).send('No data available');
    }
});

app.listen(port, () => {
    console.log(`API Adapter listening at http://localhost:${port}`);
});

