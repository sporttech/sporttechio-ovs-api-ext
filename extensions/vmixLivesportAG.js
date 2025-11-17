import { getName, transformIds, splitStartListChunks, splitResultsChunks, 
        updateFrameData, bindTeam, bindTeamFlag, recentGroups, 
        loadCommonConfig, getPerformanceRepresentation,
        registerCommonEndpoints} from './vmixLivesportCommon.js';
import { splitSessionPerformancesByRotationAndAppt } from '../model/AG/session.transform.js';
import { getTeamRank, getTeamScore } from '../model/AG/performance.utils.js';
let M = {};

let OVS = "";
let config = {
    teams: {},
    root: "/vmix/ag",
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
	updateFrameData(frameData, "bib", chunk.performances, ( p ) => { return p.athlete?.ExternalID || ""; });
	updateFrameData(frameData, "name", chunk.performances, ( p ) => { return getName(p.athlete) });
	updateFrameData(frameData, "repr", chunk.performances, ( p ) => { return bindTeam(p.athlete, config); });
	updateFrameData(frameData, "logo", chunk.performances, ( p ) => { return bindTeamFlag(p.athlete, config, OVS); } );
	frameData.event = chunk.event.Title;
	frameData.eventSubtitle = chunk.event.Subtitle;

	return frameData;
}
function proccessSessionChunk(chunk) {
	const frameData = {
		chunk: chunk.chunkIdx,
        rotation: chunk.rotation,
        appName: chunk?.apparatus?.name,
        appNameLocalised: chunk?.apparatus?.nameLocalised,
        appIcon: chunk?.apparatus?.icon
	};
	updateFrameData(frameData, "order", chunk.performances, ( p ) => { return String(p.order).padStart(2, "0")});
	updateFrameData(frameData, "bib", chunk.performances, ( p ) => { return p.athlete?.ExternalID || ""; });
	updateFrameData(frameData, "name", chunk.performances, ( p ) => { return getName(p.athlete) });
	updateFrameData(frameData, "repr", chunk.performances, ( p ) => { return bindTeam(p.athlete, config); });
	updateFrameData(frameData, "logo", chunk.performances, ( p ) => { return bindTeamFlag(p.athlete, config, OVS); } );
    frameData.competition = chunk?.competition?.Title,
	frameData.event = chunk.event.Title;
	frameData.eventSubtitle = chunk.event.Subtitle;

	return frameData;
}
function proccessResultsChunk(chunk) {
	const frameData = {
		competition: chunk.competition.Title,
	};
    if (chunk.appIcon) {
        frameData.appIcon = chunk.appIcon;
    }
    if (chunk.appName) {
        frameData.appName = chunk.appName;
    }
	updateFrameData(frameData, "rank", chunk.performances, ( p ) => { return String(p.rank).padStart(2, "0")});
	updateFrameData(frameData, "bib", chunk.performances, ( p ) => { return p.athlete?.ExternalID || ""; });
	updateFrameData(frameData, "name", chunk.performances, ( p ) => { return getName(p.athlete) });
	updateFrameData(frameData, "repr", chunk.performances, ( p ) => { return bindTeam(p.athlete, config); });
	updateFrameData(frameData, "logo", chunk.performances, ( p ) => { return bindTeamFlag(p.athlete, config, OVS); } );
	updateFrameData(frameData, "score", chunk.performances, ( p ) => { return (p.score / 1000).toFixed(3) });
	updateFrameData(frameData, "allRoundScore", chunk.performances, ( p ) => { return p.allRoundScore ? (p.allRoundScore / 1000).toFixed(3) : ""; });
	frameData.event = chunk.event.Title;
	frameData.eventSubtitle = chunk.event.Subtitle;

	return frameData;
}

