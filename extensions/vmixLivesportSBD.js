import {
    getName,
    fullYearsFromDob,
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
    athletes: {},
    root: "/vmix/sbd",
    frameState: {},
    apparatus: {},
    includeAthleteAge: false,
    displayShortInfo: false,
    locale: "en"
};

function getBibValue(athlete) {
    return athlete?.Bib != null ? String(athlete.Bib) : "";
}

function getShortInfo(athlete) {
    const bib = getBibValue(athlete);
    if (bib === "") {
        return "";
    }
    return config?.athletes?.[bib]?.shortInfo ?? "";
}

function formatScoreValue(scoreVal) {
    return (scoreVal !== undefined && scoreVal !== null) ? (scoreVal / 1000).toFixed(3) : "";
}

function formatYearsAgeText(yearsStr, locale = "en") {
    if (yearsStr === undefined || yearsStr === null || yearsStr === "") {
        return "";
    }
    const yearsNum = Number(yearsStr);
    if (Number.isNaN(yearsNum)) {
        return "";
    }

    const lang = String(locale ?? "en").toLowerCase();
    const isRu = lang.startsWith("ru");

    if (isRu) {
        // Russian pluralization rules for years:
        // 1 год, 2-4 года, 5-20 лет, 21 год, 22-24 года, 25-... лет
        const mod100 = yearsNum % 100;
        const mod10 = yearsNum % 10;

        let noun = "лет";
        if (mod10 === 1 && mod100 !== 11) {
            noun = "год";
        } else if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
            noun = "года";
        }

        return `${yearsStr} ${noun}`;
    }

    // Default: English
    return `${yearsStr} ${yearsNum === 1 ? "year" : "years"}`;
}

function formatAthleteAgeText(athlete, locale) {
    return formatYearsAgeText(fullYearsFromDob(athlete), locale);
}

function proccessStartListChunkSBD(chunk) {
    const frameData = {
        competition: chunk.competition.Title,
        group: chunk.groupIdx + 1,
        chunk: chunk.chunk
    };

    updateFrameData(frameData, "order", chunk.performances, (p) => {
        return String(p.order).padStart(2, "0");
    });
    updateFrameData(frameData, "bib", chunk.performances, (p) => {
        return getBibValue(p.athlete);
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
    if (config.includeAthleteAge === true) {
        updateFrameData(frameData, "age", chunk.performances, (p) => fullYearsFromDob(p.athlete));
        updateFrameData(frameData, "ageText", chunk.performances, (p) => formatAthleteAgeText(p.athlete, config.locale));
    }
    if (config.displayShortInfo === true) {
        updateFrameData(frameData, "shortInfo", chunk.performances, (p) => getShortInfo(p.athlete));
    }

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
    updateFrameData(frameData, "bib", chunk.performances, (p) => {
        return getBibValue(p.athlete);
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
    if (config.includeAthleteAge === true) {
        updateFrameData(frameData, "age", chunk.performances, (p) => fullYearsFromDob(p.athlete));
        updateFrameData(frameData, "ageText", chunk.performances, (p) => formatAthleteAgeText(p.athlete, config.locale));
    }
    if (config.displayShortInfo === true) {
        updateFrameData(frameData, "shortInfo", chunk.performances, (p) => getShortInfo(p.athlete));
    }

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

    const getRoutineScore = (routineIdx) => {
        const routineFrameId = p.Frames?.[routineIdx];
        const routineFrame = routineFrameId != null ? M.Frames?.[routineFrameId] : null;
        return formatScoreValue(routineFrame?.TMarkTTT_G);
    };

    const scoreFormatted = formatScoreValue(f.TMarkTTT_G);

    const description = {
        stageID: s.ID,
        group: s.Groups.indexOf(g.ID) + 1,
        routine: "R" + (fidx + 1),
        state: config.frameState[f.State],
        bib: getBibValue(a),
        name: getName(a, config),
        repr: bindTeam(a, config, e),
        eventTitle: e.Title,
        competitionTitle: c.Title,
        logo: bindTeamFlag(a, config, OVS, e),
        score: scoreFormatted,
        scoreTotal: formatScoreValue(p.MarkTTT_G),
        scoreR1: getRoutineScore(0),
        scoreR2: getRoutineScore(1),
        scoreR3: getRoutineScore(2),
        HL_G: f.HL_G ?? "",
        RunType: f.RunType_G ?? f.RunType ?? ""
    };
    if (config.includeAthleteAge === true) {
        const ageYears = fullYearsFromDob(a);
        description.age = ageYears;
        description.ageText = formatYearsAgeText(ageYears, config.locale);
    }
    if (config.displayShortInfo === true) {
        description.shortInfo = getShortInfo(a);
    }

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

function onStageRoutines(stageIds) {
    const stageIdList = String(stageIds ?? "")
        .split("-")
        .filter((sid) => !Number.isNaN(Number(sid)))
        .map((sid) => Number(sid));
    const rows = [];
    for (const sid of stageIdList) {
        const s = M?.Stages?.[sid];
        if (!s || !Array.isArray(s.Groups)) {
            continue;
        }
        for (const gid of s.Groups) {
            const g = M?.Groups?.[gid];
            if (!g || !Array.isArray(g.Performances)) {
                continue;
            }
            for (const pid of g.Performances) {
                const p = M?.Performances?.[pid];
                if (!p || !Array.isArray(p.Frames)) {
                    continue;
                }
                for (const [fidx, fid] of p.Frames.entries()) {
                    if (fidx >= s.PerfomanceFramesLimit) {
                        break;
                    }
                    if (M?.Frames?.[fid] === undefined) {
                        continue;
                    }
                    rows.push(describeFrameSBD(fid, M));
                }
            }
        }
    }
    return rows;
}

export async function register(app, model, addUpdateListner) {
    M = model;
    [OVS, config] = await loadCommonConfig("CONFIG_VMIX_LIVESPORT_SBD_FILE", config);
    registerCommonEndpoints(app, config, M, addUpdateListner, onStartLists, onResultsLists, onActiveGroups);
    app.get(config.root + '/stageroutines/:sids', (req, res) => {
        const data = onStageRoutines(req.params.sids);
        res.json(data);
    });
}

