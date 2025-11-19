const FrameState = Object.freeze({
    NOT_STARTED: 0,
    STARTED: 1,
    FINISHED: 2,
    PUBLISHED: 3,
    FAILED: 4,
    EDITING: 5
});

const FrameSubState = Object.freeze({
    NOT_SET: 0,
    DNS: 1,
    BLOCKED: 2,
    FSF: 3,
    DNF: 4,
    DSQ: 5,
    DQB: 6,
    DNC: 7
});

const FrameSubStateIRM = Object.freeze({
    [FrameSubState.DNS]: "DNS",
    [FrameSubState.DSQ]: "DSQ",
    [FrameSubState.DQB]: "DQB",
    [FrameSubState.DNF]: "DNF"
});

function getIRMCode(state, subState, allowedSubstates = null) {
    if (state !== FrameState.FAILED) {
        return "";
    }
    if (allowedSubstates && !allowedSubstates.includes(subState)) {
        return "";
    }
    return FrameSubStateIRM[subState] || "";
}

export {
    FrameState,
    FrameSubState,
    FrameSubStateIRM,
    getIRMCode
};

