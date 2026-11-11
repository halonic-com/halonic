// Asks a model server on this computer which models it has loaded, for the
// Models line of `halonic doctor`. Each kind of server says it its own way:
// Ollama lists them, LM Studio marks them, and any other OpenAI-compatible
// server only says whether it answers. A server that doesn't answer in time
// throws, and the line shows it as not answering.

import { classifyAddress, parseIpAddress } from "@halonicjs/adapter-http-kit";
import type { LoadedModel, LoadedModelSource } from "@halonicjs/app";
import type { HttpClient } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";

/**
 * How long a server may take to answer. `doctor` asks every server at once,
 * so this is also about the longest a server that hangs keeps it waiting.
 */
export const answerTimeoutMs = 3_000;

/** A model server on this computer, as its provider file describes it. */
export interface LocalModelServer {
  /** The provider's id in the workspace. */
  readonly id: string;
  /** The provider's type, such as "ollama" or "lmstudio". */
  readonly type: string;
  /** The API's address up to and including `/v1`, such as `http://localhost:11434/v1`. */
  readonly baseUrl: string;
}

/**
 * Whether `baseUrl` is on this computer: `localhost`, `127.0.0.0/8` or
 * `::1`. Only those count, written out: any other name can resolve to
 * another computer. An address that isn't a URL isn't on this computer.
 *
 * @example
 * isOnThisComputer("http://localhost:11434/v1"); // true
 * isOnThisComputer("http://10.0.0.5:11434/v1"); // false
 */
export function isOnThisComputer(baseUrl: string): boolean {
  if (!URL.canParse(baseUrl)) return false;
  const host = new URL(baseUrl).hostname.toLowerCase().replace(/^\[(.*)\]$/u, "$1");
  if (host === "localhost") return true;
  return parseIpAddress(host) !== undefined && classifyAddress(host) === "loopback";
}

/**
 * A {@link LoadedModelSource} for a model server on this computer. It never
 * sends a key: these servers need none.
 *
 * - **Ollama** (`GET /api/ps`): each model it holds in memory, with its size.
 *   The `:latest` tag is dropped, as people type the name without it.
 * - **LM Studio** (`GET /api/v0/models`): each model whose state is `loaded`,
 *   without a size, because LM Studio doesn't say it.
 * - **Any other server** (`GET {baseUrl}/models`): none, but it must answer.
 *
 * @throws from `loadedModels` when the server doesn't answer within
 *   {@link answerTimeoutMs}, answers with an error status, or sends what
 *   isn't the list it should
 *
 * @example
 * const source = localLoadedModels({ id: "ollama", type: "ollama", baseUrl: "http://localhost:11434/v1" }, { fetch });
 * await source.loadedModels(); // [{ name: "llama3.2", memoryBytes: 2147483648 }]
 */
export function localLoadedModels(server: LocalModelServer, http: HttpClient): LoadedModelSource {
  return {
    id: server.id,
    async loadedModels() {
      switch (server.type) {
        case "ollama":
          return ollamaModels(await answer(http, new URL("/api/ps", server.baseUrl)));
        case "lmstudio":
          return lmStudioModels(await answer(http, new URL("/api/v0/models", server.baseUrl)));
        default:
          await answer(http, new URL(`${server.baseUrl.replace(/\/+$/, "")}/models`));
          return [];
      }
    },
  };
}

/** The JSON the server answers `url` with. */
async function answer(http: HttpClient, url: URL): Promise<unknown> {
  // One signal for the request and the body, so a body that never ends times out too.
  const response = await http.fetch(url.href, {
    redirect: "error",
    signal: AbortSignal.timeout(answerTimeoutMs),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`${url.host} answered ${url.pathname} with HTTP ${response.status}.`);
  }
  return response.json();
}

/** `{ models: [{ name: "llama3.2:latest", size: 2147483648 }] }`. */
function ollamaModels(body: unknown): LoadedModel[] {
  return listOf(body, "models").map((entry) => {
    const name = textOf(entry, "name").replace(/:latest$/, "");
    const size = isPlainObject(entry) ? entry["size"] : undefined;
    return typeof size === "number" ? { name, memoryBytes: size } : { name };
  });
}

/** `{ data: [{ id: "qwen3-8b", state: "loaded" }, { id: "…", state: "not-loaded" }] }`. */
function lmStudioModels(body: unknown): LoadedModel[] {
  return listOf(body, "data")
    .filter((entry) => isPlainObject(entry) && entry["state"] === "loaded")
    .map((entry) => ({ name: textOf(entry, "id") }));
}

function listOf(body: unknown, field: string): unknown[] {
  const list = isPlainObject(body) ? body[field] : undefined;
  if (!Array.isArray(list)) throw new Error(`The server's answer has no "${field}" list.`);
  return list;
}

function textOf(entry: unknown, field: string): string {
  const text = isPlainObject(entry) ? entry[field] : undefined;
  if (typeof text !== "string")
    throw new Error(`A model in the server's answer has no "${field}".`);
  return text;
}
