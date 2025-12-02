import { getName, transformIds, splitStartListChunks, splitResultsChunks, 
        updateFrameData, bindTeam, bindTeamFlag, recentGroups, 
        loadCommonConfig, getPerformanceRepresentation,
        registerCommonEndpoints, F_PUBLISHED} from './vmixLivesportCommon.js';
import { splitSessionPerformancesByRotationAndAppt } from '../model/AG/session.transform.js';
import { getTeamRank, getTeamScore } from '../model/AG/performance.utils.js';
import { FrameSubState, getIRMCode } from '../model/constants/frameStates.js';
let M = {};

let OVS = "";
let config = {
    teams: {},
    root: "/vmix/ag",
    frameState: {},
    apparatus: {}
};
let appMap = {};

const APPARATUS_IRM_SUBSTATES = [
    FrameSubState.DNS,
    FrameSubState.DSQ,
    FrameSubState.DQB
];

const ALL_AROUND_IRM_SUBSTATES = [
    FrameSubState.DNF
];

const FRAME_STATE_KEYS = ["State"];
const FRAME_SUBSTATE_KEYS = ["SubState", "Substate", "SubState_G", "Substate_G", "Subsate"];
const PERFORMANCE_STATE_KEYS = ["State_G", "State"];
const PERFORMANCE_SUBSTATE_KEYS = ["SubState_G", "Substate_G", "SubState", "Substate", "Subsate"];

function pickNumeric(source, keys) {
    if (!source) {
        return undefined;
    }
    for (const key of keys) {
        if (source[key] === undefined || source[key] === null) {
            continue;
        }
        const num = Number(source[key]);
        if (!Number.isNaN(num)) {
            return num;
        }
    }
    return undefined;
}

function resolveFrameIRM(frame, allowedSubstates) {
    if (!frame) {
        return "";
    }
    const state = pickNumeric(frame, FRAME_STATE_KEYS);
    const subState = pickNumeric(frame, FRAME_SUBSTATE_KEYS);
    return getIRMCode(state, subState, allowedSubstates) || "";
}

function resolvePerformanceIRM(performance, allowedSubstates) {
    if (!performance) {
        return "";
    }
    const state = pickNumeric(performance, PERFORMANCE_STATE_KEYS);
    const subState = pickNumeric(performance, PERFORMANCE_SUBSTATE_KEYS);
    return getIRMCode(state, subState, allowedSubstates) || "";
}

