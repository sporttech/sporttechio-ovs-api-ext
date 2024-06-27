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

module.exports = {
    transformStageList,
};