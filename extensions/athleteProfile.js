import { fullYearsFromDob, getName } from './vmixLivesportCommon.js';

export function matchKey(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

export function athleteRecord(athlete, model, config) {
    const field = config.MatchAthleteBy;
    if (!field || !Object.hasOwn(athlete || {}, field)) return null;
    const key = matchKey(athlete[field]);
    if (!key) return null;
    const matches = Object.values(model?.Athletes || {}).filter(a => matchKey(a?.[field]) === key);
    if (matches.length !== 1) return null;
    return Object.hasOwn(config.athletes || {}, key) ? config.athletes[key] : null;
}

function value(primary, secondary) {
    return primary !== undefined && primary !== null && String(primary).trim() !== '' ? primary : (secondary ?? '');
}

function preferred(ovs, configured, config) {
    return config.AthleteFieldPriority === 'config' ? value(configured, ovs) : value(ovs, configured);
}

export function representingPart(raw, config, event) {
    const parts = String(raw || '').split(',').map(x => x.trim());
    const mode = config.RepresentingPart || 'event';
    if (mode === 'full' || parts.length < 2) return String(raw || '').trim();
    if (mode === 'before' || (mode === 'event' && event?.ShowAthleteCountryFlag === true)) return parts[0];
    return parts.slice(1).join(', ').trim();
}

export function resolveAthleteProfile(athlete, model, config, event, ovsBib) {
    const record = athleteRecord(athlete, model, config) || {};
    const teamKey = record.team || representingPart(athlete?.Representing, config, event);
    const team = Object.hasOwn(config.teams || {}, teamKey) ? config.teams[teamKey] : null;
    const raw = athlete?.Representing ?? '';
    const selected = representingPart(raw, config, event);
    const cityFromOvs = config.CityRepresentingPart && (raw.includes(',') || config.CityRepresentingPart === 'full')
        ? representingPart(raw, { RepresentingPart: config.CityRepresentingPart }, event) : '';
    return {
        record,
        team,
        bib: preferred(ovsBib, record.bib, config),
        name: preferred(getName(athlete || {}, config).trim(), record.name, config),
        age: preferred(fullYearsFromDob(athlete), record.age, config),
        level: preferred(athlete?.Level, record.level, config),
        city: preferred(cityFromOvs, record.city ?? team?.city, config),
        accolades: record.accolades ?? '',
        photo: preferred(athlete?.PhotoURL, record.photo, config),
        representing: value(record.representing, value(team?.representing, selected)),
        rawRepresenting: raw
    };
}
