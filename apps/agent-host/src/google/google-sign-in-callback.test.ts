import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeBase64url } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { googleRoutes } from "./google-routes.ts";
import { openGoogleSetup } from "./google-setup.ts";

// Invented values only: none is a real key or token.
const tokenKey = encodeBase64url(new Uint8Array(32).fill(7));
const token = randomLaunchToken();

let folder: string;
let server: HostServer | undefined;
let logged: string[];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-google-sign-in-callback-"));
  logged = [];
  await mkdir(join(folder, "acme"), { recursive: true });
  await writeFile(join(folder, "acme", "workspace.yaml"), "id: acme\nname: Acme\n");
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await rm(folder, { recursive: true, force: true });
});

async function started(): Promise<string> {
  const google = openGoogleSetup({
    profile: {
      platform: process.platform === "win32" ? "windows" : "linux",
      root: join(folder, "profile"),
    },
    env: { HALONIC_SECRET_TOKEN_KEY: tokenKey },
    workspaceRoots: [join(folder, "acme")],
  });
  server = await startHostServer(token, googleRoutes({ google, log: (text) => logged.push(text) }));
  return server.url;
}

interface Answer {
  status: number;
  type: string | undefined;
  text: string;
}

/** Sends a GET with exactly these headers; `fetch` can't set `Host`. */
function get(url: string, path: string, headers: Record<string, string>): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const sent = request(`${url}${path}`, { headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () =>
        resolve({
          status: response.statusCode ?? 0,
          type: response.headers["content-type"],
          text: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });
    sent.on("error", reject);
    sent.end();
  });
}

const callback = "/api/google/callback?state=nobody-started-this&code=fake-code";

verifies("agent-host.google-sign-in-callback", () => {
  describe("the Google sign-in callback", () => {
    it("answers the page for a state no sign-in started, without the launch token", async () => {
      const url = await started();

      const answer = await get(url, callback, { host: new URL(url).host });

      expect(answer.status).toBe(200);
      expect(answer.type).toContain("text/html");
      expect(answer.text).toContain("no longer valid");
      expect(answer.text).not.toContain("nobody-started-this");
    });

    it("still refuses another host name", async () => {
      const url = await started();

      const answer = await get(url, callback, { host: "attacker.example" });

      expect(answer.status).toBe(421);
    });

    it("still refuses a request from a web page", async () => {
      const url = await started();

      const answer = await get(url, callback, {
        host: new URL(url).host,
        origin: "https://attacker.example",
      });

      expect(answer.status).toBe(403);
    });

    it("still needs the token for every other path", async () => {
      const url = await started();

      const answer = await get(url, "/api/google/other", { host: new URL(url).host });

      expect(answer.status).toBe(401);
    });
  });
});
