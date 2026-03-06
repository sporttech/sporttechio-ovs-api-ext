import { transformIds, splitStartListChunks, splitResultsChunks, 
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
    if (config?.options?.AthletesUseNameSurnameFormat) {
        return {a: a, view: a.GivenName + " " + a.Surname};
    }
    return {a: a, view: a.Surname + " " + a.GivenName};
}

/**
 * Returns routine details (r1, r2, scoreTotal) from performance for use in results/startlists.
 * Uses same field sources as describeFrame(); formatting with SYN rules is done at output.
 */
function getRoutineDetails(p, data) {
    const gid = p?.GroupID;
    const group = data.Groups?.[gid];
    if (!group) return { r1: undefined, r2: undefined, scoreTotal: undefined };
    const stage = data.Stages?.[group.StageID];
    if (!stage) return { r1: undefined, r2: undefined, scoreTotal: undefined };
    const limit = stage.PerfomanceFramesLimit ?? 0;

    const buildRoutine = (f) => {
        if (!f) return undefined;
        return {
            score: f.MarkTTT_G,
            scoreDifficulty: f.DifficultyT_G,
            scoreExecution: f.ETotalT_G,
            scorePenalties: f.PenaltyT,
            scoreTime: f.TimeTMS_G,
            scoreH: f.Displacement_G
        };
    };

    const r1 = (limit > 0 && p.Frames?.[0] != null)
        ? buildRoutine(data.Frames?.[p.Frames[0]])
        : undefined;
    const r2 = (limit > 1 && p.Frames?.[1] != null)
        ? buildRoutine(data.Frames?.[p.Frames[1]])
        : undefined;
    const scoreTotal = limit >= 2 && p.MarkTTT_G != null ? p.MarkTTT_G : undefined;

    return { r1, r2, scoreTotal };
}

/** Format a routine field for output; isSYN = (competition.Discipline === 1). */
function formatRoutineField(routine, field, isSYN) {
    if (!routine) return "";
    const v = routine[field];
    if (v === undefined || v === null) return "";
    switch (field) {
        case "score":
            return (v / 1000).toFixed(3);
        case "scoreDifficulty":
            return (v / 10).toFixed(1);
        case "scoreExecution":
            return isSYN ? (v / 1000).toFixed(2) : (v / 10).toFixed(1);
        case "scorePenalties":
            return (v / 10).toFixed(1);
        case "scoreTime":
            return isSYN ? (2 * v / 100).toFixed(2) : (v / 1000).toFixed(2);
        case "scoreH":
            return (v / 100).toFixed(2);
        default:
            return String(v);
    }
}

/** Routine detail field keys (camelCase); frameData key = prefix + capitalized key, e.g. R1 + score -> R1Score */
const ROUTINE_FIELD_KEYS = ["score", "scoreDifficulty", "scoreExecution", "scorePenalties", "scoreTime", "scoreH"];

function addRoutineFieldsToFrameData(frameData, prefix, performances, getRoutine, isSYN, blankWhen = false) {
    for (const key of ROUTINE_FIELD_KEYS) {
        const frameKey = prefix + key.charAt(0).toUpperCase() + key.slice(1);
        updateFrameData(frameData, frameKey, performances, (p) =>
            blankWhen ? "" : formatRoutineField(getRoutine(p), key, isSYN));
    }
}

