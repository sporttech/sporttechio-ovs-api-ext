import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { athleteRecord, resolveAthleteProfile, representingPart } from '../extensions/athleteProfile.js';
import { register } from '../extensions/vmixLivesportAG.js';

test('MatchAthleteBy reads a direct OVS field and rejects ambiguous or missing keys', () => {
    const athlete = { Bib: 255, ExternalID: 12, ID: 5, GUID: 'abc' };
    const model = { Athletes: { 5: athlete } };
    for (const [field, key] of [['Bib', '255'], ['ExternalID', '12'], ['ID', '5'], ['GUID', 'abc']]) {
        assert.equal(athleteRecord(athlete, model, { MatchAthleteBy: field, athletes: { [key]: { name: 'Иван Иванов' } } }).name, 'Иван Иванов');
    }
    assert.equal(athleteRecord(athlete, model, { MatchAthleteBy: 'License', athletes: { 255: {} } }), null);
    assert.equal(athleteRecord({ Bib: '' }, { Athletes: {} }, { MatchAthleteBy: 'Bib', athletes: { '': {} } }), null);
    assert.equal(athleteRecord(athlete, { Athletes: { 5: athlete, 6: { Bib: '255' } } }, { MatchAthleteBy: 'Bib', athletes: { 255: {} } }), null);
});

test('field priority and representing overrides work independently of the match field', () => {
    const athlete = { Bib: 255, GivenName: 'Иван', Surname: 'Иванов', Level: 'МС', DateOfBirth: '2000-01-01', Representing: 'Россия, Москва', PhotoURL: 'https://ovs.example/a.jpg' };
    const model = { Athletes: { 1: athlete } };
    const config = { MatchAthleteBy: 'Bib', CityRepresentingPart: 'after', RepresentingPart: 'before', teams: { A: { city: 'Казань', representing: 'АГГА' } }, athletes: { 255: { name: 'Ваня Иванов', age: 18, level: 'КМС', city: 'Владимир', accolades: 'Призер', photo: 'https://cfg.example/a.jpg', team: 'A', representing: 'Команда А' } } };
    assert.equal(representingPart(athlete.Representing, config, {}), 'Россия');
    assert.equal(resolveAthleteProfile(athlete, model, { ...config, AthleteFieldPriority: 'config' }, {}, '255').city, 'Владимир');
    assert.equal(resolveAthleteProfile(athlete, model, { ...config, AthleteFieldPriority: 'config' }, {}, '255').photo, 'https://cfg.example/a.jpg');
    const ovs = resolveAthleteProfile(athlete, model, { ...config, AthleteFieldPriority: 'ovs' }, {}, '255');
    assert.equal(ovs.city, 'Москва');
    assert.equal(ovs.level, 'МС');
    assert.equal(ovs.accolades, 'Призер');
    assert.equal(ovs.photo, 'https://ovs.example/a.jpg');
    assert.equal(ovs.representing, 'Команда А');
    assert.equal(resolveAthleteProfile({ ...athlete, Representing: 'АГГА' }, { Athletes: { 1: { ...athlete, Representing: 'АГГА' } } }, { ...config, AthleteFieldPriority: 'ovs' }, {}, '255').city, 'Владимир');
});

