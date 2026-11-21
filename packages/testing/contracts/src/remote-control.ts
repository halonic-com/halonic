import type {
  PairingEvent,
  PairingSession,
  PhonePlatform,
  RemoteControl,
  RemoteState,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/** What the suite needs from a host under test. */
export interface RemoteControlHarness {
  /** A host that offers remote, with remote off, no phone paired and the risky switch off. */
  control: RemoteControl;
  /** Plays a phone that uses the open pairing's code; resolves once the host has sent `check`. */
  phoneUsesCode(code: string, phone: { name: string; platform: PhonePlatform }): Promise<void>;
}

/** Creates a new host for one test. */
export type MakeRemoteControl = () => Promise<RemoteControlHarness>;

const symbols = "[2-9A-HJKMNP-Z]";

/** The current state: the first item of a new stream. */
async function stateOf(control: RemoteControl): Promise<RemoteState> {
  const stream = control.state()[Symbol.asyncIterator]();
  const first = await stream.next();
  await stream.return?.();
  if (first.done === true) throw new Error("the state stream gave nothing");
  return first.value;
}

/** Reads a pairing's events one at a time. */
function eventsOf(session: PairingSession): () => Promise<PairingEvent> {
  const stream = session.events()[Symbol.asyncIterator]();
  return async () => {
    const next = await stream.next();
    if (next.done === true) throw new Error("the pairing has no more events");
    return next.value;
  };
}

/**
 * Changes the risky switch as a marker, and reads `state` until the marker
 * shows: every state the host gave from `stream`'s start up to then.
 */
async function statesUntilMarker(
  control: RemoteControl,
  stream: AsyncIterator<RemoteState>,
): Promise<RemoteState[]> {
  await control.setAllowRiskyRemotely(true);
  const seen: RemoteState[] = [];
  for (let next = await stream.next(); next.done !== true; next = await stream.next()) {
    seen.push(next.value);
    if (next.value.allowRiskyRemotely) return seen;
  }
  throw new Error("the state stream ended");
}

/** Opens a pairing and reads its code. */
async function openPairing(control: RemoteControl) {
  const session = await control.startPairing();
  const next = eventsOf(session);
  const code = await next();
  if (code.type !== "code") throw new Error(`a pairing began with ${code.type}`);
  return { session, next, code };
}

/** Pairs a phone with the given name, from the code to Allow. */
async function pairPhone(harness: RemoteControlHarness, name: string) {
  const { session, next, code } = await openPairing(harness.control);
  await harness.phoneUsesCode(code.code, { name, platform: "android" });
  expect((await next()).type).toBe("check");
  await session.allow();
  const paired = await next();
  if (paired.type !== "paired") throw new Error(`Allow gave ${paired.type}`);
  return paired.phone;
}

/**
 * The contract every {@link RemoteControl} passes: the fake, and the host's
 * pairing service behind Studio (tunnel phase B2). What runs out in time,
 * a code's life and the wait for Allow, is the implementation's own test.
 */
export function remoteControlContract(name: string, make: MakeRemoteControl): void {
  verifies("contracts.remote-control", () => {
    describe(`RemoteControl contract: ${name}`, () => {
      stateCases(make);
      pairingCases(make);
      newCodeCases(make);
      phoneCases(make);
    });
  });
}

function stateCases(make: MakeRemoteControl): void {
  it("starts off, with no phone, no pairing and the risky switch off", async () => {
    const { control } = await make();
    const state = await stateOf(control);
    expect(state).toMatchObject({ available: true, on: false, allowRiskyRemotely: false });
    expect(state).toMatchObject({ phones: [], pairing: false });
    expect(state.tunnel).toMatchObject({ state: "down", reason: "stopped" });
    expect(state.tunnelProviderId).not.toBe("");
  });

  it("turns remote on and off", async () => {
    const { control } = await make();
    await control.setRemote(true);
    expect((await stateOf(control)).on).toBe(true);
    await control.setRemote(false);
    const off = await stateOf(control);
    expect(off.on).toBe(false);
    expect(off.tunnel).toMatchObject({ state: "down", reason: "stopped" });
  });

  it("sets the risky switch while remote is off", async () => {
    const { control } = await make();
    await control.setAllowRiskyRemotely(true);
    expect(await stateOf(control)).toMatchObject({ on: false, allowRiskyRemotely: true });
    await control.setAllowRiskyRemotely(false);
    expect((await stateOf(control)).allowRiskyRemotely).toBe(false);
  });
}

function pairingCases(make: MakeRemoteControl): void {
  it("turns remote on for a pairing, shows a code, and turns it off when closed unpaired", async () => {
    const { control } = await make();
    const { session, next, code } = await openPairing(control);
    expect(code.code).toMatch(new RegExp(`^${symbols}{12}$`));
    expect(code.qr.startsWith("halonic-pair:")).toBe(true);
    expect(code.hostName).not.toBe("");
    expect(Number.isNaN(Date.parse(code.expiresAt))).toBe(false);
    expect(await stateOf(control)).toMatchObject({ on: true, pairing: true });
    await session.close();
    expect(await next()).toEqual({ type: "ended", reason: "closed" });
    expect(await stateOf(control)).toMatchObject({ on: false, pairing: false });
    await session.close();
  });

  it("ends a second pairing at once as busy, and leaves the first open", async () => {
    const { control } = await make();
    const first = await openPairing(control);
    const second = await control.startPairing();
    expect(await eventsOf(second)()).toEqual({ type: "ended", reason: "busy" });
    expect((await stateOf(control)).pairing).toBe(true);
    await first.session.close();
    expect(await first.next()).toEqual({ type: "ended", reason: "closed" });
  });

  it("refuses Allow and Don't allow before a phone has used the code", async () => {
    const { control } = await make();
    const { session } = await openPairing(control);
    await expect(session.allow()).rejects.toThrow();
    await expect(session.deny()).rejects.toThrow();
    await session.close();
  });

  it("shows the check code with the phone's name, and pairs it on Allow", async () => {
    const harness = await make();
    const { session, next, code } = await openPairing(harness.control);
    await harness.phoneUsesCode(code.code, { name: "Pixel 8", platform: "android" });
    const check = await next();
    expect(check).toMatchObject({ type: "check", phoneName: "Pixel 8", platform: "android" });
    expect(check.type === "check" && check.checkCode).toMatch(new RegExp(`^${symbols}{6}$`));
    await session.allow();
    const paired = await next();
    expect(paired).toMatchObject({ type: "paired", phone: { name: "Pixel 8" } });
    const state = await stateOf(harness.control);
    expect(state).toMatchObject({ on: true, pairing: false });
    expect(state.phones.map((phone) => phone.name)).toEqual(["Pixel 8"]);
  });

  it("ends the code on Don't allow, pairs nothing, and keeps remote on until closed", async () => {
    const harness = await make();
    const { session, next, code } = await openPairing(harness.control);
    await harness.phoneUsesCode(code.code, { name: "Pixel 8", platform: "android" });
    await next();
    await session.deny();
    expect(await next()).toEqual({ type: "code-ended", reason: "denied" });
    expect(await stateOf(harness.control)).toMatchObject({ on: true, pairing: true, phones: [] });
    await expect(session.allow()).rejects.toThrow();
    await session.close();
    expect(await next()).toEqual({ type: "ended", reason: "closed" });
    expect(await stateOf(harness.control)).toMatchObject({ on: false, phones: [] });
  });

  it("ends an open pairing with remote-off when remote is turned off", async () => {
    const { control } = await make();
    const { next } = await openPairing(control);
    await control.setRemote(false);
    expect(await next()).toEqual({ type: "ended", reason: "remote-off" });
    expect(await stateOf(control)).toMatchObject({ on: false, pairing: false });
  });
}

function newCodeCases(make: MakeRemoteControl): void {
  it("gives a new code on the same pairing, and remote stays on in between", async () => {
    const { control } = await make();
    const { session, next, code } = await openPairing(control);
    const states = control.state()[Symbol.asyncIterator]();
    await session.newCode();
    const fresh = await next();
    expect(fresh).toMatchObject({ type: "code" });
    expect(fresh.type === "code" && fresh.code).not.toBe(code.code);
    const between = await statesUntilMarker(control, states);
    await states.return?.();
    expect(between.every((state) => state.on && state.pairing)).toBe(true);
    await session.close();
    expect(await next()).toEqual({ type: "ended", reason: "closed" });
    expect(await stateOf(control)).toMatchObject({ on: false, pairing: false });
  });

  it("gives a new code after Don't allow, and the new code pairs a phone", async () => {
    const harness = await make();
    const { session, next, code } = await openPairing(harness.control);
    await harness.phoneUsesCode(code.code, { name: "Pixel 7", platform: "android" });
    await next();
    await session.deny();
    await next();
    await session.newCode();
    const fresh = await next();
    if (fresh.type !== "code") throw new Error(`newCode gave ${fresh.type}`);
    await harness.phoneUsesCode(fresh.code, { name: "iPhone", platform: "ios" });
    expect(await next()).toMatchObject({ type: "check", phoneName: "iPhone" });
    await session.allow();
    expect(await next()).toMatchObject({ type: "paired", phone: { name: "iPhone" } });
  });

  it("refuses a phone waiting at check when a new code is asked for", async () => {
    const harness = await make();
    const { session, next, code } = await openPairing(harness.control);
    await harness.phoneUsesCode(code.code, { name: "Pixel 8", platform: "android" });
    await next();
    await session.newCode();
    expect(await next()).toMatchObject({ type: "code" });
    await expect(session.allow()).rejects.toThrow();
    expect((await stateOf(harness.control)).phones).toEqual([]);
    await session.close();
  });

  it("refuses a new code once the pairing has ended", async () => {
    const { control } = await make();
    const { session, next } = await openPairing(control);
    await session.close();
    await next();
    await expect(session.newCode()).rejects.toThrow();
    expect(await stateOf(control)).toMatchObject({ on: false, pairing: false });
  });
}

function phoneCases(make: MakeRemoteControl): void {
  it("names a second phone with a paired phone's name with (2)", async () => {
    const harness = await make();
    await pairPhone(harness, "Pixel 8");
    const second = await pairPhone(harness, "Pixel 8");
    expect(second.name).toBe("Pixel 8 (2)");
  });

  it("keeps phones paired while remote is off", async () => {
    const harness = await make();
    await pairPhone(harness, "Pixel 8");
    await harness.control.setRemote(false);
    const state = await stateOf(harness.control);
    expect(state.phones).toHaveLength(1);
    expect(state.phones[0]?.connected).toBe(false);
  });

  it("revokes one phone, ignores an id that isn't paired, and revokes all", async () => {
    const harness = await make();
    const first = await pairPhone(harness, "Pixel 8");
    await pairPhone(harness, "Galaxy S24");
    await pairPhone(harness, "Pixel 7");
    await harness.control.revoke(first.id);
    await harness.control.revoke(first.id);
    await harness.control.revoke("not-a-phone");
    const left = (await stateOf(harness.control)).phones.map((phone) => phone.name);
    expect(left).toEqual(["Galaxy S24", "Pixel 7"]);
    await harness.control.revokeAll();
    expect((await stateOf(harness.control)).phones).toEqual([]);
  });
}
