import { buildEndpointUrl } from './endpointUrl.js';

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function readControl(control, parameter) {
    if (parameter.control === 'enum' && parameter.multiple) {
        return Array.from(control.querySelectorAll('input:checked'), input => input.value);
    }
    return control.value;
}

function updateMultiEnumSummary(control) {
    const values = Array.from(control.querySelectorAll('input:checked'), input => input.value);
    control.querySelector('summary').textContent = values.join(', ') || 'Select';
}

function setControlValue(control, parameter, value) {
    if (parameter.control === 'enum' && parameter.multiple) {
        const selected = new Set(Array.isArray(value) ? value : [value]);
        control.querySelectorAll('input').forEach(input => { input.checked = selected.has(input.value); });
        updateMultiEnumSummary(control);
    } else {
        control.value = value;
    }
}

function createControl(parameter) {
    let control;
    if (parameter.control === 'enum') {
        if (parameter.multiple) {
            control = document.createElement('details');
            control.className = 'endpoint-control multi-enum';
            control.append(document.createElement('summary'));
            const options = element('div', 'multi-enum-options');
            const defaults = new Set(parameter.defaultValue || []);
            for (const option of parameter.options || []) {
                const label = element('label', 'multi-enum-option');
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.value = option.value;
                input.checked = defaults.has(option.value);
                label.append(input, document.createTextNode(option.label || option.value));
                options.append(label);
            }
            control.append(options);
            control.addEventListener('change', () => updateMultiEnumSummary(control));
            updateMultiEnumSummary(control);
        } else {
            control = document.createElement('select');
            for (const option of parameter.options || []) {
                const optionNode = document.createElement('option');
                optionNode.value = option.value;
                optionNode.textContent = option.label || option.value;
                optionNode.selected = String(parameter.defaultValue ?? '') === String(option.value);
                control.append(optionNode);
            }
        }
    } else {
        control = document.createElement('input');
        control.type = parameter.control === 'number' ? 'number' : 'text';
        control.value = parameter.defaultValue ?? '';
        if (parameter.min !== undefined) control.min = parameter.min;
        if (parameter.max !== undefined) control.max = parameter.max;
    }
    control.name = parameter.name;
    control.required = parameter.required === true;
    control.classList.add('endpoint-control');
    control.setAttribute('aria-label', parameter.label || parameter.name);
    control.title = parameter.label || parameter.name;
    return control;
}

function renderEndpoint(endpoint) {
    const card = element('article', 'endpoint-row');
    const heading = element('h2', 'endpoint-title', endpoint.title || endpoint.path);
    heading.title = `${(endpoint.method || ['get']).join(', ').toUpperCase()} ${endpoint.path}`;

    const parameters = endpoint.parameters || [];
    if (parameters.length === 0) {
        const link = element('a', 'endpoint-link', `${window.location.origin}${endpoint.path}`);
        link.href = endpoint.path;
        link.target = '_blank';
        link.rel = 'noopener';
        card.append(
            heading,
            link,
            element('div', 'parameters'),
            createCopyButton(() => `${window.location.origin}${endpoint.path}`)
        );
        return card;
    }

    const controls = new Map();
    const form = element('div', 'parameters');
    let variantSelect;
    for (const parameter of parameters) {
        const field = element('label', 'parameter');
        field.append(element('span', 'parameter-label', parameter.name));
        const control = createControl(parameter);
        controls.set(parameter.name, control);
        field.append(control);
        if (parameter.variantControlled !== true) form.append(field);
    }

    if ((endpoint.variants || []).length > 0) {
        const field = element('label', 'parameter variant');
        field.append(element('span', 'parameter-label', 'variant'));
        variantSelect = document.createElement('select');
        variantSelect.className = 'endpoint-control';
        variantSelect.setAttribute('aria-label', 'Variant');
        variantSelect.title = 'Variant';
        variantSelect.append(new Option('Default', 'default'));
        endpoint.variants.forEach((variant, index) => variantSelect.append(new Option(variant.label, String(index))));
        variantSelect.addEventListener('change', () => {
            const values = variantSelect.value === 'default'
                ? Object.fromEntries(parameters.map(parameter => [parameter.name, parameter.defaultValue ?? '']))
                : endpoint.variants[Number(variantSelect.value)]?.values;
            if (!values) return;
            for (const [name, value] of Object.entries(values)) {
                const control = controls.get(name);
                const parameter = parameters.find(item => item.name === name);
                if (!control || !parameter) continue;
                setControlValue(control, parameter, value);
            }
            update();
        });
        field.append(variantSelect);
        form.prepend(field);
    }

    const link = element('a', 'endpoint-link');
    link.target = '_blank';
    link.rel = 'noopener';
    const copy = createCopyButton(() => link.href);
    card.append(heading, link, form, copy);

    function update() {
        const values = Object.fromEntries(parameters.map(parameter => [
            parameter.name,
            readControl(controls.get(parameter.name), parameter)
        ]));
        const result = buildEndpointUrl(endpoint, values, window.location.origin);
        link.textContent = result.valid ? result.url : endpoint.path;
        link.href = result.valid ? result.url : '';
        link.classList.toggle('disabled', !result.valid);
        link.setAttribute('aria-disabled', String(!result.valid));
        copy.disabled = !result.valid;
        card.classList.toggle('invalid', !result.valid);
        card.title = result.errors.join('. ');
    }

    controls.forEach(control => {
        const onChange = () => update();
        control.addEventListener('input', onChange);
        control.addEventListener('change', onChange);
    });
    update();
    return card;
}

function createCopyButton(getUrl) {
    const button = element('button', 'copy-button', 'Copy');
    button.type = 'button';
    button.addEventListener('click', async () => {
        try {
            await copyText(getUrl());
            button.textContent = 'Copied';
        } catch {
            button.textContent = 'Copy failed';
        }
        window.setTimeout(() => { button.textContent = 'Copy'; }, 1500);
    });
    return button;
}

async function copyText(value) {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(value);
            return;
        } catch {
            // HTTP pages on a local network may not have clipboard permission.
        }
    }
    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.append(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('Clipboard is unavailable');
}

async function loadCatalog() {
    const container = document.querySelector('#endpoint-list');
    try {
        const response = await fetch('/endpoints');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        container.replaceChildren(...data.routes.map(renderEndpoint));
    } catch (error) {
        container.textContent = `Failed to load endpoints: ${error.message}`;
    }
}

loadCatalog();