test('AG rows are enriched and versus team points keep their integer scale', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ag-gpl-'));
    const configFile = join(dir, 'config.json');
    const oldConfig = process.env.CONFIG_VMIX_LIVESPORT_AG_FILE;
    const oldOvs = process.env.OVS_URL;
    const config = {
        root: '/vmix/ag', MatchAthleteBy: 'Bib', AthleteFieldPriority: 'config',
        EnableAthleteEnrichment: true, EnableTeamEnrichment: true,
        RepresentingPart: 'after', CityRepresentingPart: 'after',
        AddRawRepresentingColumn: true, AddRepr2Column: false,
        teams: { A: { name: 'АГГА', description: 'Описание', results: { GPL24: 'ГПЛ 2024 — золото', GPL25: 'ГПЛ 2025 — бронза' }, flag: '' } },
        athletes: { 255: { bib: '255', name: 'Иван Иванов', age: 18, level: 'МС', city: 'Москва', accolades: 'Чемпион', photo: 'https://cfg.example/ivan.jpg', team: 'A' } },
        apparatus: { 1: { name: 'FLOOR', icon: '' } }, frameState: { 3: 'PUBLISHED' }
    };
    const athlete = { ID: 1, Bib: 255, ExternalID: 50, GivenName: 'Иван', Surname: 'Иванов', Representing: 'Россия, Москва', PhotoURL: 'https://ovs.example/ivan.jpg' };
    const performance = { ID: 1, Athletes: [1], GroupID: 1, Team: 1, Rank_G: 1, TeamRank_G: 1,
        MarkTTT_G: 14000, TeamMarkTTT_G: 27, MarkAllRoundTeamSummaryTTT_G: 54,
        PrevPerformanceID_G: 2, FrameTeamMarks_G: [27], Frames: [1], FramePriorities: [1], FrameRanks_G: [1] };
    const model = { Event: { Title: 'ГПЛ' }, Athletes: { 1: athlete },
        Competitions: { 1: { Title: 'Финал', Stages: [1] } },
        Stages: { 1: { ID: 1, CompetitionID: 1, Groups: [1], CalcOptions: [13], FrameTypes: [1], PerfomanceFramesLimit: 1 } },
        Groups: { 1: { ID: 1, StageID: 1, Performances: [1] } },
        Performances: { 1: performance, 2: { TeamMarkTTT_G: 10 } },
        Frames: { 1: { ID: 1, PerformanceID: 1, State: 3, TMarkTTT_G: 14000, TeamPoints_G: 27, Rotation_G: 0, DMarkT_G: 50, EMarkTTT_G: 9000, NPenaltyT_G: 0 } },
        Sessions: { 1: { LongestStage_G: 1, Packs: [1] } }, Packs: { 1: { Rotations: [0], Performances: [1] } }
    };
    const routes = new Map();
    let updateListener;
    try {
        await writeFile(configFile, JSON.stringify(config));
        process.env.CONFIG_VMIX_LIVESPORT_AG_FILE = configFile;
        process.env.OVS_URL = 'http://ovs.example';
        await register({ get: (path, handler) => routes.set(path, handler) }, model, fn => { updateListener = fn; });
        const call = (path, params = {}) => {
            let value;
            routes.get(path)({ params }, { json: data => { value = data; } });
            return value;
        };
        const start = call('/vmix/ag/startlists/:sids/chunk/:size', { sids: '1', size: '8' })[0];
        assert.equal(start.name_n1, 'Иван Иванов');
        assert.equal(start.city_n1, 'Москва');
        assert.equal(start.accolades_n1, 'Чемпион');
        assert.equal(start.PhotoURL_n1, 'https://cfg.example/ivan.jpg');
        const results = call('/vmix/ag/results/:sids/chunk/:size', { sids: '1', size: '8' })[0];
        assert.equal(results.level_n1, 'МС');
        assert.equal(results.PhotoURL_n1, 'https://cfg.example/ivan.jpg');
        const team = call('/vmix/ag/teamresults/:sids/chunk/:size', { sids: '1', size: '8' })[0];
        assert.equal(team.score_n1, '27');
        assert.equal(team.pscore_n1, '10');
        assert.equal(team.arscore_n1, '54');
        assert.equal(team.TeamScore_FLOOR_n1, '27');
        assert.equal(team.teamDescription_n1, 'Описание');
        assert.equal(team.GPL24_n1, 'ГПЛ 2024 — золото');
        assert.equal(team.GPL25_n1, 'ГПЛ 2025 — бронза');
        assert.equal(team.teamResults_n1, undefined);
        const session = call('/vmix/ag/sessions/:sids/chunk/:size', { sids: '1', size: '8' })[0];
        assert.equal(session.age_n1, 18);
        updateListener({ Frames: { 1: model.Frames[1] } });
        const active = call('/vmix/ag/active-groups')[0];
        assert.equal(active.accolades, 'Чемпион');
        assert.equal(active.scoreRoutine, '14.000');
        assert.equal(active.frameTeamPoints, 27);
        model.Stages[1].Groups.push(2);
        model.Groups[2] = { ID: 2, StageID: 1, Performances: [1] };
        const stageGroups = call('/vmix/ag/stage/:sids/groups', { sids: '1' });
        assert.equal(stageGroups.length, 2);
        assert.deepEqual(stageGroups.map(row => row.group), [1, 2]);
        assert.equal(stageGroups[0].accolades, 'Чемпион');
        assert.deepEqual(call('/vmix/ag/stage/:sids/groups', { sids: '999' }), []);
        model.Stages[1].Groups.pop();
        delete model.Groups[2];
        const liveConfig = call('/vmix/ag/config');
        liveConfig.teams.A.representing = 'Команда А';
        liveConfig.teams.A.flag = 'https://flags.example/a.png';
        liveConfig.athletes[255].representing = 'Спортсмен А';
        const overriddenStart = call('/vmix/ag/startlists/:sids/chunk/:size', { sids: '1', size: '8' })[0];
        assert.equal(overriddenStart.repr_n1, 'Спортсмен А');
        assert.equal(overriddenStart.rawRepr_n1, 'Россия, Москва');
        assert.equal(overriddenStart.logo_n1, 'https://flags.example/a.png');
        delete liveConfig.athletes[255].representing;
        assert.equal(call('/vmix/ag/startlists/:sids/chunk/:size', { sids: '1', size: '8' })[0].repr_n1, 'Команда А');
        liveConfig.EnableAthleteEnrichment = false;
        liveConfig.EnableTeamEnrichment = false;
        const plainStart = call('/vmix/ag/startlists/:sids/chunk/:size', { sids: '1', size: '8' })[0];
        assert.equal(plainStart.city_n1, undefined);
        assert.equal(plainStart.bib_n1, '255');
        assert.equal(plainStart.PhotoURL_n1, 'https://ovs.example/ivan.jpg');
        const activePhoto = call('/vmix/ag/active-groups')[0];
        assert.equal(activePhoto.PhotoURL, 'https://ovs.example/ivan.jpg');
        delete athlete.Bib;
        assert.equal(call('/vmix/ag/startlists/:sids/chunk/:size', { sids: '1', size: '8' })[0].bib_n1, '50');
        athlete.Bib = 255;
        const plainTeam = call('/vmix/ag/teamresults/:sids/chunk/:size', { sids: '1', size: '8' })[0];
        assert.equal(plainTeam.teamDescription_n1, undefined);
        model.Stages[1].CalcOptions = [];
        performance.TeamMarkTTT_G = 27000;
        performance.FrameTeamMarks_G = [27000];
        performance.MarkAllRoundTeamSummaryTTT_G = 54000;
        model.Performances[2].TeamMarkTTT_G = 10000;
        const ordinaryTeam = call('/vmix/ag/teamresults/:sids/chunk/:size', { sids: '1', size: '8' })[0];
        assert.equal(ordinaryTeam.score_n1, '27.000');
        assert.equal(ordinaryTeam.pscore_n1, '10.000');
        assert.equal(ordinaryTeam.arscore_n1, '54.000');
        assert.equal(ordinaryTeam.TeamScore_FLOOR_n1, '27.000');
        performance.PrevPerformanceID_G = -1;
        performance.MarkAllRoundTeamSummaryTTT_G = undefined;
        const missingScores = call('/vmix/ag/teamresults/:sids/chunk/:size', { sids: '1', size: '8' })[0];
        assert.equal(missingScores.pscore_n1, '');
        assert.equal(missingScores.arscore_n1, '');
    } finally {
        if (oldConfig === undefined) delete process.env.CONFIG_VMIX_LIVESPORT_AG_FILE; else process.env.CONFIG_VMIX_LIVESPORT_AG_FILE = oldConfig;
        if (oldOvs === undefined) delete process.env.OVS_URL; else process.env.OVS_URL = oldOvs;
        await rm(dir, { recursive: true, force: true });
    }
});

