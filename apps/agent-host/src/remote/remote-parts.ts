// The remote host's parts as the tunnel attack tests (`@halonicjs/testing-tunnel-attacks`) and the
// phone's messaging interop test (`@halonicjs/testing-integration`) put them together: the pairing
// desk, the paired phones, the settings, the host key, the mDNS advert, the RemoteControl Studio
// drives, the gateway's access to the desk and the phones, and the phone's allow-list view of the
// Inbox with its rates. Nothing outside the tests imports this.

export { type PrivateFile, privateFileAt } from "@halonicjs/adapter-fs-node";
export { deskAccess } from "../gateway/desk-access.ts";
export { phoneMessaging } from "../gateway/phone-messaging.ts";
export { PhoneRateLimits } from "../gateway/phone-rate-limit.ts";
export { type HostKey, sharedHostKey } from "./host-key.ts";
export { HostRemoteControl } from "./host-remote-control.ts";
export { type MulticastSocket, PairAdvert } from "./pair-advert.ts";
export { PairedPhones } from "./paired-phones.ts";
export { PairingDesk, type PairingTicket } from "./pairing-desk.ts";
export { deviceId } from "./phone-records.ts";
export { RemoteSettings } from "./remote-settings.ts";
export type { RemoteTime } from "./remote-time.ts";
