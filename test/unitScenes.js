'use strict';

// Unit tests of the scene parser and runner - they need the compiled build/, run `npm run build` first
const assert = require('node:assert');
const path = require('node:path');

const { parseScene, runScene, sceneId, TV_KEY_CODES } = require(
    path.join(__dirname, '..', 'build', 'lib', 'scenes.js'),
);
const { SAMSUNG_APPS } = require(path.join(__dirname, '..', 'build', 'lib', 'apps.js'));

const APPS = Object.keys(SAMSUNG_APPS);

describe('scenes', () => {
    it('parses keys, apps and pauses', () => {
        assert.deepStrictEqual(parseScene('HOME, YOUTUBE, WAIT 3000, OK', APPS), [
            { type: 'key', key: 'KEY_HOME' },
            { type: 'app', app: 'YOUTUBE' },
            { type: 'wait', ms: 3000 },
            { type: 'key', key: 'KEY_ENTER' },
        ]);
    });

    it('accepts the names of TV_KEYS, aliases, digits and Samsung key codes in any case', () => {
        assert.deepStrictEqual(
            parseScene('select; back\nkey_hdmi2, 5, channel up, Volume_Up', APPS).map(step => step.key),
            ['KEY_ENTER', 'KEY_RETURN', 'KEY_HDMI2', 'KEY_5', 'KEY_CHUP', 'KEY_VOLUP'],
        );
    });

    it('limits a pause to a minute and ignores empty steps', () => {
        assert.deepStrictEqual(parseScene(' , pause 999999,,', APPS), [{ type: 'wait', ms: 60000 }]);
    });

    it('names the step it does not understand', () => {
        assert.throws(() => parseScene('HOME, YOUTUBEE, OK', APPS), /Unknown step "YOUTUBEE"/);
    });

    it('maps every name of TV_KEYS of the type-detector to a Samsung key code', () => {
        for (const name of [
            'UP',
            'DOWN',
            'LEFT',
            'RIGHT',
            'SELECT',
            'BACK',
            'HOME',
            'NUMBER_0',
            'FAST_FORWARD',
            'BLUE',
        ]) {
            assert.match(TV_KEY_CODES[name], /^KEY_[A-Z0-9]+$/, name);
        }
    });

    it('makes a state ID out of the name', () => {
        assert.strictEqual(sceneId(' Scene YouTube! '), 'Scene_YouTube_');
    });

    it('runs the steps in order with the delay between them', async () => {
        const log = [];
        await runScene(parseScene('HOME, YOUTUBE, WAIT 3000, OK', APPS), 500, {
            sendKey: async key => log.push(`key ${key}`),
            launchApp: async app => log.push(`app ${app}`),
            sleep: async ms => log.push(`sleep ${ms}`),
        });
        assert.deepStrictEqual(log, [
            'key KEY_HOME',
            'sleep 500',
            'app YOUTUBE',
            'sleep 500',
            'sleep 3000',
            'sleep 500',
            'key KEY_ENTER',
        ]);
    });
});
