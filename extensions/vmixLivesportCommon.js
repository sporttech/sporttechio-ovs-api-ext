import buffer from "circular-buffer";
import { readFile } from 'fs/promises';
import { listTeams } from "../model/query.js";

function transformIds(s_ids, chunkSize, M, chunkFunction, mapFunction) {
    let max = Number(chunkSize);
    if (isNaN(max)) {
        max = -1;
    }
    const sids = s_ids.split("-").filter(s => !Number.isNaN(Number(s)));
    const chunks = sids.map(sid => chunkFunction(M, max, Number(sid))).flat();
    return chunks.map(mapFunction);
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

function splitStartListChunks(data, max, sid, getRepr = getPerformanceRepresentation, extendPerformance = ()=>{}) {
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
            const out = {
				athlete: getRepr(performance, data),
				order: pidx + 1
			}
            extendPerformance(out, performance, data);
			chunk.performances.push(out);
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

export function getPerformanceRank(p) {
    return p.Rank_G;
}
export function getPerformanceScore(p) {
    return p.MarkTTT_G;
}
function getPerformanceRepresentation(p, M) {
    return M.Athletes[p.Athletes[0]];
}

function setResultsOptionsDefault(options) {
    if (!options.getRepr) {
        options.getRepr = getPerformanceRepresentation;
    }
    if (!options.getRank) {
        options.getRank = getPerformanceRank;
    }
    if (!options.getScore) {
        options.getScore = getPerformanceScore;
    }
    if (!options.extendPerformance) {
        options.extendPerformance = () => {};
    }
    if (!options.extendChunk) {
        options.extendChunk = () => {};
    }
    if (!options.groupPerformances) {
        options.groupPerformances = (pfs) => {return pfs}
    }
}
function splitResultsChunks(data, max, sid, options = {}) {
    setResultsOptionsDefault(options);
	let performances = [];
	const event = data.Event;
	const stage = data.Stages[sid];
	const competition = data.Competitions[stage.CompetitionID];

    for (const gid of stage.Groups) {
        const group = data.Groups[gid];
		for (const pid of group.Performances) {
			const performance = data.Performances[pid];
            const out = {
				athlete: options.getRepr(performance, data), 
				rank: options.getRank(performance),
				score: options.getScore(performance),
			}
            options.extendPerformance(out, performance, data);
			performances.push(out);
		}
    }
    performances = options.groupPerformances(performances);
	performances.sort((p1, p2) => {
		return p1.rank - p2.rank;
	});
	const chunks = [];
	const chunkSize = max;
	for (let i = 0; i < performances.length; i += chunkSize) {
	    const chunk = newResultsChunk(event, competition, stage);
		chunk.performances = performances.slice(i, i + chunkSize);
        options.extendChunk(chunk)
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
export const F_STARTED = 1;
export const F_PUBLISHED = 3;
export const F_STATES = {};

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
        if (!("Panels" in updateM)) {
            return
        }
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

async function loadCommonConfig(configVar, configDefault) {
    const OVS = process.env.OVS_URL;
    let config = configDefault;
    if (!OVS) {
        throw new Error('OVS_URL environment variable is not set.');
    }
    const cfg = process.env[configVar];
    if (!cfg) {
        console.warn(`${configVar} environment variable is not set, will use default (empty) config`);
    } else {
        console.log(`Loading config from ${cfg}`);
        config = JSON.parse(await readFile(new URL(cfg, import.meta.url)));
    }
    return [OVS, config]
}

function checkTeams(config, teams) {
    let res = [];
    for (const t of teams) {
        const team = {
            team: t,
            data: "not found"
        }
        if (t in config.teams) {
            team.data = config.teams[t];
        } 
        res.push(team);
    }
    return res;
}

function registerCommonEndpoints(app, config, model, addUpdateListner, onStartLists, onResultsLists, onActiveGroups) {
    addUpdateListner(updateFramesInFocus);
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
    app.get(config.root + '/active-groups', (req, res) => {
        const data = onActiveGroups();
        res.json(data);
    });
    app.get(config.root + '/config', (req, res) => {
        res.json(config);
    });
    app.get(config.root + '/config/checkTeams', (req, res) => {
        res.json(checkTeams(config, listTeams(model)));
    });
}


export {
    transformIds,
    splitStartListChunks,
    splitResultsChunks,
    updateFrameData,
    bindTeam,
    bindTeamFlag,
    updateFramesInFocus,
    recentFrames,
    recentGroups,
    loadCommonConfig,
    registerCommonEndpoints,
    getPerformanceRepresentation
};