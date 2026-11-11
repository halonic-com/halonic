// A fake model server for the CLI probe. It speaks just enough of the
// OpenAI Responses API (POST /v1/responses, for Codex) and the Anthropic
// Messages API (POST /v1/messages, for Claude Code) to ask the agent for one
// shell command, then end the turn. It logs what comes back from the tool
// call to fake-model.log. No real model, account or key is involved.
import { appendFileSync, writeFileSync } from "node:fs";
import http from "node:http";

const command = process.env.PROBE_COMMAND ?? "echo probe";
const logFile = process.env.PROBE_LOG ?? "fake-model.log";
const log = (line) => appendFileSync(logFile, `${line}\n`);

function sse(res, events) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const [event, data] of events)
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  res.end();
}

function responses(body, res) {
  const outputs = (body.input ?? []).filter((item) => item.type === "function_call_output");
  const id = `resp_${Date.now()}`;
  const usage = {
    input_tokens: 1,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: 1,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: 2,
  };
  let item;
  if (outputs.length === 0) {
    item = {
      type: "function_call",
      id: "fc_1",
      call_id: "call_1",
      name: "exec_command",
      arguments: JSON.stringify({ cmd: command }),
      status: "completed",
    };
    log(`codex: asked for the command`);
  } else {
    for (const output of outputs) log(`codex: tool output: ${JSON.stringify(output.output)}`);
    item = {
      type: "message",
      id: "msg_1",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: "done", annotations: [] }],
    };
  }
  sse(res, [
    ["response.created", { type: "response.created", response: { id } }],
    ["response.output_item.added", { type: "response.output_item.added", output_index: 0, item }],
    ["response.output_item.done", { type: "response.output_item.done", output_index: 0, item }],
    ["response.completed", { type: "response.completed", response: { id, usage } }],
  ]);
}

function messages(body, res) {
  const last = body.messages?.at(-1);
  const results = Array.isArray(last?.content)
    ? last.content.filter((part) => part.type === "tool_result")
    : [];
  const hasBash = (body.tools ?? []).some((tool) => tool.name === "Bash");
  let block;
  let stop;
  if (hasBash && results.length === 0) {
    block = {
      type: "tool_use",
      id: "toolu_1",
      name: "Bash",
      input: { command, description: "probe" },
    };
    stop = "tool_use";
    log(`claude: asked for the command`);
  } else {
    for (const result of results)
      log(
        `claude: tool result: ${JSON.stringify(result.content)} error=${result.is_error === true}`,
      );
    block = { type: "text", text: "done" };
    stop = "end_turn";
  }
  const message = {
    id: `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    model: body.model ?? "fake",
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
  if (!body.stream) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ...message, content: [block], stop_reason: stop }));
    return;
  }
  const start = block.type === "tool_use" ? { ...block, input: {} } : { type: "text", text: "" };
  const delta =
    block.type === "tool_use"
      ? { type: "input_json_delta", partial_json: JSON.stringify(block.input) }
      : { type: "text_delta", text: block.text };
  sse(res, [
    ["message_start", { type: "message_start", message }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: start }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    [
      "message_delta",
      {
        type: "message_delta",
        delta: { stop_reason: stop, stop_sequence: null },
        usage: { output_tokens: 1 },
      },
    ],
    ["message_stop", { type: "message_stop" }],
  ]);
}

const server = http.createServer((req, res) => {
  let text = "";
  req.on("data", (chunk) => {
    text += chunk;
  });
  req.on("end", () => {
    log(`${req.method} ${req.url}`);
    let body = {};
    try {
      body = JSON.parse(text || "{}");
    } catch {}
    const path = req.url.split("?")[0];
    if (req.method === "POST" && path.endsWith("/responses")) return responses(body, res);
    if (req.method === "POST" && path.endsWith("/messages")) return messages(body, res);
    if (req.method === "POST" && path.endsWith("/count_tokens")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ input_tokens: 1 }));
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end("{}");
  });
});

server.listen(Number(process.env.PROBE_PORT ?? 0), "127.0.0.1", () => {
  writeFileSync(process.env.PROBE_PORT_FILE ?? "fake-model.port", String(server.address().port));
});
