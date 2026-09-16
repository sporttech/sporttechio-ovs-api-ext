const routes = [];
const routeKeys = new Set();
let appRouteKeys = new WeakMap();

function routeKey(method, path) {
    return `${method.toLowerCase()} ${path}`;
}

function pathParameterNames(path) {
    return Array.from(path.matchAll(/:([A-Za-z0-9_]+)/g), match => match[1]);
}

function validateDescriptor(descriptor) {
    if (!descriptor || typeof descriptor !== 'object') {
        throw new TypeError('Endpoint descriptor must be an object');
    }
    const method = String(descriptor.method || 'get').toLowerCase();
    const path = descriptor.path;
    if (!path || typeof path !== 'string') {
        throw new TypeError('Endpoint path must be a non-empty string');
    }

    const parameters = descriptor.parameters || [];
    const names = new Set();
    for (const parameter of parameters) {
        if (!parameter?.name || names.has(parameter.name)) {
            throw new Error(`Endpoint ${method.toUpperCase()} ${path} has an invalid or duplicate parameter name`);
        }
        names.add(parameter.name);
        if (!['path', 'query'].includes(parameter.in)) {
            throw new Error(`Endpoint parameter ${parameter.name} must use "path" or "query"`);
        }
        if (!['text', 'number', 'enum'].includes(parameter.control)) {
            throw new Error(`Endpoint parameter ${parameter.name} has unsupported control ${parameter.control}`);
        }
        if (parameter.control === 'enum' && !Array.isArray(parameter.options)) {
            throw new Error(`Endpoint enum parameter ${parameter.name} must provide options`);
        }
    }

    const tokens = pathParameterNames(path);
    for (const token of tokens) {
        if (!parameters.some(parameter => parameter.name === token && parameter.in === 'path')) {
            throw new Error(`Endpoint ${method.toUpperCase()} ${path} does not describe path parameter :${token}`);
        }
    }
    for (const parameter of parameters.filter(item => item.in === 'path')) {
        if (!tokens.includes(parameter.name)) {
            throw new Error(`Endpoint ${method.toUpperCase()} ${path} describes missing path parameter :${parameter.name}`);
        }
    }

    for (const variant of descriptor.variants || []) {
        if (!variant?.label || !variant.values || typeof variant.values !== 'object') {
            throw new Error(`Endpoint ${method.toUpperCase()} ${path} has an invalid variant`);
        }
        for (const name of Object.keys(variant.values)) {
            if (!names.has(name)) {
                throw new Error(`Endpoint variant ${variant.label} refers to unknown parameter ${name}`);
            }
        }
    }

    return {
        method,
        path,
        title: descriptor.title || path,
        parameters,
        variants: descriptor.variants || []
    };
}

function registerEndpoint(app, descriptor, handler) {
    const endpoint = validateDescriptor(descriptor);
    const key = routeKey(endpoint.method, endpoint.path);
    const registeredForApp = appRouteKeys.get(app) || new Set();
    if (registeredForApp.has(key)) {
        throw new Error(`Endpoint ${endpoint.method.toUpperCase()} ${endpoint.path} is already registered`);
    }
    if (typeof app[endpoint.method] !== 'function') {
        throw new Error(`Express app does not support method ${endpoint.method}`);
    }

    app[endpoint.method](endpoint.path, handler);
    registeredForApp.add(key);
    appRouteKeys.set(app, registeredForApp);
    if (!routeKeys.has(key)) {
        routeKeys.add(key);
        routes.push({
            method: [endpoint.method],
            path: endpoint.path,
            title: endpoint.title,
            parameters: endpoint.parameters,
            variants: endpoint.variants
        });
    }
}

function addExpressRoute(route) {
    const methods = Object.keys(route.methods || {});
    for (const method of methods) {
        const key = routeKey(method, route.path);
        if (routeKeys.has(key)) continue;
        routeKeys.add(key);
        routes.push({ method: [method], path: String(route.path) });
    }
}

function logRoutes(app) {
    for (const middleware of app._router?.stack || []) {
        if (middleware.route) {
            addExpressRoute(middleware.route);
        } else if (middleware.name === 'router') {
            for (const handler of middleware.handle?.stack || []) {
                if (handler.route) addExpressRoute(handler.route);
            }
        }
    }

    console.log('Registered endpoints:');
    for (const route of routes) {
        console.log(`${route.method.join(', ').toUpperCase()} ${route.path}`);
    }
}

function resetRoutesForTests() {
    routes.length = 0;
    routeKeys.clear();
    appRouteKeys = new WeakMap();
}

export {
    logRoutes,
    registerEndpoint,
    resetRoutesForTests,
    routes,
    validateDescriptor
};
