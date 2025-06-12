import { transformIds, splitStartListChunks, splitResultsChunks, 
        updateFrameData, bindTeam, bindTeamFlag, recentGroups, 
        loadCommonConfig, getPerformanceRepresentation, getPerformanceRank, getPerformanceScore,
        registerCommonEndpoints} from './vmixLivesportCommon.js';
import { Disciplines, buildStageAppsDescription, findApparatusFrameIndex } from '../model/RG/stage-apparatus.js';

let M = {};

let OVS = "";
let config = {
    teams: {},
    root: "/vmix/bra/rg",
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
    if (chunk.competition.Discipline === Disciplines.GROUP) {
	    updateFrameData(frameData, "groupName", chunk.performances, ( p ) => { return p.GroupName; } );
    }
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
    if (chunk.competition.Discipline === Disciplines.GROUP) {
	    updateFrameData(frameData, "groupName", chunk.performances, ( p ) => { return p.GroupName; } );
    }
	frameData.event = chunk.event.Title;
	frameData.eventSubtitle = chunk.event.Subtitle;
    frameData.appIcon = chunk.appIcon || "";

	return frameData;
}

const addPerformanceDescription = (out, p, data) => {
    const g = data.Groups[p.GroupID];
    const s = data.Stages[g.StageID];
    const c = data.Competitions[s.CompetitionID];
    if (c.Discipline === Disciplines.GROUP) {
        out.GroupName = p.GroupName;
    }
}
function onStartLists(s_sids, chunkSize) {
    const splitStart = (data, max, sid) => {
        return splitStartListChunks(data, max, sid, getPerformanceRepresentation, addPerformanceDescription)
    }
    return transformIds(s_sids, chunkSize, M, splitStart, proccessStartListChunk)
}

function onResultsLists(s_sids, chunkSize) {
    const splitResults =  (data, max, sid) => {
        const stage = data?.Stages[sid];
        if (!stage) {
            return [];
        }
        return splitResultsChunks(data, max, sid, {
            getRepr: getPerformanceRepresentation, 
            getRank: getPerformanceRank, 
            getScore: getPerformanceScore,
            extendPerformance: addPerformanceDescription,
        });
    }
    return transformIds(s_sids, chunkSize, M, splitResults, proccessResultsChunk)
}

function onApptResultsLists(s_sids, chunkSize, appt) {
    const getApptRank = (p, s, appt, data) => {
        const idx = findApparatusFrameIndex(s, appMap[appt]);
        if (idx == -1) {
            return 0;
        }
        const fid = p.Frames[idx];
        const f = data.Frames[fid];
        return f.Rank_G;
    };

    const getApptScore = (p, s, appt, data) => {
        const idx = findApparatusFrameIndex(s, appMap[appt]);
        if (idx == -1) {
            return 0;
        }
        const fid = p.Frames[idx];
        return data.Frames[fid].TMarkTTT_G;
    };

    const addChunkDescription = (chunk) => {
        const a = config.apparatus[""+appMap[appt]];
        chunk.appIcon = a.icon;
    }

    const splitResults =  (data, max, sid) => {
        const stage = data?.Stages[sid];
        if (!stage) {
            return [];
        }
        return splitResultsChunks(data, max, sid, 
            getPerformanceRepresentation, 
            p => getApptRank(p, stage, appt, data), 
            p => getApptScore(p, stage, appt, data),
            addPerformanceDescription,
            addChunkDescription
        );
    }
    return transformIds(s_sids, chunkSize, M, splitResults, proccessResultsChunk);
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
        const apparatuses = buildStageAppsDescription(s, c).all;
        for (const pid of g.Performances) {
            const p = M.Performances[pid];
            const aid = p.Athletes[0];
            const a = M.Athletes[aid];
            for (const [idx, app] of apparatuses.entries()) {
                const fid = p.Frames[app[0].idx];
                const appID = app[0].app;
                const app2ID = c.Discipline === Disciplines.GROUP ? app[1].app : undefined;
                const f = M.Frames[fid];
                const athlete = {
                    stageID: s.ID,
                    app: config.apparatus[appID].name,
                    app2: app2ID ? config.apparatus[app2ID].name : undefined,
                    group: s.Groups.indexOf(g.ID) + 1,
                    routine: "R" + (idx + 1),
                    state: config.frameState[f.State],
                    name: a.Surname + " " + a.GivenName,
                    repr: bindTeam(a, config),
                    scoreTotal: (p.MarkTTT_G / 1000).toFixed(3),
                    scoreRoutine: (f.TMarkTTT_G / 1000).toFixed(3),
                    scoreDifficulty: (f.DMarkTT_G / 100).toFixed(2),
                    scoreExecution: (f.EMarkTTT_G / 1000).toFixed(3),
                    scoreArtistic: (f.AMarkTTT_G / 1000).toFixed(3),
                    scorePenalties: (f.PenaltyTT_G / 100).toFixed(2),
                    rank: p.Rank_G,
                    eventTitle: e.Title,
                    competitionTitle: c.Title,
                    logo: bindTeamFlag(a, config, OVS),
                    appIcon: config.apparatus[appID].icon,
                    app2Icon: app2ID ? config.apparatus[app2ID].icon : undefined,
                    scorePrevRoutine: undefined
                }
                if (c.Discipline === Disciplines.GROUP) {
                    athlete.groupName = p.GroupName;
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
        appMap[appt.name] = Number(aptID);
    }
}


export async function register(app, model, addUpdateListner) {
    M = model;
    [OVS, config] = await loadCommonConfig("CONFIG_VMIX_LIVESPORT_RG_FILE", config);
    buildApptMap(config);
    registerCommonEndpoints(app, config, M, addUpdateListner, onStartLists, onResultsLists, onActiveGroups);
    app.get(config.root + '/results/:sids/:appt/chunk/:size', (req, res) => {
        const data = onApptResultsLists(req.params.sids, req.params.size, req.params.appt);
        res.json(data);
    });
};