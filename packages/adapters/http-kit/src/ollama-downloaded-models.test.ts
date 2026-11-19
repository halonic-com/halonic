import type { HttpClient } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ollamaAnswerTimeoutMs,
  ollamaDownloadedModelSource,
  ollamaTagsUrl,
} from "./ollama-downloaded-models.ts";

interface Asked {
  url: string;
  init: RequestInit | undefined;
}

function server(answer: (init: RequestInit | undefined) => Response): {
  http: HttpClient;
  asked: Asked[];
} {
  const asked: Asked[] = [];
  return {
    asked,
    http: {
      fetch: async (url, init) => {
        asked.push({ url, init });
        return answer(init);
      },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

verifies("http-kit.ollama-downloaded-models", () => {
  describe("ollamaDownloadedModelSource", () => {
    it("asks Ollama's /api/tags on this computer once, without a key or redirects", async () => {
      const { http, asked } = server(() =>
        Response.json({ models: [{ name: "llama3.2:latest" }, { name: "qwen3:8b" }] }),
      );

      const models = await ollamaDownloadedModelSource(http).downloadedModels();

      expect(models).toEqual(["llama3.2", "qwen3:8b"]);
      expect(asked).toHaveLength(1);
      expect(asked[0]?.url).toBe("http://localhost:11434/api/tags");
      expect(asked[0]?.url).toBe(ollamaTagsUrl);
      expect(asked[0]?.init?.redirect).toBe("error");
      expect(new Headers(asked[0]?.init?.headers).has("authorization")).toBe(false);
    });

    it("throws and names the status when Ollama answers with an error", async () => {
      const { http } = server(() => new Response("broken", { status: 500 }));

      await expect(ollamaDownloadedModelSource(http).downloadedModels()).rejects.toThrow(
        "Ollama answered /api/tags with HTTP 500.",
      );
    });

    it("throws when the answer isn't Ollama's list", async () => {
      const { http } = server(() => Response.json({ error: "unknown" }));

      await expect(ollamaDownloadedModelSource(http).downloadedModels()).rejects.toThrow(
        /no "models" list/,
      );
    });

    it("puts one 3-second limit on the request and the body", async () => {
      const limit = new AbortController();
      const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(limit.signal);
      // Headers come at once; the body only ends when the signal aborts it, as fetch does.
      const { http, asked } = server(
        (init) =>
          new Response(
            new ReadableStream({
              start(controller) {
                init?.signal?.addEventListener("abort", () =>
                  controller.error(init.signal?.reason),
                );
              },
            }),
          ),
      );

      const pending = ollamaDownloadedModelSource(http).downloadedModels();
      await vi.waitFor(() => expect(asked).toHaveLength(1));
      limit.abort(new DOMException("The operation timed out.", "TimeoutError"));

      await expect(pending).rejects.toThrow("The operation timed out.");
      expect(timeout).toHaveBeenCalledOnce();
      expect(timeout).toHaveBeenCalledWith(3_000);
      expect(ollamaAnswerTimeoutMs).toBe(3_000);
      expect(asked[0]?.init?.signal).toBe(limit.signal);
    });
  });
});
