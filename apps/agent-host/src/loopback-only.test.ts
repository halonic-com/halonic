import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { connect } from "node:net";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startGatewayListener } from "@halonicjs/adapter-remote-gateway";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { startHostServer } from "./server/host-server.ts";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * The folders of everything that must never listen beyond this computer: the
 * bridge, the model providers, MCP, secrets and tokens, the harnesses, the
 * host itself and the gateway (which a tunnel reaches by forwarding to its
 * loopback port, never by listening elsewhere).
 */
const sealedFolders = [
  "apps/agent-host/src",
  "packages/adapters/harness-bridge/src",
  "packages/adapters/harness-claude-code/src",
  "packages/adapters/harness-codex/src",
  "packages/adapters/mcp/src",
  "packages/adapters/model-anthropic/src",
  "packages/adapters/model-openai/src",
  "packages/adapters/env-secrets/src",
  "packages/adapters/secrets-file/src",
  "packages/adapters/secrets-tauri/src",
  "packages/adapters/token-store/src",
  "packages/adapters/remote-gateway/src",
];

/** What a `listen` call may name: a loopback constant or literal, or a socket's path. */
const allowedListen =
  /\.listen\(\s*(?:0|port|(?:run\.)?socketPath)\s*(?:,\s*(?:loopbackHost|gatewayLoopbackHost|"127\.0\.0\.1")\s*)?[,)]/;

function sourceFiles(folder: string): string[] {
  return readdirSync(join(repoRoot, folder), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => !/\.test(-helper)?\.tsx?$/.test(file));
}

function listenCalls(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(/\.listen\([^;]*/g)].map((call) => call[0]);
}

/** What in `file` would let it listen beyond this computer. */
function problemsIn(file: string): string[] {
  const wildcard = /["'`](?:0\.0\.0\.0|::|::0|\[::\])["'`]/.test(readFileSync(file, "utf8"));
  const wildcardProblems = wildcard ? [`${file}: names a wildcard address`] : [];
  const badCalls = listenCalls(file).filter((call) => !allowedListen.test(call));
  return [...wildcardProblems, ...badCalls.map((call) => `${file}: ${call.slice(0, 60)}`)];
}

/** An address of this computer that isn't loopback, such as its LAN address, if it has one. */
function outsideAddress(): string | undefined {
  const all = Object.values(networkInterfaces()).flatMap((list) => list ?? []);
  return all.find((address) => address.family === "IPv4" && !address.internal)?.address;
}

function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: 1000 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

verifies("agent-host.loopback-only", () => {
  describe("what is written", () => {
    it("has no listener on a wildcard or another address in the sealed packages", () => {
      const offenders = sealedFolders.flatMap(sourceFiles).flatMap(problemsIn);
      expect(offenders).toEqual([]);
    });

    it("still finds the listeners it guards", () => {
      const withListeners = sealedFolders.filter((folder) =>
        sourceFiles(folder).some((file) => listenCalls(file).length > 0),
      );
      expect(withListeners).toEqual([
        "apps/agent-host/src",
        "packages/adapters/harness-bridge/src",
        "packages/adapters/remote-gateway/src",
      ]);
    });
  });

  describe("what runs", () => {
    it("keeps the host's server and the gateway off this computer's other addresses", async () => {
      const outside = outsideAddress();
      const host = await startHostServer("token", []);
      const gateway = await startGatewayListener({
        source: { list: () => [] } as never,
        policy: { allowRiskyRemotely: () => false },
      });
      try {
        const hostPort = Number(new URL(host.url).port);
        expect(await canConnect("127.0.0.1", hostPort)).toBe(true);
        expect(await canConnect("127.0.0.1", gateway.port)).toBe(true);
        if (outside !== undefined) {
          expect(await canConnect(outside, hostPort)).toBe(false);
          expect(await canConnect(outside, gateway.port)).toBe(false);
        }
      } finally {
        await gateway.close();
        await host.close();
      }
    });

    it("sees a listener on every address as a failure, so the check above means something", async () => {
      const outside = outsideAddress();
      const wide = createServer();
      await new Promise<void>((resolve) => wide.listen(0, "0.0.0.0", resolve));
      try {
        const address = wide.address();
        const port = typeof address === "object" && address !== null ? address.port : 0;
        // When the machine has no outside address there is nothing to prove; loopback still answers.
        expect(await canConnect(outside ?? "127.0.0.1", port)).toBe(true);
      } finally {
        wide.close();
      }
    });
  });
});
