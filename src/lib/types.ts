/** One entry of the app list the TV answers with on `ed.installedApp.get` */
export interface InstalledApp {
    /** ID used to launch the app, e.g. `11101200001` */
    appId: string;
    /** Display name, e.g. `Netflix` — used to build the object ID `apps.start_<name>` */
    name: string;
    /** 2 = deep link capable, 1 = native launch */
    app_type: number;
}

/** Message the TV sends over the remote control websocket */
export interface TvEventMessage {
    /** e.g. `ms.channel.connect` or `ed.installedApp.get` */
    event: string;
    data?: {
        /** Pairing token, only present in `ms.channel.connect` */
        token?: string;
        /** App list, only present in `ed.installedApp.get` */
        data?: InstalledApp[];
    };
}
