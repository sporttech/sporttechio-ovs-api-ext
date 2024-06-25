require('dotenv').config();
const EventSource = require('eventsource');
const express = require('express');
const { applyUpdate } = require('./updateModel');
const app = express();
const port = 3000;

const serviceUrl = process.env.SERVICE_URL;
if (!serviceUrl) {
    throw new Error('SERVICE_URL environment variable is not set.');
}

const eventSource = new EventSource(serviceUrl);

let model = {};

eventSource.onmessage = function(event) {
    const update = JSON.parse(event.data);
    applyUpdate(model, update);
    console.log('Model updated:', update);
};

eventSource.onerror = function(err) {
    console.error('EventSource failed:', err);
};

app.get('/data', (req, res) => {
    if (model) {
        res.json(model);
    } else {
        res.status(204).send('No data available');
    }
});

app.listen(port, () => {
    console.log(`API Adapter listening at http://localhost:${port}`);
});

