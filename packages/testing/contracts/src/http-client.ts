import type { HttpClient } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/**
 * A server the adapter under test can reach, which the suite drives through
 * the adapter. An adapter's test harness starts one in its own runtime: a
 * loopback server for the Node adapter, a stub in the network layer for a
 * Workers adapter.
 */
export interface HttpPeer {
  /** A URL that answers with a redirect (307) to {@link HttpPeer.landingUrl}. */
  readonly redirectUrl: string;
  /** The URL the redirect points at. */
  readonly landingUrl: string;
  /** A URL whose answer doesn't come until {@link HttpPeer.release} is called. */
  readonly slowUrl: string;
  /** How many requests {@link HttpPeer.landingUrl} has got. Zero proves a redirect wasn't followed. */
  landingRequests(): number;
  /** Lets every request held at {@link HttpPeer.slowUrl} answer, so the peer can shut down. */
  release(): void;
}

/** What the adapter's test harness hands the {@link httpClientContract}. */
export interface HttpClientHarness {
  /** The adapter under test, set up so it may reach the peer (for example, with loopback allowed). */
  make(): Promise<HttpClient>;
  /** Starts a peer for one case and returns it with the function that stops it. */
  startPeer(): Promise<{ peer: HttpPeer; stop(): Promise<void> }>;
}

/** Runs `body` against a fresh client and peer, and stops the peer after. */
async function withPeer(
  harness: HttpClientHarness,
  body: (client: HttpClient, peer: HttpPeer) => Promise<void>,
): Promise<void> {
  const client = await harness.make();
  const { peer, stop } = await harness.startPeer();
  try {
    await body(client, peer);
  } finally {
    peer.release();
    await stop();
  }
}

/**
 * The part of the {@link HttpClient} contract that callers' safety rests on:
 * every adapter passes `init.redirect` and `init.signal` through. A caller
 * sets `redirect: "error"` so a bearer token never follows a redirect to
 * another address, and a `signal` to put a time limit on a request; an
 * adapter that ignored either would pass CI and fail at the caller.
 */
export function httpClientContract(name: string, harness: HttpClientHarness): void {
  verifies("contracts.http-client", () => {
    describe(`HttpClient contract: ${name}`, () => {
      it("follows a redirect by default, so the cases below prove something", async () => {
        await withPeer(harness, async (client, peer) => {
          const response = await client.fetch(peer.redirectUrl);
          expect(response.ok).toBe(true);
          expect(peer.landingRequests()).toBe(1);
        });
      });

      it("throws on a redirect with redirect error, and never reaches where it points", async () => {
        await withPeer(harness, async (client, peer) => {
          await expect(client.fetch(peer.redirectUrl, { redirect: "error" })).rejects.toThrow();
          expect(peer.landingRequests()).toBe(0);
        });
      });

      it("doesn't follow a redirect with redirect manual", async () => {
        await withPeer(harness, async (client, peer) => {
          // Some runtimes answer with the redirect and others throw; neither reaches the landing.
          await client.fetch(peer.redirectUrl, { redirect: "manual" }).catch(() => undefined);
          expect(peer.landingRequests()).toBe(0);
        });
      });

      it("throws for a signal that is already aborted", async () => {
        await withPeer(harness, async (client, peer) => {
          const signal = AbortSignal.abort(new Error("stopped by the caller"));
          await expect(client.fetch(peer.landingUrl, { signal })).rejects.toThrow();
          expect(peer.landingRequests()).toBe(0);
        });
      });

      it("stops waiting when the signal aborts during the request", async () => {
        await withPeer(harness, async (client, peer) => {
          const controller = new AbortController();
          const request = client.fetch(peer.slowUrl, { signal: controller.signal });
          const outcome = request.then(
            () => "answered",
            () => "rejected",
          );
          controller.abort(new Error("stopped by the caller"));
          expect(await outcome).toBe("rejected");
        });
      });
    });
  });
}
