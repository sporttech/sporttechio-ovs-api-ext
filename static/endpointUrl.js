function isBlank(value) {
    return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function serialiseValue(parameter, value) {
    if (Array.isArray(value)) {
        return value.join(parameter.separator || '-');
    }
    return String(value ?? '');
}

function buildEndpointUrl(endpoint, values = {}, origin = '') {
    let path = endpoint.path;
    const errors = [];
    const query = [];

    for (const parameter of endpoint.parameters || []) {
        const value = values[parameter.name] ?? parameter.defaultValue ?? '';
        const serialised = serialiseValue(parameter, value).trim();
        if (parameter.required && isBlank(value)) {
            errors.push(`${parameter.label || parameter.name} is required`);
            continue;
        }
        if (serialised === '') continue;

        if (parameter.control === 'number') {
            const number = Number(serialised);
            if (!Number.isFinite(number)
                || (parameter.min !== undefined && number < parameter.min)
                || (parameter.max !== undefined && number > parameter.max)) {
                errors.push(`${parameter.label || parameter.name} is invalid`);
                continue;
            }
        }
        if (parameter.control === 'enum') {
            const selected = Array.isArray(value) ? value : [value];
            const allowed = new Set((parameter.options || []).map(option => String(option.value)));
            if (selected.some(item => !allowed.has(String(item)))) {
                errors.push(`${parameter.label || parameter.name} is invalid`);
                continue;
            }
        }

        if (parameter.in === 'path') {
            path = path.replace(`:${parameter.name}`, encodeURIComponent(serialised));
        } else {
            query.push(`${encodeURIComponent(parameter.name)}=${encodeURIComponent(serialised)}`);
        }
    }

    if (/:[A-Za-z0-9_]+/.test(path)) {
        errors.push('Path has unresolved parameters');
    }
    const suffix = query.length ? `?${query.join('&')}` : '';
    return {
        valid: errors.length === 0,
        url: errors.length === 0 ? `${origin}${path}${suffix}` : '',
        path: errors.length === 0 ? `${path}${suffix}` : '',
        errors
    };
}

export { buildEndpointUrl };
