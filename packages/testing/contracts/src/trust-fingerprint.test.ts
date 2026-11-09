import type { Connector } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  type FingerprintConnectors,
  fingerprintAttacks,
  fingerprintCoverageContract,
  fingerprintGaps,
} from "./trust-fingerprint.ts";

/** `cwd` with `.` and `..` worked out, as a path inside the workspace. */
function folder(cwd: string): string {
  const parts: string[] = [];
  for (const part of cwd.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== "." && part !== "") parts.push(part);
  }
  return parts.join("/");
}

/** JSON with its keys sorted, so key order in the file doesn't count. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    const entries = keys.map(
      (key) => `${JSON.stringify(key)}:${canonical(Reflect.get(value, key))}`,
    );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalised(connector: Connector): Connector {
  const { transport } = connector;
  if ("stdio" in transport) {
    const cwd = folder(transport.stdio.cwd ?? ".");
    return { ...connector, transport: { stdio: { ...transport.stdio, cwd } } };
  }
  if ("http" in transport) {
    const url = new URL(transport.http.url).href;
    return { ...connector, transport: { http: { ...transport.http, url } } };
  }
  return connector;
}

/** A stand-in for the `core/workspace` fingerprint: everything, normalised. */
const reference: FingerprintConnectors = async (connectors) =>
  canonical(connectors.map(normalised));

/** The port's short example: only the command, its arguments and the host. */
const weak: FingerprintConnectors = async (connectors) =>
  canonical(
    connectors.map(({ id, transport }) => {
      if ("stdio" in transport) {
        return { id, command: transport.stdio.command, args: transport.stdio.args };
      }
      return "http" in transport ? { id, host: new URL(transport.http.url).host } : { id };
    }),
  );

fingerprintCoverageContract("reference", reference);

verifies("contracts.trust-fingerprint", () => {
  it("shows what a fingerprint of only the command, arguments and host lets through", async () => {
    const { missed, unstable } = await fingerprintGaps(weak);
    expect(unstable).toEqual([]);
    expect(missed).toEqual(
      expect.arrayContaining([
        "adds NODE_OPTIONS to a program",
        "adds PYTHONSTARTUP to a program",
        "moves the program to another folder",
        "changes the path on the same host",
        "changes https to http on the same host",
        "stops asking before a tool runs",
      ]),
    );
  });

  it("finds a fingerprint that changes on every call", async () => {
    let calls = 0;
    const { missed, unstable } = await fingerprintGaps(async () => `${calls++}`);
    expect(missed).toEqual([]);
    expect(unstable).toHaveLength(5);
  });

  it("covers every item of the fingerprint coverage plan", () => {
    const items = new Set(Object.values(fingerprintAttacks).map(({ item }) => item));
    expect([...items].sort()).toEqual(["a", "b", "c", "d", "e", "google", "program", "secrets"]);
  });
});
