// This file extends the AdapterConfig type from "@iobroker/types"
// with the native settings declared in io-package.json.
// Without it, every access to adapter.config.<option> is reported by
// "npm run check" as "Property '<option>' does not exist on type 'AdapterConfig'".

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
    namespace ioBroker {
        interface AdapterConfig {
            /** wss or http */
            protocol: string;
            /** IP address of the TV */
            ipAddress: string;
            /** port of the remote control websocket */
            port: string;
            /** pairing token, "0" to deactivate */
            token: string;
            /** MAC address used for WakeOnLAN, "0" to deactivate */
            macAddress: string;
            /** delay in milliseconds between commands sent via control.sendCmd */
            cmdDelay: string;
            /** port polled to determine the power state */
            pollingPort: string;
            /** power state polling interval in seconds, "0" to deactivate */
            pollingInterval: string;
        }
    }
}

// this is required so the above AdapterConfig is found by TypeScript / VSCode
export {};
