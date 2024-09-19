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

function listTeams(req, res) {
    const teams = {};
    if (!model.Athletes) {
        res.json({'teams':[]});
        return;
    }
    for (const aid in model.Athletes) {
        const a = model.Athletes[aid];
        teams[a.Representing] = 1;
    }
    res.json({
        'teams':Object.keys(teams).sort()
    });
}


export function extend(app, m) {
    model = m;
    app.get('/data', getData);
    app.get('/data/lastUpdate', lastUpdate);
    app.get('/data/listTeams', listTeams);
};