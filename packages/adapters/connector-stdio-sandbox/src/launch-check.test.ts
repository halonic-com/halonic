import { MemorySecrets } from "@halonicjs/adapter-memory";
import type { ConnectorConfig, ConnectorPin, HttpClient, SandboxProfile } from "@halonicjs/ports";
import type { FakeProgram } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { config, setUp } from "./connector-setup.spec.ts";
import { SandboxSessionEndedError } from "./errors.ts";
import { contractProgram, testPlace, testSetup } from "./fake-mcp-program.spec.ts";
import { type LocalToolPlace, localToolLaunch, type StdioConfig } from "./local-tool-launch.ts";

/** A secret value no error, event or report may ever carry. */
const secretValue = "s3cret-notes-token-9f2c";

const withSecret: ConnectorConfig = { ...config, secretEnv: { NOTES_TOKEN: "notes-token" } };

/** The profile Halonic builds for {@link withSecret}, holding the secret's value. */
const secretProfile: SandboxProfile = localToolLaunch(
  withSecret.transport as StdioConfig,
  testPlace,
  null,
  { NOTES_TOKEN: secretValue },
).profile;

function secretsWithToken(): MemorySecrets {
  return new MemorySecrets({ "notes-token": secretValue });
}

const pin: ConnectorPin = {
  registry: "npm",
  registryUrl: "https://registry.npmjs.org",
  package: "@acme/notes-mcp",
  version: "1.2.3",
};

const pinned: ConnectorConfig = {
  ...config,
  transport: { kind: "stdio", command: "npx", args: ["-y", "@acme/notes-mcp"], env: {}, pin },
};

const pinnedPlace: LocalToolPlace = {
  ...testPlace,
  runner: {
    found: { program: "/acme/bin/npx", leadingArgs: [], pathFolders: ["/acme/bin"] },
    platform: "linux",
  },
};

/** An npm registry that lists exactly the pinned package and version, and remembers what it was asked. */
function npmRegistry(asked: string[]): HttpClient {
  return {
    fetch: async (url) => {
      asked.push(String(url));
      const document = { name: pin.package, versions: { [pin.version]: { version: pin.version } } };
      return new Response(JSON.stringify(document), { status: 200 });
    },
  };
}

verifies("connector-stdio-sandbox.local-tool-profile", () => {
  describe("the launch checks before a start", () => {
    it("starts only in a session whose profile is the one Halonic built, naming what differs and no value", async () => {
      const tampered = {
        ...secretProfile,
        network: { bridge: null, allowedSites: ["*"] },
        env: { ...secretProfile.env, NOTES_TOKEN: `${secretValue}-other` },
      };
      const { sandbox, factory, context } = setUp({ profile: tampered });
      const start = vi.spyOn(sandbox, "start");
      const client = factory.create(withSecret, { ...context, secrets: secretsWithToken() });
      const refused = (await client.listTools().catch((error: unknown) => error)) as Error;
      expect(refused.message).toBe(
        `Connector "notes" didn't start: its sandbox session's profile isn't the one Halonic built for it (env.NOTES_TOKEN, network).`,
      );
      expect(refused.message).not.toContain(secretValue);
      expect(start).not.toHaveBeenCalled();
    });

    it("starts with the secrets Halonic read, and refuses one that isn't set", async () => {
      const { sandbox, factory, context } = setUp({ profile: secretProfile });
      await expect(factory.create(withSecret, context).listTools()).rejects.toThrow(
        'Connector "notes" needs the secret "notes-token", which isn\'t set.',
      );
      expect(sandbox.started).toEqual([]);
      const client = factory.create(withSecret, { ...context, secrets: secretsWithToken() });
      await client.listTools();
      expect(sandbox.started).toHaveLength(1);
      await client.close();
    });

    it("refuses a local tool the host didn't set up", async () => {
      const { sandbox, factory, context } = setUp({ factory: { localTools: () => undefined } });
      await expect(factory.create(config, context).listTools()).rejects.toThrow(
        "Connector \"notes\" is a local tool Halonic didn't set up, so it doesn't start.",
      );
      expect(sandbox.started).toEqual([]);
    });

    it("starts a pinned package after its registry lists the pin, with the runner the host found", async () => {
      const asked: string[] = [];
      const profile = localToolLaunch(pinned.transport as StdioConfig, pinnedPlace, pin, {});
      const { sandbox, factory, context } = setUp({
        profile: profile.profile,
        factory: { localTools: () => ({ ...testSetup, place: pinnedPlace }) },
      });
      const client = factory.create(pinned, { ...context, http: npmRegistry(asked) });
      await client.listTools();
      expect(asked).toEqual(["https://registry.npmjs.org/@acme%2fnotes-mcp"]);
      expect(sandbox.started).toEqual([profile.command]);
      await client.close();
    });

    it("refuses a pinned package whose registry can't be reached, and one the command pins otherwise", async () => {
      const { sandbox, factory, context } = setUp({
        factory: { localTools: () => ({ ...testSetup, place: pinnedPlace }) },
      });
      const unreachable = { fetch: () => Promise.reject(new Error("offline")) };
      await expect(
        factory.create(pinned, { ...context, http: unreachable }).listTools(),
      ).rejects.toThrow("https://registry.npmjs.org can't be reached");
      const otherVersion = {
        ...pinned,
        transport: { ...pinned.transport, args: ["-y", "@acme/notes-mcp@9.9.9"] },
      } as ConnectorConfig;
      await expect(
        factory.create(otherVersion, { ...context, http: npmRegistry([]) }).listTools(),
      ).rejects.toThrow("Halonic didn't start the connector");
      expect(sandbox.started).toEqual([]);
    });

    it("fails with the session-ended error when the session ends during the registry lookup", async () => {
      const profile = localToolLaunch(pinned.transport as StdioConfig, pinnedPlace, pin, {});
      const { sandbox, factory, context } = setUp({
        profile: profile.profile,
        factory: { localTools: () => ({ ...testSetup, place: pinnedPlace }) },
      });
      const registry = npmRegistry([]);
      const closesSession: HttpClient = {
        fetch: async (url, init) => {
          await sandbox.close();
          return registry.fetch(url, init);
        },
      };
      const client = factory.create(pinned, { ...context, http: closesSession });
      await expect(client.listTools()).rejects.toThrow(SandboxSessionEndedError);
      expect(sandbox.started).toEqual([]);
    });
  });

  it("never lets a secret of the profile out: not in a refusal, an event, a stop or a tool's failure", async () => {
    const printsSecret: FakeProgram = async (io) => {
      io.writeError(`token=${io.profile.env["NOTES_TOKEN"]}\n`);
      return contractProgram([])(io);
    };
    const { sandbox, factory, context, blocked } = setUp({
      profile: secretProfile,
      program: printsSecret,
    });
    const client = factory.create(withSecret, { ...context, secrets: secretsWithToken() });
    const seen: unknown[] = [];
    seen.push(await client.listTools());
    seen.push(await client.callTool("broken_note", {}).catch((error: unknown) => error));
    sandbox.block({ kind: "network", host: "tracker.example.test", port: 443 });
    seen.push(...blocked);
    await sandbox.close();
    seen.push(await client.listTools().catch((error: unknown) => error));
    for (const item of seen) expect(JSON.stringify(serialise(item))).not.toContain(secretValue);
  });
});

/** An error as its name, message and own fields, as a log would write it. */
function serialise(value: unknown): unknown {
  if (!(value instanceof Error)) return value;
  return { ...value, name: value.name, message: value.message, stack: value.stack };
}
