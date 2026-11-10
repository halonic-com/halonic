import type { Agent, Connector } from "@halonicjs/format";
import type { Clock, Digest, TrustRecord } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import { TestTrustStore } from "./testing/test-trust-store.ts";
import { type TrustCheck, TrustService, type TrustSubject } from "./trust-service.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const location = "/workspaces/acme";
const commandPaths = new Map([["node", "/usr/bin/node"]]);

function program(id: string, env: Record<string, string> = {}): Connector {
  return {
    version: 1,
    id,
    transport: { stdio: { command: "node", args: [`${id}.js`], env } },
    tools: { approve: [] },
  };
}

function subject(...connectors: Connector[]): TrustSubject {
  return { location, connectors, commandPaths, agents: [] };
}

/** An agent that runs in Claude Code and may reach the given sites. */
function harnessAgent(allowedSites: string[]): Agent {
  return {
    version: 1,
    id: "coder",
    name: "Coder",
    params: {},
    instructions: "",
    skills: [],
    knowledge: [],
    connectors: [],
    runLogs: false,
    collections: [],
    subagents: [],
    methods: {},
    output: { type: "text" },
    maxSteps: 6,
    harness: "claude-code",
    allowedSites,
  };
}

function setup() {
  const store = new TestTrustStore();
  let now = "2026-11-09T10:00:00.000Z";
  const clock: Clock = { now: () => new Date(now) };
  const service = new TrustService({ store, digest, clock, appVersion: "0.1.0" });
  const later = (iso: string) => {
    now = iso;
  };
  return { store, service, later };
}

/** Trusts the workspace as a person would: with the fingerprint the check showed. */
async function trustAsPerson(service: TrustService, workspace: TrustSubject): Promise<void> {
  const shown = await service.check(workspace);
  const granted = await service.grant(workspace, shown.fingerprint, "cli");
  expect(granted.ok).toBe(true);
}

function expectStatus<S extends TrustCheck["status"]>(
  check: TrustCheck,
  status: S,
): asserts check is Extract<TrustCheck, { status: S }> {
  expect(check.status).toBe(status);
}