function proccessStartListChunk(chunk) {
	const frameData = {
		competition: chunk.competition.Title,
		group: chunk.groupIdx + 1,
		chunk: chunk.chunk
	};
    const aptID = chunk.competition.Discipline === 4 ? chunk.performances[0].Discipline : chunk.competition.Discipline;
    frameData.appIcon = config.apparatus[aptID].icon;
	updateFrameData(frameData, "order", chunk.performances, ( p ) => { return String(p.order).padStart(2, "0")});
	updateFrameData(frameData, "name", chunk.performances, ( p ) => { return p.athlete.view });
	updateFrameData(frameData, "repr", chunk.performances, ( p ) => { return bindTeam(p.athlete.a, config, chunk.event); });
	updateFrameData(frameData, "logo", chunk.performances, ( p ) => { return bindTeamFlag(p.athlete.a, config, OVS, chunk.event); } );
	frameData.event = chunk.event.Title;
	frameData.eventSubtitle = chunk.event.Subtitle;

	if (config?.options?.ExtendStartListsWithRoutineDetails === true) {
		const isSYN = chunk.competition?.Discipline === 1;
		if (chunk.routine != null) {
			// splitroutines: single set Score, ScoreDifficulty, ... for the current routine only
			const getRoutine = chunk.routine === 1 ? (p) => p.r1 : (p) => p.r2;
			updateFrameData(frameData, "scoreTotal", chunk.performances, (p) => {
				const r = getRoutine(p);
				return r?.score != null ? (r.score / 1000).toFixed(3) : "";
			});
			addRoutineFieldsToFrameData(frameData, "", chunk.performances, getRoutine, isSYN);
		} else {
			updateFrameData(frameData, "scoreTotal", chunk.performances, ( p ) =>
				p.scoreTotal != null ? (p.scoreTotal / 1000).toFixed(3) : "" );
			addRoutineFieldsToFrameData(frameData, "R1", chunk.performances, (p) => p.r1, isSYN);
			addRoutineFieldsToFrameData(frameData, "R2", chunk.performances, (p) => p.r2, isSYN);
		}
	}
	if (chunk.routine != null) {
		frameData.routine = chunk.routine;
		frameData.routineLabel = chunk.routineLabel;
	}

	return frameData;
}
function proccessResultsChunk(chunk) {
	const frameData = {
		competition: chunk.competition.Title,
	};
    const aptID = chunk.competition.Discipline === 4 ? chunk.performances[0].Discipline : chunk.competition.Discipline;
    frameData.appIcon = config.apparatus[aptID].icon;
	updateFrameData(frameData, "rank", chunk.performances, ( p ) => { return String(p.rank).padStart(2, "0")});
	updateFrameData(frameData, "name", chunk.performances, ( p ) => { return p.athlete.view });
	updateFrameData(frameData, "repr", chunk.performances, ( p ) => { return bindTeam(p.athlete.a, config, chunk.event); });
	updateFrameData(frameData, "logo", chunk.performances, ( p ) => { return bindTeamFlag(p.athlete.a, config, OVS, chunk.event); } );
	updateFrameData(frameData, "score", chunk.performances, ( p ) => { return (p.score / 1000).toFixed(3) });
	frameData.event = chunk.event.Title;
	frameData.eventSubtitle = chunk.event.Subtitle;

	if (config?.options?.ExtendResultsWithRoutineDetails === true) {
		const isSYN = chunk.competition?.Discipline === 1;
		updateFrameData(frameData, "scoreTotal", chunk.performances, ( p ) =>
			p.scoreTotal != null ? (p.scoreTotal / 1000).toFixed(3) : "" );
		addRoutineFieldsToFrameData(frameData, "R1", chunk.performances, (p) => p.r1, isSYN);
		addRoutineFieldsToFrameData(frameData, "R2", chunk.performances, (p) => p.r2, isSYN);
	}

	return frameData;
}



function onStartLists(s_sids, chunkSize) {
    const splitChunks = (data, max, sid) => {
        const extendPerformance = (config?.options?.ExtendStartListsWithRoutineDetails === true)
            ? (pout, p, dataCtx) => {
                const d = getRoutineDetails(p, dataCtx);
                pout.r1 = d.r1;
                pout.r2 = d.r2;
                pout.scoreTotal = d.scoreTotal;
            }
            : () => {};
        return splitStartListChunks(data, max, sid, performancePresent, extendPerformance);
    };
    return transformIds(s_sids, chunkSize, M, splitChunks, proccessStartListChunk);
}

/**
 * Startlist chunks ordered by group then routine: G1-R1, G1-R2, G2-R1, G2-R2, ...
 * Each chunk has routine (1|2), routineLabel ("R1"|"R2"); when ExtendStartListsWithRoutineDetails
 * only the current routine block is filled in frameData.
 */
