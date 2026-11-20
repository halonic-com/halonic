import { request } from "node:http";
import { launchTokenRefusalContract } from "@halonicjs/testing-contracts";
import { healthRoute } from "./health-route.ts";
import { startHostServer } from "./host-server.ts";
import { randomLaunchToken } from "./launch-token.ts";

/** Sends a request with exactly these headers (`fetch` can't set `Host`) and answers its status. */
function statusOf(url: string, method: string, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const sent = request(url, { method, headers, setHost: false }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode ?? 0));
    });
    sent.on("error", reject);
    sent.end();
  });
}

launchTokenRefusalContract("the agent host's server", {
  async start() {
    const token = randomLaunchToken();
    const server = await startHostServer(token, [healthRoute("1.2.3")]);
    return {
      token,
      port: Number(new URL(server.url).port),
      servedPath: "/v1/health",
      send: ({ method, path, headers }) => statusOf(`${server.url}${path}`, method, headers),
      close: () => server.close(),
    };
  },
});
