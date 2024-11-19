import { transformStageList, splitStartListChunks, splitResultsChunks, 
        updateFrameData, bindTeam, bindTeamFlag,
        recentGroups, loadCommonConfig, registerCommonEndpoints,
        recentFrames, F_STATES, F_PUBLISHED} from './vmixLivesportCommon.js';

let M = {};

let OVS = "";
let config = {
    teams: {},
    root: "/vmid/bra/tra",
    frameState: {},
    apparatus: {}
};

function performancePresent(p, M) {
    const gid = p?.GroupID;
    const sid = M?.Groups[gid]?.StageID;
    const cid = M?.Stages[sid]?.CompetitionID;
    const c = M?.Competitions[cid];
    const a = M?.Athletes[p.Athletes[0]];

    // SYN
    if (c.Discipline === 1) {
        const a2 = M?.Athletes[p.Athletes[1]];
        return {a: a, view: a.Surname + "\\" + a2.Surname}
    }
    return {a: a, view: a.Surname + " " + a.GivenName};
}

function proccessStartListChunk(chunk) {
	const frameData = {
		competition: chunk.competition.Title,
		group: chunk.groupIdx + 1,
		chunk: chunk.chunk
	};
	updateFrameData(frameData, "order", chunk.performances, ( p ) => { return String(p.order).padStart(2, "0")});
	updateFrameData(frameData, "name", chunk.performances, ( p ) => { return p.athlete.view });
	updateFrameData(frameData, "repr", chunk.performances, ( p ) => { return bindTeam(p.athlete.a, config); });
	updateFrameData(frameData, "logo", chunk.performances, ( p ) => { return bindTeamFlag(p.athlete.a, config, OVS); } );
	frameData.event = chunk.event.Title;
	frameData.eventSubtitle = chunk.event.Subtitle;

	return frameData;
}
function proccessResultsChunk(chunk) {
	const frameData = {
		competition: chunk.competition.Title,
	};
	updateFrameData(frameData, "rank", chunk.performances, ( p ) => { return String(p.rank).padStart(2, "0")});
	updateFrameData(frameData, "name", chunk.performances, ( p ) => { return p.athlete.view });
	updateFrameData(frameData, "repr", chunk.performances, ( p ) => { return bindTeam(p.athlete.a, config); });
	updateFrameData(frameData, "logo", chunk.performances, ( p ) => { return bindTeamFlag(p.athlete.a, config, OVS); } );
	updateFrameData(frameData, "score", chunk.performances, ( p ) => { return (p.score / 1000).toFixed(3) });
	frameData.event = chunk.event.Title;
	frameData.eventSubtitle = chunk.event.Subtitle;

	return frameData;
}



function onStartLists(s_sids, chunkSize) {
    const splitChunks = (data, max, sid) => {
        return splitStartListChunks(data, max, sid, performancePresent);
    }
    return transformStageList(s_sids, chunkSize, M, splitChunks, proccessStartListChunk);
}
function onResultsLists(s_sids, chunkSize) {
    const splitChunks = (data, max, sid) => {
        return splitResultsChunks(data, max, sid, {
            getRepr: performancePresent
        });
    }
    return transformStageList(s_sids, chunkSize, M, splitChunks, proccessResultsChunk);
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

function describeFrame(fid, M) {
        const f = M.Frames[fid];
        const p = M.Performances[f.PerformanceID];
        const fidx = p.Frames.indexOf(f.ID);
        const aid = p.Athletes[0];
        const a = M.Athletes[aid];
        const g = M.Groups[p.GroupID];
        const s = M.Stages[g.StageID];
        const c = M.Competitions[s.CompetitionID];
        const prevStage = getPrevStage(s,c,M);
        const aptID = c.Discipline;
        const e = M.Event;

        const description = {
            stageID: s.ID,
            app: config.apparatus[aptID].name,
            group: s.Groups.indexOf(g.ID) + 1,
            routine: "R" + (fidx + 1),
            state: config.frameState[f.State],
            name: performancePresent(p, M).view,
            repr: bindTeam(a, config),
            scoreTotal: (p.MarkTTT_G / 1000).toFixed(3),
            scoreRoutine: (f.MarkTTT_G / 1000).toFixed(3),
            scoreDifficulty: (f.DifficultyT_G / 10).toFixed(1),
            scoreExecution: (f.ETotalT_G / 10).toFixed(1),
            scorePenalties: (f.PenaltyT / 10).toFixed(1),
            rank: p.Rank_G,
            eventTitle: e.Title,
            competitionTitle: c.Title,
            logo: bindTeamFlag(a, config, OVS),
            appIcon: config.apparatus[aptID].icon,
            scorePrevRoutine: undefined
        }
        // Hack for second routine
        if (fidx > 0) {
            const prevFrameID = p.Frames[fidx-1];
            const prevFrame = M.Frames[prevFrameID];
            description.scorePrevRoutine = (prevFrame.MarkTTT_G / 1000).toFixed(3);
        }
        // Get qualification results when possible
        const pp = getSameAthletePerformance(p, prevStage, M);
        if (pp !== null) {
            description.scoreQ = (pp.MarkTTT_G / 1000).toFixed(3);
            description.rankQ = pp.Rank_G;
        }
        return description
}

function onActiveGroups() {
    const groups = recentGroups(M);
    const rows = [];
    for (const gid of groups) {
        const g = M.Groups[gid];
        const s = M.Stages[g.StageID];
        for (const pid of g.Performances) {
            const p = M.Performances[pid];
            for (const [fidx, fid] of p.Frames.entries()) {
                if (fidx >= s.PerfomanceFramesLimit) {
                    break;
                }
                rows.push(describeFrame(fid, M));
            }
        }

    }   
    return rows;
}

function onLastResult() {
    const recent = recentFrames();
    if (recent.length === 0) {
        return [];
    }
    for (const event of recent) {
        if (event.state == F_STATES[F_PUBLISHED]) {
           return [describeFrame(event.ID, M)]; 
        }
    }
    return [];
}


export async function register(app, model, addUpdateListner) {
    M = model;
    [OVS, config] = await loadCommonConfig("CONFIG_VMIX_LIVESPORT_TRA_FILE", config);
    registerCommonEndpoints(app, config, M, addUpdateListner, onStartLists, onResultsLists, onActiveGroups);
    app.get(config.root + '/last-result', (req, res) => {
        const data = onLastResult();
        res.json(data);
    });
};