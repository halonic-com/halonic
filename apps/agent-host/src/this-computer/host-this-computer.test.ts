import { MemoryTrustStore } from "@halonicjs/adapter-memory";
import type { Sandbox } from "@halonicjs/ports";
import type { ProfileFolder } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { HostRunInstructions } from "../harness/host-instructions.ts";
import type { HostHarnessProfiles } from "../harness/host-profiles.ts";
import type { HostProposalFolders } from "../harness/host-proposals.ts";
import { type HostThisComputerInput, hostThisComputer } from "./host-this-computer.ts";

const launcher = { check: async () => ({ ok: true }) } as unknown as Sandbox;
const profiles = {
  removingTempFolders: (sandbox: Sandbox) => sandbox,
} as unknown as HostHarnessProfiles;

/** What a host with a profile folder on Linux has. */
function input(fields: Partial<HostThisComputerInput> = {}): HostThisComputerInput {
  return {
    profile: { platform: "linux", root: "/srv/acme-profile" } as ProfileFolder,
    profiles,
    instructions: {} as HostRunInstructions,
    proposals: {} as HostProposalFolders,
    workspaceRoots: ["/srv/acme"],
    trustStore: new MemoryTrustStore(),
    platform: "linux",
    launcher,
    ...fields,
  };
}

verifies("agent-host.this-computer-sessions", () => {
  describe("hostThisComputer", () => {
    it("offers the launcher behind the gate on a host with a profile folder", () => {
      const offered = hostThisComputer(input());
      expect(offered?.launcher).toBe(launcher);
      expect(offered?.built).toBe(profiles);
    });

    it("offers none without a profile folder, or anything read from one", () => {
      expect(hostThisComputer(input({ profile: undefined }))).toBeUndefined();
      expect(hostThisComputer(input({ profiles: undefined }))).toBeUndefined();
      expect(hostThisComputer(input({ instructions: undefined }))).toBeUndefined();
      expect(hostThisComputer(input({ proposals: undefined }))).toBeUndefined();
      expect(hostThisComputer(input({ trustStore: undefined }))).toBeUndefined();
    });

    it("offers none on Windows", () => {
      expect(hostThisComputer(input({ platform: "win32" }))).toBeUndefined();
    });
  });
});
