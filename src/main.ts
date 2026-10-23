/*
 * ioBroker.samsung_tizen
 *
 * Controls Samsung TVs with TizenOS (model year >= 2016) over the
 * `samsung.remote.control` websocket API.
 *
 * The MIT License (MIT)
 * Copyright (c) 2019-2025 DaHuby <michael.hubeny@me.com>
 */
import { Adapter, type AdapterOptions } from '@iobroker/adapter-core';
import WebSocket from 'ws';
import { wake } from 'wake_on_lan';

import { type InstalledTvApp, SAMSUNG_APPS, findInstalledApps, launchApp } from './lib/apps';
import { discoverTvs, readDeviceInfo } from './lib/discover';
import { parseScene, runScene, sceneId } from './lib/scenes';
import { type ConnectionParams, PairingError, pair, sendTestKey } from './lib/pairing';
import { keys } from './lib/remotekeys';
import type { TvEventMessage } from './lib/types';

/** Name this client announces to the TV — shown in the TV's device connection manager */
const REMOTE_NAME = 'ioBroker';
/** Path of the remote control websocket endpoint */
const REMOTE_PATH = '/api/v2/channels/samsung.remote.control';
/** Number of retries before a command is given up */
const MAX_RETRIES = 5;
/** Delay between two retries in ms */
const RETRY_DELAY = 2_000;
/** How long a key of the remote control tab may take before the button reports an error, in ms */
const REMOTE_TIMEOUT = 5_000;
/** Remote keys are sent as given, so only accept what looks like one */
const KEY_PATTERN = /^KEY_[A-Z0-9_]+$/;
/** Pause between two steps of a scene if the settings name none, in ms */
const DEFAULT_SCENE_DELAY = 500;
/** An IP address or a host name from the setup assistant - it ends up in a URL */
const HOST_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/;

/** Callback style used throughout this adapter: `null` means success */
type DoneCallback = (error: Error | null) => void;

/** `ws` delivers a Buffer by default, but `RawData` allows more than that — normalize it to a string */
function rawDataToString(data: WebSocket.RawData): string {
    if (Buffer.isBuffer(data)) {
        return data.toString();
    }
    if (Array.isArray(data)) {
        return Buffer.concat(data).toString();
    }
    return Buffer.from(data).toString();
}

/** `common.name` may be a translated object; the states of this adapter always carry a plain string */
function nameToString(name: ioBroker.StringOrTranslated | undefined): string {
    if (typeof name === 'string') {
        return name;
    }
    return name?.en ?? '';
}

class SamsungTizen extends Adapter {
    /** Remote control websocket, kept open between commands */
    private ws: WebSocket | null = null;
    /** Interval that polls the power state of the TV */
    private pollingTimer: ioBroker.Interval | null = null;
    /** Set in `onUnload` so that pending retries do not reconnect during shutdown */
    private unloaded = false;
    /** Apps found on the TV - asking for all known app IDs takes a moment, so it is done once */
    private installedApps: InstalledTvApp[] | null = null;

    public constructor(options: Partial<AdapterOptions> = {}) {
        super({ ...options, name: 'samsung_tizen' });

        this.on('ready', () => this.onReady());
        this.on('stateChange', (id, state) => this.onStateChange(id, state));
        this.on('message', obj => void this.onMessage(obj));
        this.on('unload', callback => this.onUnload(callback));
    }