verifies("app.trust-service", () => {
  it("calls a workspace without a record new, with its full fingerprint and no grant", async () => {
    const { service } = setup();

    const check = await service.check(subject(program("files")));

    expectStatus(check, "new");
    expect(check.fingerprint).toMatch(/^hfp1:[0-9a-f]{64}$/);
    expect(check.content.connectors.map((connector) => connector.id)).toEqual(["files"]);
    expect(check).not.toHaveProperty("grant");
  });

  it("hands out a grant once a person trusted the fingerprint they were shown", async () => {
    const { service, store } = setup();
    const workspace = subject(program("files"));
    await trustAsPerson(service, workspace);

    const check = await service.check(workspace);

    expectStatus(check, "trusted");
    expect(check.grant).toEqual({ location, fingerprint: check.fingerprint });
    expect(check.shrunk).toEqual({ connectors: [], agents: [] });
    expect(await store.get(location)).toMatchObject({
      fingerprint: check.fingerprint,
      grantedAt: "2026-11-09T10:00:00.000Z",
      appVersion: "0.1.0",
      origin: "cli",
      pins: {},
    });
  });

  it("asks again when a connector gains NODE_OPTIONS, with what changed and when it was trusted", async () => {
    const { service } = setup();
    await trustAsPerson(service, subject(program("files")));

    const check = await service.check(
      subject(program("files", { NODE_OPTIONS: "--require ./x.js" })),
    );

    expectStatus(check, "changed");
    expect(check.trustedAt).toBe("2026-11-09T10:00:00.000Z");
    expect(check.changes.changed.map((change) => [change.id, change.fields])).toEqual([
      ["files", ["settings"]],
    ]);
    expect(check).not.toHaveProperty("grant");
  });

  it("shrinks the record without asking when whole connectors are removed", async () => {
    const { service, store, later } = setup();
    await trustAsPerson(service, subject(program("files"), program("mail")));
    const before = (await store.get(location)) as TrustRecord;
    await store.grant({ ...before, pins: { mail: pin("@acme/mail") } });
    later("2026-11-10T08:00:00.000Z");

    const check = await service.check(subject(program("files")));

    expectStatus(check, "trusted");
    expect(check.shrunk).toEqual({ connectors: ["mail"], agents: [] });
    expect(check.grant.fingerprint).toBe(check.fingerprint);
    expect(await store.get(location)).toMatchObject({
      fingerprint: check.fingerprint,
      content: check.content,
      grantedAt: "2026-11-09T10:00:00.000Z",
      pins: {},
    });
  });

  it("shrinks the record without asking when only a harness agent is removed, and says so", async () => {
    const { service, store } = setup();
    await trustAsPerson(service, { ...subject(program("files")), agents: [harnessAgent([])] });
    const before = (await store.get(location)) as TrustRecord;

    const check = await service.check(subject(program("files")));

    expectStatus(check, "trusted");
    expect(check.shrunk).toEqual({ connectors: [], agents: ["coder"] });
    expect(check.fingerprint).not.toBe(before.fingerprint);
    expect(await store.get(location)).toMatchObject({
      fingerprint: check.fingerprint,
      content: check.content,
      grantedAt: before.grantedAt,
    });
  });

  it("doesn't shrink a record whose content no longer gives its fingerprint", async () => {
    const { service, store } = setup();
    await trustAsPerson(service, subject(program("files"), program("mail")));
    const record = (await store.get(location)) as TrustRecord;
    // A hand edit adds NODE_OPTIONS to the trusted content, so dropping
    // `mail` would otherwise look like a removal and trust it silently.
    const edited = await service.check(
      subject(program("files", { NODE_OPTIONS: "-r x" }), program("mail")),
    );
    await store.grant({ ...record, content: edited.content });

    const check = await service.check(subject(program("files", { NODE_OPTIONS: "-r x" })));

    expectStatus(check, "changed");
    expect(await store.get(location)).toMatchObject({ fingerprint: record.fingerprint });
  });

  it("treats content from another scheme as nothing trusted, so every connector is new", async () => {
    const { service, store } = setup();
    await store.grant({
      location,
      fingerprint: "hfp0:old",
      content: { programs: [] },
      grantedAt: "2026-11-01T10:00:00.000Z",
      appVersion: "0.0.9",
      pins: {},
      origin: "migration",
    });

    const check = await service.check(subject(program("files")));

    expectStatus(check, "changed");
    expect(check.changes.added.map((connector) => connector.id)).toEqual(["files"]);
    expect(check.changes.onlyRemoves).toBe(false);
  });

  it("calls the workspace unreadable when the store throws, with the store's error", async () => {
    const { service, store } = setup();
    store.breakRecords();

    const check = await service.check(subject(program("files")));

    expectStatus(check, "unreadable");
    expect(String(check.error)).toContain(location);
    expect(check).not.toHaveProperty("grant");
  });

  it("saves nothing when the shown fingerprint is a prefix or out of date", async () => {
    const { service, store } = setup();
    const old = await service.check(subject(program("files")));
    const workspace = subject(program("files", { PYTHONSTARTUP: "x.py" }));
    const { fingerprint } = await service.check(workspace);

    for (const shown of [fingerprint.slice(0, 12), old.fingerprint, ""]) {
      expect(await service.grant(workspace, shown, "prompt")).toEqual({
        ok: false,
        error: { kind: "fingerprint-changed", fingerprint },
      });
    }
    expect(await store.list()).toEqual([]);
  });

  it("puts the resolved command in the fingerprint, and can't be called without it", async () => {
    const { service } = setup();
    const connectors = [program("files")];
    const here = await service.check({ location, connectors, commandPaths, agents: [] });
    const there = await service.check({
      location,
      connectors,
      commandPaths: new Map([["node", "/opt/evil/node"]]),
      agents: [],
    });

    expect(here.fingerprint).not.toBe(there.fingerprint);
    expectTypeOf<TrustSubject["commandPaths"]>().toEqualTypeOf<ReadonlyMap<string, string>>();
    // @ts-expect-error commandPaths is required
    const missing: TrustSubject = { location, connectors, agents: [] };
    expect(missing).toBeDefined();
  });

  it("asks again when a harness agent's sites change, and can't be called without the agents", async () => {
    const { service } = setup();
    const coder = harnessAgent(["api.example.com"]);
    await trustAsPerson(service, { ...subject(program("files")), agents: [coder] });

    const check = await service.check({
      ...subject(program("files")),
      agents: [harnessAgent(["api.example.com", "pypi.org"])],
    });

    expectStatus(check, "changed");
    expect(check.changes.agents.changed.map((change) => change.fields)).toEqual([["allowedSites"]]);
    // @ts-expect-error agents is required
    const missing: TrustSubject = { location, connectors: [], commandPaths };
    expect(missing).toBeDefined();
  });

  it("lists package runners as unpinned, also behind a shell, and keeps the flag out of the fingerprint", async () => {
    const { service } = setup();
    const runner = (id: string, command: string, args: string[]): Connector => ({
      version: 1,
      id,
      transport: { stdio: { command, args, env: {} } },
      tools: { approve: [] },
    });
    const connectors = [
      runner("mail", "npx", ["-y", "@acme/mail-mcp"]),
      program("files"),
      runner("crm", "cmd", ["/c", "uvx", "crm-mcp"]),
    ];

    const check = await service.check({ location, connectors, commandPaths, agents: [] });

    expectStatus(check, "new");
    expect(check.unpinned).toEqual(["crm", "mail"]);
    expect(JSON.stringify(check.content)).not.toContain("unpinned");
    const filesOnly = await service.check(subject(program("files")));
    expect(filesOnly.unpinned).toEqual([]);
  });

  it("offers no way to save a record without the fingerprint a person was shown", () => {
    expectTypeOf<keyof TrustService>().toEqualTypeOf<"check" | "grant" | "revoke" | "list">();
    const methods = Object.getOwnPropertyNames(TrustService.prototype).filter(
      (name) => name !== "constructor",
    );
    expect(methods.filter((name) => /update|refresh|save|accept/i.test(name))).toEqual([]);
  });

  it("revokes and lists through the store", async () => {
    const { service } = setup();
    await trustAsPerson(service, subject(program("files")));
    expect((await service.list()).map((record) => record.location)).toEqual([location]);

    await service.revoke(location);

    expect(await service.list()).toEqual([]);
    expectStatus(await service.check(subject(program("files"))), "new");
  });
});

function pin(name: string) {
  return {
    registry: "npm" as const,
    registryUrl: "https://registry.npmjs.org",
    package: name,
    version: "1.0.0",
  };
}
