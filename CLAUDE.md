# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`iobroker.samsung_tizen` is an ioBroker adapter that controls **Samsung TVs running TizenOS** (model year 2016 and newer) over the TV's `samsung.remote.control` websocket API. It creates a button state per remote key, can launch installed apps, send macro key sequences and poll whether the TV is switched on.

TypeScript (CommonJS output). Sources live in `src/`, the published and runnable code is the compiled `build/` (`package.json` `main` is `build/main.js`). `build/` is gitignored — always run the build before starting the adapter or the integration tests.

## Commands

```bash
npm run build                             # tsc -p tsconfig.build.json -> build/
npm run watch                             # same in watch mode
npm run check                             # type check only (tsconfig.json, noEmit)
npm run lint                              # eslint (@iobroker/eslint-config, flat config)
npx eslint -c eslint.config.mjs --fix src # autofix + prettier formatting

npm run test:package                      # validates package.json / io-package.json / admin JSON (fast)
npm run test:integration                  # starts a real js-controller + adapter instance
npm run translate                         # translate-adapter -b admin/i18n/en.json
npm run release-patch                     # @alcalzone/release-script, moves the README changelog into io-package news
```

There is deliberately **no `prepare` script** — `npm ci` / `npm install` does not build. Run `npm run build` yourself after a fresh checkout and before starting the adapter or the tests. Because `build/` is neither committed nor built on install, `common.nogit` is `true` in `io-package.json`: the adapter can only be installed from npm, not from GitHub. The integration test aborts with "JS-Controller is already running!" if a js-controller is already running on the machine.

## Architecture

### Layout

| Path | Content |
| --- | --- |
| `src/main.ts` | the whole adapter: one `SamsungTizen extends utils.Adapter` class |
| `src/lib/remotekeys.ts` | `keys` — the list of every state the adapter creates on startup |
| `src/lib/types.ts` | shapes of the JSON the TV sends over the websocket |
| `src/lib/adapter-config.d.ts` | augments `ioBroker.AdapterConfig` |
| `src/types/wake_on_lan.d.ts` | typings for `wake_on_lan`, which ships none |
| `admin/jsonConfig.json` | the configuration dialog |
| `admin/i18n/<lang>.json` | flat translation files, keyed by the English labels in `jsonConfig.json` |

`src/lib/adapter-config.d.ts` is hand-maintained and must be kept in sync with `native` in `io-package.json` **and** with `admin/jsonConfig.json` — nothing generates it. All three key sets must be identical; a field that exists in `native` but not in `jsonConfig.json` is silently dropped from existing instances the first time a user saves.

### Transport: the remote control websocket

One websocket (`this.ws`) is shared by every command:

```
<protocol>://<ipAddress>:<port>/api/v2/channels/samsung.remote.control?name=<base64 "ioBroker">[&token=<token>]
```

- `wsConnect(done)` reuses the socket if `readyState === OPEN`, otherwise it opens a new one and calls back once the TV answers `ms.channel.connect`. `rejectUnauthorized: false` — the TV's certificate is self-signed.
- The socket is **shared**, so every response handler has to filter for the reply it asked for (`text.includes('ed.installedApp.get')`) and remove itself again.
- `getToken()` opens the socket **without** a token on purpose: that is what makes the TV show the pairing dialog. The token from `ms.channel.connect` is then stored in `common.name` of `config.token` — not in the state value. Odd, but it is the documented workflow in the README, so it stays.
- Every command carries a retry counter `x`. On failure `wsError()` closes the socket and decides what happens next: attempt 0 tries to wake the TV via Wake-on-LAN, attempts 1..4 wait `RETRY_DELAY`, attempt 5 gives up with an error.

### States

`src/lib/remotekeys.ts` drives object creation in `onReady()`. Everything is written with `setObject` (not `setObjectNotExists`), so a restart repairs renamed or edited objects — except for user-created macros under `command.*`, which are not in the list and therefore survive.

| ID | Meaning |
| --- | --- |
| `control.KEY_*` | one button per remote key; `onStateChange` sends the key name uppercased |
| `control.sendCmd` | string state — a comma separated key sequence |
| `control.KEY_POWERON` / `KEY_POWEROFF` | not real TV keys: they check the power state first and only then send `KEY_POWER` |
| `command.*` | macros. The key sequence lives in **`common.name`**, comma separated. Users create their own here. |
| `apps.getInstalledApps` | button — asks the TV for its app list and creates `apps.start_<name>` for each entry |
| `apps.start_<name>` | button — `common.name` holds the `appId` |
| `config.getToken` | button — see `getToken()` above |
| `powerOn` | only created when `pollingInterval > 0`; written with `ack = true` by the polling interval |

`onStateChange` dispatches on the segments of the ID (`key[2]` = channel, `key[3]` = name), not on a lookup table. The branches are independent `if`s, not a chain — `control.sendCmd` matches both the `SENDCMD` branch and would match `control`, which is why the last two branches are an `if/else if` pair.

### Configuration

Every `native` value is a **string**, including the numeric ones (`port`, `cmdDelay`, `pollingPort`, `pollingInterval`, `token`). That is how existing installations have them stored, so `jsonConfig.json` uses `text` fields and the code runs everything through `parseFloat()`. Do not "clean this up" to `number` fields without a migration — the defaults in `io-package.json` are strings too, and changing them breaks existing instances.

`token` and `macAddress` use the string `'0'` as "deactivated".

### Dependencies worth knowing about

- **`is-port-reachable` is ESM-only.** It cannot be `require`d from this CommonJS build and is loaded with `await import('is-port-reachable')` in `getPowerStateInstant()`. Do not change `module` away from `Node16` — TypeScript would rewrite that `import()` into a `require()` and the adapter would die at runtime with `ERR_REQUIRE_ESM`. After a build, `grep -n "import(" build/main.js` must still find it.
- **`wake_on_lan`** ships no typings (`src/types/wake_on_lan.d.ts`) and `wake()` throws **synchronously** on a malformed MAC address.
- **`ws`** delivers messages as `RawData`; `rawDataToString()` normalizes that to a string.

## Known legacy behaviour (intentional, do not "fix" silently)

- Apps are always launched with `action_type: 'DEEP_LINK'`. The original condition was `app_type === 1 || 2`, which is always true; changing it now would change which apps still start.
- `sendCmd`'s error path splices `KEY_POWERON` out of the command array while the retry counter `x` indexes into the same array — the retry can skip keys. Preserved from the JS version.
- `wsError` treats `readyState > CONNECTING` as "worth closing", so it also closes an already closed socket.
- The adapter logs a lot at `info` level, including the full websocket URL with the token.

## Release flow

Changelog entries go under `### **WORK IN PROGRESS**` in `README.md`; `@alcalzone/release-script` moves them into `common.news` of `io-package.json`. Never edit `common.news` by hand. Raising minimum Node / js-controller / admin versions is a breaking change → major release.
