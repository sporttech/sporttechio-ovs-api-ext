import { routes } from "../logRoutes.js";
import { listTeams } from "../model/query.js";
let model = {};

function getData(req, res) {
    res.json(model);
}

function lastUpdate(req, res) {
    if (model.lastUpdate) {
        res.json({"lastUodate": model.lastUpdate});
    } else {
        res.status(204).send('No data available');
    }
}

function listTeamsWrap(req, res) {
    res.json({
        'teams':listTeams(model)
    });
}
function listRoutes(req, res) {
    res.json({
        list: routes.map(r => r.path),
        routes: routes,
    });
}


export function extend(app, m) {
    model = m;
    app.get('/data', getData);
    app.get('/data/lastUpdate', lastUpdate);
    app.get('/data/listTeams', listTeamsWrap);
    app.get('/endpoints', listRoutes);
};