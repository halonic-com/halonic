// A stand-in for Halonic on a computer, for the screen captures (HAL-6953).
// It answers only the connect page's hello call, `GET /api/hello`, with the
// versions it is given, so a real build shows its version screens. It listens
// on loopback only: the emulator reaches it as 10.0.2.2.
//
//   node fake-computer.mjs <port> <version> <minAppVersion>

import { createServer } from "node:http";
import { argv, exit } from "node:process";

const [port, version, minAppVersion] = argv.slice(2);
if (port === undefined || version === undefined || minAppVersion === undefined) {
  console.error("Usage: node fake-computer.mjs <port> <version> <minAppVersion>");
  exit(2);
}
const hello = JSON.stringify({ product: "halonic", version, minAppVersion });

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/api/hello") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(hello);
    return;
  }
  response.writeHead(404);
  response.end();
});
server.listen(Number(port), "127.0.0.1", () => {
  console.log(`Answering /api/hello on 127.0.0.1:${port} with ${hello}`);
});
