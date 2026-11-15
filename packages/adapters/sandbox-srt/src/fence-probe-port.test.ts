import { createServer, type Server } from "node:net";
import { describe, expect, it } from "vitest";

type Pick = { server: Server; port: number };
const { listenOutsideProxyRange, inProxyRange } = (await import(
  new URL("../scripts/fence-probe-port.mjs", import.meta.url).href
)) as {
  listenOutsideProxyRange: (
    onConnection: () => void,
    tries?: number,
    create?: () => Server,
  ) => Promise<Pick>;
  inProxyRange: (port: number) => boolean;
};

/** A server whose reported port is `port`, whatever the OS gave it. */
function serverReporting(port: number, closed: number[]): Server {
  const real = createServer();
  real.address = () => ({ port, address: "127.0.0.1", family: "IPv4" });
  real.close = ((done?: () => void) => {
    closed.push(port);
    return Object.getPrototypeOf(real).close.call(real, done);
  }) as Server["close"];
  return real;
}

describe("the Windows fence canary port", () => {
  it("knows the proxy range edges", () => {
    expect([60079, 60080, 60089, 60090].map(inProxyRange)).toEqual([false, true, true, false]);
  });

  it("re-picks while the port falls inside the proxy range", async () => {
    const ports = [60084, 60085, 50000];
    const closed: number[] = [];
    const { server, port } = await listenOutsideProxyRange(
      () => {},
      5,
      () => serverReporting(ports.shift() as number, closed),
    );
    await new Promise((done) => server.close(done));
    expect(port).toBe(50000);
    expect(closed.slice(0, 2)).toEqual([60084, 60085]);
  });

  it("fails with the reason when every pick is inside the range", async () => {
    const closed: number[] = [];
    await expect(
      listenOutsideProxyRange(
        () => {},
        3,
        () => serverReporting(60081, closed),
      ),
    ).rejects.toThrow(/60081, 60081, 60081 are inside the proxy range/);
    expect(closed).toHaveLength(3);
  });

  it("picks a real port outside the range", async () => {
    const { server, port } = await listenOutsideProxyRange(() => {});
    await new Promise((done) => server.close(done));
    expect(inProxyRange(port)).toBe(false);
  });
});
