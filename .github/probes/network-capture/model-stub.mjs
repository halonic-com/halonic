// A stand-in for a local model server (Ollama, LM Studio) for the network
// capture. It speaks just enough of OpenAI's chat completions API, plain and
// streamed, and answers "refund" to everything, so Acme's Support reply takes
// its refund path. It listens on 127.0.0.1 only and writes its port to
// STUB_PORT_FILE and one line per call to STUB_LOG.
import { appendFileSync, writeFileSync } from "node:fs";
import http from "node:http";

const logFile = process.env.STUB_LOG ?? "model-stub.log";
const answer = "refund";

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    appendFileSync(logFile, `${req.method} ${req.url}\n`);
    if (req.method === "GET" && req.url?.endsWith("/models")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: [{ id: "stub", object: "model" }] }));
      return;
    }
    if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
      res.writeHead(404).end();
      return;
    }
    const stream = JSON.parse(body || "{}").stream === true;
    const id = `chatcmpl-${Date.now()}`;
    const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
    if (!stream) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id,
          object: "chat.completion",
          model: "stub",
          choices: [
            { index: 0, message: { role: "assistant", content: answer }, finish_reason: "stop" },
          ],
          usage,
        }),
      );
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    const chunk = (choice, extra = {}) =>
      `data: ${JSON.stringify({ id, object: "chat.completion.chunk", model: "stub", choices: [choice], ...extra })}\n\n`;
    res.write(
      chunk({ index: 0, delta: { role: "assistant", content: answer }, finish_reason: null }),
    );
    res.write(chunk({ index: 0, delta: {}, finish_reason: "stop" }, { usage }));
    res.end("data: [DONE]\n\n");
  });
});

server.listen(0, "127.0.0.1", () => {
  writeFileSync(process.env.STUB_PORT_FILE ?? "model-stub.port", String(server.address().port));
});
