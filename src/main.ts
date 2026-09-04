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

    public constructor(options: Partial<AdapterOptions> = {}) {
        super({ ...options, name: 'samsung_tizen' });

        this.on('ready', () => this.onReady());
        this.on('stateChange', (id, state) => this.onStateChange(id, state));
        this.on('unload', callback => this.onUnload(callback));
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

        this.subscribeStates('control.*');
        this.subscribeStates('apps.*');
        this.subscribeStates('command.*');
        this.subscribeStates('config.*');

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
