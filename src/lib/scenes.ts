/*
 * Scenes: a named sequence of keys, apps and pauses the user configures in the settings, e.g.
 * `HOME, YOUTUBE, WAIT 3000, OK` - open YouTube and confirm the account selection.
 *
 * A step is
 * - a key: a name of `TV_KEYS` of @iobroker/type-detector (`HOME`, `SELECT`, `BACK`, `NUMBER_1`, ...), a short
 *   alias (`OK`, `ENTER`, `VOLUP`, `0`...`9`) or a Samsung key code (`KEY_HOME`)
 * - an app: a key of `TV_APPS` (`YOUTUBE`, `NETFLIX`, ...), started with the REST API of the TV
 * - a pause: `WAIT 2000` (milliseconds)
 * separated by commas or new lines; case and spaces do not matter.
 */

/** Samsung key code per name of `TV_KEYS` of the type-detector */
export const TV_KEY_CODES: Readonly<Record<string, string>> = {
    UP: 'KEY_UP',
    DOWN: 'KEY_DOWN',
    LEFT: 'KEY_LEFT',
    RIGHT: 'KEY_RIGHT',
    SELECT: 'KEY_ENTER',
    BACK: 'KEY_RETURN',
    EXIT: 'KEY_EXIT',
    HOME: 'KEY_HOME',
    MENU: 'KEY_MENU',
    INFO: 'KEY_INFO',
    GUIDE: 'KEY_GUIDE',
    CHANNEL_UP: 'KEY_CHUP',
    CHANNEL_DOWN: 'KEY_CHDOWN',
    NUMBER_0: 'KEY_0',
    NUMBER_1: 'KEY_1',
    NUMBER_2: 'KEY_2',
    NUMBER_3: 'KEY_3',
    NUMBER_4: 'KEY_4',
    NUMBER_5: 'KEY_5',
    NUMBER_6: 'KEY_6',
    NUMBER_7: 'KEY_7',
    NUMBER_8: 'KEY_8',
    NUMBER_9: 'KEY_9',
    PLAY: 'KEY_PLAY',
    PAUSE: 'KEY_PAUSE',
    STOP: 'KEY_STOP',
    REWIND: 'KEY_REWIND',
    FAST_FORWARD: 'KEY_FF',
    RED: 'KEY_RED',
    GREEN: 'KEY_GREEN',
    YELLOW: 'KEY_YELLOW',
    BLUE: 'KEY_BLUE',
};

/** Short names a user is likely to type, in addition to the names of `TV_KEYS` */
const KEY_ALIASES: Readonly<Record<string, string>> = {
    OK: 'KEY_ENTER',
    ENTER: 'KEY_ENTER',
    RETURN: 'KEY_RETURN',
    SOURCE: 'KEY_SOURCE',
    POWER: 'KEY_POWER',
    MUTE: 'KEY_MUTE',
    VOLUP: 'KEY_VOLUP',
    VOLUME_UP: 'KEY_VOLUP',
    VOLDOWN: 'KEY_VOLDOWN',
    VOLUME_DOWN: 'KEY_VOLDOWN',
    CHUP: 'KEY_CHUP',
    CHDOWN: 'KEY_CHDOWN',
    FF: 'KEY_FF',
    TOOLS: 'KEY_TOOLS',
};

/** Longest pause a step may ask for, in ms */
const MAX_WAIT = 60_000;

export type SceneStep = { type: 'key'; key: string } | { type: 'app'; app: string } | { type: 'wait'; ms: number };

/** One row of the scene table of the settings */
export interface SceneConfig {
    name: string;
    steps: string;
    /** Pause between two steps in ms */
    delay?: number | string;
}

/**
 * Turn the steps of a scene into a list of actions.
 *
 * @param steps the text of the scene, e.g. `HOME, YOUTUBE, WAIT 3000, OK`
 * @param apps the keys of the known apps (`TV_APPS`)
 * @throws {Error} naming the first step that is not understood
 */
export function parseScene(steps: string, apps: readonly string[]): SceneStep[] {
    const result: SceneStep[] = [];
    for (const raw of String(steps ?? '').split(/[,\n;]/)) {
        const token = raw.trim().toUpperCase().replace(/\s+/g, ' ');
        if (!token) {
            continue;
        }
        const wait = /^(?:WAIT|PAUSE|SLEEP) ?(\d+)$/.exec(token);
        if (wait) {
            result.push({ type: 'wait', ms: Math.min(Number(wait[1]), MAX_WAIT) });
            continue;
        }
        const name = token.replace(/ /g, '_');
        if (/^KEY_[A-Z0-9_]+$/.test(name)) {
            result.push({ type: 'key', key: name });
        } else if (TV_KEY_CODES[name]) {
            result.push({ type: 'key', key: TV_KEY_CODES[name] });
        } else if (KEY_ALIASES[name]) {
            result.push({ type: 'key', key: KEY_ALIASES[name] });
        } else if (/^\d$/.test(name)) {
            result.push({ type: 'key', key: `KEY_${name}` });
        } else if (apps.includes(name)) {
            result.push({ type: 'app', app: name });
        } else {
            throw new Error(`Unknown step "${raw.trim()}"`);
        }
    }
    return result;
}

/** State ID of a scene: `scenes.<name>` with only the characters ioBroker allows in an ID */
export function sceneId(name: string): string {
    return String(name ?? '')
        .trim()
        .replace(/[^A-Za-z0-9_-]/g, '_');
}

/** What running a scene needs from the adapter */
export interface SceneRunner {
    sendKey: (key: string) => Promise<void>;
    launchApp: (app: string) => Promise<void>;
    sleep: (ms: number) => Promise<void>;
}

/**
 * Run the steps one after the other, with `delay` ms between two of them.
 *
 * @param steps parsed steps
 * @param delay pause between two steps in ms
 * @param runner the actions of the adapter
 */
export async function runScene(steps: SceneStep[], delay: number, runner: SceneRunner): Promise<void> {
    for (const [i, step] of steps.entries()) {
        if (i > 0 && delay > 0) {
            await runner.sleep(delay);
        }
        if (step.type === 'key') {
            await runner.sendKey(step.key);
        } else if (step.type === 'app') {
            await runner.launchApp(step.app);
        } else {
            await runner.sleep(step.ms);
        }
    }
}
