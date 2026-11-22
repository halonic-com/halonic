import type { GatewayCleartextFrame } from "@halonicjs/ports";
import type { HostRig, RigPairing } from "./host-rig.ts";
import { cleartext, PairingPhone, type ScannedQr } from "./pairing-phone.ts";
import { op, type WireClient, wireFrame } from "./wire-client.ts";

/*
 * The steps of a pairing over the wire, as a phone takes them through the
 * tunnel, for the attack tests to take in order or to break off.
 */

/** A phone's pairing so far: its connection and what the host refused, if it did. */
export interface PairingTry {
  readonly phone: PairingPhone;
  /** The phone's message 1 as it went out, for a replay. */
  readonly message1: Uint8Array;
  readonly client: WireClient;
  readonly refusal: GatewayCleartextFrame | undefined;
}

/** Sends message 1 on a new connection; reads message 2, or the host's cleartext refusal. */
export async function sendPair1(rig: HostRig, phone: PairingPhone): Promise<PairingTry> {
  const client = await rig.opened();
  const message1 = phone.pair1();
  client.write(wireFrame(op.binary, message1));
  const answer = await client.binaryFrame(0);
  if (answer === undefined) throw new Error("the host closed without answering message 1");
  const refusal = cleartext(answer);
  if (refusal === undefined) phone.readPair2(answer);
  return { phone, message1, client, refusal };
}

/** Message 1 and message 3 with the code in `qr`; gives the refusal, if the host refused. */
export async function tryCode(rig: HostRig, qr: ScannedQr): Promise<GatewayCleartextFrame> {
  const started = await sendPair1(rig, new PairingPhone(qr));
  if (started.refusal !== undefined) return started.refusal;
  started.client.write(wireFrame(op.binary, started.phone.pair3()));
  const refusal = cleartext(await started.client.binaryFrame(1));
  if (refusal === undefined) throw new Error("the host took the try without refusing it");
  return refusal;
}

/** A code of the right form that isn't `qr`'s, for a wrong try. */
export function wrongCode(qr: ScannedQr): ScannedQr {
  const code = qr.code.startsWith("2") ? `3${qr.code.slice(1)}` : `2${qr.code.slice(1)}`;
  return { hostKey: qr.hostKey, code };
}

/** Takes a phone through messages 1 to 3 to the dialog's check code, where Allow is awaited. */
export async function reachCheck(rig: HostRig, pairing: RigPairing): Promise<PairingTry> {
  const started = await sendPair1(rig, new PairingPhone(await pairing.qr()));
  if (started.refusal !== undefined) throw new Error(`refused: ${started.refusal.kind}`);
  const checks = pairing.events.filter((event) => event.type === "check").length;
  started.client.write(wireFrame(op.binary, started.phone.pair3()));
  await pairing.event("check", checks + 1);
  return started;
}

/** Pairs a phone through the dialog: messages 1 to 3, Allow, and `paired` inside the session. */
export async function pairPhone(rig: HostRig, pairing: RigPairing): Promise<PairingPhone> {
  const { phone, client } = await reachCheck(rig, pairing);
  await pairing.session.allow();
  const paired = phone.read((await client.binaryFrame(1)) ?? Buffer.alloc(0));
  if ((paired as { type?: string }).type !== "paired") throw new Error("the phone wasn't paired");
  client.end();
  return phone;
}

/** The phone's encrypted answer after message 3, once the host decided. */
export async function verdict(phone: PairingPhone, client: WireClient): Promise<unknown> {
  const answer = await client.binaryFrame(1);
  if (answer === undefined) throw new Error("the host closed without an answer");
  return cleartext(answer) ?? phone.read(answer);
}
