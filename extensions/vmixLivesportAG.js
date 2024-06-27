const rootEP = "/vmix/bra/ag"
let M = {};

function onModelUpdated(model, update) {
    console.log("Model updated (listner)");
}

module.exports.register = function(app, model, addUpdateListner) {
    console.log("Registering extension " + rootEP);
    M = model;
    addUpdateListner(onModelUpdated);
    
    app.get(rootEP + '/example', (req, res) => {
        res.json({ message: "This is an example endpoint"});
    });
};