import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { agentHostCodingToolsServer, ownPayloadFolder } from "./coding-tools-mode.ts";

const profile = join("/", "profiles", "acme");
const payload = join(profile, "agent-host", "1.2.0-0123456789abcdef");
const inPayload = (folder: string) =>
  join(folder, "apps", "agent-host", "src", "coding-tools-mode.ts");

verifies("agent-host.coding-tools-mode", () => {
  describe("ownPayloadFolder", () => {
    it("is the payload folder the file was unpacked into", () => {
      expect(ownPayloadFolder(inPayload(payload))).toBe(payload);
    });

    it.each([
      ["the repo's source", join("/", "src", "halonic")],
      ["a folder not named as a payload", join(profile, "agent-host", "latest")],
      [
        "a payload name outside the profile's agent-host folder",
        join("/", "tmp", "1.2.0-0123456789abcdef"),
      ],
    ])("is undefined for %s", (_name, folder) => {
      expect(ownPayloadFolder(inPayload(folder))).toBeUndefined();
    });
  });

  describe("agentHostCodingToolsServer", () => {
    it("starts this executable in the coding-tools mode, its code the executable and the payload", () => {
      const executable = join("/", "opt", "halonic", "halonic-agent-host");

      expect(agentHostCodingToolsServer(profile, payload, executable)).toEqual({
        program: executable,
        args: ["--profile-folder", profile, "coding-tools"],
        codePaths: [executable, payload],
      });
    });

    it("names no server for a host running from source", () => {
      expect(agentHostCodingToolsServer(profile, undefined)).toBeUndefined();
      expect(agentHostCodingToolsServer(profile)).toBeUndefined();
    });
  });
});
