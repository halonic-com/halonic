import type { Coordination } from "@halonicjs/ports";
import type { RequestLogEntry, Server } from "./api.ts";
import { fakeClientId, fakeGoogle, fakeSecret } from "./google-fakes.test-helper.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

export const route = { app: "own", runsOn: "this-computer" } as const;
// An invented workspace key: 32 hex characters, as the profile makes them.
export const connector = { workspace: "0123456789abcdef0123456789abcdef", id: "gmail" };
export const lanHost = "lan.example:8080";

// Invented values. None is real.
export const fakeCode = "fake-auth-code-0000000001";
export const fakeState = "fake-state-0000000001";

export function setup(options: { password?: boolean } = {}) {
  const clock = new TestClock();
  const google = fakeGoogle(clock);
  const requestLog: RequestLogEntry[] = [];
  const errors: unknown[] = [];
  const server: Server = testServer({
    passwordHash: options.password === true ? "hash:pw" : null,
    clock,
    passwordHasher: new FakePasswordHasher(),
    coordination: new FakeCoordination(clock) as unknown as Coordination,
    google,
    requestLog: { record: (entry) => requestLog.push(entry) },
    errorLog: { record: (cause) => errors.push(cause) },
    config: { allowedHosts: ["localhost", lanHost] },
  });
  return { server, google, clock, requestLog, errors };
}

export type Setup = ReturnType<typeof setup>;

/** A setup with a client ID and a saved secret, ready to sign in. */
export async function readySetup({ google }: Setup): Promise<string> {
  const { accountRef } = await google.setups.start({ route, connector, accountType: "personal" });
  await google.setups.update(accountRef, { kind: "client-id", clientId: fakeClientId });
  const clientRef = await google.clientSecrets.saveClientSecret(fakeSecret);
  await google.setups.update(accountRef, { kind: "client-secret-saved", clientRef });
  return accountRef;
}

export function startSignIn(
  server: Server,
  accountRef: string,
  headers: Record<string, string> = {},
  origin = "http://localhost:4321",
): Promise<Response> {
  return server.handle(
    new Request(`${origin}/api/google/setups/${accountRef}/sign-in`, {
      method: "POST",
      headers: { host: new URL(origin).host, "sec-fetch-site": "same-origin", ...headers },
    }),
  );
}

/** Google's redirect: a plain navigation with no session and no site header a script could set. */
export function callback(server: Server, query: string, headers: Record<string, string> = {}) {
  return server.handle(
    new Request(`http://localhost:4321/api/google/callback?${query}`, {
      headers: { host: "localhost:4321", ...headers },
    }),
  );
}

export const codeQuery = `state=${fakeState}&code=${fakeCode}`;

/** Everything a test can see of what the server said and kept, to check a value isn't in it. */
export function everythingSaid(
  texts: readonly string[],
  requestLog: readonly RequestLogEntry[],
  errors: readonly unknown[],
): string {
  return [
    ...texts,
    JSON.stringify(requestLog),
    ...errors.map((error) => `${String(error)} ${JSON.stringify(error)}`),
  ].join("\n");
}
