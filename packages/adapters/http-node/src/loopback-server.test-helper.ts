import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** A plain `http` server on `127.0.0.1` that counts the connections it gets. */
export interface LoopbackServer {
  readonly port: number;
  /** Connections accepted so far. Zero proves a refused request sent nothing. */
  connections(): number;
  /** What each request asked for and sent. */
  readonly received: {
    method: string;
    url: string;
    headers: IncomingMessage["headers"];
    body: string;
  }[];
  close(): Promise<void>;
}

/** Starts a server that answers every request with `answer`. Close it in `afterEach`. */
export async function startLoopbackServer(
  answer: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<LoopbackServer> {
  let connections = 0;
  const received: LoopbackServer["received"] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({
        method: request.method ?? "",
        url: request.url ?? "",
        headers: request.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      answer(request, response);
    });
  });
  server.on("connection", () => {
    connections++;
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    port,
    connections: () => connections,
    received,
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

/** A resolver that gives each name its answers in turn, the last one again once they run out, and counts the lookups. */
export function fakeResolver(answers: Readonly<Record<string, readonly (readonly string[])[]>>): {
  resolve: (hostname: string) => Promise<readonly string[]>;
  lookups: string[];
} {
  const lookups: string[] = [];
  return {
    lookups,
    resolve: async (hostname) => {
      const turn = lookups.filter((name) => name === hostname).length;
      lookups.push(hostname);
      const forName = answers[hostname] ?? [];
      const answer = forName[Math.min(turn, forName.length - 1)];
      if (answer === undefined) throw new Error(`getaddrinfo ENOTFOUND ${hostname}`);
      return answer;
    },
  };
}
