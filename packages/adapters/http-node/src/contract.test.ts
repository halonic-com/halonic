import { httpClientContract } from "@halonicjs/testing-contracts";
import { startLoopbackServer } from "./loopback-server.test-helper.ts";
import { createNodeHttpClient } from "./node-http-client.ts";

httpClientContract("http-node", {
  make: async () => createNodeHttpClient({ hostClass: () => "loopback" }),
  startPeer: async () => {
    const held: (() => void)[] = [];
    let landings = 0;
    const server = await startLoopbackServer((request, response) => {
      const origin = `http://127.0.0.1:${server.port}`;
      if (request.url === "/redirect") {
        response.writeHead(307, { location: `${origin}/landing` }).end();
        return;
      }
      if (request.url === "/slow") {
        held.push(() => response.end("late"));
        return;
      }
      landings += 1;
      response.end("landed");
    });
    const origin = `http://127.0.0.1:${server.port}`;
    return {
      peer: {
        redirectUrl: `${origin}/redirect`,
        landingUrl: `${origin}/landing`,
        slowUrl: `${origin}/slow`,
        landingRequests: () => landings,
        release: () => {
          for (const answer of held.splice(0)) answer();
        },
      },
      stop: () => server.close(),
    };
  },
});
