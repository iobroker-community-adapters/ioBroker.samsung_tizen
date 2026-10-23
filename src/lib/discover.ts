/*
 * Find Samsung Tizen TVs in the local network.
 *
 * 1. SSDP M-SEARCH on every IPv4 interface separately - with several adapters (VPN, Docker, Tailscale)
 *    a search sent on the default interface never reaches the TV.
 * 2. Every answering address is confirmed with `GET http://<ip>:8001/api/v2/`, which a Tizen TV
 *    answers without a token (model, name, MAC address, power state).
 *
 * A TV in deep standby has its network switched off and cannot be found.
 */
import dgram from 'node:dgram';
import http from 'node:http';
import os from 'node:os';

/** Port of the REST API that answers the device info without a token */
const REST_PORT = 8001;
const SSDP_ADDRESS = '239.255.255.250';
const SSDP_PORT = 1900;
/** Search targets a Samsung TV answers */
const SEARCH_TARGETS = ['urn:samsung.com:device:RemoteControlReceiver:1', 'urn:dial-multiscreen-org:service:dial:1'];

/** A TV that answered the search and the REST API */
export interface FoundTv {
    ip: string;
    /** e.g. `Samsung The Frame 55` */
    name: string;
    /** e.g. `GQ55LS03BAUXZG` */
    model: string;
    /** MAC address of the active network interface (the TV calls it `wifiMac` even on LAN) */
    mac: string;
    /** `on` or `standby`; empty on older models */
    powerState: string;
    /** `wired` or `wireless` */
    networkType: string;
    /** true for The Frame */
    frameTv: boolean;
}

/** Shape of `GET /api/v2/` - only the fields used here */
interface DeviceInfoResponse {
    device?: {
        OS?: string;
        type?: string;
        name?: string;
        modelName?: string;
        wifiMac?: string;
        PowerState?: string;
        networkType?: string;
        FrameTVSupport?: string;
    };
}

/** IPv4 addresses of all active interfaces except loopback and link-local */
function localAddresses(): string[] {
    const result: string[] = [];
    for (const entries of Object.values(os.networkInterfaces())) {
        for (const entry of entries ?? []) {
            if (entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.')) {
                result.push(entry.address);
            }
        }
    }
    return result;
}

/** Send the M-SEARCH on one interface and collect the addresses that answer */
function searchOnInterface(address: string, timeout: number, found: Set<string>): Promise<void> {
    return new Promise(resolve => {
        const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        const finish = (): void => {
            try {
                socket.close();
            } catch {
                // already closed
            }
            resolve();
        };
        socket.on('message', (_msg, rinfo) => found.add(rinfo.address));
        socket.on('error', finish);
        socket.bind(0, address, () => {
            try {
                socket.setMulticastInterface(address);
                for (const st of SEARCH_TARGETS) {
                    const message = `M-SEARCH * HTTP/1.1\r\nHOST: ${SSDP_ADDRESS}:${SSDP_PORT}\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ${st}\r\n\r\n`;
                    socket.send(message, SSDP_PORT, SSDP_ADDRESS);
                }
            } catch {
                finish();
                return;
            }
            setTimeout(finish, timeout);
        });
    });
}

/**
 * Read the device info of a TV. Resolves with `null` if nothing - or not a Tizen TV - answers.
 *
 * @param ip address of the TV
 * @param timeout in ms
 */
export function readDeviceInfo(ip: string, timeout = 2000): Promise<FoundTv | null> {
    return new Promise(resolve => {
        // `agent: false`: the TV closes the connection after every answer, so a kept-alive socket of the
        // global agent makes every second request fail with "socket hang up"
        const req = http.get({ host: ip, port: REST_PORT, path: '/api/v2/', timeout, agent: false }, res => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => (body += chunk));
            res.on('end', () => {
                try {
                    const device = (JSON.parse(body) as DeviceInfoResponse).device;
                    if (!device || (device.OS !== 'Tizen' && !/samsung/i.test(device.type ?? ''))) {
                        return resolve(null);
                    }
                    resolve({
                        ip,
                        name: device.name ?? '',
                        model: device.modelName ?? '',
                        mac: (device.wifiMac ?? '').toLowerCase(),
                        powerState: device.PowerState ?? '',
                        networkType: device.networkType ?? '',
                        frameTv: device.FrameTVSupport === 'true',
                    });
                } catch {
                    resolve(null);
                }
            });
            res.on('error', () => resolve(null));
        });
        req.on('timeout', () => req.destroy());
        req.on('error', () => resolve(null));
    });
}

/**
 * Search the local network for Samsung Tizen TVs.
 *
 * @param timeout how long to wait for SSDP answers in ms
 */
export async function discoverTvs(timeout = 3000): Promise<FoundTv[]> {
    const answered = new Set<string>();
    await Promise.all(localAddresses().map(address => searchOnInterface(address, timeout, answered)));
    const tvs = await Promise.all([...answered].map(ip => readDeviceInfo(ip)));
    return tvs.filter((tv): tv is FoundTv => !!tv).sort((a, b) => a.ip.localeCompare(b.ip));
}
