export function listTeams(model) {
    const teams = {};
    if (!model.Athletes) {
        return [];
    }
    for (const aid in model.Athletes) {
        const a = model.Athletes[aid];
        teams[a.Representing] = 1;
    }
    return  Object.keys(teams).sort();
}