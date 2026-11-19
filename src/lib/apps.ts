/*
 * Apps a Samsung Tizen TV can start, keyed like `TV_APPS` of @iobroker/type-detector.
 *
 * Samsung documents no app IDs. These come from community lists (homebridge-samsung-tizen,
 * blog-razrabotchika/homebridge-samsung-tizen-applications); an app has a new ID on newer models now
 * and then, so every app lists all known IDs, newest first. The adapter asks the TV which of them is
 * installed - `GET /api/v2/applications/<id>` answers 200 or 404 - and uses the first one that is.
 *
 * Checked on a Samsung The Frame GQ55LS03BAUXZG (2022): YouTube, Netflix (3201907018807), Disney+
 * (3201901017640), Prime Video (3201910019365), Apple TV, Joyn, RTL+ (3201908018988), ARD Mediathek,
 * ZDF Mediathek, Spotify and Browser (3202010022079) are found and start with `POST`. The launch over the
 * websocket (`ed.apps.launch`) does nothing on that TV, so apps are started with the REST API only.
 */
import http from 'node:http';

/** Port of the REST API of the TV */
const REST_PORT = 8001;

/** Known app IDs per `TV_APPS` key, newest first */
export const SAMSUNG_APPS: Readonly<Record<string, { name: string; ids: string[] }>> = {
    YOUTUBE: { name: 'YouTube', ids: ['111299001912'] },
    NETFLIX: { name: 'Netflix', ids: ['3201907018807', '11101200001'] },
    DISNEY_PLUS: { name: 'Disney+', ids: ['3202204027038', '3202009021709', '3201901017640'] },
    PRIME_VIDEO: { name: 'Prime Video', ids: ['3201910019365', '3201512006785'] },
    APPLE_TV: { name: 'Apple TV', ids: ['3201807016597'] },
    MAX: { name: 'Max', ids: ['3202301029760', '3201601007230'] },
    PARAMOUNT_PLUS: { name: 'Paramount+', ids: ['3202110025305', '3201710014981'] },
    DAZN: { name: 'DAZN', ids: ['3201806016390'] },
    JOYN: { name: 'Joyn', ids: ['3201502001386'] },
    RTL_PLUS: { name: 'RTL+', ids: ['3201908018988', '3201909019211'] },
    MAGENTA_TV: { name: 'MagentaTV', ids: ['3201907018746'] },
    ARD_MEDIATHEK: { name: 'ARD Mediathek', ids: ['3201412000679'] },
    ZDF_MEDIATHEK: { name: 'ZDF Mediathek', ids: ['3201705012365'] },
    SPOTIFY: { name: 'Spotify', ids: ['3201606009684'] },
    TWITCH: { name: 'Twitch', ids: ['3202203026841'] },
    PLEX: { name: 'Plex', ids: ['3201512006963'] },
    BROWSER: { name: 'Browser', ids: ['3202010022079', '3201907018784', 'org.tizen.browser'] },
};

/** An app that is installed on the TV */
export interface InstalledTvApp {
    /** Key of `TV_APPS`, e.g. `YOUTUBE` */
    key: string;
    name: string;
    /** The ID under which this TV knows it */
    appId: string;
}

/**
 * One request to the app endpoint of the REST API. Resolves with the HTTP status, 0 if the TV does not answer.
 * `agent: false`: the TV closes the connection after every answer.
 */
function appRequest(ip: string, appId: string, method: 'GET' | 'POST', timeout = 3000): Promise<number> {
    return new Promise(resolve => {
        const req = http.request(
            {
                host: ip,
                port: REST_PORT,
                path: `/api/v2/applications/${encodeURIComponent(appId)}`,
                method,
                timeout,
                agent: false,
            },
            res => {
                res.resume();
                res.on('end', () => resolve(res.statusCode ?? 0));
            },
        );
        req.on('timeout', () => req.destroy());
        req.on('error', () => resolve(0));
        req.end();
    });
}

/**
 * Ask the TV which of the known apps are installed.
 *
 * @param ip address of the TV
 * @returns the installed apps in the order of `SAMSUNG_APPS`; empty if the TV does not answer
 */
export async function findInstalledApps(ip: string): Promise<InstalledTvApp[]> {
    const found = await Promise.all(
        Object.entries(SAMSUNG_APPS).map(async ([key, app]) => {
            for (const appId of app.ids) {
                if ((await appRequest(ip, appId, 'GET')) === 200) {
                    return { key, name: app.name, appId };
                }
            }
            return null;
        }),
    );
    return found.filter((app): app is InstalledTvApp => !!app);
}

/**
 * Start an app.
 *
 * @param ip address of the TV
 * @param appId ID under which this TV knows the app
 */
export async function launchApp(ip: string, appId: string): Promise<void> {
    const status = await appRequest(ip, appId, 'POST');
    if (status === 0) {
        throw new Error('The TV does not answer. Is it switched on?');
    }
    if (status < 200 || status >= 300) {
        throw new Error(`The TV refused to start the app (HTTP ${status})`);
    }
}
