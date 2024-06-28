function logRoutes(app) {
    console.log("Registered endpoints:");
    app._router.stack.forEach((middleware) => {
        if (middleware.route) { // routes registered directly on the app
            console.log(`${Object.keys(middleware.route.methods).join(', ').toUpperCase()} ${middleware.route.path}`);
        } else if (middleware.name === 'router') { // router middleware 
            middleware.handle.stack.forEach((handler) => {
                if (handler.route) {
                    console.log(`${Object.keys(handler.route.methods).join(', ').toUpperCase()} ${handler.route.path}`);
                }
            });
        }
    });
};

export {
    logRoutes
};