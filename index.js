import dotenv from 'dotenv'
import EventSource from 'eventsource';
import clc from "cli-color";
import express from 'express';
import { internalIpV4Sync } from 'internal-ip';
import { applyUpdate, isEmptyUpdate } from './model/update.js';
import { routes, logRoutes } from './logRoutes.js';
import { extend as extendDataRoute } from './routes/data.js';

dotenv.config();

function getObjectSize(obj) {
    const seen = new WeakSet();
    function sizeOf(value) {
        if (value === null) return 0;
        if (typeof value === 'boolean') return 4;
        if (typeof value === 'number') return 8;
        if (typeof value === 'string') return value.length * 2;
        if (typeof value === 'symbol') return 0;
        if (typeof value === 'object') {
            if (seen.has(value)) return 0;
            seen.add(value);
            let size = 0;
            for (const key in value) {
                if (Object.prototype.hasOwnProperty.call(value, key)) {
                    size += sizeOf(key);
                    size += sizeOf(value[key]);
                }
            }
            return size;
        }
        return 0;
    }
    return sizeOf(obj);
}

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
const requestStatsInterval = parseInt(process.env.REQUEST_STATS_INTERVAL) || 15000; // Default 15 seconds
let eventSource;

let model = {};
let shouldClearModel = false;
let lastUpdateTime = Date.now();
let updateCount = 0;
let reconnectTimeout = null;

// Request aggregation
let requestStats = new Map();
let lastRequestStatsLog = Date.now();

const updateListners = [];
function addUpdateListner(listner) {
    updateListners.push(listner); 
}

function clearModel() {
    shouldClearModel = false;
    Object.keys(model).forEach(key => delete model[key]);
    console.log(clc.yellow('Model cleared'));
}

function logUpdateStats(update) {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTime;
    updateCount++;
    
    console.log(clc.yellow('\n=== EventSource Update Stats ==='));
    console.log(`Time since last update: ${timeSinceLastUpdate}ms`);
    console.log(`Total updates: ${updateCount}`);
    console.log(`Update size: ${JSON.stringify(update).length / 1024}KB`);
    console.log(`Model size: ${getObjectSize(model) / (1024 * 1024)}MB`);
    console.log(clc.yellow('=============================='));
    
    lastUpdateTime = now;
}

function logRequestStats() {
    const now = Date.now();
    const timeSinceLastLog = now - lastRequestStatsLog;
    
    if (timeSinceLastLog < requestStatsInterval) return; // Log every N seconds
    
    if (requestStats.size === 0) {
        lastRequestStatsLog = now;
        return;
    }
    
    console.log(clc.cyan(`\n=== Request Statistics (${requestStatsInterval/1000}s) ===`));
    
    // Sort by request count (descending)
    const sortedStats = Array.from(requestStats.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10); // Show top 10 most frequent requests
    
    sortedStats.forEach(([endpoint, stats]) => {
        const avgTime = (stats.totalTime / stats.count).toFixed(2);
        const requestsPerMinute = Math.round((stats.count / timeSinceLastLog) * 60000);
        
        console.log(clc.cyan(`${endpoint}:`), 
            `${stats.count} requests,`, 
            `avg ${avgTime}ms,`, 
            `${requestsPerMinute}/min,`,
            `[${Array.from(stats.statusCodes).join(',')}]`
        );
    });
    
    console.log(clc.cyan('===============================\n'));
    
    // Reset stats
    requestStats.clear();
    lastRequestStatsLog = now;
}

function trackRequest(req, res, duration, memoryDiff) {
    const endpoint = `${req.method} ${req.originalUrl}`;
    const statusCode = res.statusCode;
    
    if (!requestStats.has(endpoint)) {
        requestStats.set(endpoint, {
            count: 0,
            totalTime: 0,
            statusCodes: new Set(),
            lastRequest: Date.now()
        });
    }
    
    const stats = requestStats.get(endpoint);
    stats.count++;
    stats.totalTime += duration;
    stats.statusCodes.add(statusCode);
    stats.lastRequest = Date.now();
    
    // Log individual request only if it's not a frequent one
    if (stats.count <= 3 || (Date.now() - stats.lastRequest) > 10000) {
        const date = new Date();
        console.info(clc.blue(`${date.toLocaleTimeString()}:`), 
            clc.yellow(`${req.ip} =>`), 
            `${req.method} ${req.originalUrl} [${res.statusCode}] -`, 
            clc.whiteBright(`${duration.toFixed(2)} ms`),
            clc.cyan(`Memory: +${memoryDiff.heapUsed}MB heap, +${memoryDiff.external}MB external`)
        );
    }
    
    // Log aggregated stats periodically
    logRequestStats();
}

