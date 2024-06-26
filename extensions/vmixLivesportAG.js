const rootEP = "/vmix/bra/ag"
let M = {};
module.exports.register = function(app, model) {
    console.log("Registering extension " + rootEP);
    M = model;
    app.get(rootEP + '/example', (req, res) => {
        res.json({ message: "This is an example endpoint"});
    });
};