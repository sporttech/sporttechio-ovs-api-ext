import { chunk, objectToArray } from '../../utils/array.js';

export function splitSessionPerformancesByRotationAndAppt(M, sid, chunkSize) {
    const chunks = [];
    const session = M.Sessions[sid];
    if (session === undefined) {
        return chunks;
    }
    const stage = M.Stages[session.LongestStage_G];
    const frameTypes = objectToArray(stage.FrameTypes).slice(0, stage.PerfomanceFramesLimit);

    let rotationNumber = -1;

    while (true) {
        rotationNumber++;
        const packs = session.Packs.map(pkid => M.Packs[pkid])
                                    .filter(p => objectToArray(p.Rotations).some(r => r === rotationNumber));
        if (packs.length === 0) {
            break;
        }

        for (const [fidx, ft] of frameTypes.entries()) {
            const sortPerformancesInPack = (p1, p2) => {
                const score1 = p1.FramePriorities[fidx];
                const score2 = p2.FramePriorities[fidx];
                if (score1 === score2) {
                    return 0;
                }
                return score1 > score2 ? 1 : -1;
            }
            const wrapPerformancesChunk = (chunk, chunkIdx) => {
                const chunked = {
                    performances: chunk,
                    rotation: rotationNumber,
                    frameType: ft,
                    frameIndex: fidx,
                    chunkIdx: chunkIdx
                }
                return chunked;
            }
            const packsOnAppt = packs.filter(p => p.Rotations[fidx] === rotationNumber);
            const performancesOnAppt = packsOnAppt.map(p => p.Performances.map(pid => M.Performances[pid]).sort(sortPerformancesInPack)).flat();
            const chunkedPerformancesOnAppt = chunkSize > 0 ? chunk(performancesOnAppt, chunkSize) : [performancesOnAppt];
            
            chunks.push(...(chunkedPerformancesOnAppt.map(wrapPerformancesChunk)));
        }
    }
    return chunks;
}