// `wake_on_lan` ships no typings, so declare the small part of its API that this adapter uses.
declare module 'wake_on_lan' {
    export interface WakeOptions {
        /** Broadcast address the magic packet is sent to, default `255.255.255.255` */
        address?: string;
        /** How many packets are sent, default 3 */
        num_packets?: number;
        /** Delay between the packets in ms, default 100 */
        interval?: number;
        /** UDP port, default 9 */
        port?: number;
    }

    /** Build a Wake-on-LAN magic packet. Throws on a malformed MAC address. */
    export function createMagicPacket(mac: string): Buffer;

    /** Send a Wake-on-LAN magic packet. Throws synchronously on a malformed MAC address. */
    export function wake(mac: string, callback?: (error?: Error | null) => void): void;
    export function wake(mac: string, options: WakeOptions, callback?: (error?: Error | null) => void): void;
}