function splitStartListChunksSplitRoutines(data, max, sid) {
    const event = data.Event;
    const stage = data?.Stages?.[sid];
    if (!stage) return [];
    const competition = data.Competitions[stage.CompetitionID];
    const limit = stage.PerfomanceFramesLimit ?? 2;
    const routineIndices = limit >= 2 ? [0, 1] : [0];
    const chunks = [];
    const extendPerf = (config?.options?.ExtendStartListsWithRoutineDetails === true)
        ? (pout, p) => {
            const d = getRoutineDetails(p, data);
            pout.r1 = d.r1;
            pout.r2 = d.r2;
            pout.scoreTotal = d.scoreTotal;
        }
        : () => {};

    for (const [idx, gid] of stage.Groups.entries()) {
        const group = data.Groups[gid];
        for (const routineIdx of routineIndices) {
            let chunkCount = 1;
            let chunk = {
                event,
                competition,
                stage,
                group,
                chunk: chunkCount,
                groupIdx: idx,
                performances: [],
                routine: routineIdx + 1,
                routineLabel: "R" + (routineIdx + 1)
            };
            for (const [pidx, pid] of group.Performances.entries()) {
                const performance = data.Performances[pid];
                const out = { athlete: performancePresent(performance, data), order: pidx + 1 };
                extendPerf(out, performance);
                chunk.performances.push(out);
                if (chunk.performances.length >= max && max > 0) {
                    chunks.push(chunk);
                    chunkCount++;
                    chunk = {
                        event,
                        competition,
                        stage,
                        group,
                        chunk: chunkCount,
                        groupIdx: idx,
                        performances: [],
                        routine: routineIdx + 1,
                        routineLabel: "R" + (routineIdx + 1)
                    };
                }
            }
            chunks.push(chunk);
        }
    }
    return chunks;
}

function onStartListsSplitRoutines(s_sids, chunkSize) {
    const splitChunks = (data, max, sid) => splitStartListChunksSplitRoutines(data, max, sid);
    return transformIds(s_sids, chunkSize, M, splitChunks, proccessStartListChunk);
}

function onResultsLists(s_sids, chunkSize) {
    const splitChunks = (data, max, sid) => {
        const options = { getRepr: performancePresent };
        if (config?.options?.ExtendResultsWithRoutineDetails === true) {
            options.extendPerformance = (pout, p, dataCtx) => {
                const d = getRoutineDetails(p, dataCtx);
                pout.r1 = d.r1;
                pout.r2 = d.r2;
                pout.scoreTotal = d.scoreTotal;
            };
        }
        return splitResultsChunks(data, max, sid, options);
    };
    return transformIds(s_sids, chunkSize, M, splitChunks, proccessResultsChunk);
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
        // Team All-Around has a different discipline ID
        const aptID = c.Discipline === 4 ? p.Discipline : c.Discipline;
        const e = M.Event;

        const description = {
            stageID: s.ID,
            app: config.apparatus[aptID].name,
            group: s.Groups.indexOf(g.ID) + 1,
            routine: "R" + (fidx + 1),
            state: config.frameState[f.State],
            name: performancePresent(p, M).view,
            repr: bindTeam(a, config, e),
            scoreTotal: (p.MarkTTT_G / 1000).toFixed(2),
            scoreRoutine: (f.MarkTTT_G / 1000).toFixed(2),
            scoreDifficulty: (f.DifficultyT_G / 10).toFixed(1),
            scoreExecution: (f.ETotalT_G / 10).toFixed(1),
            scorePenalties: (f.PenaltyT / 10).toFixed(1),
            scoreTime: (f.TimeTMS_G / 1000).toFixed(2),
            scoreH: (f.Displacement_G / 100).toFixed(2),
            rank: p.Rank_G,
            eventTitle: e.Title,
            competitionTitle: c.Title,
            logo: bindTeamFlag(a, config, OVS, e),
            appIcon: config.apparatus[aptID].icon,
            scorePrevRoutine: undefined
        }
        if (c.Discipline === 1) {
             description.scoreTime = (2 * f.TimeTMS_G / 100).toFixed(2)
             description.scoreExecution = (f.ETotalT_G / 1000).toFixed(2)
             description.scoreH = (f.Displacement_G / 100).toFixed(2)
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
    app.get(config.root + '/startlists/:sids/splitroutines/chunk/:size', (req, res) => {
        const data = onStartListsSplitRoutines(req.params.sids, req.params.size);
        res.json(data);
    });
    app.get(config.root + '/last-result', (req, res) => {
        const data = onLastResult();
        res.json(data);
    });
};