import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  connectPagePolicy,
  metaPolicies,
  policyDirectives,
  policyProblems,
} from "./page-policy.ts";

// Vitest runs each package's tests from the package folder.
const shellFolder = join(process.cwd(), "src-tauri");

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function tauriConfig(file: string): Json {
  return JSON.parse(readFileSync(join(shellFolder, file), "utf8")) as Json;
}

/** RFC 7396 JSON Merge Patch, the way Tauri lays a platform's config over `tauri.conf.json`. */
function mergePatch(target: Json, patch: Json): Json {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) return patch;
  const merged: { [key: string]: Json } =
    target !== null && typeof target === "object" && !Array.isArray(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key];
    else merged[key] = mergePatch(merged[key] ?? null, value);
  }
  return merged;
}

/** The policy in the Android app's merged config (`app.security.csp`). */
function androidConfigPolicy(): string {
  const merged = mergePatch(tauriConfig("tauri.conf.json"), tauriConfig("tauri.android.conf.json"));
  const csp = (merged as { app?: { security?: { csp?: unknown } } }).app?.security?.csp;
  if (typeof csp !== "string")
    throw new Error("The Android config has no content security policy.");
  return csp;
}

/**
 * The policy as Tauri sends it with the page: what the config says, with its IPC sources added to
 * `connect-src` (where they aren't already) and a hash in `script-src` for a script it injects.
 */
function withTauriAdditions(policy: string): string {
  const directives = new Map(policyDirectives(policy));
  const connect = directives.get("connect-src") ?? [];
  const ipc = ["ipc:", "http://ipc.localhost"].filter((source) => !connect.includes(source));
  directives.set("connect-src", [...connect, ...ipc]);
  directives.set("script-src", [
    ...(directives.get("script-src") ?? []),
    "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='",
  ]);
  return [...directives].map(([name, sources]) => [name, ...sources].join(" ")).join("; ");
}

/** Swaps one directive of the connect page's policy for another. */
function policyWith(directive: string): string {
  const name = directive.split(" ")[0] ?? "";
  return connectPagePolicy
    .split("; ")
    .map((part) => (part.split(" ")[0] === name ? directive : part))
    .join("; ");
}

const asMeta = { scriptHashes: false };
const asSent = { scriptHashes: true };

verifies("studio.connect.no-network", () => {
  describe("the policy Tauri sends with the page on Android", () => {
    it("is the same policy in the Android config Tauri sends, with what Tauri adds to it", () => {
      expect(androidConfigPolicy()).toBe(connectPagePolicy);
      expect(policyProblems(withTauriAdditions(androidConfigPolicy()), asSent)).toEqual([]);
    });
  });

  describe("the check", () => {
    it("names a source that reaches the network, in any directive", () => {
      expect(
        policyProblems(
          policyWith("connect-src ipc: http://ipc.localhost https://example.com"),
          asSent,
        ),
      ).toContain("connect-src allows https://example.com, which reaches the network.");
      expect(policyProblems(policyWith("img-src 'self' 192.168.1.20:4280"), asSent)).toContain(
        "img-src allows 192.168.1.20:4280, which reaches the network.",
      );
      expect(policyProblems(policyWith("font-src 'self' https:"), asSent)).toContain(
        "font-src allows https:, which reaches the network.",
      );
      expect(
        policyProblems(policyWith("connect-src ipc: http://ipc.localhost wss:"), asSent),
      ).toContain("connect-src allows wss:, which reaches the network.");
      expect(policyProblems(policyWith("default-src *"), asSent)).toContain(
        "default-src allows *, which reaches the network.",
      );
    });

    it("allows Tauri's Android IPC address only in connect-src", () => {
      expect(policyProblems(policyWith("img-src 'self' http://ipc.localhost"), asSent)).toContain(
        "img-src allows http://ipc.localhost, which reaches the network.",
      );
    });

    it("names a script source that isn't the page's own files", () => {
      for (const source of ["'unsafe-inline'", "'unsafe-eval'", "blob:", "data:"]) {
        expect(policyProblems(policyWith(`script-src 'self' ${source}`), asSent)).toContain(
          `script-src allows ${source}, which runs scripts that aren't the page's own files.`,
        );
      }
    });

    it("allows a hash or nonce in script-src only in the policy Tauri sends", () => {
      const withHash = policyWith("script-src 'self' 'sha256-abc=' 'nonce-xyz'");

      expect(policyProblems(withHash, asSent)).toEqual([]);
      expect(policyProblems(withHash, asMeta)).toEqual([
        `script-src is "'self' 'sha256-abc=' 'nonce-xyz'"; it should be "'self'".`,
      ]);
      expect(policyProblems(policyWith("style-src 'self' 'sha256-abc='"), asSent)).toEqual([
        `style-src is "'self' 'sha256-abc='"; it should be "'self'".`,
      ]);
    });

    it("names a directive that is missing or that the policy shouldn't have", () => {
      const withoutObjects = connectPagePolicy.replace("object-src 'none'; ", "");

      expect(policyProblems(withoutObjects, asMeta)).toEqual([
        `The policy has no object-src; it should be "'none'".`,
      ]);
      expect(policyProblems(`${connectPagePolicy}; worker-src 'self'`, asMeta)).toEqual([
        "The policy has a worker-src that the connect page's policy doesn't.",
      ]);
    });

    it("reads every policy tag on a page, so a second one can't go unnoticed", () => {
      const page = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'">
        <META HTTP-EQUIV='content-security-policy' CONTENT='img-src *'><meta charset="utf-8">`;

      expect(metaPolicies(page)).toEqual(["default-src 'self'", "img-src *"]);
    });
  });
});
