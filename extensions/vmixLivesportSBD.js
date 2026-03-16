import {
    getName,
    transformIds,
    splitStartListChunks,
    splitResultsChunks,
    updateFrameData,
    bindTeam,
    bindTeamFlag,
    recentGroups,
    loadCommonConfig,
    registerCommonEndpoints
} from './vmixLivesportCommon.js';

let M = {};
let OVS = "";

let config = {
    teams: {},
    root: "/vmix/sbd",
    frameState: {},
    apparatus: {}
};

function proccessStartListChunkSBD(chunk) {
    const frameData = {
        competition: chunk.competition.Title,
        group: chunk.groupIdx + 1,
        chunk: chunk.chunk
    };

    updateFrameData(frameData, "order", chunk.performances, (p) => {
        return String(p.order).padStart(2, "0");
    });
    updateFrameData(frameData, "name", chunk.performances, (p) => {
        return getName(p.athlete, config);
    });
    updateFrameData(frameData, "repr", chunk.performances, (p) => {
        return bindTeam(p.athlete, config, chunk.event);
    });
    updateFrameData(frameData, "logo", chunk.performances, (p) => {
        return bindTeamFlag(p.athlete, config, OVS, chunk.event);
    });

    frameData.event = chunk.event.Title;
    frameData.eventSubtitle = chunk.event.Subtitle;

    return frameData;
}

function onStartLists(s_sids, chunkSize) {
    const splitChunks = (data, max, sid) => {
        return splitStartListChunks(data, max, sid);
    };
    return transformIds(s_sids, chunkSize, M, splitChunks, proccessStartListChunkSBD);
}

function proccessResultsChunkSBD(chunk) {
    const frameData = {
        competition: chunk.competition.Title
    };

    updateFrameData(frameData, "rank", chunk.performances, (p) => {
        return String(p.rank).padStart(2, "0");
    });
    updateFrameData(frameData, "name", chunk.performances, (p) => {
        return getName(p.athlete, config);
    });
    updateFrameData(frameData, "repr", chunk.performances, (p) => {
        return bindTeam(p.athlete, config, chunk.event);
    });
    updateFrameData(frameData, "logo", chunk.performances, (p) => {
        return bindTeamFlag(p.athlete, config, OVS, chunk.event);
    });
    updateFrameData(frameData, "score", chunk.performances, (p) => {
        if (p.score === undefined || p.score === null) {
            return "";
        }
        return (p.score / 1000).toFixed(3);
    });
    updateFrameData(frameData, "scoreR1", chunk.performances, (p) => p.scoreR1 ?? "");
    updateFrameData(frameData, "scoreR2", chunk.performances, (p) => p.scoreR2 ?? "");
    updateFrameData(frameData, "scoreR3", chunk.performances, (p) => p.scoreR3 ?? "");
    updateFrameData(frameData, "hlR1", chunk.performances, (p) => p.hlR1 ?? "");
    updateFrameData(frameData, "hlR2", chunk.performances, (p) => p.hlR2 ?? "");
    updateFrameData(frameData, "hlR3", chunk.performances, (p) => p.hlR3 ?? "");
    updateFrameData(frameData, "runTypeR1", chunk.performances, (p) => p.runTypeR1 ?? "");
    updateFrameData(frameData, "runTypeR2", chunk.performances, (p) => p.runTypeR2 ?? "");
    updateFrameData(frameData, "runTypeR3", chunk.performances, (p) => p.runTypeR3 ?? "");

    frameData.event = chunk.event.Title;
    frameData.eventSubtitle = chunk.event.Subtitle;

    return frameData;
}

function extendResultsPerformance(pout, performance, data) {
    const g = data?.Groups?.[performance.GroupID];
    const stage = g ? data?.Stages?.[g.StageID] : null;
    const limit = stage?.PerfomanceFramesLimit ?? 3;
    const frames = performance.Frames ?? [];
    for (let i = 0; i < limit; i++) {
        const fid = frames[i];
        const frame = fid != null ? data.Frames?.[fid] : null;
        const scoreVal = frame?.TMarkTTT_G;
        pout["scoreR" + (i + 1)] = (scoreVal !== undefined && scoreVal !== null) ? (scoreVal / 1000).toFixed(3) : "";
        pout["hlR" + (i + 1)] = frame?.HL_G ?? "";
        pout["runTypeR" + (i + 1)] = frame?.RunType_G ?? frame?.RunType ?? "";
    }
}

function onResultsLists(s_sids, chunkSize) {
    const splitChunks = (data, max, sid) => {
        return splitResultsChunks(data, max, sid, {
            extendPerformance: (pout, performance, dataCtx) => extendResultsPerformance(pout, performance, dataCtx)
        });
    };
    return transformIds(s_sids, chunkSize, M, splitChunks, proccessResultsChunkSBD);
}

function describeFrameSBD(fid, M) {
    const f = M.Frames[fid];
    const p = M.Performances[f.PerformanceID];
    const fidx = p.Frames.indexOf(f.ID);
    const aid = p.Athletes[0];
    const a = M.Athletes[aid];
    const g = M.Groups[p.GroupID];
    const s = M.Stages[g.StageID];
    const c = M.Competitions[s.CompetitionID];
    const e = M.Event;

    const scoreVal = f.TMarkTTT_G;
    const scoreFormatted = (scoreVal !== undefined && scoreVal !== null) ? (scoreVal / 1000).toFixed(3) : "";

    const description = {
        stageID: s.ID,
        group: s.Groups.indexOf(g.ID) + 1,
        routine: "R" + (fidx + 1),
        state: config.frameState[f.State],
        name: getName(a, config),
        repr: bindTeam(a, config, e),
        eventTitle: e.Title,
        competitionTitle: c.Title,
        logo: bindTeamFlag(a, config, OVS, e),
        score: scoreFormatted,
        HL_G: f.HL_G ?? "",
        RunType: f.RunType_G ?? f.RunType ?? ""
    };

    return description;
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
                rows.push(describeFrameSBD(fid, M));
            }
        }
    }
    return rows;
}

export async function register(app, model, addUpdateListner) {
    M = model;
    [OVS, config] = await loadCommonConfig("CONFIG_VMIX_LIVESPORT_SBD_FILE", config);
    registerCommonEndpoints(app, config, M, addUpdateListner, onStartLists, onResultsLists, onActiveGroups);
}