    /**
     * Messages of the configuration dialog:
     * - `discover`: list of the TVs found in the network, for the `autocompleteSendTo` of the IP address
     * - `searchTv`: IP address, MAC address, protocol and port of the first TV found, written into the form via `useNative`
     * - `readDeviceInfo`: MAC address of the TV at `ip`, written into the form via `useNative`
     * - `remote`: send the key `key` - the buttons of the remote control tab
     * - `wake`: Wake-on-LAN to `mac` or, without it, to the configured MAC address
     * - `apps`: the known apps installed on the TV (`refresh: true` asks the TV again)
     * - `launchApp`: start the app `app` (a key of `TV_APPS`, e.g. `YOUTUBE`)
     * - `scenes`: the scenes of the settings, `runScene`: run the scene `scene` (its state ID)
     *
     * The setup assistant works with the data being entered, not with the saved configuration:
     * - `listTvs`: all TVs found, with name, model, MAC address and power state
     * - `deviceInfo`: the same for the TV at `ip`
     * - `pair`: connect to `ip` without a token, so the TV asks the user, and answer with the token
     * - `testKey`: send `key` (default `KEY_INFO`) with `ip`, `protocol`, `port` and `token`
     */
    private async onMessage(obj: ioBroker.Message): Promise<void> {
        if (!obj?.callback) {
            return;
        }
        const message = (obj.message ?? {}) as {
            ip?: string;
            key?: string;
            mac?: string;
            protocol?: string;
            port?: string | number;
            token?: string;
            app?: string;
            refresh?: boolean;
            scene?: string;
        };
        let response: unknown;

        try {
            switch (obj.command) {
                case 'scenes':
                    response = {
                        scenes: [...this.scenes].map(([id, scene]) => ({ id, name: scene.name })),
                    };
                    break;
                case 'runScene':
                    await this.runSceneById(String(message.scene ?? ''));
                    response = {};
                    break;
                case 'apps': {
                    const apps = await this.getInstalledApps(!!message.refresh);
                    response = { apps: apps.map(({ key, name }) => ({ key, name })) };
                    break;
                }
                case 'launchApp': {
                    const app = (await this.getInstalledApps(false)).find(entry => entry.key === message.app);
                    if (!app) {
                        response = { error: `App ${message.app} is not installed on the TV` };
                        break;
                    }
                    await launchApp(this.config.ipAddress, app.appId);
                    this.log.debug(`remote control tab: app ${app.name} started`);
                    response = {};
                    break;
                }
                case 'listTvs':
                    response = { tvs: await discoverTvs() };
                    break;
                case 'deviceInfo': {
                    const ip = (message.ip ?? '').trim();
                    const device = HOST_PATTERN.test(ip) ? await readDeviceInfo(ip) : null;
                    response = device
                        ? { device }
                        : {
                              error: 'No Samsung TV answers at this address. Is the TV switched on?',
                              code: 'unreachable',
                          };
                    break;
                }
                case 'pair':
                case 'testKey': {
                    const params = this.connectionParams(message);
                    if (!params) {
                        response = { error: 'Invalid connection data', code: 'protocol' };
                        break;
                    }
                    if (obj.command === 'pair') {
                        this.log.info(`Pairing with the TV at ${params.ip} - please allow the connection on the TV`);
                        const token = await pair(params);
                        this.log.info('Pairing done, the token is handed to the settings');
                        response = { token };
                    } else {
                        const key = message.key ?? 'KEY_INFO';
                        if (!KEY_PATTERN.test(key)) {
                            response = { error: `Unknown key ${key}`, code: 'protocol' };
                            break;
                        }
                        await sendTestKey(params, key);
                        response = {};
                    }
                    break;
                }
                case 'discover': {
                    const tvs = await discoverTvs();
                    response = tvs.map(tv => ({
                        label: `${tv.name || tv.model} (${tv.model}) - ${tv.ip}`,
                        value: tv.ip,
                    }));
                    break;
                }
                case 'searchTv': {
                    const [tv] = await discoverTvs();
                    if (!tv) {
                        response = { error: 'No Samsung TV found. Is it switched on and in the same network?' };
                        break;
                    }
                    this.log.info(`TV found: ${tv.name} (${tv.model}) at ${tv.ip}`);
                    response = {
                        native: {
                            ipAddress: tv.ip,
                            // keep what the user entered if the TV does not tell
                            macAddress: tv.mac || this.config.macAddress,
                            // TVs that hand out a token only accept the secure websocket
                            protocol: tv.tokenAuthSupport ? 'wss' : 'http',
                            port: tv.tokenAuthSupport ? '8002' : '8001',
                        },
                    };
                    break;
                }
                case 'readDeviceInfo': {
                    const ip = (message.ip ?? '').trim();
                    const tv = ip ? await readDeviceInfo(ip) : null;
                    if (!tv) {
                        response = { error: 'No Samsung TV answers at this address. Is the TV switched on?' };
                    } else if (!tv.mac) {
                        response = { error: 'The TV does not report its MAC address' };
                    } else {
                        response = { native: { macAddress: tv.mac } };
                    }
                    break;
                }
                case 'remote': {
                    const key = String(message.key ?? '');
                    if (!KEY_PATTERN.test(key)) {
                        response = { error: `Unknown key ${key}` };
                        break;
                    }
                    await this.sendKeyNow(key);
                    // no `result`: admin would show it in an alert after every key
                    response = {};
                    break;
                }
                case 'wake': {
                    const mac = message.mac ?? this.config.macAddress;
                    if (!mac || mac === '0') {
                        response = { error: 'No MAC address configured' };
                        break;
                    }
                    // throws synchronously on a malformed MAC address
                    wake(mac);
                    response = {};
                    break;
                }
                default:
                    response = { error: `Unknown command ${obj.command}` };
            }
        } catch (e) {
            response =
                e instanceof PairingError
                    ? { error: e.message, code: e.code }
                    : { error: (e as Error).message, code: 'protocol' };
        }

        this.sendTo(obj.from, obj.command, response, obj.callback);
    }