test('sortBy=TeamID orders teamresults by teamID while keeping ranks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ag-team-sort-'));
    const configFile = join(dir, 'config.json');
    const oldConfig = process.env.CONFIG_VMIX_LIVESPORT_AG_FILE;
    const oldOvs = process.env.OVS_URL;
    const config = {
        root: '/vmix/ag', teams: {},
        apparatus: { 1: { name: 'FLOOR', icon: '' } }, frameState: { 3: 'PUBLISHED' }
    };
    const athletes = {
        1: { ID: 1, Bib: 1, GivenName: 'A', Surname: 'One', Representing: 'T1' },
        2: { ID: 2, Bib: 2, GivenName: 'B', Surname: 'Two', Representing: 'T2' }
    };
    const performances = {
        1: { ID: 1, Athletes: [1], GroupID: 1, Team: 2, TeamRank_G: 1, TeamMarkTTT_G: 30, Frames: [1], FramePriorities: [1], FrameRanks_G: [1], FrameTeamMarks_G: [30] },
        2: { ID: 2, Athletes: [2], GroupID: 1, Team: 1, TeamRank_G: 2, TeamMarkTTT_G: 20, Frames: [2], FramePriorities: [1], FrameRanks_G: [2], FrameTeamMarks_G: [20] }
    };
    const model = {
        Event: { Title: 'GPL' }, Athletes: athletes,
        Competitions: { 1: { Title: 'Final', Stages: [1] } },
        Stages: { 1: { ID: 1, CompetitionID: 1, Groups: [1], CalcOptions: [13], FrameTypes: [1], PerfomanceFramesLimit: 1 } },
        Groups: { 1: { ID: 1, StageID: 1, Performances: [1, 2] } },
        Performances: performances,
        Frames: {
            1: { ID: 1, PerformanceID: 1, State: 3, TeamPoints_G: 30 },
            2: { ID: 2, PerformanceID: 2, State: 3, TeamPoints_G: 20 }
        }
    };
    const routes = new Map();
    try {
        await writeFile(configFile, JSON.stringify(config));
        process.env.CONFIG_VMIX_LIVESPORT_AG_FILE = configFile;
        process.env.OVS_URL = 'http://ovs.example';
        await register({ get: (path, handler) => routes.set(path, handler) }, model, () => {});
        const call = (query = {}) => {
            let value;
            routes.get('/vmix/ag/teamresults/:sids/chunk/:size')(
                { params: { sids: '1', size: '8' }, query },
                { json: data => { value = data; } }
            );
            return value[0];
        };
        const byRank = call();
        assert.equal(byRank.teamID_n1, '2');
        assert.equal(byRank.rank_n1, '01');
        assert.equal(byRank.teamID_n2, '1');
        assert.equal(byRank.rank_n2, '02');
        const byTeamID = call({ sortBy: 'TeamID' });
        assert.equal(byTeamID.teamID_n1, '1');
        assert.equal(byTeamID.rank_n1, '02');
        assert.equal(byTeamID.teamID_n2, '2');
        assert.equal(byTeamID.rank_n2, '01');
    } finally {
        if (oldConfig === undefined) delete process.env.CONFIG_VMIX_LIVESPORT_AG_FILE; else process.env.CONFIG_VMIX_LIVESPORT_AG_FILE = oldConfig;
        if (oldOvs === undefined) delete process.env.OVS_URL; else process.env.OVS_URL = oldOvs;
        await rm(dir, { recursive: true, force: true });
    }
});

