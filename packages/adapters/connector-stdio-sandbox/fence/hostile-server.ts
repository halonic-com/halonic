import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

/**
 * A plugin's local tool that tries to get out: an MCP server over stdio,
 * with only Node's own modules, that `local-tool-attacks.test.ts` starts in
 * a real sandbox session. Each tool tries one attack and answers what
 * happened, so the test sees what the program saw. It also lists
 * `wipe_disk`, a tool its manifest doesn't declare, which leaves a mark in
 * its working folder if it is ever called.
 */

const schema = (properties: Record<string, object>) => ({ type: "object", properties });

const tools = [
  { name: "fetch_url", description: "Fetches a URL.", inputSchema: schema({ url: {} }) },
  { name: "read_file", description: "Reads a file.", inputSchema: schema({ path: {} }) },
  {
    name: "write_file",
    description: "Writes a file.",
    inputSchema: schema({ path: {}, text: {} }),
  },
  { name: "read_env", description: "Reads its environment.", inputSchema: schema({}) },
  { name: "wipe_disk", description: "Not in the manifest.", inputSchema: schema({}) },
];

/** The error's code, such as `EACCES`, or its message when it has none. */
function failure(error: unknown): string {
  const code = (error as { code?: unknown }).code;
  return `refused:${typeof code === "string" ? code : String(error)}`;
}

async function fetchUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    return `reached:${response.status}:${(await response.text()).slice(0, 200)}`;
  } catch (error) {
    return failure((error as { cause?: unknown }).cause ?? error);
  }
}

function readFile(path: string): string {
  try {
    return `read:${readFileSync(path, "utf8")}`;
  } catch (error) {
    return failure(error);
  }
}

function writeFile(path: string, text: string): string {
  try {
    writeFileSync(path, text);
    return "wrote";
  } catch (error) {
    return failure(error);
  }
}

async function call(name: string, args: Record<string, string>): Promise<string> {
  switch (name) {
    case "fetch_url":
      return fetchUrl(args["url"] ?? "");
    case "read_file":
      return readFile(args["path"] ?? "");
    case "write_file":
      return writeFile(args["path"] ?? "", args["text"] ?? "");
    case "read_env":
      return JSON.stringify(process.env);
    case "wipe_disk":
      writeFileSync("wiped", "the undeclared tool ran");
      return "wiped";
    default:
      throw new Error(`no tool ${name}`);
  }
}

async function answer(method: string, params: Record<string, unknown>): Promise<unknown> {
  if (method === "initialize")
    return { protocolVersion: "2025-11-25", capabilities: { tools: {} } };
  if (method === "tools/list") return { tools };
  if (method === "tools/call") {
    const text = await call(
      params["name"] as string,
      (params["arguments"] ?? {}) as Record<string, string>,
    );
    return { content: [{ type: "text", text }] };
  }
  return {};
}

for await (const line of createInterface({ input: process.stdin })) {
  const { id, method, params } = JSON.parse(line) as {
    id?: unknown;
    method: string;
    params?: Record<string, unknown>;
  };
  // A notification gets no answer.
  if (typeof id !== "number") continue;
  const result = await answer(method, params ?? {});
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}
