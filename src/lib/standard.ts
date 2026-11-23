/*
 * The commands of the shared catalog of ioBroker.assistant (HELP.md, family `tv`): `getApps`, `launchApp`, `remote`,
 * `power` and `setChannel` answer in its form. Pure helpers, so that they can be tested without a TV.
 */
import type { InstalledTvApp } from './apps';
import { parseScene } from './scenes';

/** A failed answer: `reason` is a code of the catalog */
export interface StandardError {
    error: string;
    reason: string;
    candidates?: string[];
}

function fold(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * The Samsung key code of a key: a key name of the catalog (`up`, `ok`, `back`, `volumeUp`, `channelDown`, `0`-`9`
 * ...), a name of `TV_KEYS` of the type-detector or an alias the scenes know, or a Samsung key code (`KEY_HOME`).
 *
 * @param key the key of the message
 * @returns the key code, or null if it is no key
 */
export function remoteKeyOf(key: unknown): string | null {
    const text = typeof key === 'number' ? String(key) : typeof key === 'string' ? key.trim() : '';
    if (!text || /[,;\n]/.test(text)) {
        return null;
    }
    try {
        // volumeUp -> volume_Up -> VOLUME_UP, channelDown -> CHANNEL_DOWN
        const steps = parseScene(text.replace(/([a-z0-9])([A-Z])/g, '$1_$2'), []);
        return steps.length === 1 && steps[0].type === 'key' ? steps[0].key : null;
    } catch {
        return null;
    }
}

/**
 * The installed app a message means: its key (`NETFLIX`) or its name (`Netflix`, `prime video`), case and spaces do
 * not count; else the only app whose name contains the text.
 *
 * @param apps the apps installed on the TV
 * @param wanted key or name
 */
export function appOf(apps: InstalledTvApp[], wanted: unknown): InstalledTvApp | StandardError {
    const text = typeof wanted === 'string' ? wanted.trim() : '';
    const names = apps.map(app => app.name);
    if (!text) {
        return { error: 'Which app? Give app', reason: 'BAD_REQUEST', candidates: names };
    }
    const exact = apps.find(app => app.key === text);
    if (exact) {
        return exact;
    }
    const name = fold(text);
    const same = apps.find(app => fold(app.key) === name || fold(app.name) === name);
    if (same) {
        return same;
    }
    const partial = apps.filter(app => name && fold(app.name).includes(name));
    if (partial.length === 1) {
        return partial[0];
    }
    if (partial.length > 1) {
        return { error: `"${text}" fits several apps`, reason: 'AMBIGUOUS', candidates: partial.map(app => app.name) };
    }
    return {
        error: `App ${text} is not installed on the TV${apps.length ? '' : ' (or the TV is off)'}`,
        reason: 'NOT_FOUND',
        candidates: names,
    };
}

/**
 * The digit keys of a channel number (the TV switches to it after the last digit, while it shows live TV)
 *
 * @param channel a number like 7 or "21"
 * @returns the keys, or null if it is no channel number
 */
export function channelKeys(channel: unknown): string[] | null {
    const text = typeof channel === 'number' ? String(channel) : typeof channel === 'string' ? channel.trim() : '';
    if (!/^\d{1,4}$/.test(text)) {
        return null;
    }
    return [...text].map(digit => `KEY_${digit}`);
}

/**
 * `on` of the message power: true / false, also "true", "on", 1 and their opposites
 *
 * @param on the value
 * @returns the wanted state, or undefined if it is none
 */
export function powerOf(on: unknown): boolean | undefined {
    if (on === true || on === 1 || on === 'true' || on === 'on' || on === '1') {
        return true;
    }
    if (on === false || on === 0 || on === 'false' || on === 'off' || on === '0') {
        return false;
    }
    return undefined;
}

/**
 * The catalog code of an error of the TV
 *
 * @param message the text of the error
 */
export function reasonOf(message: string): string | undefined {
    if (/does not answer|No connection|ECONNREFUSED|EHOSTUNREACH|ETIMEDOUT|ENETUNREACH|socket hang up/i.test(message)) {
        return 'NOT_CONNECTED';
    }
    if (/not installed|no such scene/i.test(message)) {
        return 'NOT_FOUND';
    }
    return undefined;
}
