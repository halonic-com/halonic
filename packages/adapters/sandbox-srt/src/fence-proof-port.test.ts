import { createServer, type Server } from "node:net";
import { describe, expect, it } from "vitest";
import { listenOnCanaryPort } from "./fence-proof.ts";

/** Servers that report the given ports one after the other, whatever the OS gave them. */
function serversReporting(ports: number[], closed: number[]): () => Server {
  let next = 0;
  return () => {
    const port = ports[next] ?? 50_000 + next;
    next += 1;
    const real = createServer();
    real.address = () => ({ port, address: "127.0.0.1", family: "IPv4" });
    real.close = ((done?: () => void) => {
      closed.push(port);
      return Object.getPrototypeOf(real).close.call(real, done);
    }) as Server["close"];
    return real;
  };
}

describe("the canary port of the fence proof", () => {
  it("keeps a port outside the srt proxy range and closes the ones inside it", async () => {
    const closed: number[] = [];
    const picked = await listenOnCanaryPort(serversReporting([60080, 60081, 60090], closed));
    expect(picked.port).toBe(60090);
    expect(closed.sort()).toEqual([60080, 60081]);
    picked.server.close();
  });

  it("gives up, closing every listener, when every pick is inside the range", async () => {
    const closed: number[] = [];
    const inRange = Array.from({ length: 11 }, (_, index) => 60080 + (index % 10));
    await expect(listenOnCanaryPort(serversReporting(inRange, closed))).rejects.toThrow(
      /inside the proxy range/,
    );
    expect(closed).toHaveLength(11);
  });
});
