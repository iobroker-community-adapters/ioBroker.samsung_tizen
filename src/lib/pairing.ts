/*
 * Pairing and a test key for the setup assistant of the settings.
 *
 * Both work with the connection data the user is entering right now - not with the saved configuration
 * of the instance - and with an own short-lived websocket, so the running instance is not disturbed.
 *
 * Pairing = connecting without a token: the TV shows its "allow ioBroker to connect?" dialog and, once the
 * user allows it, answers `ms.channel.connect` with the token. `ms.channel.timeOut` means nobody answered
 * the dialog in time, `ms.channel.unauthorized` that the device is blocked in the device connection manager.
 */
import WebSocket from 'ws';

/** Path of the remote control websocket endpoint */
const REMOTE_PATH = '/api/v2/channels/samsung.remote.control';

/** The connection data of the setup assistant */
export interface ConnectionParams {
    ip: string;
    /** `wss` or `http` (the adapter's name for an unencrypted websocket) */
    protocol: string;
    port: string | number;
    /** Name shown in the device connection manager of the TV - the token belongs to it */
    name: string;
    token?: string;
}

/** Why pairing or the test key failed - the setup assistant shows a hint per code */
export type PairingErrorCode = 'denied' | 'timeout' | 'unreachable' | 'noToken' | 'protocol';

export class PairingError extends Error {
    public readonly code: PairingErrorCode;

    public constructor(code: PairingErrorCode, message: string) {
        super(message);
        this.code = code;
    }
}

/** `ws` delivers a Buffer by default, but `RawData` allows more than that - normalize it to a string */
function rawDataToString(data: WebSocket.RawData): string {
    if (Buffer.isBuffer(data)) {
        return data.toString();
    }
    if (Array.isArray(data)) {
        return Buffer.concat(data).toString();
    }
    return Buffer.from(data).toString();
}

/** Tokens of the TVs are numbers; anything else must not end up in the URL */
function isValidToken(token: string | undefined): token is string {
    return !!token && token !== '0' && /^[A-Za-z0-9_-]{1,128}$/.test(token);
}

/** URL of the remote control websocket for the given connection data */
export function buildUrl(params: ConnectionParams, withToken: boolean): string {
    const name = Buffer.from(params.name).toString('base64');
    let url = `${params.protocol}://${params.ip}:${params.port}${REMOTE_PATH}?name=${name}`;
    if (withToken && isValidToken(params.token)) {
        url += `&token=${params.token}`;
    }
    return url;
}

/**
 * Open a websocket and resolve with it once the TV accepted the connection.
 *
 * @param params connection data
 * @param withToken false to make the TV ask the user
 * @param timeout ms until the attempt is given up
 */
function connect(
    params: ConnectionParams,
    withToken: boolean,
    timeout: number,
): Promise<{ ws: WebSocket; token: string | null }> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(buildUrl(params, withToken), { rejectUnauthorized: false, handshakeTimeout: timeout });
        const pending: { settled: boolean; timer?: NodeJS.Timeout } = { settled: false };
        const finish = (err: PairingError | null, token: string | null = null): void => {
            if (pending.settled) {
                return;
            }
            pending.settled = true;
            clearTimeout(pending.timer);
            if (err) {
                ws.removeAllListeners();
                ws.on('error', () => {});
                ws.terminate();
                reject(err);
            } else {
                resolve({ ws, token });
            }
        };
        pending.timer = setTimeout(() => finish(new PairingError('timeout', 'The TV did not answer in time')), timeout);

        ws.on('message', (data: WebSocket.RawData) => {
            let message: { event?: string; data?: { token?: string | number } };
            try {
                message = JSON.parse(rawDataToString(data));
            } catch {
                return;
            }
            switch (message.event) {
                case 'ms.channel.connect':
                    finish(null, message.data?.token !== undefined ? String(message.data.token) : null);
                    break;
                case 'ms.channel.unauthorized':
                    finish(new PairingError('denied', 'The TV denied the connection'));
                    break;
                case 'ms.channel.timeOut':
                    finish(new PairingError('timeout', 'Nobody allowed the connection on the TV in time'));
                    break;
                case 'ms.error':
                    finish(new PairingError('protocol', 'The TV answered with an error'));
                    break;
                default:
                    // other events at start-up, e.g. ms.remote.touchEnable
                    break;
            }
        });
        ws.on('error', (err: NodeJS.ErrnoException) => {
            const unreachable = ['ECONNREFUSED', 'EHOSTUNREACH', 'ETIMEDOUT', 'ENETUNREACH', 'ECONNRESET'];
            finish(
                unreachable.includes(err.code ?? '')
                    ? new PairingError('unreachable', `The TV is not reachable (${err.code})`)
                    : new PairingError('protocol', err.message),
            );
        });
        ws.on('close', () => finish(new PairingError('protocol', 'The TV closed the connection')));
    });
}

/**
 * Connect without a token, so the TV asks the user, and resolve with the token it hands out.
 * TVs without token support (port 8001) resolve with `'0'`, the adapter's value for "no token".
 *
 * @param params connection data
 * @param timeout ms - the TV itself gives the user about 30 s
 */
export async function pair(params: ConnectionParams, timeout = 40_000): Promise<string> {
    const { ws, token } = await connect(params, false, timeout);
    ws.close();
    if (isValidToken(token ?? undefined)) {
        return token as string;
    }
    if (params.protocol === 'wss') {
        throw new PairingError('noToken', 'The TV accepted the connection but sent no token');
    }
    return '0';
}

/**
 * Send one key with the given connection data and close the connection again.
 *
 * @param params connection data including the token
 * @param key remote key, e.g. `KEY_INFO`
 * @param timeout ms
 */
export async function sendTestKey(params: ConnectionParams, key: string, timeout = 8_000): Promise<void> {
    const { ws } = await connect(params, true, timeout);
    await new Promise<void>((resolve, reject) =>
        ws.send(
            JSON.stringify({
                method: 'ms.remote.control',
                params: { Cmd: 'Click', DataOfCmd: key, Option: 'false', TypeOfRemote: 'SendRemoteKey' },
            }),
            err => (err ? reject(new PairingError('protocol', err.message)) : resolve()),
        ),
    );
    // give the TV a moment to take the key before the socket goes away
    await new Promise(resolve => setTimeout(resolve, 300));
    ws.close();
}
