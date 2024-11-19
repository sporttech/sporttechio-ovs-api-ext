import { transformStageList, splitStartListChunks, splitResultsChunks, 
        updateFrameData, bindTeam, bindTeamFlag, recentGroups, 
        loadCommonConfig, getPerformanceRepresentation,
        registerCommonEndpoints} from './vmixLivesportCommon.js';

let M = {};

let OVS = "";
let config = {
    teams: {},
    root: "/vmix/bra/ag",
    frameState: {},
    apparatus: {}
};
let appMap = {};

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
function proccessSessionChunk(chunk) {
	const frameData = {
		chunk: chunk.chunk,
        competition: chunk.competition.Title,
        rotation: chunk.rotation,
        appIcon: chunk.app.icon
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


function newSessionChunk(event, session, competition, pack, app, rotation, chunk) {
    return {
		event: event,
		session: session,
        competition: competition,
        pack: pack,
        app: app,
        rotation: 'R'+rotation,
		chunk: chunk,
        performances: []
    };
}

function splitSessionChunks(data, max, sid, getRepr = getPerformanceRepresentation, extendPerformance = ()=>{}) {
    const chunks = [];
	const event = data.Event;
    const session = data.Sessions[sid];
    if (session === undefined) {
        return [];
    }
    const stage = data.Stages[session.LongestStage_G];
    const competition = data.Competitions[stage.CompetitionID];

    let rotationFound = true;
    let rotationNumber = -1;

    while (rotationFound) {
        rotationNumber++;
        rotationFound = false;
        for (const pkid of session.Packs) {
            const pack = data.Packs[pkid];
            let appID = -1;
            let app = "";
            for (const [appIdx, rotation] of Object.entries(pack.Rotations)) {
                if (rotation === rotationNumber) {
                    appID = stage.FrameTypes[appIdx];
                    app = config.apparatus[appID];
                    rotationFound = true;
                }
            }
            if (appID === -1) {
                continue;
            }
            let chunkCount = 1;
            let chunk = newSessionChunk(event, session, competition, pack, app, rotationNumber + 1, chunkCount);
            for (const [pidx, pid] of pack.Performances.entries()) {
                const performance = data.Performances[pid];
                const out = {
                    athlete: getRepr(performance, data),
                    order: pidx + 1
                }
                extendPerformance(out, performance, data);
                chunk.performances.push(out);
                if (chunk.performances.length >= max && max > 0) {
                    chunks.push(chunk);
                    chunkCount++;
                    chunk = newSessionChunk(event, session, competition,  pack, app, rotationNumber + 1, chunkCount);
                }
            }
            chunks.push(chunk);
        }
    }

    return chunks;
}

function onStartLists(s_sids, chunkSize) {
    return transformStageList(s_sids, chunkSize, M, splitStartListChunks, proccessStartListChunk)
}
function onSession(s_sids, chunkSize) {
    return transformStageList(s_sids, chunkSize, M, splitSessionChunks, proccessSessionChunk)
}
function onResultsLists(s_sids, chunkSize) {
    return transformStageList(s_sids, chunkSize, M, splitResultsChunks, proccessResultsChunk)
}

function findApptFrameIdx(s, appt) {
        const aptID = appMap[appt];
        for (let i = 0; i < s.PerfomanceFramesLimit; i++) {
            if (""+s.FrameTypes[i] === aptID) {
                return i;
            }    
        }
        return -1;
}

function onApptResultsLists(s_sids, chunkSize, appt) {
    const getApptRank = (p, s, appt) => {
        const idx = findApptFrameIdx(s, appt);
        if (idx == -1) {
            return 0;
        }
        return p.FrameRanks_G[idx]
    };

    const getApptScore = (p, s, appt, data) => {
        if (appt === "VAULT") {
            return p.MarkVaultTTT_G;
        }
        const idx = findApptFrameIdx(s, appt);
        if (idx == -1) {
            return 0;
        }
        const fid = p.Frames[idx];
        return data.Frames[fid].TMarkTTT_G;
    };

    const splitResults =  (data, max, sid) => {
        const stage = data?.Stages[sid];
        if (!stage) {
            return [];
        }
        return splitResultsChunks(data, max, sid, getPerformanceRepresentation, p => getApptRank(p, stage, appt), p => getApptScore(p, stage, appt, data));
    }
    return transformStageList(s_sids, chunkSize, M, splitResults, proccessResultsChunk);
}

const equals = (a, b) =>
    a.length === b.length &&
    a.every((v, i) => v === b[i]);
  
function getPrevStage(s,c,M) {
    const stageIdx = c.Stages.indexOf(s.ID);
    if (stageIdx < 1) {
        return null;
    }
    const prevStageId = c.Stages[stageIdx - 1];
    return M.Stages[prevStageId];
}

function getSameAthletePerformance(pRef, s, M) {
    if (s === null) {
        return null;
    }
    for (const gid of s.Groups) {
        const g = M.Groups[gid];
        for (const pid of g.Performances) {
            const p = M.Performances[pid];
            if (equals(p.Athletes, pRef.Athletes)) {
                return p;
            }
        }
    }

    return null;
}

function onActiveGroups() {
    const groups = recentGroups(M);
    const rows = [];
    for (const gid of groups) {
        const g = M.Groups[gid];
        const s = M.Stages[g.StageID];
        const c = M.Competitions[s.CompetitionID];
        const e = M.Event;
        const prevStage = getPrevStage(s,c,M);
        for (const pid of g.Performances) {
            const p = M.Performances[pid];
            const aid = p.Athletes[0];
            const a = M.Athletes[aid];
            for (const [fidx, fid] of p.Frames.entries()) {
                if (fidx >= s.PerfomanceFramesLimit) {
                    break;
                }
                const f = M.Frames[fid];
                const aptID = s.FrameTypes[fidx];
                const athlete = {
                    stageID: s.ID,
                    app: config.apparatus[aptID].name,
                    group: s.Groups.indexOf(g.ID) + 1,
                    routine: "R" + (fidx + 1),
                    state: config.frameState[f.State],
                    name: a.Surname + " " + a.GivenName,
                    repr: bindTeam(a, config),
                    scoreTotal: (p.MarkTTT_G / 1000).toFixed(3),
                    scoreRoutine: (f.TMarkTTT_G / 1000).toFixed(3),
                    scoreDifficulty: (f.DMarkT_G / 10).toFixed(1),
                    scoreExecution: (f.EMarkTTT_G / 1000).toFixed(3),
                    scorePenalties: (f.NPenaltyT_G / 10).toFixed(1),
                    rank: p.Rank_G,
                    eventTitle: e.Title,
                    competitionTitle: c.Title,
                    logo: bindTeamFlag(a, config, OVS),
                    appIcon: config.apparatus[aptID].icon,
                    scorePrevRoutine: undefined
                }
                // Hack for second VAULT2 routine
                if (fidx > 0 && aptID === 3) {
                    const prevFrameID = p.Frames[fidx-1];
                    const prevFrame = M.Frames[prevFrameID];
                    athlete.scorePrevRoutine = (prevFrame.TMarkTTT_G / 1000).toFixed(3);
                }
                // Get qualification results when possible
                const pp = getSameAthletePerformance(p, prevStage, M);
                if (pp !== null) {
                    athlete.scoreQ = (pp.MarkTTT_G / 1000).toFixed(3);
                    athlete.rankQ = pp.Rank_G;
                }

                rows.push(athlete);
            }
        }

    }   
    return rows;
}

function buildApptMap(config) {
    for (const aptID in config.apparatus) {
        const appt = config.apparatus[aptID];
        appMap[appt.name] = aptID;
    }
}


export async function register(app, model, addUpdateListner) {
    M = model;
    [OVS, config] = await loadCommonConfig("CONFIG_VMIX_LIVESPORT_AG_FILE", config);
    buildApptMap(config);
    registerCommonEndpoints(app, config, M, addUpdateListner, onStartLists, onResultsLists, onActiveGroups);
    app.get(config.root + '/results/:sids/:appt/chunk/:size', (req, res) => {
        const data = onApptResultsLists(req.params.sids, req.params.size, req.params.appt);
        res.json(data);
    });
    app.get(config.root + '/sessions/:sids/chunk/:size', (req, res) => {
        const data = onSession(req.params.sids, req.params.size) 
        res.json(data);
    });
};