require('dotenv').config();
const EventSource = require('eventsource');
const clc = require("cli-color");
const express = require('express');
const { applyUpdate, isEmptyUpdate } = require('./updateModel');
const { logRoutes } = require('./logRoutes');
const app = express();
const port = process.env.PORT || 3000;

const ovsUrl = process.env.OVS_URL;
if (!ovsUrl) {
    throw new Error('OVS_URL environment variable is not set.');
}
const ovsEp = process.env.OVS_API_REQUEST;
if (!ovsEp) {
    throw new Error('OVS_API_REQUEST environment variable is not set.');
}

const serviceUrl = ovsUrl + ovsEp;
const eventSource = new EventSource(serviceUrl);

let model = {};
let shouldClearModel = false;

const updateListners = [];
function addUpdateListner(listner) {
    updateListners.push(listner); 
}

function clearModel() {
    shouldClearModel = false;
    Object.keys(model).forEach(key => delete model[key]);

}
eventSource.onmessage = function(event) {
    const start = process.hrtime();
    if (shouldClearModel) {
        clearModel();
    }
    const update = JSON.parse(event.data);
    if (isEmptyUpdate(update)) {
        return;
    }

    applyUpdate(model, update);
    model.lastUpdate = new Date();
    updateListners.forEach((ul) => {
        try {
            ul(update, model);
        } catch (e) {
            console.warn("Model update listner failed:");
            console.error(e);
        }
    });

    const [seconds, nanoseconds] = process.hrtime(start);
    const milliseconds = (seconds * 1e3) + (nanoseconds * 1e-6);
    const date = new Date();
    console.info(clc.blue(`${date.toLocaleTimeString()}:`), `EVENTSOURCE model-update - `, clc.whiteBright(`${milliseconds.toFixed(2)} ms`));
};

eventSource.onerror = function(err) {
    console.error(clc.red('EventSource failed:'), err);
};
eventSource.onopen = function(event) {
    console.log(clc.green('=== Connection established:'), serviceUrl);
    shouldClearModel = true;
};

// Middleware to calculate request processing time
app.use((req, res, next) => {
    const start = process.hrtime();
    res.on('finish', () => {
        const [seconds, nanoseconds] = process.hrtime(start);
        const milliseconds = (seconds * 1e3) + (nanoseconds * 1e-6);
        const date = new Date();
        console.info(clc.blue(`${date.toLocaleTimeString()}:`), `${req.method} ${req.originalUrl} [${res.statusCode}] -`, clc.whiteBright(`${milliseconds.toFixed(2)} ms`));
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
console.log(`sporttech.io API Adapter loading extensions: ${extensions}`);
extensions.forEach(extensionName => {
    console.log(`=== Loading extension: ${extensionName.trim()}`);
    try {
        const extension = require(`./extensions/${extensionName.trim()}`);
        if (typeof extension.register === 'function') {
            extension.register(app, model, addUpdateListner);
            console.log(clc.green(`Loaded extension:`), `${extensionName.trim()}`);
        } else {
            console.warn(`Extension ${extensionName.trim()} does not export a register function.`);
        }
    } catch (error) {
        console.error(clc.bgRed(`Failed to load extension`), `${extensionName.trim()}:`, error);
    }
});

app.listen(port, () => {
    console.log(clc.bgGreen(`=== sporttech.io API Adapter listening at`), `http://localhost:${port}`);
    console.log(clc.green(`OVS url:`), `${ovsUrl}/`);
    logRoutes(app);
});

