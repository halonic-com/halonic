import type { Digest, ListedToolText } from "@halonicjs/ports";
import { unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  httpToolServer,
  listedToolFingerprint,
  listedToolText,
  sameToolServer,
  stdioToolServer,
  strictCanonicalJson,
  writtenDigest,
} from "./listed-tool-fingerprint.ts";
import { UntrustedText } from "./listed-tool-rules.ts";
import type { OfferedListedTool } from "./tool-listing.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const lookup: ListedToolText = {
  name: "notes__lookup",
  description: "Finds a note by its title.",
  parameters: { type: "object", properties: { title: { type: "string" } } },
};

function canonical(value: unknown): string {
  return unwrap(strictCanonicalJson(value));
}

async function fingerprintOf(tool: ListedToolText): Promise<string> {
  return unwrap(await listedToolFingerprint(tool, digest));
}

verifies("ports.listed-tool-approval", () => {
  it("sorts keys and writes numbers as ECMAScript does", () => {
    expect(canonical({ b: 1, a: 1.0 })).toBe('{"a":1,"b":1}');
    expect(canonical({ a: 1, b: 1 })).toBe('{"a":1,"b":1}');
    expect(canonical([-0, 1e21])).toBe("[0,1e+21]");
  });

  it("sorts keys by UTF-16 code unit", () => {
    expect(canonical({ ｚ: 1, "😀": 1, é: 1, z: 1 })).toBe('{"z":1,"é":1,"😀":1,"ｚ":1}');
  });

  it("keeps array order and sorts object keys at every depth", () => {
    expect(canonical([[2, 1], [{ b: true, a: null }]])).toBe('[[2,1],[{"a":null,"b":true}]]');
  });

  it("escapes control characters in lowercase hex and writes the rest as it is", () => {
    expect(canonical("\t\u001fé")).toBe('"\\t\\u001fé"');
  });

  it.each([
    ["undefined", { a: undefined }],
    ["NaN", { a: Number.NaN }],
    ["Infinity", [Number.POSITIVE_INFINITY]],
    ["a Date", { a: new Date(0) }],
    ["an unpaired surrogate", { a: "\ud800" }],
    ["a function", [() => 1]],
    ["a big integer", [1n]],
    // biome-ignore lint/suspicious/noSparseArray: the hole is what is being refused
    ["an array with a hole", [1, , 2]],
  ])("refuses %s", (_, value) => {
    expect(strictCanonicalJson(value).ok).toBe(false);
  });

  it("refuses a value that contains itself", () => {
    const loop: Record<string, unknown> = {};
    loop["self"] = loop;
    expect(strictCanonicalJson(loop)).toEqual({ ok: false, error: "value.self contains itself" });
  });

  it("allows the same object twice when it doesn't contain itself", () => {
    const shared = { type: "string" };
    expect(canonical({ a: shared, b: shared })).toBe(
      '{"a":{"type":"string"},"b":{"type":"string"}}',
    );
  });

  it("gives htl1: and 64 lowercase hex digits, the same for the same tool", async () => {
    const first = await fingerprintOf(lookup);
    expect(first).toMatch(/^htl1:[0-9a-f]{64}$/);
    expect(await fingerprintOf(structuredClone(lookup))).toBe(first);
  });

  it("refuses to fingerprint a tool that isn't plain JSON", async () => {
    const broken = { ...lookup, description: "\udc00" };
    expect((await listedToolFingerprint(broken, digest)).ok).toBe(false);
  });

  it.each<[string, Record<string, unknown>]>([
    [
      "a nested description",
      { type: "object", properties: { title: { type: "string", description: "x" } } },
    ],
    ["a $defs entry", { type: "object", $defs: { a: { type: "string" } } }],
    ["required", { type: "object", required: ["title"] }],
    ["an enum value", { type: "string", enum: ["a"] }],
    ["additionalProperties", { type: "object", additionalProperties: false }],
    ["a limit", { type: "string", maxLength: 10 }],
  ])("changes when the parameters gain %s", async (_, parameters) => {
    expect(await fingerprintOf({ ...lookup, parameters })).not.toBe(await fingerprintOf(lookup));
  });

  it("changes when two tools swap their texts", async () => {
    const search = { ...lookup, name: "notes__search", description: "Searches the notes." };
    const swappedLookup = { ...lookup, description: search.description };
    expect(await fingerprintOf(swappedLookup)).not.toBe(await fingerprintOf(lookup));
  });

  it("reads untrusted texts through .text and keeps a __proto__ property", () => {
    const parameters = Object.fromEntries([
      ["type", "object"],
      [
        "properties",
        Object.fromEntries([
          ["__proto__", { title: new UntrustedText("Proto"), enum: [new UntrustedText("a")] }],
        ]),
      ],
    ]);
    const offered: OfferedListedTool = {
      kind: "listed",
      name: "notes__lookup",
      listedName: "lookup",
      description: new UntrustedText("Finds a note."),
      parameters,
      risk: "write",
      untrusted: true,
    };
    const text = listedToolText(offered);
    expect(text.description).toBe("Finds a note.");
    expect(canonical(text.parameters)).toBe(
      '{"properties":{"__proto__":{"enum":["a"],"title":"Proto"}},"type":"object"}',
    );
  });

  it("writes an http address as trust does, without the fragment and with the query", async () => {
    const one = unwrap(await httpToolServer("HTTPS://Notes.Example.com:443/mcp#top", {}, digest));
    const two = unwrap(await httpToolServer("https://notes.example.com/mcp", {}, digest));
    expect(one).toEqual({ kind: "http", url: "https://notes.example.com/mcp", headers: null });
    expect(sameToolServer(one, two)).toBe(true);
    const teamA = unwrap(await httpToolServer("https://notes.example.com/mcp?team=a", {}, digest));
    const teamB = unwrap(await httpToolServer("https://notes.example.com/mcp?team=b", {}, digest));
    expect(sameToolServer(teamA, teamB)).toBe(false);
  });

  it("refuses an http address with user info, as trust does", async () => {
    const result = await httpToolServer("https://ops:pw@notes.example.com/mcp", {}, digest);
    expect(result.ok).toBe(false);
  });

  it("keeps headers only as a digest, so a typed-in token never reaches the address", async () => {
    const typed = unwrap(
      await httpToolServer(
        "https://notes.example.com/mcp",
        { Authorization: "Bearer typed-in-token-1" },
        digest,
      ),
    );
    expect(JSON.stringify(typed)).not.toContain("typed-in-token");
    expect(typed).toMatchObject({ headers: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) });
    const changed = unwrap(
      await httpToolServer(
        "https://notes.example.com/mcp",
        { Authorization: "Bearer typed-in-token-2" },
        digest,
      ),
    );
    expect(sameToolServer(typed, changed)).toBe(false);
  });

  it("keeps a secret reference as written, so rotating the secret changes nothing", async () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a workspace's secret reference, written literally
    const reference = "${NOTES_TOKEN}";
    const headers = { Authorization: `Bearer ${reference}` };
    expect(await writtenDigest(headers, digest)).toBe(await writtenDigest({ ...headers }, digest));
    const server = await stdioToolServer(
      { command: "notes-mcp", args: [`--token=${reference}`], env: {} },
      digest,
    );
    expect(server).toEqual({
      kind: "stdio",
      command: "notes-mcp",
      args: [`--token=${reference}`],
      pin: null,
      cwd: ".",
      env: null,
      secretEnv: null,
    });
  });

  it("asks again when a wrapper's environment points at another server", async () => {
    const at = async (url: string) =>
      stdioToolServer({ command: "notes-wrapper", args: [], env: { NOTES_SERVER: url } }, digest);
    expect(
      sameToolServer(
        await at("https://notes.example.com/mcp"),
        await at("https://other.example.com/mcp"),
      ),
    ).toBe(false);
  });

  it("asks again when a stdio server starts in another folder", async () => {
    const at = async (cwd?: string) =>
      stdioToolServer(
        { command: "node", args: ["server.js"], env: {}, ...(cwd === undefined ? {} : { cwd }) },
        digest,
      );
    expect(sameToolServer(await at("tools/notes"), await at("tools/other"))).toBe(false);
    // Written another way, the same folder is the same server, as trust has it.
    expect(sameToolServer(await at("./tools/../tools/notes"), await at("tools/notes"))).toBe(true);
    expect(sameToolServer(await at(), await at("."))).toBe(true);
  });

  it("asks again when a stdio server's secret environment names another secret", async () => {
    const at = async (secret: string) =>
      stdioToolServer(
        { command: "notes-mcp", args: [], env: {}, secretEnv: { NOTES_TOKEN: secret } },
        digest,
      );
    const notes = await at("notes-token");
    expect(sameToolServer(notes, await at("other-token"))).toBe(false);
    expect(notes).toMatchObject({ secretEnv: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) });
    expect(JSON.stringify(notes)).not.toContain("notes-token");
  });

  it("compares integration settings as canonical JSON", () => {
    const settings = { url: "https://notes.example.com/mcp", team: "a" };
    expect(
      sameToolServer(
        { kind: "integration", id: "knowledge-mcp", version: "1.2.0", settings },
        {
          kind: "integration",
          id: "knowledge-mcp",
          version: "1.2.0",
          settings: { team: "a", url: "https://notes.example.com/mcp" },
        },
      ),
    ).toBe(true);
    expect(
      sameToolServer(
        { kind: "integration", id: "knowledge-mcp", version: "1.2.0", settings },
        { kind: "integration", id: "knowledge-mcp", version: "1.3.0", settings },
      ),
    ).toBe(false);
  });

  it("matches no address that isn't plain JSON", () => {
    const odd = {
      kind: "integration",
      id: "x",
      version: "1",
      settings: { a: Number.NaN },
    } as const;
    expect(sameToolServer(odd, odd)).toBe(false);
  });
});
