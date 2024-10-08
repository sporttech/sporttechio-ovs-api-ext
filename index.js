import dotenv from 'dotenv'
import EventSource from 'eventsource';
import clc from "cli-color";
import express from 'express';
import { internalIpV4Sync } from 'internal-ip';
import { applyUpdate, isEmptyUpdate } from './model/update.js';
import { logRoutes } from './logRoutes.js';
import { extend as extendDataRoute } from './routes/data.js';

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;
const ip =  internalIpV4Sync();

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
eventSource.onopen = function() {
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
        console.info(clc.blue(`${date.toLocaleTimeString()}:`), clc.yellow(`${req.ip} =>`), `${req.method} ${req.originalUrl} [${res.statusCode}] -`, clc.whiteBright(`${milliseconds.toFixed(2)} ms`));
    });
    next();
});

extendDataRoute(app, model);
async function loadExtensions() {
    const extensions = process.env.EXTENSIONS ? process.env.EXTENSIONS.split(',') : [];
    console.log(`sporttech.io API Adapter loading extensions: ${extensions}`);
    for (const extensionName of extensions) {
        console.log(`=== Loading extension: ${extensionName.trim()}`);
        try {
            const ext = await import(`./extensions/${extensionName.trim()}.js`);
            if (typeof ext.register === 'function') {
                await ext.register(app, model, addUpdateListner);
                console.log(clc.green(`Loaded extension:`), `${extensionName.trim()}`);
            } else {
                console.warn(`Extension ${extensionName.trim()} does not export a register function.`);
            }
        } catch (error) {
            console.error(clc.bgRed(`Failed to load extension`), `${extensionName.trim()}:`, error);
        }
    }
}

await loadExtensions();

app.listen(port, () => {
    console.log(clc.bgGreen(`=== sporttech.io API Adapter listening at`), clc.bgCyan(`http://${ip}:${port}`));
    console.log(clc.green(`OVS url:`), clc.bgCyan(`${ovsUrl}/`));
    logRoutes(app);
});