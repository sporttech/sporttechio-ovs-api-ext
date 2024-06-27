const buffer = require("circular-buffer");

function transformStageList(s_sids, chunkSize, M, stageChunkFunction, tranformFunction) {
    const chunks = [];
    let max = Number(chunkSize);
    if (isNaN(max)) {
        max = -1;
    }
    const sids = s_sids.split("-");

    for (const s_sid of sids) {
        const sid = Number(s_sid);
        if (isNaN(sid)) {
            continue;
        }
        chunks.push(...stageChunkFunction(M, max, sid))
    }


    return chunks.map(tranformFunction);
}

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

function newResultsChunk(event, competition, stage) {
    return {
		event: event,
		competition: competition,
        stage: stage,
        performances: []
    };
}


function splitResultsChunks(data, max, sid) {
	const performances = [];
	const event = data.Event;
	const stage = data.Stages[sid];
	const competition = data.Competitions[stage.CompetitionID];

    for (const gid of stage.Groups) {
        const group = data.Groups[gid];
		for (const pid of group.Performances) {
			const performance = data.Performances[pid];
			performances.push({
				athlete: data.Athletes[performance.Athletes[0]],
				rank: performance.Rank_G,
				score: performance.MarkTTT_G,
			});
		}
    }
	performances.sort((p1, p2) => {
		return p1.rank - p2.rank;
	});
	const chunks = [];
	const chunkSize = max;
	for (let i = 0; i < performances.length; i += chunkSize) {
	    const chunk = newResultsChunk(event, competition, stage);
		chunk.performances = performances.slice(i, i + chunkSize);
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

function bindTeam(a, config) {
    if (a.Representing in config.teams) {
        return config.teams[a.Representing].name;
    }
    return a.Representing;
}
function bindTeamFlag(a, config, OVS) {
    if (a.Representing in config.teams && config.teams[a.Representing].flag !== "") {
        return config.teams[a.Representing].flag;
    }
    return `${ OVS }/static/img/assets/named/${ a.Representing }`;
}

const recentFramesInFoucs = new buffer(10);
const F_STARTED = 1;
const F_PUBLISHED = 3;
const F_STATES = {};
F_STATES[F_STARTED] = "started";
F_STATES[F_PUBLISHED] = "published";
function processFrameUodate(frame) {
        if (!("State" in frame)) {
            return
        }
        const state = frame.State;
        if (state in F_STATES) {
            recentFramesInFoucs.enq({
                ID: frame.ID, 
                state: F_STATES[state]
            });
        }
}

function updateFramesInFocus(updateM) {
    if (!("Frames" in updateM)) {
        return;
    }
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

function recentFrames() {
    return recentFramesInFoucs.toarray();
}

function recentGroups(M) {
    const frames = recentFrames();
    const gids = [];
    for (const fdata of frames) {
        const fid = fdata.ID;
        const pid = M?.Frames[fid]?.PerformanceID;
        if (pid === undefined) {
            continue;
        }
        const gid = M?.Performances[pid]?.GroupID;
        if (gid === undefined) {
            continue;
        }
        gids.push(gid);
    }
    const groups = Array.from(new Set(gids));
    groups.sort();
    return groups;
}


module.exports = {
    transformStageList,
    splitStartListChunks,
    splitResultsChunks,
    updateFrameData,
    bindTeam,
    bindTeamFlag,
    updateFramesInFocus,
    recentFrames,
    recentGroups
};