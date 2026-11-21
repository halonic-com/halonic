import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileRecordStore, FileTrustStore } from "@halonicjs/adapter-fs-node";
import { createTokenStore, storedTokenNames } from "@halonicjs/adapter-token-store";
import { type ApprovedSignIn, createSignInGrants } from "@halonicjs/oauth-sign-in";
import type { HttpClient } from "@halonicjs/ports";
import { profileFolder, tokenFolders } from "@halonicjs/profile";
import { encodeBase64url } from "@halonicjs/std";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pluginCommandWith } from "./commands/plugin/command.ts";
import { createTrustCommand } from "./commands/trust/command.ts";
import { exitCode } from "./exit-code.ts";
import type { PluginSetup } from "./plugin-host.ts";
import { runCli } from "./run-cli.ts";
import { captureIo } from "./test/capture-io.ts";
import { removeTestFolder } from "./test/remove-folder.ts";
import { webCryptoDigest } from "./workspace-runs.ts";

// Fake values only; none is real.
const tokenKey = encodeBase64url(new Uint8Array(32).fill(7));
const refreshToken = "fake-refresh-token-0000000001";
const clientSecret = "fake-client-secret-0000000001";
const clock = { now: () => new Date("2026-11-21T09:00:00.000Z") };

/** The sign-in `weather-account` as the person approved it, with the plugin's client secret `weather-client`. */
const approved: ApprovedSignIn = {
  flow: "oauth-code",
  authorizeUrl: "https://auth.weather.example/oauth/authorize",
  tokenUrl: "https://auth.weather.example/oauth/token",
  revokeUrl: "https://auth.weather.example/oauth/revoke",
  clientId: "fake-client",
  clientAuth: "post",
  clientSecretName: "weather-client",
  scopes: ["forecast.read"],
  accessHosts: ["api.weather.example"],
  as: "bearer",
};

const manifest = `id: weather
version: 1.2.0
sdk: 1
name: Weather
backend:
  hosts: [api.weather.example]
  tools:
    - { name: get_forecast, description: The forecast., risk: read, untrusted: true }
`;

let folder: string;
let setup: PluginSetup;
let revoked: { url: string; body: string }[];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-plugin-sign-out-"));
  revoked = [];
  const http: HttpClient = {
    async fetch(url, init) {
      revoked.push({ url, body: String(init?.body) });
      return new Response(null, { status: 200 });
    },
  };
  setup = {
    profile: {
      platform: process.platform === "win32" ? "windows" : "linux",
      homeFolder: folder,
      variables: {
        HALONIC_HOME: join(folder, "profile"),
        HALONIC_SECRET_TOKEN_KEY: tokenKey,
        HALONIC_SECRET_PLUGIN__WEATHER__WEATHER_CLIENT: clientSecret,
      },
    },
    clock,
    http,
  };
});

afterEach(async () => {
  await removeTestFolder(folder);
});

/** The profile's sign-in grants, sealed with the test's token key, as the agent host keeps them. */
function grantRecords() {
  if (setup.profile === undefined) throw new Error("the test sets the profile");
  const records = new FileRecordStore(
    tokenFolders(profileFolder(setup.profile)).integrationSignIns,
  );
  const tokens = createTokenStore({
    records,
    secrets: { get: async (name) => (name === "token-key" ? tokenKey : null) },
    clock,
  });
  return { records, grants: createSignInGrants(tokens, webCryptoDigest) };
}

/** Adds Weather from its source folder with `halonic plugin add`, and gives what it printed. */
async function addWeather() {
  const source = join(folder, "sources", "weather");
  await mkdir(join(source, "backend"), { recursive: true });
  await writeFile(join(source, "plugin.yaml"), manifest);
  await writeFile(join(source, "backend", "index.js"), "export default {};\n");
  const io = captureIo(folder);
  const code = await runCli(["plugin", "add", source], io, [pluginCommandWith(setup)]);
  return { code, io };
}

/** Adds Weather, trusts it and saves a grant for its sign-in and one for another plugin's. */
async function addSignedInWeather(): Promise<void> {
  const { io } = await addWeather();
  const fingerprint = io.stdout.at(-1) ?? "";
  await trust(["--plugin", "weather", "--yes", "--fingerprint", fingerprint]);
  const { grants } = grantRecords();
  await grants.save("weather", "weather-account", { refreshToken, approved });
  await grants.save("rain", "rain-account", { refreshToken, approved });
}

async function trust(args: readonly string[]) {
  const io = captureIo(folder);
  const machine = () => ({
    store: new FileTrustStore(join(folder, "profile", "trust")),
    clock,
    commandSearch: { path: undefined, endings: [] },
  });
  return await runCli(["trust", ...args], io, [createTrustCommand(machine, setup)]);
}

const savedNames = async () => (await storedTokenNames(grantRecords().records)).sort();

describe("app.plugin-sign-out in the CLI", () => {
  it("signs out the plugin's sign-ins when its trust is removed, revoking with its own client secret", async () => {
    await addSignedInWeather();

    expect(await trust(["--plugin", "weather", "--remove"])).toBe(exitCode.ok);

    expect(revoked).toHaveLength(1);
    expect(revoked[0]?.url).toBe("https://auth.weather.example/oauth/revoke");
    expect(revoked[0]?.body).toContain(`client_secret=${clientSecret}`);
    expect(await savedNames()).toEqual(["s4_rain_rain_account"]);
  });

  it("signs out the plugin's sign-ins when it is removed", async () => {
    await addSignedInWeather();
    const io = captureIo(folder);

    const code = await runCli(["plugin", "remove", "weather", "--yes"], io, [
      pluginCommandWith(setup),
    ]);

    expect(code).toBe(exitCode.ok);
    expect(revoked).toHaveLength(1);
    expect(await savedNames()).toEqual(["s4_rain_rain_account"]);
  });

  it("still removes the grant when the revoke fails", async () => {
    await addSignedInWeather();
    setup = {
      ...setup,
      http: {
        fetch: async () => {
          throw new Error("connect failed");
        },
      },
    };

    expect(await trust(["--plugin", "weather", "--remove"])).toBe(exitCode.ok);

    expect(await savedNames()).toEqual(["s4_rain_rain_account"]);
  });

  it("signs out what a plugin deleted by hand left before a new one is added under its id", async () => {
    await addSignedInWeather();
    await rm(join(folder, "profile", "plugins", "weather"), { recursive: true });

    expect((await addWeather()).code).toBe(exitCode.ok);

    expect(revoked).toHaveLength(1);
    expect(await savedNames()).toEqual(["s4_rain_rain_account"]);
  });
});