function proccessStartListChunk(chunk) {
	const frameData = {
		competition: chunk.competition.Title,
		group: chunk.groupIdx + 1,
		chunk: chunk.chunk
	};
	updateFrameData(frameData, "order", chunk.performances, ( p ) => { return String(p.order).padStart(2, "0")});
	updateFrameData(frameData, "bib", chunk.performances, ( p ) => { return p.athlete?.ExternalID || ""; });
	updateFrameData(frameData, "name", chunk.performances, ( p ) => { return getName(p.athlete) });
	updateFrameData(frameData, "repr", chunk.performances, ( p ) => { return bindTeam(p.athlete, config, chunk.event); });
	updateFrameData(frameData, "logo", chunk.performances, ( p ) => { return bindTeamFlag(p.athlete, config, OVS, chunk.event); } );
	updateFrameData(frameData, "teamID", chunk.performances, ( p ) => { return p.teamID !== undefined ? String(p.teamID) : ""; });
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
	updateFrameData(frameData, "repr", chunk.performances, ( p ) => { return bindTeam(p.athlete, config, chunk.event); });
	updateFrameData(frameData, "logo", chunk.performances, ( p ) => { return bindTeamFlag(p.athlete, config, OVS, chunk.event); } );
	updateFrameData(frameData, "pack", chunk.performances, ( p ) => { return p.packNumber !== undefined ? String(p.packNumber) : ""; });
	updateFrameData(frameData, "teamID", chunk.performances, ( p ) => { return p.teamID !== undefined ? String(p.teamID) : ""; });
    if (config.ExtendSessionsWithResults === true) {
        updateFrameData(frameData, "scoreTotal", chunk.performances, ( p ) => { 
            return (p.MarkTTT_G !== undefined && p.MarkTTT_G !== null) ? (p.MarkTTT_G / 1000).toFixed(3) : "";
        });
        updateFrameData(frameData, "score", chunk.performances, ( p ) => { 
            return p.frame?.TMarkTTT_G !== undefined ? (p.frame.TMarkTTT_G / 1000).toFixed(3) : "";
        });
        updateFrameData(frameData, "state", chunk.performances, ( p ) => { 
            return p.frame?.State !== undefined ? (config.frameState?.[p.frame.State] || "") : "";
        });
        updateFrameData(frameData, "rankApparatus", chunk.performances, ( p ) => { 
            return (p.frameIdx !== undefined && p.FrameRanks_G?.[p.frameIdx] !== undefined) ? String(p.FrameRanks_G[p.frameIdx]) : "";
        });
    }
    updateFrameData(frameData, "frameTeamPoints", chunk.performances, ( p ) => { 
        return p.frame?.TeamPoints_G !== undefined && p.frame.TeamPoints_G !== null ? String(p.frame.TeamPoints_G) : "";
    });
    updateFrameData(frameData, "performanceTeamPoints", chunk.performances, ( p ) => { 
        return (p.performance?.TeamPoints_G !== undefined && p.performance.TeamPoints_G !== null) || (p.TeamPoints_G !== undefined && p.TeamPoints_G !== null) ? String(p.performance?.TeamPoints_G || p.TeamPoints_G) : "";
    });
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
	updateFrameData(frameData, "rank", chunk.performances, ( p ) => { 
		if (p._shouldClearScoreAndRank) {
			return "";
		}
		return String(p.rank).padStart(2, "0");
	});
	updateFrameData(frameData, "bib", chunk.performances, ( p ) => { return p.athlete?.ExternalID || ""; });
	updateFrameData(frameData, "name", chunk.performances, ( p ) => { return getName(p.athlete) });
	updateFrameData(frameData, "repr", chunk.performances, ( p ) => { return bindTeam(p.athlete, config, chunk.event); });
	updateFrameData(frameData, "logo", chunk.performances, ( p ) => { return bindTeamFlag(p.athlete, config, OVS, chunk.event); } );
	updateFrameData(frameData, "score", chunk.performances, ( p ) => { 
		if (p._shouldClearScoreAndRank) {
			return "";
		}
		return (p.score / 1000).toFixed(3);
	});
	updateFrameData(frameData, "allRoundScore", chunk.performances, ( p ) => { 
		if (p._shouldClearScoreAndRank) {
			return "";
		}
		return p.allRoundScore ? (p.allRoundScore / 1000).toFixed(3) : "";
	});
	updateFrameData(frameData, "VaultR1Score", chunk.performances, ( p ) => { return p.VaultR1Score !== undefined ? (p.VaultR1Score / 1000).toFixed(3) : ""; });
	updateFrameData(frameData, "VaultR2Score", chunk.performances, ( p ) => { return p.VaultR2Score !== undefined ? (p.VaultR2Score / 1000).toFixed(3) : ""; });
	updateFrameData(frameData, "VaultBonus", chunk.performances, ( p ) => { return p.BonusVaultTTT_G !== undefined && p.BonusVaultTTT_G !== null ? (p.BonusVaultTTT_G / 1000).toFixed(3) : ""; });
	updateFrameData(frameData, "completedApparatus", chunk.performances, ( p ) => { return p.completedApparatusCount !== undefined ? String(p.completedApparatusCount) : ""; });
	updateFrameData(frameData, "rotation", chunk.performances, ( p ) => { return p.rotationNumber !== undefined ? 'R' + String(p.rotationNumber) : ""; });
	updateFrameData(frameData, "scoreDifficulty", chunk.performances, ( p ) => { return p.difficultyScore !== undefined ? (p.difficultyScore / 10).toFixed(1) : ""; });
	updateFrameData(frameData, "scoreExecution", chunk.performances, ( p ) => { return p.executionScore !== undefined ? (p.executionScore / 1000).toFixed(3) : ""; });
	updateFrameData(frameData, "scorePenalties", chunk.performances, ( p ) => { return p.penaltyScore !== undefined ? (p.penaltyScore / 10).toFixed(1) : ""; });
	updateFrameData(frameData, "scoreBonus", chunk.performances, ( p ) => { return p.bonusScore !== undefined ? (p.bonusScore / 10).toFixed(1) : ""; });
	updateFrameData(frameData, "IRM", chunk.performances, ( p ) => { return p.IRM || ""; });
	updateFrameData(frameData, "PenaltyAllRoundInd", chunk.performances, ( p ) => { return p.PenaltyAllRoundIndTTT_G !== undefined && p.PenaltyAllRoundIndTTT_G !== null ? (p.PenaltyAllRoundIndTTT_G / 1000).toFixed(3) : ""; });
	updateFrameData(frameData, "PenaltyAllRoundTeam", chunk.performances, ( p ) => { return p.PenaltyAllRoundTeamTTT_G !== undefined && p.PenaltyAllRoundTeamTTT_G !== null ? (p.PenaltyAllRoundTeamTTT_G / 1000).toFixed(3) : ""; });
	updateFrameData(frameData, "teamID", chunk.performances, ( p ) => { return p.teamID !== undefined ? String(p.teamID) : ""; });
	updateFrameData(frameData, "performanceTeamPoints", chunk.performances, ( p ) => { 
		return p.performanceTeamPoints !== undefined ? String(p.performanceTeamPoints) : "";
	});
	updateFrameData(frameData, "frameTeamPoints", chunk.performances, ( p ) => { 
		return p.frameTeamPoints !== undefined ? String(p.frameTeamPoints) : "";
	});
	// Add vault2Details if present
	if (chunk.performances.some(p => p.vault2Details)) {
		updateFrameData(frameData, "vault2Details", chunk.performances, ( p ) => {
			if (p.vault2Details) {
				return {
					scoreDifficulty: p.vault2Details.scoreDifficulty !== undefined ? (p.vault2Details.scoreDifficulty / 10).toFixed(1) : "",
					scoreExecution: p.vault2Details.scoreExecution !== undefined ? (p.vault2Details.scoreExecution / 1000).toFixed(3) : "",
					scorePenalties: p.vault2Details.scorePenalties !== undefined ? (p.vault2Details.scorePenalties / 10).toFixed(1) : "",
					scoreBonus: p.vault2Details.scoreBonus !== undefined ? (p.vault2Details.scoreBonus / 10).toFixed(1) : "",
					score: p.vault2Details.score !== undefined ? (p.vault2Details.score / 1000).toFixed(3) : ""
				};
			}
			return null;
		});
	}
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
    const filterWithoutApptOrder = config.filterSessionAptStartListFromAthletesWithoutSetApptOrder === true;
    const chunks = splitSessionPerformancesByRotationAndAppt(data, sid, max, filterWithoutApptOrder);
    const extendChunkData = (chunk, chunkIdx) => {
        const resolvedFrameIdx = Number.isInteger(chunk.frameIndex) ? chunk.frameIndex : -1;
        const getFrameForPerformance = (performance) => {
            if (!performance?.Frames || resolvedFrameIdx < 0) {
                return null;
            }
            const frameId = performance.Frames[resolvedFrameIdx];
            if (frameId === undefined || frameId === null) {
                return null;
            }
            return data.Frames?.[frameId] || null;
        };
        const out = {
            chunkIdx: chunkIdx,
	        event: event,
	        session: session,
            competition: competition,
            apparatus: config.apparatus[chunk.frameType],
            rotation: 'R'+(chunk.rotation+1),
            performances: chunk.performances.map((p, idx) => {
                const perfOut = { ...p };
                perfOut.order = 1 + idx + (chunk.chunkIdx * max);
                perfOut.athlete = getRepr(p, data);
                perfOut.performance = p;
                if (resolvedFrameIdx >= 0) {
                    perfOut.frameIdx = resolvedFrameIdx;
                }
                const frame = getFrameForPerformance(p);
                if (frame) {
                    perfOut.frame = frame;
                }
                extendPerformance(perfOut, p, data);
                if (p.Team !== undefined && p.Team !== null && p.Team >= 0) {
                    perfOut.teamID = p.Team;
                }
                return perfOut;
            }),
            sourceChunk: chunk
        };
        return out;
    }

    return chunks.map(extendChunkData);
}

