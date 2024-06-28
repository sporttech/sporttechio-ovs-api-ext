function extendPreservingIdent(dst, src) {
    if (typeof src === 'object' && "invalidated" in src) {
        for (const key in src["invalidated"]) {
            delete dst[key];
        }
    }

    for (const [key, value] of Object.entries(src)) {
        if (key === "invalidated") {
            continue;
        }

        if (Array.isArray(dst[key])) {
            dst[key] = value;
        } else if (typeof dst[key] === 'object' && dst[key] !== null && dst[key] !== undefined) {
            extendPreservingIdent(dst[key], value);
        } else {
            dst[key] = value;
        }
    }
}

function applyUpdate(model, update) {
    // Clear deleted items
    for (const [key, value] of Object.entries(update)) {
        if ('deleted' in value) {
            const deleteIDs = value['deleted'];
            for (const id of deleteIDs) {
                delete model[key][id];
            }
            delete model[key]['deleted'];
        }
    }

    // Add and Patch items
    extendPreservingIdent(model, update);
}

function isEmpty(update) {
    return Object.keys(update).length === 0;
}

export {
    applyUpdate,
    isEmpty as isEmptyUpdate
};

