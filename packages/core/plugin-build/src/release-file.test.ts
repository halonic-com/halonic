import { canonicalJson } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  maxReleaseFileBytes,
  parseReleaseFile,
  type ReleaseFileFields,
  releaseFileText,
} from "./release-file.ts";
import { acmeCommit } from "./test/acme.test-helper.ts";

const fields: ReleaseFileFields = {
  pluginId: "halonic-ws.acme",
  version: "0.3.0",
  sha256: "a".repeat(64),
  workspaceCommit: acmeCommit,
  halonicVersion: "0.2.0-beta.1",
  changes: {
    added: ["refund"],
    removed: [],
    changed: [{ tool: "order_status", fields: ["description"] }],
  },
};

const written = { ...fields, archive: "halonic-ws.acme-0.3.0.tar" };

/** The release file's text with some fields replaced, as a hand-edited file would be. */
function edited(changes: Record<string, unknown>): string {
  return `${canonicalJson({ ...written, ...changes })}\n`;
}

verifies("plugin-build.release-file", () => {
  it("writes canonical JSON with the archive name and reads it back", () => {
    const text = releaseFileText(fields);
    expect(text).toBe(`${canonicalJson(written)}\n`);
    expect(parseReleaseFile(text)).toEqual({ ok: true, value: written });
  });

  it("takes a SHA-256 commit too", () => {
    expect(parseReleaseFile(edited({ workspaceCommit: "b".repeat(64) })).ok).toBe(true);
  });

  it.each([
    ["an archive name with a path", { archive: "../other.tar" }],
    ["an archive name for another version", { archive: "halonic-ws.acme-0.2.0.tar" }],
    ["a plugin id outside the pattern", { pluginId: "halonic-ws.../x", archive: "x.tar" }],
    ["a version that isn't strict", { version: "v0.3.0" }],
    ["a sha-256 in capitals", { sha256: "A".repeat(64) }],
    ["a short commit", { workspaceCommit: "0123456" }],
    ["a Halonic version that isn't one", { halonicVersion: "latest" }],
    ["an extra field", { install: true }],
    ["an extra field in the changes", { changes: { ...fields.changes, moved: [] } }],
    [
      "a changed tool without its fields",
      { changes: { ...fields.changes, changed: [{ tool: "a" }] } },
    ],
  ])("refuses %s", (_name, changes) => {
    expect(parseReleaseFile(edited(changes))).toMatchObject({
      ok: false,
      error: { code: "invalid" },
    });
  });

  it("refuses text that isn't JSON, and a file over the cap", () => {
    expect(parseReleaseFile("{ pluginId")).toEqual({ ok: false, error: { code: "not-json" } });
    expect(parseReleaseFile(" ".repeat(maxReleaseFileBytes + 1))).toEqual({
      ok: false,
      error: { code: "too-large", maxBytes: maxReleaseFileBytes },
    });
  });

  it("refuses to write fields it would refuse to read", () => {
    expect(() => releaseFileText({ ...fields, sha256: "short" })).toThrow(
      "Can't write a release file with these fields: sha256.",
    );
  });

  it("writes and reads back the routing entries that changed, and refuses free text there", () => {
    const routing = {
      ...fields,
      changes: { ...fields.changes, routing: ["areas.docs", "roles.code-reviewer"] },
    };
    const text = releaseFileText(routing);
    expect(parseReleaseFile(text)).toEqual({
      ok: true,
      value: { ...routing, archive: "halonic-ws.acme-0.3.0.tar" },
    });
    for (const entry of ["login", "roles.Liam", "areas.docs; rm -rf"]) {
      expect(
        parseReleaseFile(edited({ changes: { ...fields.changes, routing: [entry] } })),
      ).toMatchObject({ ok: false, error: { code: "invalid" } });
    }
  });

  it("writes and reads back the signals that changed, and refuses ids that aren't ids", () => {
    const signals = {
      ...fields,
      changes: {
        ...fields.changes,
        signals: { added: ["watcher"], removed: [], changed: ["a_b"] },
      },
    };
    expect(parseReleaseFile(releaseFileText(signals))).toEqual({
      ok: true,
      value: { ...signals, archive: "halonic-ws.acme-0.3.0.tar" },
    });
    for (const bad of [
      { added: ["Watcher"], removed: [], changed: [] },
      { added: ["../x"], removed: [], changed: [] },
      { added: [], removed: [] },
      { added: [], removed: [], changed: [], moved: [] },
    ]) {
      expect(
        parseReleaseFile(edited({ changes: { ...fields.changes, signals: bad } })),
      ).toMatchObject({ ok: false, error: { code: "invalid" } });
    }
  });
});