    /** The scenes of the settings with a valid name, keyed by their state ID */
    private get scenes(): Map<string, { name: string; steps: string; delay: number }> {
        const scenes = new Map<string, { name: string; steps: string; delay: number }>();
        for (const scene of Array.isArray(this.config.scenes) ? this.config.scenes : []) {
            const id = sceneId(scene?.name);
            if (id && !scenes.has(id)) {
                const delay = parseFloat(String(scene.delay ?? ''));
                scenes.set(id, {
                    name: scene.name.trim(),
                    steps: scene.steps ?? '',
                    delay: Number.isFinite(delay) && delay >= 0 ? delay : DEFAULT_SCENE_DELAY,
                });
            }
        }
        return scenes;
    }

    /** One button per scene under `scenes.*`; buttons of scenes that are gone from the settings are deleted */
    private async createSceneStates(): Promise<void> {
        const scenes = this.scenes;
        if (scenes.size) {
            await this.setObjectNotExistsAsync('scenes', {
                type: 'channel',
                common: { name: 'Scenes' },
                native: {},
            });
        }
        for (const [id, scene] of scenes) {
            try {
                parseScene(scene.steps, Object.keys(SAMSUNG_APPS));
            } catch (e) {
                this.log.warn(`Scene "${scene.name}": ${(e as Error).message}`);
            }
            await this.setObject(`scenes.${id}`, {
                type: 'state',
                common: { name: scene.name, type: 'boolean', role: 'button', read: false, write: true },
                native: { steps: scene.steps },
            });
        }
        const existing = await this.getStatesOfAsync('scenes');
        for (const obj of existing ?? []) {
            const id = obj._id.split('.').pop() ?? '';
            if (!scenes.has(id)) {
                await this.delObjectAsync(obj._id);
            }
        }
    }

    /** Run the scene with the state ID `id` */
    private async runSceneById(id: string): Promise<void> {
        const scene = this.scenes.get(id);
        if (!scene) {
            throw new Error('There is no such scene in the settings');
        }
        const steps = parseScene(scene.steps, Object.keys(SAMSUNG_APPS));
        this.log.info(`Scene "${scene.name}": ${steps.length} steps`);
        await runScene(steps, scene.delay, {
            sendKey: key => this.sendKeyNow(key),
            launchApp: async key => {
                const app = (await this.getInstalledApps(false)).find(entry => entry.key === key);
                if (!app) {
                    throw new Error(`App ${key} is not installed on the TV`);
                }
                await launchApp(this.config.ipAddress, app.appId);
            },
            sleep: ms => new Promise(resolve => this.setTimeout(resolve, ms)),
        });
    }

