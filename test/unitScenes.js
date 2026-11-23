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

describe('help', () => {
    const fs = require('node:fs');
    const { COMMANDS, HELP } = require(path.join(__dirname, '..', 'build', 'lib', 'help.js'));

    /** The commands of the switch in `onMessage` of src/main.ts */
    function commandsOfMain() {
        const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
        const start = source.indexOf('private async onMessage(');
        const end = source.indexOf('private get scenes(');
        assert.ok(start > 0 && end > start, 'onMessage found');
        return [...source.slice(start, end).matchAll(/case '([^']+)':/g)].map(m => m[1]);
    }

    it('lists every command onMessage answers, each once', () => {
        const names = COMMANDS.map(c => c.command);
        assert.strictEqual(new Set(names).size, names.length);
        assert.deepStrictEqual([...names].sort(), commandsOfMain().sort());
    });

    it('marks the commands that act on the TV as writing', () => {
        assert.deepStrictEqual(
            COMMANDS.filter(c => c.write)
                .map(c => c.command)
                .sort(),
            ['launchApp', 'pair', 'power', 'remote', 'runScene', 'setChannel', 'testKey', 'wake'],
        );
    });

    it('marks the commands of the shared catalog (ioBroker.assistant HELP.md)', () => {
        const marked = Object.fromEntries(COMMANDS.filter(c => c.standard).map(c => [c.command, c.standard]));
        assert.deepStrictEqual(marked, {
            getApps: 'tv.getApps',
            launchApp: 'tv.launchApp',
            remote: 'tv.remote',
            power: 'tv.power',
            setChannel: 'tv.setChannel',
        });
        for (const c of COMMANDS.filter(c => c.standard)) {
            assert.ok(HELP.includes(`- ${c.command} {`), c.command);
            assert.ok(HELP.includes(c.standard), c.standard);
        }
    });

    it('names every command, every known app and the states an agent needs', () => {
        for (const word of [
            ...COMMANDS.filter(c => c.command !== 'help').map(c => c.command),
            ...APPS,
            'sendTo samsung_tizen.0',
            'powerOn',
            'control.sendCmd',
            'control.KEY_POWERON',
            'How to talk to the user:',
            'ask which TV',
        ]) {
            assert.ok(HELP.includes(word), word);
        }
    });

    it('keeps the lines short', () => {
        for (const line of HELP.split('\n')) {
            assert.ok(line.length <= 120, line);
        }
    });
});

