import type { Secrets } from "@halonicjs/ports";
import type { ErrorLog, Server, ServerConfig, ServerPorts } from "./api.ts";
import { createServer } from "./create-server.ts";

/** A port the test doesn't expect the server to touch: any call fails the test loudly. */
function unusedPort<Port extends object>(name: string): Port {
  return new Proxy(
    {},
    {
      get(_target, method) {
        throw new Error(`${name}.${String(method)} was called, but this test doesn't expect it`);
      },
    },
  ) as Port;
}

/** A server built from fakes, for tests. `passwordHash` null means no password is configured. */
export function testServer(options: {
  passwordHash: string | null;
  config?: Partial<ServerConfig>;
  secrets?: Secrets;
  errorLog?: ErrorLog;
}): Server {
  const ports: ServerPorts = {
    runs: unusedPort("runs"),
    secrets: options.secrets ?? {
      get: async (name) => (name === "serve-password" ? options.passwordHash : null),
    },
    passwordHasher: unusedPort("passwordHasher"),
    coordination: unusedPort("coordination"),
    requestCounts: unusedPort("requestCounts"),
    errorLog: options.errorLog ?? { record: () => {} },
    clock: { now: () => new Date("2026-11-12T10:00:00Z") },
    ids: { next: (prefix) => `${prefix}_1` },
  };
  const config: ServerConfig = {
    deploymentId: "acme",
    version: "0.1.0",
    minAppVersion: "0.1.0",
    allowedHosts: ["halonic.acme.example"],
    maxBodyBytes: 1024,
    ...options.config,
  };
  return createServer({ config, ports });
}