function getCompletedApparatusCount(performance, data) {
    if (!performance?.Frames || !Array.isArray(performance.Frames) || !data?.Frames) {
        return 0;
    }
    let maxRotation = -1;
    for (const fid of performance.Frames) {
        const frame = data.Frames[fid];
        if (!frame) {
            continue;
        }
        if (frame.State !== F_PUBLISHED) {
            continue;
        }
        const rotation = Number(frame.Rotation_G);
        if (!Number.isNaN(rotation)) {
            maxRotation = Math.max(maxRotation, rotation);
        }
    }
    if (maxRotation < 0 || !performance.ApparatusRotationMapping_G) {
        return 0;
    }
    for (const [completedCount, rotationIdx] of Object.entries(performance.ApparatusRotationMapping_G)) {
        if (Number(rotationIdx) === maxRotation) {
            const parsedCount = Number(completedCount);
            return Number.isNaN(parsedCount) ? 0 : parsedCount+1;
        }
    }
    return 0;
}

function hasAllApparatusOrderSet(performance, stage, data) {
    if (!performance || !stage || !data) {
        return false;
    }
    if (!performance.FramePriorities || performance.FramePriorities === null) {
        return false;
    }
    const frameTypes = stage.FrameTypes;
    const framesLimit = stage.PerfomanceFramesLimit || frameTypes.length;
    const VAULT2_ID = appMap["VAULT2"];
    const REST_ID = appMap["REST"];
    
    for (let fidx = 0; fidx < framesLimit; fidx++) {
        const aptID = String(frameTypes[fidx]);
        // Skip VAULT2 and REST
        if (aptID === VAULT2_ID || aptID === REST_ID) {
            continue;
        }
        const priority = performance.FramePriorities[fidx];
        if (priority === undefined || priority === null || priority === 0) {
            return false;
        }
    }
    return true;
}

