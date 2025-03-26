import { chunk } from '../../utils/array.js';

export const Apparatus = {
    NoApparatus: 0,
    Rope: 1,
    Hoop: 2,
    Ball: 3,
    Clubs: 4,
    Ribbon: 5,
    TypeOne: 6,
    TypeTwo: 7,
    TypeThree: 8,
    TypeFour: 9,
    NotInUse: 10,
    ApparatusMax: 11,
};

export const Disciplines = {
    IND: 0,
    GROUP: 1,
    TEAM: 2,
    DISCIPLINE__MAX: 3,
};

function buildIndAppts(apps) {
    const filtered = apps.filter( a => a.app != Apparatus.NotInUse);
    return filtered.map( a => [a]);
}

function buildGroupAppts(apps) {
    const pairs = chunk(apps,2);
    return pairs.filter( p => {
        if (p.length == 2) {
            return chunk[0].app !== Apparatus.NotInUse && chunk[1].app !== Apparatus.NotInUse;
        }
        return p[0].app !== Apparatus.NotInUse;
    });
}

function _buildStageAppsDescription(stage, competition) {
    const appsWithIndexes = stage.Apparatuses.map((app, idx) => { return {app: app, idx: idx}}) ;
    if (competition.Discipline === Disciplines.IND) {
        return {ind:buildIndAppts(appsWithIndexes), group:[]};
    }
    if (competition.Discipline === Disciplines.GROUP) {
        return {ind:[], group:buildGroupAppts(appsWithIndexes)};
    }
    const ind = buildIndAppts(appsWithIndexes.slice(0,stage.TApparatusStart));
    const group = buildGroupAppts(appsWithIndexes.slice(stage.TApparatusStart));
    return {ind:ind, group:group};
}

export function buildStageAppsDescription(stage, competition) {
    const descr = _buildStageAppsDescription(stage, competition);
    descr.all = descr.ind.concat(descr.group);
    return descr;
}

export function findApparatusFrameIndex(stage, apparatus) {
   return stage.Apparatuses.indexOf(apparatus); 
}