import { describe, expect, it } from "vitest";
import { RemoteRunner } from "./remote-runner.ts";

function fakeFetch(
  answer: Response,
  seen: { url?: string; init?: RequestInit } = {},
): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    seen.url = url;
    if (init !== undefined) seen.init = init;
    return answer;
  }) as unknown as typeof fetch;
}

describe("RemoteRunner", () => {
  it("lists cases with the bearer token and no double slash in the address", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const tree = { kind: "suite", name: "", meta: {}, children: [] };
    const runner = new RemoteRunner(
      "https://w.example/",
      "tok",
      fakeFetch(Response.json(tree), seen),
    );
    expect(await runner.cases()).toEqual(tree);
    expect(seen.url).toBe("https://w.example/cases");
    expect(seen.init?.headers).toEqual({ authorization: "Bearer tok" });
  });

  it("runs a case by posting its ID", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const result = { status: "passed", assertions: 2 };
    const runner = new RemoteRunner(
      "https://w.example",
      "tok",
      fakeFetch(Response.json(result), seen),
    );
    expect(await runner.run("c1")).toEqual(result);
    expect(seen.init?.method).toBe("POST");
    expect(seen.init?.body).toBe('{"id":"c1"}');
  });

  it("says the status on an error and never prints the token", async () => {
    const runner = new RemoteRunner(
      "https://w.example",
      "s3cret",
      fakeFetch(new Response("no", { status: 401 })),
    );
    const error = await runner.cases().catch((e: unknown) => e as Error);
    expect((error as Error).message).toContain("401");
    expect((error as Error).message).not.toContain("s3cret");
  });
});
