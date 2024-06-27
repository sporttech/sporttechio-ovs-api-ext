const { transformStageList } = require('./vmixLivesportCommon');
const buffer = require("circular-buffer");

const F_STARTED = 1;
const F_PUBLISHED = 3;
const F_STATES = {};
F_STATES[F_STARTED] = "started";
F_STATES[F_PUBLISHED] = "published";

const recentFramesInFoucs = new buffer(10);

let M = {};

let OVS = "";
let config = {
    teams: {},
    root: "/vmid/bra/ag"
};

function bindTeam(a) {
    if (a.Representing in config.teams) {
        return config.teams[a.Representing].name;
    }
    return a.Representing;
}
function bindTeamFlag(a) {
    if (a.Representing in config.teams && config.teams[a.Representing].flag !== "") {
        return config.teams[a.Representing].flag;
    }
    return `${ OVS }/static/img/assets/named/${ a.Representing }`;
}

function processFrameUodate(frame) {
        if (!("State" in frame)) {
            return
        }
        const state = frame.State;
        if (state in F_STATES) {
            recentFramesInFoucs.enq({ID: frame.ID, state: F_STATES[state]});
        }
}

function updateFramesInFocus(updateM) {
    if (Object.keys(updateM["Frames"]).length > 10) {
        // Probably that is initial model load, skipping frames monitoring
        // and filling in buffer with Panel frames
        for (const panel of Object.values(updateM["Panels"])) {
            if (!("FrameID" in panel)) {
                continue;
            }
            const fid = panel.FrameID;
            if (!(fid in updateM.Frames)) {
                continue;
            }
            processFrameUodate(updateM.Frames[fid]);
        }
        return;
    }
    
    for (const frame of Object.values(updateM["Frames"])) {
        processFrameUodate(frame);
    }
}

function onModelUpdated(updateM) {
    updateFramesInFocus(updateM);
}


/// Start list request 
function newStartListChunk(event, competition, stage, group, groupIdx, chunk) {
    return {
		event: event,
		competition: competition,
        stage: stage,
        group: group,
		chunk: chunk,
		groupIdx: groupIdx,
        performances: []
    };
}


function splitStartListChunks(data, max, sid) {
    const chunks = [];
	const event = data.Event;
    const stage = data.Stages[sid];
    if (stage === undefined) {
        return [];
    }
	const competition = data.Competitions[stage.CompetitionID];

	for (const [idx, gid] of stage.Groups.entries()) {
		const group = data.Groups[gid];
		let chunkCount = 1;
		let chunk = newStartListChunk(event, competition, stage, group, idx, chunkCount);
		for (const [pidx, pid] of group.Performances.entries()) {
			const performance = data.Performances[pid];

			chunk.performances.push({
				athlete: data.Athletes[performance.Athletes[0]],
				order: pidx + 1
			});
			if (chunk.performances.length >= max && max > 0) {
				chunks.push(chunk);
				chunkCount++;
				chunk = newStartListChunk(event, competition, stage, group, idx, chunkCount);
			}
		}
		chunks.push(chunk);
	}

    return chunks;
}

function updateFrameData(frameData, key, performances, get) {
	const lng = performances.length > 8 ? performances.length : 8;
	for (let i = 0; i < lng; i++) {
		if (i < performances.length) {
			frameData[key + "_n" + (i+1)] = get(performances[i]);
		} else {
			frameData[key + "_n" + (i+1)] = "";
		}
	}
}

function proccessStartListChunk(chunk) {
	const frameData = {
		competition: chunk.competition.Title,
		group: chunk.groupIdx + 1,
		chunk: chunk.chunk
	};
	updateFrameData(frameData, "order", chunk.performances, ( p ) => { return String(p.order).padStart(2, "0")});
	updateFrameData(frameData, "name", chunk.performances, ( p ) => { return p.athlete.Surname + " " + p.athlete.GivenName });
	updateFrameData(frameData, "repr", chunk.performances, ( p ) => { return bindTeam(p.athlete); });
	updateFrameData(frameData, "logo", chunk.performances, ( p ) => { return bindTeamFlag(p.athlete); } );
	frameData["event"] = chunk.event.Title;
	frameData["eventSubtitle"] = chunk.event.Subtitle;

	return frameData;
}


function onStartLists(s_sids, chunkSize) {
    return transformStageList(s_sids, chunkSize, M, splitStartListChunks, proccessStartListChunk)
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
        res.json({ recentFramesInFoucs: recentFramesInFoucs.toarray()});
    });
    app.get(config.root + '/startlists/:sids/chunk/:size', (req, res) => {
        const resp = onStartLists(req.params.sids, req.params.size) 
        res.json(resp);
    });
};