// The loopback port the Windows fence canary listens on. srt only permits
// 60080-60089 through its proxy, so a port in that range proves nothing, and
// the next port the OS hands out is usually in the same range: a retry of the
// whole probe cannot help. So re-pick here, outside the range.
import { createServer } from "node:net";

export const proxyRange = { first: 60080, last: 60089 };

export function inProxyRange(port) {
  return port >= proxyRange.first && port <= proxyRange.last;
}

/**
 * Starts the canary server on a free port outside the proxy range. Asks the OS
 * for a port and closes and re-picks while it falls inside the range, up to
 * `tries` times. Throws when every pick landed in the range.
 */
export async function listenOutsideProxyRange(onConnection, tries = 10, create = createServer) {
  const rejected = [];
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const server = create(onConnection);
    await new Promise((done, fail) => {
      server.once("error", fail);
      server.listen(0, "127.0.0.1", done);
    });
    const port = server.address().port;
    if (!inProxyRange(port)) return { server, port };
    rejected.push(port);
    await new Promise((done) => server.close(done));
  }
  throw new Error(
    `Ports ${rejected.join(", ")} are inside the proxy range ${proxyRange.first}-${proxyRange.last}, so they prove nothing (${tries} tries).`,
  );
}
