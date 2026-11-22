// The remote host's parts as the tunnel attack tests (`@halonicjs/testing-tunnel-attacks`) put them
// together: the pairing desk, the paired phones, the settings, the host key, the mDNS advert and the
// RemoteControl Studio drives. Nothing outside the tests imports this.
export { type HostKey, sharedHostKey } from "./host-key.ts";
export { HostRemoteControl } from "./host-remote-control.ts";
export { type MulticastSocket, PairAdvert } from "./pair-advert.ts";
export { PairedPhones } from "./paired-phones.ts";
export { PairingDesk, type PairingTicket } from "./pairing-desk.ts";
export { deviceId } from "./phone-records.ts";
export { type PrivateFile, privateFileAt } from "./private-file.ts";
export { RemoteSettings } from "./remote-settings.ts";
export type { RemoteTime } from "./remote-time.ts";
