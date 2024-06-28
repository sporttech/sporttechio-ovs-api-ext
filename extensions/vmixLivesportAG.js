import { transformStageList, splitStartListChunks, splitResultsChunks, 
        updateFrameData, bindTeam, bindTeamFlag, recentGroups, 
        loadCommonConfig,
        registerCommonEndpoints} from './vmixLivesportCommon.js';

let M = {};

let OVS = "";
let config = {
    teams: {},
    root: "/vmid/bra/ag",
    frameState: {},
    apparatus: {}
};

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
    rows = [];
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


export async function register(app, model, addUpdateListner) {
    M = model;
    [OVS, config] = await loadCommonConfig("CONFIG_VMIX_LIVESPORT_AG_FILE", config);
    registerCommonEndpoints(app, config, addUpdateListner, onStartLists, onResultsLists, onActiveGroups);
};