    /**
     * The known apps installed on the TV. Asked once and kept, because it takes one request per known app ID;
     * an empty answer - the TV was off - is not kept.
     */
    private async getInstalledApps(refresh: boolean): Promise<InstalledTvApp[]> {
        if (!this.installedApps?.length || refresh) {
            this.installedApps = HOST_PATTERN.test(this.config.ipAddress)
                ? await findInstalledApps(this.config.ipAddress)
                : [];
        }
        return this.installedApps;
    }

    /** Validated connection data of the setup assistant - it ends up in a URL */
    private connectionParams(message: {
        ip?: string;
        protocol?: string;
        port?: string | number;
        token?: string;
    }): ConnectionParams | null {
        const ip = (message.ip ?? '').trim();
        const protocol = message.protocol === 'http' ? 'http' : 'wss';
        const port = Number(message.port ?? (protocol === 'wss' ? 8002 : 8001));
        if (!HOST_PATTERN.test(ip) || !Number.isInteger(port) || port < 1 || port > 65535) {
            return null;
        }
        return { ip, protocol, port, name: REMOTE_NAME, token: message.token };
    }

    /** Send one key and resolve once it is written to the websocket - for the remote control tab */
    private sendKeyNow(key: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const pending: { settled: boolean; timer?: ioBroker.Timeout } = { settled: false };
            const finish = (err: Error | null): void => {
                if (pending.settled) {
                    return;
                }
                pending.settled = true;
                if (pending.timer) {
                    this.clearTimeout(pending.timer);
                }
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            };
            pending.timer = this.setTimeout(
                () => finish(new Error('The TV does not answer. Is it switched on and the token accepted?')),
                REMOTE_TIMEOUT,
            );

            this.wsConnect(err => {
                if (err || !this.ws) {
                    finish(err ?? new Error('No connection to the TV'));
                    return;
                }
                this.ws.send(
                    JSON.stringify({
                        method: 'ms.remote.control',
                        params: { Cmd: 'Click', DataOfCmd: key, Option: 'false', TypeOfRemote: 'SendRemoteKey' },
                    }),
                    sendErr => finish(sendErr ?? null),
                );
                this.log.debug(`remote control tab: ${key} sent to tv`);
            });
        });
    }

    private async onReady(): Promise<void> {
        for (const entry of keys) {
            await this.setObject(entry.object, {
                type: 'state',
                common: {
                    name: entry.name,
                    type: 'boolean',
                    role: 'button',
                    read: false,
                    write: true,
                },
                native: {},
            });
        }

        await this.setObject('control.sendCmd', {
            type: 'state',
            common: {
                name: 'send multiple keys separated with ","',
                type: 'string',
                role: 'state',
                read: true,
                write: true,
            },
            native: {},
        });

        if (parseFloat(this.config.pollingInterval) > 0) {
            await this.startPowerStatePolling();
        }

        await this.createSceneStates();

        this.subscribeStates('control.*');
        this.subscribeStates('apps.*');
        this.subscribeStates('command.*');
        this.subscribeStates('config.*');
        this.subscribeStates('scenes.*');

        this.log.info(`${this.namespace} started with config : ${JSON.stringify(this.config)}`);
    }

    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        // States are deleted with `state === null`; there is nothing to send then
        if (!state) {
            return;
        }
        const key = id.split('.');
        const channel = key[2];
        const name = key[3]?.toUpperCase();

        if (id === `${this.namespace}.apps.getInstalledApps`) {
            this.getApps(0);
        }
        if (channel === 'apps' && id !== `${this.namespace}.apps.getInstalledApps`) {
            // object id is `apps.start_<app name>`
            const app = key[3].split('_');
            this.startApp(app[1], 0);
        }
        if (channel === 'command') {
            void this.getForeignObjectAsync(id).then(
                obj => {
                    if (obj) {
                        // the key sequence of a command is stored in `common.name`
                        this.sendCmd(nameToString(obj.common.name).split(','), 0);
                    }
                },
                (e: unknown) => this.log.error((e as Error).message),
            );
        }
        if (channel === 'config' && key[3] === 'getToken') {
            this.getToken();
        }
        if (channel === 'scenes' && !state.ack && key[3]) {
            void this.runSceneById(key[3]).catch((e: unknown) =>
                this.log.error(`Scene ${key[3]}: ${(e as Error).message}`),
            );
        }
        if (name === 'SENDCMD') {
            this.sendCmd(String(state.val ?? '').split(','), 0);
        }
        if (name === 'KEY_POWERON' || name === 'KEY_POWEROFF') {
            void this.onOff(name);
        } else if (channel === 'control' && name) {
            this.sendKey(name, 0);
        }
    }

    private onUnload(callback: () => void): void {
        this.unloaded = true;
        try {
            if (this.pollingTimer) {
                this.clearInterval(this.pollingTimer);
                this.pollingTimer = null;
            }
            if (this.ws) {
                this.ws.removeAllListeners();
                this.ws.close();
                this.ws = null;
            }
        } catch {
            // ignore
        }
        callback();
    }

    /** Create the `powerOn` state and poll the TV for its power state */
    private async startPowerStatePolling(): Promise<void> {
        await this.setObject('powerOn', {
            type: 'state',
            common: {
                name: 'power state of TV',
                type: 'boolean',
                role: 'state',
                read: true,
                write: false,
            },
            native: {},
        });

        this.pollingTimer =
            this.setInterval(() => void this.getPowerStateInstant(), parseFloat(this.config.pollingInterval) * 1_000) ??
            null;
    }

    /** Check whether the polling port answers and write the result to `powerOn` */
    private async getPowerStateInstant(): Promise<boolean> {
        // `is-port-reachable` is an ESM only package and cannot be `require`d from this CommonJS build
        const { default: isPortReachable } = await import('is-port-reachable');

        const response = await isPortReachable(parseFloat(this.config.pollingPort), {
            host: this.config.ipAddress,
        });

        try {
            await this.setState('powerOn', response, true);
        } catch (e) {
            this.log.error((e as Error).message);
        }

        return response;
    }

    /** URL of the remote control websocket */
    private buildRemoteUrl(withToken: boolean): string {
        let url = `${this.config.protocol}://${this.config.ipAddress}:${this.config.port}${REMOTE_PATH}?name=${Buffer.from(REMOTE_NAME).toString('base64')}`;

        if (withToken && parseFloat(this.config.token) > 0) {
            url = `${url}&token=${this.config.token}`;
        }

        return url;
    }

    /** Open the remote control websocket, or report success right away if it is already open */
    private wsConnect(done: DoneCallback): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            const wsUrl = this.buildRemoteUrl(true);
            this.log.info(`open connection: ${wsUrl}`);

            this.ws = new WebSocket(wsUrl, { rejectUnauthorized: false });

            this.ws.on('error', e => done(e));

            this.ws.on('message', (data: WebSocket.RawData): void => {
                const text = rawDataToString(data);
                if (!text.includes('event')) {
                    return;
                }
                const message = JSON.parse(text) as TvEventMessage;
                if (message.event === 'ms.channel.connect') {
                    done(null);
                }
            });
        } else {
            done(null);
        }
    }

    /**
     * Close the websocket after a failed command and decide whether it is worth another attempt.
     * The first attempt tries to wake the TV via Wake-on-LAN, the following ones just wait.
     */
    private wsError(func: string, action: string, err: Error, x: number, done: DoneCallback): void {
        if (this.ws && this.ws.readyState > WebSocket.CONNECTING) {
            this.ws.close();
            this.log.info('websocket connection closed');
        }

        if (x === 0) {
            if (this.config.macAddress !== '0') {
                this.log.info(
                    `Error while: ${func}, action: ${action} error: ${err.message} retry 1/${MAX_RETRIES} will be executed`,
                );
                this.log.info(`Will now try to switch TV with MAC: ${this.config.macAddress} on`);
                wake(this.config.macAddress);
                done(null);
            }
            if (parseFloat(this.config.macAddress) === 0) {
                done(null);
            }
        } else if (x < MAX_RETRIES) {
            this.setTimeout(() => {
                x++;
                this.log.info(
                    `Error while: ${func}, action: ${action}  error: ${err.message} retry ${x}/${MAX_RETRIES} will be executed`,
                );
                done(null);
            }, RETRY_DELAY);
        } else if (x > MAX_RETRIES - 1) {
            const text = `Error while: ${func}, action: ${action} error: ${err.message} maximum retries reached`;
            this.log.info(text);
            done(new Error(text));
        }
    }

    /** Ask the TV for a pairing token and store it in `common.name` of `config.token` */
    private getToken(): void {
        const wsUrl = this.buildRemoteUrl(false);
        this.log.info(`open connection: ${wsUrl}`);

        this.ws = new WebSocket(wsUrl, { rejectUnauthorized: false });

        this.ws.on('error', e => this.log.info(e.message));

        this.ws.on('message', (data: WebSocket.RawData): void => {
            const message = JSON.parse(rawDataToString(data)) as TvEventMessage;
            if (message.event === 'ms.channel.connect') {
                this.log.info(`getToken done, token: ${message.data?.token}`);
                // the token is intentionally stored as the object name, not as the state value
                void this.setObject('config.token', {
                    type: 'state',
                    common: {
                        name: message.data?.token ?? '',
                        type: 'string',
                        role: 'state',
                        read: true,
                        write: true,
                    },
                    native: {},
                });
            }
        });
    }

    /** Send a single remote key to the TV */
    private sendKey(key: string, x: number): void {
        this.wsConnect(err => {
            if (err) {
                this.log.info(err.message);
                this.wsError('sendKey', key, err, x, error => {
                    if (!error && !this.unloaded) {
                        x++;
                        // KEY_POWER is not repeated, otherwise a retry would toggle the TV off again
                        if (key !== 'KEY_POWER') {
                            this.sendKey(key, x);
                        }
                    }
                });
            }
            if (!err) {
                this.ws?.send(
                    JSON.stringify({
                        method: 'ms.remote.control',
                        params: { Cmd: 'Click', DataOfCmd: key, Option: 'false', TypeOfRemote: 'SendRemoteKey' },
                    }),
                );
                this.log.info(`sendKey: ${key} successfully sent to tv`);
            }
        });
    }

    /** Send a sequence of remote keys, separated by `cmdDelay` milliseconds */
    private sendCmd(cmd: string[], x: number): void {
        this.wsConnect(err => {
            if (err) {
                this.wsError('sendCommand', cmd.join(','), err, x, error => {
                    if (!error && !this.unloaded) {
                        if (cmd[x] === 'KEY_POWERON') {
                            cmd.splice(x, 1);
                            if (x <= cmd.length) {
                                this.log.info(`sendCommand: ${cmd.join(',')} successfully sent to tv`);
                            }
                        }
                        x++;
                        this.sendCmd(cmd, x);
                    }
                });
            }
            if (!err) {
                const loop = (i: number): void => {
                    if (i >= cmd.length) {
                        return;
                    }
                    this.commandDelay(() => {
                        // only skip while the socket is still connecting
                        if (!this.ws || this.ws.readyState === WebSocket.CONNECTING) {
                            return;
                        }
                        if (cmd[i] === 'KEY_POWERON' || cmd[i] === 'KEY_POWEROFF') {
                            void this.onOff(cmd[i]);
                        } else {
                            this.ws.send(
                                JSON.stringify({
                                    method: 'ms.remote.control',
                                    params: {
                                        Cmd: 'Click',
                                        DataOfCmd: cmd[i],
                                        Option: 'false',
                                        TypeOfRemote: 'SendRemoteKey',
                                    },
                                }),
                            );
                            this.log.info(`sendKey: ${cmd[i]} successfully sent to tv`);
                        }
                        i++;
                        if (i === cmd.length) {
                            this.log.info(`sendCommand: ${cmd.join(',')} successfully sent to tv`);
                        }
                        loop(i);
                    });
                };

                loop(0);
            }
        });
    }

    /** Switch the TV on or off, but only if it is not already in that state */
    private async onOff(key: string): Promise<void> {
        const res = await this.getPowerStateInstant();

        if (key === 'KEY_POWERON') {
            if (!res) {
                this.sendKey('KEY_POWER', 0);
            } else {
                this.log.info('TV is already on');
            }
        }
        if (key === 'KEY_POWEROFF') {
            if (res) {
                this.sendKey('KEY_POWER', 0);
            } else {
                this.log.info('TV is already off');
            }
        }
    }

    /** Wait `cmdDelay` milliseconds between two keys of a command sequence */
    private commandDelay(done: () => void): void {
        this.setTimeout(done, parseFloat(this.config.cmdDelay));
    }

    /** Read the installed apps from the TV and create a `apps.start_<name>` button for each of them */
    private getApps(x: number): void {
        this.wsConnect(err => {
            if (err) {
                this.wsError('getInstalledApps', 'get', err, x, error => {
                    if (!error && !this.unloaded) {
                        x++;
                        this.getApps(x);
                    }
                });
            }
            if (!err) {
                this.ws?.send(
                    JSON.stringify({ method: 'ms.channel.emit', params: { event: 'ed.installedApp.get', to: 'host' } }),
                );

                const onInstalledApps = (data: WebSocket.RawData): void => {
                    const text = rawDataToString(data);
                    // the socket is shared, so ignore anything that is not the reply we asked for
                    if (!text.includes('ed.installedApp.get')) {
                        return;
                    }
                    this.ws?.removeListener('message', onInstalledApps);

                    const message = JSON.parse(text) as TvEventMessage;
                    for (const app of message.data?.data ?? []) {
                        void this.setObject(`apps.start_${app.name}`, {
                            type: 'state',
                            common: {
                                name: app.appId,
                                type: 'boolean',
                                role: 'button',
                                read: false,
                                write: true,
                            },
                            native: {},
                        });
                    }
                    this.log.info('getInstalledApps successfully sent to tv');
                };

                this.ws?.on('message', onInstalledApps);
            }
        });
    }

    /** Start an app by its display name */
    private startApp(app: string, x: number): void {
        this.wsConnect(err => {
            if (err) {
                this.wsError('startApp', app, err, x, error => {
                    if (!error && !this.unloaded) {
                        x++;
                        this.startApp(app, x);
                    }
                });
            }
            if (!err) {
                this.ws?.send(
                    JSON.stringify({ method: 'ms.channel.emit', params: { event: 'ed.installedApp.get', to: 'host' } }),
                );

                const onInstalledApps = (data: WebSocket.RawData): void => {
                    const text = rawDataToString(data);
                    if (!text.includes('ed.installedApp.get')) {
                        return;
                    }
                    this.ws?.removeListener('message', onInstalledApps);

                    const message = JSON.parse(text) as TvEventMessage;
                    if (message.event === 'ed.installedApp.get') {
                        for (const entry of message.data?.data ?? []) {
                            if (app === entry.name) {
                                this.ws?.send(
                                    JSON.stringify({
                                        method: 'ms.channel.emit',
                                        params: {
                                            event: 'ed.apps.launch',
                                            to: 'host',
                                            data: {
                                                // The original condition `app_type === 1 || 2` is
                                                // always true, so every app is launched as a deep
                                                // link. Kept as is — changing it would change which
                                                // apps still start.
                                                action_type: 'DEEP_LINK',
                                                appId: entry.appId,
                                            },
                                        },
                                    }),
                                );
                                this.log.info(`app: ${app} successfully started`);
                            }
                        }
                    }
                };

                this.ws?.on('message', onInstalledApps);
            }
        });
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<AdapterOptions> | undefined) => new SamsungTizen(options);
} else {
    // otherwise start the instance directly
    (() => new SamsungTizen())();
}
