import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemorySecretStore } from "@halonicjs/adapter-memory";
import type { RemoteControl, RemoteState } from "@halonicjs/ports";
import { FakeTunnelProvider } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { RunLedger } from "../gateway/run-ledger.ts";
import { RunTable } from "../harness/run-table.ts";
import { optionalProfileOf } from "../profile-folder.ts";
import { type HostRemote, openHostRemote, remoteHomeFor } from "./host-remote.ts";

const offer = { tunnel: new FakeTunnelProvider() };
const folders: string[] = [];
const opened: HostRemote[] = [];

afterEach(async () => {
  for (const remote of opened.splice(0)) await remote.close();
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function newProfile() {
  const root = await mkdtemp(join(tmpdir(), "halonic-host-remote-"));
  folders.push(root);
  const profile = optionalProfileOf(root);
  if (profile === undefined) throw new Error("No profile.");
  return profile;
}

async function stateOf(control: RemoteControl): Promise<RemoteState> {
  const stream = control.state()[Symbol.asyncIterator]();
  const first = await stream.next();
  await stream.return?.();
  return first.value as RemoteState;
}

/** The host's remote in `profile`, with what it reported. */
async function opening(profile: Awaited<ReturnType<typeof newProfile>>) {
  const logged: string[] = [];
  const ledger = new RunLedger();
  const remote = await openHostRemote({
    offer,
    profile,
    secrets: new MemorySecretStore(),
    log: (text) => logged.push(text),
    ledger,
    runs: new RunTable(ledger),
    ownPorts: new Set(),
  });
  opened.push(remote);
  return { remote, logged };
}

verifies("agent-host.remote-gateway", () => {
  describe("remoteHomeFor", () => {
    it("offers remote only with a provider, a profile, its lock, and a port to listen on", async () => {
      const profile = await newProfile();
      const logged: string[] = [];
      const log = (text: string) => logged.push(text);
      const serving = { overStdio: false, profile, holdsLock: true };
      expect(await remoteHomeFor(undefined, serving, log)).toBeUndefined();
      expect(logged).toEqual([]);
      expect(await remoteHomeFor(offer, serving, log)).toEqual({ offer, profile });
      expect(await remoteHomeFor(offer, { ...serving, overStdio: true }, log)).toBeUndefined();
      expect(await remoteHomeFor(offer, { ...serving, profile: undefined }, log)).toBeUndefined();
      expect(await remoteHomeFor(offer, { ...serving, holdsLock: false }, log)).toBeUndefined();
      expect(logged).toEqual([
        "Remote isn't offered: the remote gateway needs a port, and over --stdio the host listens on none.\n",
        "Remote isn't offered: there is no profile folder to keep paired phones in.\n",
        "Remote isn't offered: another agent host serves this profile's phones.\n",
      ]);
    });

    it("runs a probe only when the rest lets the host offer remote, and offers what it finds", async () => {
      const profile = await newProfile();
      const serving = { overStdio: false, profile, holdsLock: true };
      let probes = 0;
      const probe = (found: typeof offer | undefined) => async () => {
        probes += 1;
        return found;
      };
      expect(
        await remoteHomeFor(probe(offer), { ...serving, overStdio: true }, () => {}),
      ).toBeUndefined();
      expect(
        await remoteHomeFor(probe(offer), { ...serving, holdsLock: false }, () => {}),
      ).toBeUndefined();
      expect(probes).toBe(0);
      expect(await remoteHomeFor(probe(offer), serving, () => {})).toEqual({ offer, profile });
      expect(await remoteHomeFor(probe(undefined), serving, () => {})).toBeUndefined();
      expect(probes).toBe(2);
    });
  });
});

verifies("agent-host.remote-not-offered", () => {
  describe("openHostRemote", () => {
    it("offers remote, off until the person turns it on, when the host has a provider", async () => {
      const { remote } = await opening(await newProfile());
      expect(await stateOf(remote.control)).toMatchObject({
        available: true,
        on: false,
        tunnelProviderId: "fake",
        phones: [],
      });
    });

    it("offers no remote, and says why, when the paired phones file can't be read", async () => {
      const profile = await newProfile();
      await mkdir(join(profile.root, "remote"), { recursive: true });
      await writeFile(join(profile.root, "remote", "paired-phones.json"), "not json");
      const { remote, logged } = await opening(profile);
      expect(await stateOf(remote.control)).toMatchObject({ available: false, on: false });
      expect(logged.join("")).toContain("Remote isn't offered: its files couldn't be read");
    });
  });
});
