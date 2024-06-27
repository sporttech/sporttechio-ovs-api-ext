const { transformStageList, splitStartListChunks, splitResultsChunks, updateFrameData, bindTeam, bindTeamFlag, updateFramesInFocus, recentFrames } = require('./vmixLivesportCommon');

let M = {};

let OVS = "";
let config = {
    teams: {},
    root: "/vmid/bra/ag"
};

function onModelUpdated(updateM) {
    updateFramesInFocus(updateM);
}

function proccessStartListChunk(chunk) {
	const frameData = {
		competition: chunk.competition.Title,
		group: chunk.groupIdx + 1,
		chunk: chunk.chunk
	};
	updateFrameData(frameData, "order", chunk.performances, ( p ) => { return String(p.order).padStart(2, "0")});
	updateFrameData(frameData, "name", chunk.performances, ( p ) => { return p.athlete.Surname + " " + p.athlete.GivenName });
	updateFrameData(frameData, "repr", chunk.performances, ( p ) => { return bindTeam(p.athlete, config); });
	updateFrameData(frameData, "logo", chunk.performances, ( p ) => { return bindTeamFlag(p.athlete, config, OVS); } );
	frameData.event = chunk.event.Title;
	frameData.eventSubtitle = chunk.event.Subtitle;

	return frameData;
}
function proccessResultsChunk(chunk) {
	const frameData = {
		competition: chunk.competition.Title,
	};
	updateFrameData(frameData, "rank", chunk.performances, ( p ) => { return String(p.rank).padStart(2, "0")});
	updateFrameData(frameData, "name", chunk.performances, ( p ) => { return p.athlete.Surname + " " + p.athlete.GivenName });
	updateFrameData(frameData, "repr", chunk.performances, ( p ) => { return bindTeam(p.athlete, config); });
	updateFrameData(frameData, "logo", chunk.performances, ( p ) => { return bindTeamFlag(p.athlete, config, OVS); } );
	updateFrameData(frameData, "score", chunk.performances, ( p ) => { return (p.score / 1000).toFixed(3) });
	frameData.event = chunk.event.Title;
	frameData.eventSubtitle = chunk.event.Subtitle;

	return frameData;
}

function onStartLists(s_sids, chunkSize) {
    return transformStageList(s_sids, chunkSize, M, splitStartListChunks, proccessStartListChunk)
}
function onResultsLists(s_sids, chunkSize) {
    return transformStageList(s_sids, chunkSize, M, splitResultsChunks, proccessResultsChunk)
}

/// Results list request 

module.exports.register = function(app, model, addUpdateListner) {
    addUpdateListner(onModelUpdated);
    M = model;
    OVS = process.env.OVS_URL;
    if (!OVS) {
        throw new Error('OVS_URL environment variable is not set.');
    }
    const cfg = process.env.CONFIG_VMIX_LIVESPORT_FILE;
    if (!cfg) {
        console.warn('CONFIG_VMIX_LIVESPORT_FILE environment variable is not set, will use default (empty) config');
    } else {
        console.log(`Loading config from ${cfg}`);
        config = require(cfg);
    }

    app.get(config.root + '/recent-frames', (req, res) => {
        res.json({ recentFramesInFoucs: recentFrames()});
    });
    app.get(config.root + '/startlists/:sids/chunk/:size', (req, res) => {
        const data = onStartLists(req.params.sids, req.params.size) 
        res.json(data);
    });
    app.get(config.root + '/results/:sids/chunk/:size', (req, res) => {
        const data = onResultsLists(req.params.sids, req.params.size) 
        res.json(data);
    });
};