function onStartLists(s_sids, chunkSize) {
    const splitStartList = (data, max, sid) => {
        return splitStartListChunks(data, max, sid, getPerformanceRepresentation, (pout, p) => {
            if (p.Team !== undefined && p.Team !== null && p.Team >= 0) {
                pout.teamID = p.Team;
            }
        });
    };
    return transformIds(s_sids, chunkSize, M, splitStartList, proccessStartListChunk)
}
function onSession(s_sids, chunkSize, apparatusFilter = null) {
    const splitSessionChunksWithFilter = (data, max, sid) => {
        const allChunks = splitSessionChunks(data, max, sid);
        if (!apparatusFilter || apparatusFilter.length === 0) {
            return allChunks;
        }
        // Filter chunks by apparatus
        const allowedFrameTypes = apparatusFilter.map(apptName => appMap[apptName]).filter(Boolean);
        return allChunks.filter(chunk => {
            const frameType = String(chunk.sourceChunk.frameType);
            return allowedFrameTypes.some(ft => String(ft) === frameType);
        });
    };
    return transformIds(s_sids, chunkSize, M, splitSessionChunksWithFilter, proccessSessionChunk)
}
function onResultsLists(s_sids, chunkSize) {
    const splitResults = (data, max, sid) => {
        const stage = data?.Stages[sid];
        return splitResultsChunks(data, max, sid, {
            getRepr: getPerformanceRepresentation,
            extendPerformance: (pout, p, dataCtx) => {
                pout.allRoundScore = p.MarkAllRoundSummaryTTT_G || 0;
                pout.completedApparatusCount = getCompletedApparatusCount(p, dataCtx);
                pout.IRM = resolvePerformanceIRM(p, ALL_AROUND_IRM_SUBSTATES);
                
                // Check if score and rank should be cleared
                let shouldClear = false;
                // Condition 1: IRM resolves to one of the configured codes
                const clearIRMCodes = config.clearScoreAndRankIRMCodes || [];
                if (pout.IRM && clearIRMCodes.includes(pout.IRM)) {
                    shouldClear = true;
                }
                // Condition 2: Config flag is set and athlete doesn't have all apparatus order set
                if (!shouldClear && config.ClearScoreAndRankIfNotAllApptsInSession === true) {
                    if (!hasAllApparatusOrderSet(p, stage, dataCtx)) {
                        shouldClear = true;
                    }
                }
                if (shouldClear) {
                    pout._shouldClearScoreAndRank = true;
                }
                
                if (p.PenaltyAllRoundIndTTT_G !== undefined && p.PenaltyAllRoundIndTTT_G !== null && p.PenaltyAllRoundIndTTT_G > 0) {
                    pout.PenaltyAllRoundInd = p.PenaltyAllRoundIndTTT_G;
                }
                if (p.PenaltyAllRoundTeamTTT_G !== undefined && p.PenaltyAllRoundTeamTTT_G !== null && p.PenaltyAllRoundTeamTTT_G > 0) {
                    pout.PenaltyAllRoundTeam = p.PenaltyAllRoundTeamTTT_G;
                }
                if (p.TeamPoints_G !== undefined && p.TeamPoints_G !== null) {
                    pout.performanceTeamPoints = p.TeamPoints_G;
                }
                if (p.Team !== undefined && p.Team !== null && p.Team >= 0) {
                    pout.teamID = p.Team;
                }
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
        const frameIdx = findApptFrameIdx(stage, appt);
        const getFrameForPerformance = (p) => {
            if (frameIdx === -1 || p.Frames[frameIdx] === undefined) {
                return null;
            }
            const fid = p.Frames[frameIdx];
            return data.Frames[fid] || null;
        };
        const extendPerformance = (pout, p, dataCtx) => {
            const frame = getFrameForPerformance(p);
            if (appt === "VAULT") {
                pout.allRoundScore = p.MarkAllRoundVaultTTT_G || 0;
                // Get R1 frame score for Vault
                if (frameIdx !== -1 && p.Frames[frameIdx] !== undefined) {
                    const r1FrameId = p.Frames[frameIdx];
                    const r1Frame = dataCtx.Frames[r1FrameId];
                    if (r1Frame && r1Frame.TMarkTTT_G !== undefined) {
                        pout.VaultR1Score = r1Frame.TMarkTTT_G;
                    }
                }
                // Get R2 frame score for Vault (VAULT2)
                const frameIdx2 = findApptFrameIdx(stage, "VAULT2");
                if (frameIdx2 !== -1 && p.Frames[frameIdx2] !== undefined) {
                    const r2FrameId = p.Frames[frameIdx2];
                    const r2Frame = dataCtx.Frames[r2FrameId];
                    if (r2Frame && r2Frame.State === F_PUBLISHED && r2Frame.TMarkTTT_G !== undefined) {
                        pout.VaultR2Score = r2Frame.TMarkTTT_G;
                        // Add vault2Details if flag is enabled
                        if (config.AddVault2DetailsToVaultResult === true) {
                            pout.vault2Details = {};
                            if (r2Frame.DMarkT_G !== undefined) {
                                pout.vault2Details.scoreDifficulty = r2Frame.DMarkT_G;
                            }
                            if (r2Frame.EMarkTTT_G !== undefined) {
                                pout.vault2Details.scoreExecution = r2Frame.EMarkTTT_G;
                            }
                            if (r2Frame.NPenaltyT_G !== undefined) {
                                pout.vault2Details.scorePenalties = r2Frame.NPenaltyT_G;
                            }
                            if (r2Frame.DBonusT_G !== undefined) {
                                pout.vault2Details.scoreBonus = r2Frame.DBonusT_G;
                            }
                            if (r2Frame.TMarkTTT_G !== undefined) {
                                pout.vault2Details.score = r2Frame.TMarkTTT_G;
                            }
                        }
                    }
                }
                // Get BonusVaultTTT_G for Vault
                if (p.BonusVaultTTT_G !== undefined && p.BonusVaultTTT_G !== null && p.BonusVaultTTT_G > 0) {
                    pout.BonusVaultTTT_G = p.BonusVaultTTT_G;
                }
            } else if (frame) {
                pout.allRoundScore = frame?.TAllRoundMarkTTT_G || 0;
            } else {
                pout.allRoundScore = 0;
            }
            if (frame && frame.Rotation_G !== undefined && frame.Rotation_G !== null) {
                const rotationNumber = Number(frame.Rotation_G);
                if (!Number.isNaN(rotationNumber)) {
                    pout.rotationNumber = rotationNumber + 1;
                }
            }
            if (frame?.DMarkT_G !== undefined) {
                pout.difficultyScore = frame.DMarkT_G;
            }
            if (frame?.EMarkTTT_G !== undefined) {
                pout.executionScore = frame.EMarkTTT_G;
            }
            if (frame?.NPenaltyT_G !== undefined) {
                pout.penaltyScore = frame.NPenaltyT_G;
            }
            if (frame?.DBonusT_G !== undefined) {
                pout.bonusScore = frame.DBonusT_G;
            }
            if (frame?.TeamPoints_G !== undefined && frame.TeamPoints_G !== null) {
                pout.frameTeamPoints = frame.TeamPoints_G;
            }
            pout.IRM = resolveFrameIRM(frame, APPARATUS_IRM_SUBSTATES);
            if (p.TeamPoints_G !== undefined && p.TeamPoints_G !== null) {
                pout.performanceTeamPoints = p.TeamPoints_G;
            }
            if (p.Team !== undefined && p.Team !== null && p.Team >= 0) {
                pout.teamID = p.Team;
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

function formatTeamScore(stage, score) {
	if (score === undefined || score === null || score === "") {
		return "";
	}
	const isVersusMode = stage?.CalcOptions?.includes(13);
	return isVersusMode ? score.toString() : (score / 1000).toFixed(3);
}

function addTeam(pout, p, data, stage) {
    if (p.Team >= 0) {
        pout.teamID = p.Team;
        pout.ARScore = p.MarkAllRoundTeamSummaryTTT_G;
        if (p.PrevPerformanceID_G && p.PrevPerformanceID_G !== -1) {
            const prev = data.Performances[p.PrevPerformanceID_G];
            pout.prevScore = getTeamScore(prev);
        }
        
        // Add apparatus team scores
        if (stage && stage.FrameTypes && p.FrameTeamMarks_G) {
            const framesLimit = stage.PerfomanceFramesLimit || stage.FrameTypes.length;
            pout.teamApparatusScores = {};
            for (let i = 0; i < framesLimit; i++) {
                const aptID = String(stage.FrameTypes[i]);
                const apparatus = config.apparatus[aptID];
                if (apparatus && apparatus.name) {
                    const apptName = apparatus.name;
                    const teamMark = p.FrameTeamMarks_G[i];
                    if (teamMark !== undefined && teamMark !== null) {
                        pout.teamApparatusScores[apptName] = teamMark;
                    }
                }
            }
        }
    }
}

function proccessTeamResultsChunk(chunk) {
	const frameData = {
		competition: chunk.competition.Title,
	};
	updateFrameData(frameData, "rank", chunk.performances, ( p ) => { return String(p.rank).padStart(2, "0")});
	updateFrameData(frameData, "repr", chunk.performances, ( p ) => { return bindTeam(p.athlete, config, chunk.event); });
	updateFrameData(frameData, "logo", chunk.performances, ( p ) => { return bindTeamFlag(p.athlete, config, OVS, chunk.event); } );
	updateFrameData(frameData, "score", chunk.performances, ( p ) => { 
		return formatTeamScore(chunk.stage, p.score);
	});
	updateFrameData(frameData, "pscore", chunk.performances, ( p ) => { return (p.prevScore / 1000).toFixed(3) });
	updateFrameData(frameData, "arscore", chunk.performances, ( p ) => { return (p.ARScore / 1000).toFixed(3) });
	updateFrameData(frameData, "bib", chunk.performances, ( p ) => { return p.athlete?.ExternalID || ""; });
	updateFrameData(frameData, "teamID", chunk.performances, ( p ) => { return p.teamID !== undefined ? String(p.teamID) : ""; });
	
	// Add dynamic fields for each apparatus team score
	if (chunk.stage && chunk.stage.FrameTypes) {
		const framesLimit = chunk.stage.PerfomanceFramesLimit || chunk.stage.FrameTypes.length;
		for (let i = 0; i < framesLimit; i++) {
			const aptID = String(chunk.stage.FrameTypes[i]);
			const apparatus = config.apparatus[aptID];
			if (apparatus && apparatus.name) {
				const apptName = apparatus.name;
				const fieldName = `TeamScore_${apptName}`;
				updateFrameData(frameData, fieldName, chunk.performances, ( p ) => {
					const value = p.teamApparatusScores?.[apptName];
					return formatTeamScore(chunk.stage, value);
				});
			}
		}
	}
	
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
        const addTeamWithStage = (pout, p, dataCtx) => {
            addTeam(pout, p, dataCtx, stage);
        };
        return splitResultsChunks(data, max, sid, {
            getRepr: getPerformanceRepresentation,
            getRank: p => getTeamRank(p),
            getScore: p => getTeamScore(p),
            extendPerformance: addTeamWithStage,
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
                    repr: bindTeam(a, config, e),
                    scoreTotal: (p.MarkTTT_G / 1000).toFixed(3),
                    scoreRoutine: (f.TMarkTTT_G / 1000).toFixed(3),
                    scoreDifficulty: (f.DMarkT_G / 10).toFixed(1),
                    scoreExecution: (f.EMarkTTT_G / 1000).toFixed(3),
                    scorePenalties: (f.NPenaltyT_G / 10).toFixed(1),
                    rank: p.Rank_G,
                    rankApt: p.FrameRanks_G[fidx],
                    eventTitle: e.Title,
                    competitionTitle: c.Title,
                    logo: bindTeamFlag(a, config, OVS, e),
                    appIcon: config.apparatus[aptID].icon,
                    scorePrevRoutine: undefined,
                    scoreAllRound: p.MarkAllRoundSummaryTTT_G ? (p.MarkAllRoundSummaryTTT_G / 1000).toFixed(3) : undefined,
                    scoreAllRoundApt: allRoundAptScore ? (allRoundAptScore / 1000).toFixed(3) : undefined,
                    frameTeamPoints: f.TeamPoints_G !== undefined && f.TeamPoints_G !== null ? f.TeamPoints_G : undefined,
                    performanceTeamPoints: p.TeamPoints_G !== undefined && p.TeamPoints_G !== null ? p.TeamPoints_G : undefined
                }
                if (p.Team !== undefined && p.Team !== null && p.Team >= 0) {
                    athlete.teamID = p.Team;
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

function parseApparatusParam(apptParam) {
    if (typeof apptParam !== "string") {
        return [];
    }
    const parts = apptParam
        .split("-")
        .map(part => part.trim())
        .filter(Boolean);
    if (parts.length === 0 && apptParam.length > 0) {
        return [apptParam];
    }
    return parts.length ? parts : [];
}


export async function register(app, model, addUpdateListner) {
    M = model;
    [OVS, config] = await loadCommonConfig("CONFIG_VMIX_LIVESPORT_AG_FILE", config);
    buildApptMap(config);
    registerCommonEndpoints(app, config, M, addUpdateListner, onStartLists, onResultsLists, onActiveGroups);
    app.get(config.root + '/results/:sids/:appt/chunk/:size', (req, res) => {
        const appts = parseApparatusParam(req.params.appt);
        const targets = appts.length ? appts : [req.params.appt];
        const data = targets.reduce((acc, appt) => {
            const chunks = onApptResultsLists(req.params.sids, req.params.size, appt);
            return acc.concat(chunks);
        }, []);
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
    app.get(config.root + '/sessions/:sids/:appt/chunk/:size', (req, res) => {
        const appts = parseApparatusParam(req.params.appt);
        const targets = appts.length ? appts : [req.params.appt];
        const data = onSession(req.params.sids, req.params.size, targets);
        res.json(data);
    });
};