function setupEventSource() {
    eventSource = new EventSource(serviceUrl);
    
    eventSource.onopen = function() {
        console.log(clc.green('=== Connection established:'), serviceUrl);
        
        // Cancel any pending reconnect timeout since we're connected
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
            console.log(clc.green('Cancelled pending reconnect timeout'));
        }
    
        shouldClearModel = true;
        lastUpdateTime = Date.now();
        updateCount = 0;
    };
    
    eventSource.onmessage = function(event) {
        try {
            const start = process.hrtime();
            const startMemory = process.memoryUsage();
            
            if (shouldClearModel) {
                clearModel();
            }
            
            const update = JSON.parse(event.data);
            if (isEmptyUpdate(update)) {
                return;
            }

            // Log update statistics
            logUpdateStats(update);

            // Log model size before update
            const beforeModelSize = getObjectSize(model) / (1024 * 1024);
            console.log(clc.yellow('Model size before update:'), `${beforeModelSize.toFixed(2)}MB`);

            // Apply update with memory monitoring
            applyUpdate(model, update);
            model.lastUpdate = new Date();
            
            // Log model size after update
            const afterModelSize = getObjectSize(model) / (1024 * 1024);
            console.log(clc.yellow('Model size after update:'), `${afterModelSize.toFixed(2)}MB`);
            console.log(clc.yellow('Model size change:'), `${(afterModelSize - beforeModelSize).toFixed(2)}MB`);

            // Notify listeners with error handling
            updateListners.forEach((ul) => {
                try {
                    ul(update, model);
                } catch (e) {
                    console.error(clc.red('Model update listener failed:'), e);
                }
            });

            const [seconds, nanoseconds] = process.hrtime(start);
            const milliseconds = (seconds * 1e3) + (nanoseconds * 1e-6);
            const endMemory = process.memoryUsage();
            const memoryDiff = {
                heapUsed: Math.round((endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024),
                heapTotal: Math.round((endMemory.heapTotal - startMemory.heapTotal) / 1024 / 1024),
                external: Math.round((endMemory.external - startMemory.external) / 1024 / 1024),
                rss: Math.round((endMemory.rss - startMemory.rss) / 1024 / 1024)
            };

            const date = new Date();
            console.info(clc.blue(`${date.toLocaleTimeString()}:`), 
                `EVENTSOURCE model-update - `, 
                clc.whiteBright(`${milliseconds.toFixed(2)} ms`),
                clc.cyan(`Memory: +${memoryDiff.heapUsed}MB heap, +${memoryDiff.external}MB external`)
            );
        } catch (error) {
            console.error(clc.red('Error processing EventSource message:'), error);
            console.error(clc.red('Current memory usage:'), process.memoryUsage());
        }
    };
    
    eventSource.onerror = function(err) {
        console.error(clc.red('\n=== EventSource Error Details ==='));
        console.error(clc.red('Error object:'), err);
        console.error(clc.red('Error type:'), err?.type || 'unknown');
        console.error(clc.red('Error message:'), err?.message || 'No message');
        console.error(clc.red('ReadyState:'), eventSource.readyState, {
            0: 'CONNECTING',
            1: 'OPEN', 
            2: 'CLOSED'
        }[eventSource.readyState] || 'UNKNOWN');
        console.error(clc.red('URL:'), serviceUrl);
        console.error(clc.red('Timestamp:'), new Date().toISOString());
        console.error(clc.red('Current memory usage:'), process.memoryUsage());
        console.error(clc.red('===============================\n'));
        
        // Cancel any existing reconnect timeout
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
        }
        
        // Attempt to reconnect after a delay
        reconnectTimeout = setTimeout(() => {
            console.log(clc.yellow('Attempting to reconnect EventSource...'));
            eventSource.close();
            setupEventSource(); // Используем функцию настройки
        }, 5000);
    };
}

// Initialize EventSource
setupEventSource();

// Middleware to calculate request processing time and memory usage with aggregation
app.use((req, res, next) => {
    const start = process.hrtime();
    const startMemory = process.memoryUsage();
    
    // Add error handler
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
        const [seconds, nanoseconds] = process.hrtime(start);
        const milliseconds = (seconds * 1e3) + (nanoseconds * 1e-6);
        const endMemory = process.memoryUsage();
        const memoryDiff = {
            heapUsed: Math.round((endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024),
            heapTotal: Math.round((endMemory.heapTotal - startMemory.heapTotal) / 1024 / 1024),
            external: Math.round((endMemory.external - startMemory.external) / 1024 / 1024),
            rss: Math.round((endMemory.rss - startMemory.rss) / 1024 / 1024)
        };
        
        // Track request with aggregation
        trackRequest(req, res, milliseconds, memoryDiff);
        
        originalEnd.call(this, chunk, encoding);
    };

    // Add timeout handler
    const timeout = setTimeout(() => {
        console.error(clc.red(`Request timeout for ${req.method} ${req.originalUrl}`));
        if (!res.headersSent) {
            res.status(504).send('Request timeout');
        }
    }, 30000); // 30 second timeout

    res.on('finish', () => {
        clearTimeout(timeout);
    });

    next();
});

// Add global error handler
app.use((err, req, res, next) => {
    console.error(clc.red('Error processing request:'), err);
    const memoryUsage = process.memoryUsage();
    console.error(clc.red('Memory at error:'), {
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`
    });
    
    if (!res.headersSent) {
        res.status(500).send('Internal Server Error');
    }
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

app.use(express.static('static'));
app.use((req, res) => {
    const endpoints = routes.map(r => {
        // Replace chunk/:size with chunk/8 and :sids with 0
        let path = r.path;
        path = path.replace(/chunk\/:size/g, 'chunk/8')
                  .replace(/:sids/g, '0')
                  .replace(/:[^/]+/g, '0');
        return `<li><a href="${path}">${path}</a></li>`;
    }).join('\n');

    res.send(`
        <html>
            <body>
                <h3>OVS URL:</h3>
                <p><a href="${process.env.OVS_URL}/">${process.env.OVS_URL}/</a></p>
                
                <h3>Last Update:</h3>
                <p>${model.lastUpdate}</p>
                
                <h3>Available Endpoints:</h3>
                <ul>
                    ${endpoints}
                </ul>
            </body>
        </html>
    `);
})


app.listen(port, () => {
    console.log(clc.bgGreen(`=== sporttech.io API Adapter listening at`), clc.bgCyan(`http://${ip}:${port}`));
    console.log(clc.green(`OVS url:`), clc.bgCyan(`${ovsUrl}/`));
    logRoutes(app);
});