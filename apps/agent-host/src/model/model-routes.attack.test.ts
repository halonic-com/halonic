import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chatBody, post, type Setup, startRoutes } from "./model-routes.test-helper.ts";

/**
 * Attacks from a caller that holds the launch token, such as a compromised
 * page: it may not use the route to send workspace text to a remote provider,
 * to name a workspace the launcher didn't, to pick the address or the key,
 * or to ask for more than the host's caps.
 */

let setup: Setup | undefined;

afterEach(async () => {
  await setup?.close();
  setup = undefined;
});

async function started(): Promise<Setup> {
  setup = await startRoutes();
  await setup.provider("ollama", { type: "ollama", local: "true", baseUrl: setup.model.url });
  return setup;
}

async function status(body: unknown): Promise<number> {
  return (await post((await started()).url, body)).status;
}

verifies("agent-host.model-routes", () => {
  describe("the model route under attack", () => {
    it("refuses a provider that isn't on this machine, whatever its file says about being local", async () => {
      const { url, folders, model } = await started();
      const remote = [
        { type: "openai", local: "true" },
        { type: "openai-compatible", local: "true", baseUrl: "https://api.example.test/v1" },
        { type: "ollama", local: "true", baseUrl: "http://localhost.example.test:11434/v1" },
        { type: "ollama", local: "true", baseUrl: "http://10.0.0.5:11434/v1" },
        { type: "lmstudio", local: "true", baseUrl: "http://[::2]:1234/v1" },
      ];
      for (const [index, fields] of remote.entries()) {
        await setup?.provider(`remote${index}`, fields);
        const response = await post(url, chatBody(folders.workspace, `remote${index}`));
        expect(response.status, JSON.stringify(fields)).toBe(403);
        expect(await response.json()).toMatchObject({
          error: { kind: "provider_not_on_this_machine" },
        });
      }
      expect(model.asked).toEqual([]);
    });

    it("refuses a provider whose address is the host's own port, a port Halonic uses on this computer", async () => {
      const { url, folders, model } = await started();
      await setup?.provider("own", { type: "ollama", local: "true", baseUrl: `${url}/v1` });
      const response = await post(url, chatBody(folders.workspace, "own"));
      expect(response.status).toBe(502);
      // Without the check the host would answer 401 ("didn't accept the key").
      expect(JSON.stringify(await response.json())).toContain("couldn't reach own");
      expect(model.asked).toEqual([]);
    });

    it("runs no more chats at once than its cap, and frees a place when one ends", async () => {
      setup = await startRoutes({}, 2);
      const { url, folders, model } = setup;
      await setup.provider("ollama", { type: "ollama", local: "true", baseUrl: model.url });
      let release = () => {};
      model.holding = new Promise((resolve) => {
        release = resolve;
      });
      const running = [1, 2].map(() => post(url, chatBody(folders.workspace)));
      await vi.waitFor(() => expect(model.asked).toHaveLength(2));
      const refused = await post(url, chatBody(folders.workspace));
      expect(refused.status).toBe(429);
      expect(await refused.json()).toMatchObject({ error: { kind: "too_many_chats" } });
      release();
      for (const each of await Promise.all(running)) expect(each.status).toBe(200);
      expect((await post(url, chatBody(folders.workspace))).status).toBe(200);
    });

    it("stops the model call when the window drops its connection", async () => {
      const { url, folders, model } = await started();
      model.holding = new Promise(() => {});
      const window = new AbortController();
      const asking = post(url, chatBody(folders.workspace), window.signal).catch(() => undefined);
      await vi.waitFor(() => expect(model.asked).toHaveLength(1));
      window.abort();
      await asking;
      await vi.waitFor(() => expect(model.dropped).toBe(1));
    });

    it("takes the address from the workspace's file and never from the request", async () => {
      const { url, folders, model } = await started();
      await setup?.provider("remote", { type: "openai", local: "true" });
      for (const field of ["baseUrl", "type", "secret"]) {
        const body = chatBody(folders.workspace, "remote");
        (body as { [key: string]: unknown })[field] = model.url;
        expect((await post(url, body)).status).toBe(400);
      }
      expect(model.asked).toEqual([]);
    });

    it("refuses a workspace the launcher didn't name, a parent, a missing folder and a link to it", async () => {
      const { url, folders, model } = await started();
      await setup?.provider("ollama", { type: "ollama", baseUrl: model.url }, folders.other);
      const link = await setup?.link(folders.other);
      for (const folder of [folders.other, folders.base, `${folders.base}/nowhere`, link]) {
        const response = await post(url, chatBody(folder ?? "", "ollama"));
        expect(response.status, String(folder)).toBe(403);
      }
      expect(model.asked).toEqual([]);
    });

    it("refuses a relative workspace folder and a provider id the body doesn't hold", async () => {
      expect(await status(chatBody("workspace"))).toBe(400);
      expect(await status({ workspaceRoot: "/", request: chatBody("/")["request"] })).toBe(400);
    });

    it("refuses tools, meta, extra sampling fields and roles that aren't text", async () => {
      const { folders } = await started();
      const asks = [
        { tools: [{ name: "x", description: "x", parameters: {} }] },
        { meta: { runId: "r" } },
        { params: { extra: { stream: true } } },
        { params: { stop: ["x"] } },
        { messages: [{ role: "tool", content: "x", toolCallId: "1", name: "x" }] },
        { messages: [] },
      ];
      for (const ask of asks) {
        expect(await status(chatBody(folders.workspace, "ollama", ask)), JSON.stringify(ask)).toBe(
          400,
        );
      }
      expect(setup?.model.asked).toEqual([]);
    });

    it("caps maxTokens, the messages and their text", async () => {
      const { folders } = await started();
      const message = (content: string) => ({ role: "user", content });
      expect(
        await status(chatBody(folders.workspace, "ollama", { params: { maxTokens: 4097 } })),
      ).toBe(400);
      expect(
        await status(chatBody(folders.workspace, "ollama", { params: { maxTokens: 0 } })),
      ).toBe(400);
      expect(
        await status(
          chatBody(folders.workspace, "ollama", { messages: Array(65).fill(message("x")) }),
        ),
      ).toBe(400);
      expect(
        await status(
          chatBody(folders.workspace, "ollama", {
            messages: [message("x".repeat(100_000)), message("x".repeat(100_001))],
          }),
        ),
      ).toBe(413);
      expect(setup?.model.asked).toEqual([]);
    });

    it("keeps the detail of a failure that isn't the provider's own out of the answer", async () => {
      const { url, folders } = await started();
      await setup?.provider("down", { type: "ollama", baseUrl: "http://127.0.0.1:9/v1" });
      const response = await post(url, chatBody(folders.workspace, "down"));
      expect(response.status).toBe(502);
      expect(JSON.stringify(await response.json())).not.toContain(folders.base);
    });
  });
});
