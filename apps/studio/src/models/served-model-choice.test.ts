import { choiceKey } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ServedModelChoice } from "./served-model-choice.ts";

const anthropic = { kind: "key", provider: "anthropic" } as const;

/** The page's fetch, answering each `<method> <path>` from `answers`, with what it was sent. */
function pageFetch(answers: Record<string, Response | (() => Response)>) {
  const sent: { method: string; path: string; body: unknown }[] = [];
  const fetchPage = async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    sent.push({ method, path, body });
    const answer = answers[`${method} ${path}`];
    if (answer === undefined) return Response.json({ code: "not_found" }, { status: 404 });
    return typeof answer === "function" ? answer() : answer;
  };
  return { fetchPage, sent };
}

verifies("studio.served-model-choice", () => {
  it("sends the key only in the test's body, and the choice alone without one", async () => {
    const { fetchPage, sent } = pageFetch({
      "POST /api/model-choice/test": () =>
        Response.json({ kind: "tested", outcome: "ok", testId: "t1" }),
    });
    const served = new ServedModelChoice(fetchPage);

    expect(await served.test(anthropic, choiceKey("sk-ant-acme"))).toEqual({
      kind: "tested",
      outcome: "ok",
      testId: "t1",
    });
    await served.test(anthropic);
    expect(sent).toEqual([
      {
        method: "POST",
        path: "/api/model-choice/test",
        body: { choice: anthropic, key: "sk-ant-acme" },
      },
      { method: "POST", path: "/api/model-choice/test", body: { choice: anthropic } },
    ]);
  });

  it("reads the saved key, the trust line, Ollama's models and the current model", async () => {
    const line = { reaches: { name: "Anthropic", secrets: 1, local: false }, localOnlyOff: true };
    const { fetchPage } = pageFetch({
      "GET /api/model-choice/key-saved/anthropic": Response.json({ saved: true }),
      "POST /api/model-choice/line-facts": Response.json({ line: null }),
      "GET /api/model-choice/preview/t1": Response.json({ preview: line }),
      "GET /api/model-choice/local-models": Response.json({ kind: "not-found" }),
      "GET /api/model-choice/current": Response.json({ current: { kind: "sample" } }),
    });
    const served = new ServedModelChoice(fetchPage);

    expect(await served.keySaved("anthropic")).toBe(true);
    expect(await served.lineFacts(anthropic)).toBeUndefined();
    expect(await served.preview("t1")).toEqual({ ...line, fingerprint: undefined });
    expect(await served.localModels()).toMatchObject({ kind: "not-found" });
    expect(await served.current()).toEqual({ kind: "sample" });
  });

  it("continues with the test id alone and passes on a refusal's files", async () => {
    const { fetchPage, sent } = pageFetch({
      "POST /api/model-choice/continue": Response.json({
        ok: false,
        failed: "not-committed",
        keySaved: true,
        files: ["models.yaml"],
      }),
    });
    const saved = await new ServedModelChoice(fetchPage).continue("t1");

    expect(sent).toEqual([
      { method: "POST", path: "/api/model-choice/continue", body: { testId: "t1" } },
    ]);
    expect(saved).toMatchObject({ ok: false, failed: "not-committed", files: ["models.yaml"] });
  });

  it("rejects a refusal with its status only", async () => {
    const { fetchPage } = pageFetch({
      "POST /api/model-choice/test": Response.json({ code: "too_many_tests" }, { status: 429 }),
    });
    await expect(
      new ServedModelChoice(fetchPage).test(anthropic, choiceKey("sk-ant-acme")),
    ).rejects.toThrow("The computer answered 429 to POST /api/model-choice/test.");
  });
});
