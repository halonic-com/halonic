// Asks a model server on this computer which models it has loaded, for the
// Models line of `halonic doctor`. Each kind of server says it its own way:
// Ollama lists them, LM Studio marks them, and any other OpenAI-compatible
// server only says whether it answers. A server that doesn't answer in time
// throws, and the line shows it as not answering.

import { classifyAddress, parseIpAddress } from "@halonicjs/adapter-http-kit";
import type { LoadedModel, LoadedModelSource } from "@halonicjs/app";
import type { HttpClient } from "@halonicjs/ports";
import { decodeUtf8, isPlainObject } from "@halonicjs/std";

/**
 * How long a server may take to answer. `doctor` asks every server at once,
 * so this is also about the longest a server that hangs keeps it waiting.
 */
export const answerTimeoutMs = 3_000;

/**
 * The most bytes doctor reads of an answer. A list of loaded models is a few
 * KiB; a bigger answer isn't the list, so it is refused unread, before trust
 * as after it (HAL-16336).
 */
export const answerMaxBytes = 1024 * 1024;

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
 * - **Any other server** (`GET {baseUrl}/models`, without the query or
 *   fragment `baseUrl` may carry): none, but it must answer.
 *
 * @throws from `loadedModels` when the server doesn't answer within
 *   {@link answerTimeoutMs}, answers with an error status or with more than
 *   {@link answerMaxBytes}, or sends what isn't the list it should
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
          await answer(http, modelListUrl(server.baseUrl));
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
  const text = await textWithin(response, answerMaxBytes);
  if (text === undefined) {
    throw new Error(`${url.host} answered ${url.pathname} with more than 1 MiB.`);
  }
  return JSON.parse(text);
}

/**
 * Where an OpenAI-compatible server lists its models: `{baseUrl}/models`. A
 * query or fragment in `baseUrl` is left out, since the list takes none.
 *
 * @example
 * modelListUrl("http://localhost:8000/v1/?x=1").href; // "http://localhost:8000/v1/models"
 */
function modelListUrl(baseUrl: string): URL {
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = "";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/models`;
  return url;
}

/**
 * The body as text, or `undefined` when it holds more than `maxBytes`. It
 * reads piece by piece and cancels the rest at the first piece past the
 * limit, so a huge answer is never held whole.
 */
async function textWithin(response: Response, maxBytes: number): Promise<string | undefined> {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    return undefined;
  }
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const pieces: Uint8Array[] = [];
  let total = 0;
  for (let piece = await reader.read(); !piece.done; piece = await reader.read()) {
    total += piece.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    pieces.push(piece.value);
  }
  const whole = new Uint8Array(total);
  let offset = 0;
  for (const piece of pieces) {
    whole.set(piece, offset);
    offset += piece.byteLength;
  }
  return decodeUtf8(whole);
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
