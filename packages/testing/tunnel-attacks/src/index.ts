// The public API of @halonicjs/testing-tunnel-attacks: the rig the attack tests share, so a later phase's
// attack tests (a paired device, a stolen session) can stand on the same tunnel and gateway.
export { RecordingSource, type SourceCall } from "./recording-source.ts";
export { openTunnelRig, type TunnelRig, type TunnelRigOptions } from "./tunnel-rig.ts";
export { op, WireClient, wireFrame } from "./wire-client.ts";
