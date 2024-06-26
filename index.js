require('dotenv').config();
const EventSource = require('eventsource');
const express = require('express');
const { applyUpdate } = require('./updateModel');
const { logRoutes } = require('./logRoutes');
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
    if (Object.keys(update).length > 0) {
        model.lastUpdate = new Date();
    }
};

eventSource.onerror = function(err) {
    console.error('EventSource failed:', err);
};
eventSource.onopen = function(event) {
    console.log('Connection established:', serviceUrl);
    Object.keys(model).forEach(key => delete model[key]);
};

// Middleware to calculate request processing time
app.use((req, res, next) => {
    const start = process.hrtime();
    res.on('finish', () => {
        const [seconds, nanoseconds] = process.hrtime(start);
        const milliseconds = (seconds * 1e3) + (nanoseconds * 1e-6);
        console.log(`${req.method} ${req.originalUrl} [${res.statusCode}] - ${milliseconds.toFixed(2)} ms`);
    });
    next();
});

app.get('/data', (req, res) => {
    if (model) {
        res.json(model);
    } else {
        res.status(204).send('No data available');
    }
});
app.get('/data/lu', (req, res) => {
    if (model.lastUpdate) {
        res.json({"lastUodate": model.lastUpdate});
    } else {
        res.status(204).send('No data available');
    }
});


const extensions = process.env.EXTENSIONS ? process.env.EXTENSIONS.split(',') : [];
extensions.forEach(extensionName => {
    try {
        const extension = require(`./extensions/${extensionName.trim()}`);
        if (typeof extension.register === 'function') {
            extension.register(app, model);
            console.log(`Loaded extension: ${extensionName.trim()}`);
        } else {
            console.warn(`Extension ${extensionName.trim()} does not export a register function.`);
        }
    } catch (error) {
        console.error(`Failed to load extension ${extensionName.trim()}:`, error);
    }
});

app.listen(port, () => {
    console.log(`sporttech.io API Adapter listening at http://localhost:${port}`);
    logRoutes(app);
});

