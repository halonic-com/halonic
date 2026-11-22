import type { HttpClient } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  answerMaxBytes,
  isOnThisComputer,
  type LocalModelServer,
  localLoadedModels,
} from "./local-model-servers.ts";

/** A server that answers every call with `status` and `body`, and keeps the addresses it was asked. */
function answering(status: number, body: unknown) {
  const asked: { url: string; init: RequestInit | undefined }[] = [];
  const http: HttpClient = {
    fetch: async (url, init) => {
      asked.push({ url, init });
      return new Response(JSON.stringify(body), { status });
    },
  };
  return { http, asked };
}

const ollama: LocalModelServer = {
  id: "local",
  type: "ollama",
  baseUrl: "http://localhost:11434/v1",
};

describe("localLoadedModels", () => {
  it("lists Ollama's models with their size, without the :latest tag", async () => {
    const { http, asked } = answering(200, {
      models: [
        { name: "llama3.2:latest", size: 2_147_483_648 },
        { name: "qwen3:8b", size: 5_000_000_000 },
      ],
    });

    const source = localLoadedModels(ollama, http);

    expect(source.id).toBe("local");
    expect(await source.loadedModels()).toEqual([
      { name: "llama3.2", memoryBytes: 2_147_483_648 },
      { name: "qwen3:8b", memoryBytes: 5_000_000_000 },
    ]);
    expect(asked[0]?.url).toBe("http://localhost:11434/api/ps");
    expect(asked[0]?.init?.redirect).toBe("error");
    expect(asked[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("lists only the models LM Studio has loaded, without a size", async () => {
    const { http, asked } = answering(200, {
      data: [
        { id: "qwen3-8b", state: "loaded" },
        { id: "gemma-3", state: "not-loaded" },
      ],
    });

    const source = localLoadedModels(
      { id: "studio", type: "lmstudio", baseUrl: "http://127.0.0.1:1234/v1" },
      http,
    );

    expect(await source.loadedModels()).toEqual([{ name: "qwen3-8b" }]);
    expect(asked[0]?.url).toBe("http://127.0.0.1:1234/api/v0/models");
  });

  it("asks any other server for its model list, and names no model", async () => {
    const { http, asked } = answering(200, { data: [{ id: "anything" }] });

    const source = localLoadedModels(
      { id: "vllm", type: "openai-compatible", baseUrl: "http://localhost:8000/v1/" },
      http,
    );

    expect(await source.loadedModels()).toEqual([]);
    expect(asked[0]?.url).toBe("http://localhost:8000/v1/models");
  });

  it("throws when the server answers with an error status", async () => {
    const { http } = answering(500, {});

    await expect(localLoadedModels(ollama, http).loadedModels()).rejects.toThrow(
      "localhost:11434 answered /api/ps with HTTP 500.",
    );
  });

  it("throws when the answer isn't the list it should be", async () => {
    await expect(localLoadedModels(ollama, answering(200, {}).http).loadedModels()).rejects.toThrow(
      'The server\'s answer has no "models" list.',
    );
    await expect(
      localLoadedModels(ollama, answering(200, { models: [{ size: 1 }] }).http).loadedModels(),
    ).rejects.toThrow('A model in the server\'s answer has no "name".');
  });

  it("throws when the server can't be reached", async () => {
    const http: HttpClient = {
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    };

    await expect(localLoadedModels(ollama, http).loadedModels()).rejects.toThrow("fetch failed");
  });
});

verifies("doctor-node.model-server-answer", () => {
  it("asks an OpenAI-compatible server for its list without the address's query or fragment", async () => {
    const { http, asked } = answering(200, { data: [] });
    const server = {
      id: "vllm",
      type: "openai-compatible",
      baseUrl: "http://localhost:8000/v1/?drop=all#top",
    };

    await localLoadedModels(server, http).loadedModels();

    expect(asked[0]?.url).toBe("http://localhost:8000/v1/models");
  });

  it("refuses an answer of more than 1 MiB, and stops reading it", async () => {
    let cancelled = false;
    const piece = new Uint8Array(64 * 1024).fill(0x20);
    let sent = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += piece.byteLength;
        controller.enqueue(piece);
      },
      cancel() {
        cancelled = true;
      },
    });
    const http: HttpClient = { fetch: async () => new Response(endless) };

    await expect(localLoadedModels(ollama, http).loadedModels()).rejects.toThrow(
      "localhost:11434 answered /api/ps with more than 1 MiB.",
    );
    expect(cancelled).toBe(true);
    expect(sent).toBeLessThanOrEqual(answerMaxBytes + 2 * piece.byteLength);
  });

  it("refuses an answer that says it is longer than 1 MiB, without reading it", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const headers = { "content-length": String(2 * answerMaxBytes) };
    const http: HttpClient = { fetch: async () => new Response(body, { headers }) };

    await expect(localLoadedModels(ollama, http).loadedModels()).rejects.toThrow(
      "localhost:11434 answered /api/ps with more than 1 MiB.",
    );
    expect(cancelled).toBe(true);
  });
});

describe("isOnThisComputer", () => {
  it("counts localhost, 127.0.0.0/8 and ::1 as this computer", () => {
    for (const url of [
      "http://localhost:11434/v1",
      "http://LOCALHOST:1234/v1",
      "http://127.0.0.1:1234/v1",
      "http://127.8.9.10/v1",
      "http://[::1]:1234/v1",
    ]) {
      expect(isOnThisComputer(url), url).toBe(true);
    }
  });

  it("counts every other address, name and text as another computer", () => {
    for (const url of [
      "http://10.0.0.5:11434/v1",
      "http://192.168.1.20:1234/v1",
      "http://169.254.169.254/v1",
      "http://0.0.0.0:1234/v1",
      "https://models.example.com/v1",
      "http://localhost.example.com/v1",
      "http://127.0.0.1.example.com/v1",
      "not a url",
    ]) {
      expect(isOnThisComputer(url), url).toBe(false);
    }
  });
});
