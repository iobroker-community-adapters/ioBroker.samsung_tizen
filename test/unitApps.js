'use strict';

// Unit tests of app discovery - they need the compiled build/, run `npm run build` first
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const http = require('node:http');
const path = require('node:path');

const { findInstalledApps } = require(path.join(__dirname, '..', 'build', 'lib', 'apps.js'));

describe('apps', () => {
    it('checks apps sequentially and still tries fallback IDs', async () => {
        const originalRequest = http.request;
        const requestedIds = [];
        let activeRequests = 0;
        let maxActiveRequests = 0;

        http.request = (options, callback) => {
            const request = new EventEmitter();
            request.end = () => {
                const appId = decodeURIComponent(options.path.split('/').pop());
                requestedIds.push(appId);
                activeRequests++;
                maxActiveRequests = Math.max(maxActiveRequests, activeRequests);

                setImmediate(() => {
                    const response = new EventEmitter();
                    response.statusCode =
                        appId === '111299001912' || appId === '11101200001' ? 200 : 404;
                    response.resume = () => {};
                    callback(response);
                    setImmediate(() => {
                        activeRequests--;
                        response.emit('end');
                    });
                });
            };
            request.destroy = () => {};
            return request;
        };

        try {
            const apps = await findInstalledApps('192.0.2.1');
            assert.strictEqual(maxActiveRequests, 1);
            assert.deepStrictEqual(
                apps.map(app => ({ key: app.key, appId: app.appId })),
                [
                    { key: 'YOUTUBE', appId: '111299001912' },
                    { key: 'NETFLIX', appId: '11101200001' },
                ],
            );
            assert.deepStrictEqual(requestedIds.slice(0, 3), [
                '111299001912',
                '3201907018807',
                '11101200001',
            ]);
        } finally {
            http.request = originalRequest;
        }
    });
});
