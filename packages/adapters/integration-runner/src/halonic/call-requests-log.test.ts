// A failed call carries Halonic's own log of its requests (HAL-19185): the
// kit's real client across the bridge, so the entries are the kit's.

import { createLimitedHttpClient, RequestLog } from "@halonicjs/adapter-integration-kit";
import type { ConnectorCallRequest, HttpClient } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { bridged, type Tool } from "../bridged.test-helper.ts";
import { fakeKitClient, fakeSecret } from "../pipes.test-helper.ts";
import { RunnerToolError } from "./limits.ts";

const replyCanary = "reply-canary-7d1f";

const policy = {
  name: "acme",
  hosts: ["api.example.com"],
  secrets: {
    "bearer-key": { hosts: ["api.example.com"], placement: { as: "bearer" as const } },
  },
  signIns: {},
  tokens: [],
};

/**
 * The kit's real client over a server that answers each path with its
 * status, a 429 with a wait the kit won't make, and never answers a path in `hanging`, calling `onHang` instead:
 * the request waits until it is aborted.
 */
function realKit(
  statuses: Readonly<Record<string, number>>,
  hanging: readonly string[] = [],
  onHang: () => void = () => undefined,
) {
  const transport: HttpClient = {
    fetch: async (url, init = {}) => {
      const path = new URL(url).pathname;
      if (hanging.includes(path)) {
        onHang();
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        });
      }
      const status = statuses[path] ?? 200;
      // A wait longer than the kit's 30 s, so it gives a 429 back without trying again.
      const headers = status === 429 ? { "retry-after": "60" } : undefined;
      return new Response(`{"note":"${replyCanary}"}`, { status, ...(headers ? { headers } : {}) });
    },
  };
  return createLimitedHttpClient({
    policy,
    transport,
    secrets: { get: async () => fakeSecret },
    log: new RequestLog(),
  });
}

/** The error a call failed with, with the requests on it. */
async function failure(promise: Promise<unknown>): Promise<RunnerToolError> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof RunnerToolError)) throw new Error(`Not a tool error: ${String(error)}`);
  return error;
}

/** A tool that fetches `url` with the key placed, then fails. */
function fetchThenFail(url: string): Tool {
  return async (host) => {
    const response = await host.http
      .fetch(url, { method: "POST", auth: { secret: "bearer-key", as: "bearer" } })
      .catch(() => undefined);
    await response?.text();
    throw new Error("The service said no.");
  };
}

verifies("integration-runner.call-requests-log", () => {
  it("puts the kit's entries of the call's requests on its error, oldest first", async () => {
    const tool: Tool = async (host) => {
      await (await host.http.fetch("https://api.example.com/v1/items?page=2")).text();
      await (await host.http.fetch("https://api.example.com/v1/slow")).text();
      throw new Error("Too many requests.");
    };
    const { run } = await bridged(tool, realKit({ "/v1/slow": 429 }));
    const error = await failure(run());
    expect(error.callRequests).toStrictEqual<ConnectorCallRequest[]>([
      { method: "GET", host: "api.example.com", path: "/v1/items", status: 200 },
      { method: "GET", host: "api.example.com", path: "/v1/slow", status: 429 },
    ]);
  });

  it("logs a host the sheet doesn't declare as the kit refused it", async () => {
    const tool = fetchThenFail("https://shopify.com.example.net/admin");
    const { run } = await bridged(tool, realKit({}));
    const error = await failure(run());
    expect(error.callRequests).toStrictEqual([
      {
        method: "POST",
        host: "shopify.com.example.net",
        path: "/admin",
        refusal: "host-not-allowed",
      },
    ]);
  });

  it("never gives one call the requests of another running at the same time", async () => {
    let releaseFirst: () => void = () => undefined;
    const firstWaits = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let calls = 0;
    const tool: Tool = async (host) => {
      const first = calls === 0;
      calls += 1;
      const path = first ? "/v1/slow" : "/v1/forbidden";
      await (await host.http.fetch(`https://api.example.com${path}`)).text();
      if (first) await firstWaits;
      else releaseFirst();
      throw new Error("No.");
    };
    const { connection, finish } = await bridged(
      tool,
      realKit({ "/v1/slow": 429, "/v1/forbidden": 403 }),
    );
    const [slow, forbidden] = await Promise.all([
      failure(connection.callTool("run", {})),
      failure(connection.callTool("run", {})),
    ]);
    await finish();
    expect(slow.callRequests?.map((request) => request.status)).toStrictEqual([429]);
    expect(forbidden.callRequests?.map((request) => request.status)).toStrictEqual([403]);
  });

  it("carries none while a request of the call still waits for its answer", async () => {
    let postArrived: () => void = () => undefined;
    const postReachedTheKit = new Promise<void>((resolve) => {
      postArrived = resolve;
    });
    const tool: Tool = async (host) => {
      await (await host.http.fetch("https://api.example.com/v1/items")).text();
      // Never answered: it may still reach the service after the call ends.
      void host.http.fetch("https://api.example.com/v1/orders", { method: "POST" }).catch(() => {});
      await postReachedTheKit;
      throw new Error("Too many requests.");
    };
    const kit = realKit({ "/v1/items": 429 }, ["/v1/orders"], () => postArrived());
    const { run } = await bridged(tool, kit);
    const error = await failure(run());
    expect(error).not.toHaveProperty("callRequests");
  });

  it("carries none while the kit waits to try a 429 again", async () => {
    let firstTry: () => void = () => undefined;
    const triedOnce = new Promise<void>((resolve) => {
      firstTry = resolve;
    });
    const transport: HttpClient = {
      fetch: async () => {
        firstTry();
        return new Response("slow down", { status: 429, headers: { "retry-after": "30" } });
      },
    };
    const kit = createLimitedHttpClient({
      policy,
      transport,
      secrets: { get: async () => fakeSecret },
      log: new RequestLog(),
    });
    const tool: Tool = async (host) => {
      // The kit logs the 429, then waits to try again: the request isn't done.
      void host.http.fetch("https://api.example.com/v1/slow").catch(() => {});
      await triedOnce;
      throw new Error("Gave up.");
    };
    const { run } = await bridged(tool, kit);
    const error = await failure(run());
    expect(error).not.toHaveProperty("callRequests");
  });

  it("holds no placed secret and nothing of the reply", async () => {
    const { run } = await bridged(fetchThenFail("https://api.example.com/v1/send"), realKit({}));
    const error = await failure(run());
    expect(error.callRequests).toHaveLength(1);
    const text = JSON.stringify(error.callRequests);
    expect(text).not.toContain(fakeSecret);
    expect(text).not.toContain(replyCanary);
  });

  it("carries none when the secret filter would change one of them", async () => {
    const kit = fakeKitClient((_url, init) => {
      const logged = (init as { onLogged?: (entry: unknown) => void }).onLogged;
      logged?.({
        method: "GET",
        host: `${fakeSecret}.example`,
        path: "/",
        durationMs: 0,
        outcome: "ok",
        status: 401,
      });
      return new Response("{}", { status: 401 });
    });
    const { run } = await bridged(fetchThenFail("https://api.example.com/v1"), kit);
    const error = await failure(run());
    expect(error).not.toHaveProperty("callRequests");
  });
});
