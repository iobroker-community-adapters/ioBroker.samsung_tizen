/*
 * The answer of the message `help`: what the instance answers and how the TV is controlled, written for AI agents
 * (e.g. ioBroker.pi-agent, or the MCP server with `send_to`) and script authors. Keep it in sync with `onMessage`
 * and `onStateChange` in main.ts and the README.
 */

/** A command of `onMessage`; `write` = it has an effect (sends to the TV) */
export interface HelpCommand {
    command: string;
    write: boolean;
}

/** Every command `onMessage` answers */
export const COMMANDS: HelpCommand[] = [
    { command: 'help', write: false },
    { command: 'apps', write: false },
    { command: 'launchApp', write: true },
    { command: 'remote', write: true },
    { command: 'wake', write: true },
    { command: 'scenes', write: false },
    { command: 'runScene', write: true },
    { command: 'listTvs', write: false },
    { command: 'deviceInfo', write: false },
    { command: 'pair', write: true },
    { command: 'testKey', write: true },
    { command: 'discover', write: false },
    { command: 'searchTv', write: false },
    { command: 'readDeviceInfo', write: false },
];

export const HELP = `ioBroker.samsung_tizen: controls a Samsung TV with Tizen (model year 2016 and newer): remote keys,
apps, scenes (sequences of keys, apps and pauses from the settings), switching on and off. One instance controls one
TV, the one in its settings; several TVs are several instances (samsung_tizen.0, samsung_tizen.1, ...).

Commands (sendTo samsung_tizen.0, or the instance of the TV): the answer is {} when done, else {error, code?}
(e.g. the TV is off, does not answer within 5 s, or the token is not accepted).
- apps {refresh?}: the known apps installed on the TV: {apps: [{key, name}]}, e.g. {key: "YOUTUBE", name:
  "YouTube"}. Known keys: YOUTUBE, NETFLIX, DISNEY_PLUS, PRIME_VIDEO, APPLE_TV, MAX, PARAMOUNT_PLUS, DAZN, JOYN,
  RTL_PLUS, MAGENTA_TV, ARD_MEDIATHEK, ZDF_MEDIATHEK, SPOTIFY, TWITCH, PLEX, BROWSER.
  The TV must be on; the list is kept, refresh true asks the TV again.
- launchApp {app}: starts an app, app = a key from apps, e.g. "NETFLIX".
- remote {key}: sends one key, a Samsung key code KEY_... in capitals: KEY_HOME, KEY_ENTER (ok), KEY_RETURN
  (back), KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_VOLUP, KEY_VOLDOWN, KEY_MUTE, KEY_CHUP, KEY_CHDOWN,
  KEY_0 ... KEY_9, KEY_SOURCE, KEY_HDMI, KEY_MENU, KEY_INFO, KEY_GUIDE, KEY_PLAY, KEY_PAUSE, KEY_STOP, KEY_FF,
  KEY_REWIND, KEY_RED, KEY_GREEN, KEY_YELLOW, KEY_BLUE, KEY_POWER (toggles on/off).
- wake {mac?}: sends Wake-on-LAN to mac, default the MAC address of the settings (switches the TV on if it
  allows that).
- scenes: the scenes of the settings: {scenes: [{id, name}]}.
- runScene {scene}: runs the scene with this id; answers when all its steps are done.
- listTvs, deviceInfo, pair, testKey, discover, searchTv, readDeviceInfo: for the settings, not for agents.

States (samsung_tizen.0.*), written with ack false:
- powerOn (only if the power state polling is on in the settings): read: the TV is on; write true / false
  switches it on (Wake-on-LAN, then KEY_POWER) or off, only if it is not in that state yet.
- control.KEY_*: one button per key (write true); control.KEY_POWERON / control.KEY_POWEROFF switch on / off
  only if needed.
- control.sendCmd: keys separated by commas, e.g. "KEY_HOME,KEY_RIGHT,KEY_ENTER", sent with the delay of the
  settings.
- scenes.<id>: a button per scene; command.<name>: buttons of key sequences (the keys are the object name).

How to talk to the user:
- Which TV: one instance per TV. If there are several instances and the request names none, ask which TV
  (title or room of the instance); do not guess and do not reuse the one of an earlier request.
- Keys, apps, scenes and switching act at once on a TV someone may be watching: only on the user's request.
  KEY_POWER toggles: to switch on or off use powerOn or control.KEY_POWERON / control.KEY_POWEROFF.
- Name apps by their name (Netflix), not by key; if an app is not in the answer of apps, tell the user it was
  not found on the TV (or the TV is off).
- An error that the TV does not answer: it is off or unreachable; wake or powerOn can switch it on.`;
