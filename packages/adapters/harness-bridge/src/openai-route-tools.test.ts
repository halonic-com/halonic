import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { fakeProvider } from "./fake-provider.test-helper.ts";
import {
  closeOpenedBridges,
  codexRequest,
  open,
  programRequest,
} from "./openai-route.test-helper.ts";

afterEach(closeOpenedBridges);

verifies("harness-bridge.openai", () => {
  it("removes OpenAI's web search and MCP tools by their type, and keeps every other tool", async () => {
    const openai = fakeProvider(() => new Response("{}"));
    const tools = [
      { type: "web_search" },
      { type: "web_search_preview_2025_03_11", search_context_size: "low" },
      { type: "mcp", server_label: "outside", server_url: "https://mcp.example.test" },
      { type: "function", name: "web_search", parameters: { type: "object" } },
      { type: "custom", name: "apply_patch" },
    ];
    const { bridge } = await open(openai.fetch);
    await programRequest(bridge, { ...codexRequest, tools });

    const forwarded = JSON.parse(openai.calls[0]?.body ?? "");
    expect(forwarded.tools).toEqual([tools[3], tools[4]]);
    expect(forwarded.input).toEqual(codexRequest.input);
  });

  describe("a tool_choice that forces a removed tool", () => {
    const tools = [
      { type: "web_search_preview" },
      { type: "mcp", server_label: "outside", server_url: "https://mcp.example.test" },
      { type: "function", name: "shell", parameters: { type: "object" } },
    ];
    const choices: [string, unknown, unknown][] = [
      ["a web search tool", { type: "web_search_preview" }, "auto"],
      ["an MCP tool", { type: "mcp", server_label: "outside" }, "auto"],
      [
        "a list of allowed tools with one removed",
        {
          type: "allowed_tools",
          mode: "required",
          tools: [{ type: "mcp" }, { type: "function", name: "shell" }],
        },
        { type: "allowed_tools", mode: "required", tools: [{ type: "function", name: "shell" }] },
      ],
      [
        "a list of allowed tools that are all removed",
        { type: "allowed_tools", mode: "auto", tools: [{ type: "web_search" }] },
        "auto",
      ],
    ];
    for (const [what, sent, forwarded] of choices) {
      it(`becomes ${JSON.stringify(forwarded)} for ${what}`, async () => {
        const openai = fakeProvider(() => new Response("{}"));
        const { bridge } = await open(openai.fetch);
        await programRequest(bridge, { ...codexRequest, tools, tool_choice: sent });
        expect(JSON.parse(openai.calls[0]?.body ?? "").tool_choice).toEqual(forwarded);
      });
    }

    it("stays as it is when it forces a kept tool", async () => {
      const openai = fakeProvider(() => new Response("{}"));
      const { bridge } = await open(openai.fetch);
      const sent = JSON.stringify({
        ...codexRequest,
        tool_choice: { type: "function", name: "shell" },
      });
      await programRequest(bridge, sent);
      expect(openai.calls[0]?.body).toBe(sent);
    });
  });

  describe('a tool_choice of "required"', () => {
    it("becomes auto when the bridge removed every tool", async () => {
      const openai = fakeProvider(() => new Response("{}"));
      const { bridge } = await open(openai.fetch);
      const tools = [{ type: "web_search" }, { type: "mcp", server_label: "outside" }];
      await programRequest(bridge, { ...codexRequest, tools, tool_choice: "required" });

      const forwarded = JSON.parse(openai.calls[0]?.body ?? "");
      expect(forwarded.tool_choice).toBe("auto");
      expect(forwarded.tools).toEqual([]);
    });

    it("stays as it is when a tool is left", async () => {
      const openai = fakeProvider(() => new Response("{}"));
      const { bridge } = await open(openai.fetch);
      const shell = { type: "function", name: "shell", parameters: { type: "object" } };
      await programRequest(bridge, {
        ...codexRequest,
        tools: [{ type: "web_search" }, shell],
        tool_choice: "required",
      });

      const forwarded = JSON.parse(openai.calls[0]?.body ?? "");
      expect(forwarded.tool_choice).toBe("required");
      expect(forwarded.tools).toEqual([shell]);
    });

    it("stays as it is when the request came without tools", async () => {
      const openai = fakeProvider(() => new Response("{}"));
      const { bridge } = await open(openai.fetch);
      const sent = JSON.stringify({ ...codexRequest, tools: [], tool_choice: "required" });
      await programRequest(bridge, sent);
      expect(openai.calls[0]?.body).toBe(sent);
    });
  });
});