function splitSessionChunks(data, max, sid, getRepr = getPerformanceRepresentation, extendPerformance = ()=>{}) {
	const event = data.Event;
    const session = data.Sessions[sid];
    if (session === undefined) {
        return [];
    }
    const stage = data.Stages[session.LongestStage_G];
    const competition = data.Competitions[stage.CompetitionID];
    const chunks = splitSessionPerformancesByRotationAndAppt(data, sid, max);
    const extendChunkData = (chunk, chunkIdx) => {
        const out = {
            chunkIdx: chunkIdx,
	        event: event,
	        session: session,
            competition: competition,
            apparatus: config.apparatus[chunk.frameType],
            rotation: 'R'+(chunk.rotation+1),
            performances: chunk.performances.map((p, idx) => {
                const out = { ...p };
                out.order = 1+idx + (chunk.chunkIdx === 0 ? 0 : (chunk.chunkIdx-1) * max);
                out.athlete = getRepr(p, data);
                extendPerformance(out, p, data);
                return out;
            }),
            sourceChunk: chunk
        };
        return out;
    }

    return chunks.map(extendChunkData);
}

function onStartLists(s_sids, chunkSize) {
    return transformIds(s_sids, chunkSize, M, splitStartListChunks, proccessStartListChunk)
}
function onSession(s_sids, chunkSize) {
    return transformIds(s_sids, chunkSize, M, splitSessionChunks, proccessSessionChunk)
}
function onResultsLists(s_sids, chunkSize) {
    const splitResults = (data, max, sid) => {
        return splitResultsChunks(data, max, sid, {
            getRepr: getPerformanceRepresentation,
            extendPerformance: (pout, p) => {
                pout.allRoundScore = p.MarkAllRoundSummaryTTT_G || 0;
            }
        });
    };
    return transformIds(s_sids, chunkSize, M, splitResults, proccessResultsChunk)
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

function getApptAllRoundScore(p, s, appt, data) {
    if (appt === "VAULT") {
        return p.MarkAllRoundVaultTTT_G;
    }
    const idx = findApptFrameIdx(s, appt);
    if (idx == -1) {
        return 0;
    }
    const fid = p.Frames[idx];
    return data.Frames[fid]?.TAllRoundMarkTTT_G || 0;
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

    const extendChunk = (chunk) => {
        chunk.appIcon = config.apparatus[appMap[appt]].icon;
        chunk.appName = config.apparatus[appMap[appt]].name;
    }

    const splitResults =  (data, max, sid) => {
        const stage = data?.Stages[sid];
        if (!stage) {
            return [];
        }
        const extendPerformance = (pout, p) => {
            if (appt === "VAULT") {
                pout.allRoundScore = p.MarkAllRoundVaultTTT_G || 0;
            } else {
                const idx = findApptFrameIdx(stage, appt);
                if (idx !== -1 && p.Frames[idx] !== undefined) {
                    const fid = p.Frames[idx];
                    const frame = data.Frames[fid];
                    pout.allRoundScore = frame?.TAllRoundMarkTTT_G || 0;
                } else {
                    pout.allRoundScore = 0;
                }
            }
        };
        return splitResultsChunks(data, max, sid, {
            getRepr: getPerformanceRepresentation,
            getRank: p => getApptRank(p, stage, appt),
            getScore: p => getApptScore(p, stage, appt, data),
            extendChunk: extendChunk,
            extendPerformance: extendPerformance
        });
    }
    return transformIds(s_sids, chunkSize, M, splitResults, proccessResultsChunk);
}

function mergeTeams(plist) {
    const filtered = plist.filter( p => p.teamID >= 0)
    const grouped = filtered.reduce((acc, obj) => {
        const key = obj.teamID;
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(obj);
        return acc;
    }, {});
    const mapped = Object.entries(grouped).map(([, group]) => {
        const ref = {
        ...group[0]
        }
        return ref;
    });
    return mapped;
}

function addTeam(pout, p, data) {
    if (p.Team >= 0) {
        pout.teamID = p.Team;
        pout.ARScore = p.MarkAllRoundTeamSummaryTTT_G;
        if (p.PrevPerformanceID_G && p.PrevPerformanceID_G !== -1) {
            const prev = data.Performances[p.PrevPerformanceID_G];
            pout.prevScore = getTeamScore(prev);
        }
    }
}

function proccessTeamResultsChunk(chunk) {
	const frameData = {
		competition: chunk.competition.Title,
	};
	updateFrameData(frameData, "rank", chunk.performances, ( p ) => { return String(p.rank).padStart(2, "0")});
	updateFrameData(frameData, "repr", chunk.performances, ( p ) => { return bindTeam(p.athlete, config); });
	updateFrameData(frameData, "logo", chunk.performances, ( p ) => { return bindTeamFlag(p.athlete, config, OVS); } );
	updateFrameData(frameData, "score", chunk.performances, ( p ) => { return (p.score / 1000).toFixed(3) });
	updateFrameData(frameData, "pscore", chunk.performances, ( p ) => { return (p.prevScore / 1000).toFixed(3) });
	updateFrameData(frameData, "arscore", chunk.performances, ( p ) => { return (p.ARScore / 1000).toFixed(3) });
	updateFrameData(frameData, "bib", chunk.performances, ( p ) => { return p.athlete?.ExternalID || ""; });
	frameData.event = chunk.event.Title;
	frameData.eventSubtitle = chunk.event.Subtitle;

	return frameData;
}

function onTeamResultsLists(s_sids, chunkSize) {
    const splitResults =  (data, max, sid) => {
        const stage = data?.Stages[sid];
        if (!stage) {
            return [];
        }
        return splitResultsChunks(data, max, sid, {
            getRepr: getPerformanceRepresentation,
            getRank: p => getTeamRank(p),
            getScore: p => getTeamScore(p),
            extendPerformance: addTeam,
            groupPerformances: (plist => mergeTeams(plist))
        });
    }
    return transformIds(s_sids, chunkSize, M, splitResults, proccessTeamResultsChunk);
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
                const apptName = config.apparatus[aptID].name;
                const allRoundAptScore = getApptAllRoundScore(p, s, apptName, M);
                const athlete = {
                    stageID: s.ID,
                    app: apptName,
                    group: s.Groups.indexOf(g.ID) + 1,
                    routine: "R" + (fidx + 1),
                    state: config.frameState[f.State],
                    bib: a.ExternalID,
                    name: getName(a),
                    repr: bindTeam(a, config),
                    scoreTotal: (p.MarkTTT_G / 1000).toFixed(3),
                    scoreRoutine: (f.TMarkTTT_G / 1000).toFixed(3),
                    scoreDifficulty: (f.DMarkT_G / 10).toFixed(1),
                    scoreExecution: (f.EMarkTTT_G / 1000).toFixed(3),
                    scorePenalties: (f.NPenaltyT_G / 10).toFixed(1),
                    rank: p.Rank_G,
                    rankApt: p.FrameRanks_G[fidx],
                    eventTitle: e.Title,
                    competitionTitle: c.Title,
                    logo: bindTeamFlag(a, config, OVS),
                    appIcon: config.apparatus[aptID].icon,
                    scorePrevRoutine: undefined,
                    scoreAllRound: p.MarkAllRoundSummaryTTT_G ? (p.MarkAllRoundSummaryTTT_G / 1000).toFixed(3) : undefined,
                    scoreAllRoundApt: allRoundAptScore ? (allRoundAptScore / 1000).toFixed(3) : undefined
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
    app.get(config.root + '/teamresults/:sids/chunk/:size', (req, res) => {
        const data = onTeamResultsLists(req.params.sids, req.params.size, req.params.appt);
        res.json(data);
    });
    app.get(config.root + '/sessions/:sids/chunk/:size', (req, res) => {
        const data = onSession(req.params.sids, req.params.size) 
        res.json(data);
    });
};