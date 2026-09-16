import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
    logRoutes,
    registerEndpoint,
    resetRoutesForTests,
    routes,
    validateDescriptor
} from '../logRoutes.js';
import { buildEndpointUrl } from '../static/endpointUrl.js';
import { apparatusParameter } from '../extensions/vmixLivesportCommon.js';

const sids = {
    name: 'sids', in: 'path', control: 'text', required: true,
    defaultValue: '0', label: 'Stage IDs'
};
const size = {
    name: 'size', in: 'path', control: 'number', required: true,
    defaultValue: 8, min: 1, label: 'Chunk size'
};

test.beforeEach(() => resetRoutesForTests());

test('registerEndpoint registers Express handler and metadata while retaining plain routes', () => {
    const app = express();
    app.get('/data', () => {});
    registerEndpoint(app, {
        method: 'get', path: '/vmix/ag/results/:sids/chunk/:size', title: 'Results',
        parameters: [sids, size]
    }, () => {});
    logRoutes(app);

    assert.deepEqual(routes.map(route => route.path), ['/vmix/ag/results/:sids/chunk/:size', '/data']);
    assert.equal(routes[0].title, 'Results');
    assert.equal(routes[1].parameters, undefined);
});

test('registerEndpoint rejects duplicate routes and incomplete path metadata', () => {
    const app = { get() {} };
    const descriptor = {
        method: 'get', path: '/results/:sids/chunk/:size', parameters: [sids, size]
    };
    registerEndpoint(app, descriptor, () => {});
    assert.throws(() => registerEndpoint(app, descriptor, () => {}), /already registered/);
    assert.throws(() => validateDescriptor({
        method: 'get', path: '/results/:sids/chunk/:size', parameters: [sids]
    }), /does not describe path parameter :size/);
});

test('buildEndpointUrl fills path, multiple enum and query parameters', () => {
    const endpoint = {
        path: '/vmix/ag/results/:sids/:appt/chunk/:size',
        parameters: [
            sids,
            {
                name: 'appt', in: 'path', control: 'enum', required: true, multiple: true,
                separator: '-', options: [{ value: 'FLOOR' }, { value: 'VAULT' }]
            },
            size,
            {
                name: 'sortBy', in: 'query', control: 'enum',
                options: [{ value: 'rank' }, { value: 'TeamID' }]
            }
        ]
    };
    const result = buildEndpointUrl(endpoint, {
        sids: '1-2', appt: ['FLOOR', 'VAULT'], size: 16, sortBy: 'TeamID'
    }, 'http://localhost:3000');
    assert.equal(result.valid, true);
    assert.equal(result.url, 'http://localhost:3000/vmix/ag/results/1-2/FLOOR-VAULT/chunk/16?sortBy=TeamID');
});

test('buildEndpointUrl encodes values, omits empty query and rejects invalid values', () => {
    const endpoint = {
        path: '/result/:sids',
        parameters: [
            sids,
            size,
            { name: 'filter', in: 'query', control: 'text' }
        ].filter(parameter => parameter.name !== 'size')
    };
    assert.equal(buildEndpointUrl(endpoint, { sids: 'A B', filter: '' }).path, '/result/A%20B');
    assert.equal(buildEndpointUrl(endpoint, { sids: '' }).valid, false);
    assert.equal(buildEndpointUrl({
        path: '/chunk/:size', parameters: [size]
    }, { size: 0 }).valid, false);
    assert.equal(buildEndpointUrl({
        path: '/teams',
        parameters: [{
            name: 'sortBy', in: 'query', control: 'enum', defaultValue: '',
            options: [{ value: '', label: 'Default' }, { value: 'rank', label: 'Rank' }]
        }]
    }).path, '/teams');
});

test('apparatus enum uses configured names and localised labels', () => {
    const parameter = apparatusParameter({
        apparatus: {
            1: { name: 'FLOOR', nameLocalised: 'Вольные упражнения' },
            2: { name: 'VAULT' }
        }
    }, true);
    assert.deepEqual(parameter.options, [
        { value: 'FLOOR', label: 'FLOOR — Вольные упражнения' },
        { value: 'VAULT', label: 'VAULT' }
    ]);
    assert.deepEqual(parameter.defaultValue, ['FLOOR']);
});