describe('standard commands (shared catalog, family tv)', () => {
    const { appOf, channelKeys, powerOf, reasonOf, remoteKeyOf } = require(
        path.join(__dirname, '..', 'build', 'lib', 'standard.js'),
    );
    const INSTALLED = [
        { key: 'YOUTUBE', name: 'YouTube', appId: '111299001912' },
        { key: 'PRIME_VIDEO', name: 'Prime Video', appId: '3201910019365' },
        { key: 'ARD_MEDIATHEK', name: 'ARD Mediathek', appId: '3201412000679' },
        { key: 'ZDF_MEDIATHEK', name: 'ZDF Mediathek', appId: '3201705012365' },
    ];

    it('maps the key names of the catalog to Samsung key codes', () => {
        const keys = ['up', 'down', 'left', 'right', 'ok', 'back', 'home', 'menu', 'play', 'pause'];
        assert.deepStrictEqual(keys.map(remoteKeyOf), [
            'KEY_UP',
            'KEY_DOWN',
            'KEY_LEFT',
            'KEY_RIGHT',
            'KEY_ENTER',
            'KEY_RETURN',
            'KEY_HOME',
            'KEY_MENU',
            'KEY_PLAY',
            'KEY_PAUSE',
        ]);
        assert.deepStrictEqual(['volumeUp', 'volumeDown', 'mute', 'channelUp', 'channelDown'].map(remoteKeyOf), [
            'KEY_VOLUP',
            'KEY_VOLDOWN',
            'KEY_MUTE',
            'KEY_CHUP',
            'KEY_CHDOWN',
        ]);
        assert.strictEqual(remoteKeyOf('7'), 'KEY_7');
        assert.strictEqual(remoteKeyOf(0), 'KEY_0');
    });

    it('takes the Samsung key codes as before and refuses what is no key', () => {
        assert.strictEqual(remoteKeyOf('KEY_HDMI2'), 'KEY_HDMI2');
        assert.strictEqual(remoteKeyOf('KEY_VOLUP'), 'KEY_VOLUP');
        assert.strictEqual(remoteKeyOf('KEY_HOME,KEY_ENTER'), null);
        assert.strictEqual(remoteKeyOf('WAIT 100'), null);
        assert.strictEqual(remoteKeyOf('YOUTUBE'), null);
        assert.strictEqual(remoteKeyOf('nonsense'), null);
        assert.strictEqual(remoteKeyOf(''), null);
        assert.strictEqual(remoteKeyOf(undefined), null);
    });

    it('finds an app by key or name', () => {
        assert.strictEqual(appOf(INSTALLED, 'YOUTUBE').key, 'YOUTUBE');
        assert.strictEqual(appOf(INSTALLED, 'youtube').key, 'YOUTUBE');
        assert.strictEqual(appOf(INSTALLED, 'Prime Video').key, 'PRIME_VIDEO');
        assert.strictEqual(appOf(INSTALLED, 'prime_video').key, 'PRIME_VIDEO');
        assert.strictEqual(appOf(INSTALLED, 'prime').key, 'PRIME_VIDEO');
        assert.deepStrictEqual(appOf(INSTALLED, 'Mediathek'), {
            error: '"Mediathek" fits several apps',
            reason: 'AMBIGUOUS',
            candidates: ['ARD Mediathek', 'ZDF Mediathek'],
        });
        assert.strictEqual(appOf(INSTALLED, 'Netflix').reason, 'NOT_FOUND');
        assert.deepStrictEqual(appOf(INSTALLED, 'Netflix').candidates, [
            'YouTube',
            'Prime Video',
            'ARD Mediathek',
            'ZDF Mediathek',
        ]);
        assert.match(appOf([], 'Netflix').error, /or the TV is off/);
        assert.strictEqual(appOf(INSTALLED, '').reason, 'BAD_REQUEST');
    });

    it('sends a channel number as digit keys', () => {
        assert.deepStrictEqual(channelKeys(7), ['KEY_7']);
        assert.deepStrictEqual(channelKeys('21'), ['KEY_2', 'KEY_1']);
        assert.deepStrictEqual(channelKeys(' 105 '), ['KEY_1', 'KEY_0', 'KEY_5']);
        assert.strictEqual(channelKeys('ZDF'), null);
        assert.strictEqual(channelKeys('12345'), null);
        assert.strictEqual(channelKeys(-1), null);
        assert.strictEqual(channelKeys(undefined), null);
    });

    it('reads on of power and the reason of an error', () => {
        assert.deepStrictEqual([true, 'true', 'on', 1].map(powerOf), [true, true, true, true]);
        assert.deepStrictEqual([false, 'false', 'off', 0].map(powerOf), [false, false, false, false]);
        assert.strictEqual(powerOf('maybe'), undefined);
        assert.strictEqual(powerOf(undefined), undefined);
        assert.strictEqual(reasonOf('The TV does not answer. Is it switched on?'), 'NOT_CONNECTED');
        assert.strictEqual(reasonOf('connect ECONNREFUSED 192.168.1.5:8002'), 'NOT_CONNECTED');
        assert.strictEqual(reasonOf('App NETFLIX is not installed on the TV'), 'NOT_FOUND');
        assert.strictEqual(reasonOf('The TV refused to start the app (HTTP 404)'), undefined);
    });
});