test('AddApparatusAllRoundScoresToResults and AddApparatusScoresToResults add published apparatus columns to results', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ag-appt-ar-'));
    const configFile = join(dir, 'config.json');
    const oldConfig = process.env.CONFIG_VMIX_LIVESPORT_AG_FILE;
    const oldOvs = process.env.OVS_URL;
    const config = {
        root: '/vmix/ag', teams: {},
        AddApparatusAllRoundScoresToResults: true,
        AddApparatusScoresToResults: true,
        apparatus: {
            1: { name: 'FLOOR', icon: '' },
            2: { name: 'VAULT', icon: '' },
            3: { name: 'VAULT2', icon: '' },
            10: { name: 'REST', icon: '' },
            4: { name: 'POMMEL', icon: '' }
        },
        frameState: { 3: 'PUBLISHED' }
    };
    const athlete = { ID: 1, Bib: 1, GivenName: 'A', Surname: 'One', Representing: 'T1' };
    const performance = {
        ID: 1, Athletes: [1], GroupID: 1, Rank_G: 1, MarkTTT_G: 28000, MarkAllRoundSummaryTTT_G: 28000,
        MarkAllRoundVaultTTT_G: 14000, MarkVaultTTT_G: 14250, Frames: [1, 2, 3, 4, 5], FramePriorities: [1, 1, 1, 1, 1], FrameRanks_G: [1, 1, 1, 1, 1]
    };
    const model = {
        Event: { Title: 'GPL' }, Athletes: { 1: athlete },
        Competitions: { 1: { Title: 'Final', Stages: [1] } },
        Stages: { 1: { ID: 1, CompetitionID: 1, Groups: [1], FrameTypes: [1, 2, 3, 10, 4], PerfomanceFramesLimit: 5 } },
        Groups: { 1: { ID: 1, StageID: 1, Performances: [1] } },
        Performances: { 1: performance },
        Frames: {
            1: { ID: 1, PerformanceID: 1, State: 3, TAllRoundMarkTTT_G: 0, TMarkTTT_G: 13500 },
            2: { ID: 2, PerformanceID: 1, State: 3, TAllRoundMarkTTT_G: 14000, TMarkTTT_G: 14000 },
            3: { ID: 3, PerformanceID: 1, State: 3, TAllRoundMarkTTT_G: 14100, TMarkTTT_G: 14100 },
            4: { ID: 4, PerformanceID: 1, State: 3, TAllRoundMarkTTT_G: 0, TMarkTTT_G: 0 },
            5: { ID: 5, PerformanceID: 1, State: 1, TAllRoundMarkTTT_G: 12500, TMarkTTT_G: 12500 }
        }
    };
    const routes = new Map();
    try {
        await writeFile(configFile, JSON.stringify(config));
        process.env.CONFIG_VMIX_LIVESPORT_AG_FILE = configFile;
        process.env.OVS_URL = 'http://ovs.example';
        await register({ get: (path, handler) => routes.set(path, handler) }, model, () => {});
        const call = () => {
            let value;
            routes.get('/vmix/ag/results/:sids/chunk/:size')(
                { params: { sids: '1', size: '8' } },
                { json: data => { value = data; } }
            );
            return value[0];
        };
        const withFlag = call();
        assert.equal(withFlag.ARScore_FLOOR_n1, '0.000');
        assert.equal(withFlag.ARScore_VAULT_n1, '14.000');
        assert.equal(withFlag.ARScore_POMMEL_n1, '');
        assert.equal(withFlag.Score_FLOOR_n1, '13.500');
        assert.equal(withFlag.Score_VAULT_n1, '14.250');
        assert.equal(withFlag.Score_POMMEL_n1, '');
        assert.equal(withFlag.Score_VAULT2_n1, undefined);
        assert.equal(withFlag.Score_REST_n1, undefined);
        assert.equal(withFlag.ARScore_VAULT2_n1, undefined);
        const liveConfig = (() => {
            let value;
            routes.get('/vmix/ag/config')({}, { json: data => { value = data; } });
            return value;
        })();
        liveConfig.AddApparatusAllRoundScoresToResults = false;
        liveConfig.AddApparatusScoresToResults = false;
        const withoutFlag = call();
        assert.equal(withoutFlag.ARScore_FLOOR_n1, undefined);
        assert.equal(withoutFlag.Score_FLOOR_n1, undefined);
        assert.equal(withoutFlag.ARScore_VAULT_n1, undefined);
        assert.equal(withoutFlag.Score_VAULT_n1, undefined);
    } finally {
        if (oldConfig === undefined) delete process.env.CONFIG_VMIX_LIVESPORT_AG_FILE; else process.env.CONFIG_VMIX_LIVESPORT_AG_FILE = oldConfig;
        if (oldOvs === undefined) delete process.env.OVS_URL; else process.env.OVS_URL = oldOvs;
        await rm(dir, { recursive: true, force: true });
    }
});
