import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { acmeSnapshot, acmeTool, fakeHost, githubToken } from "./fake-host.test-helper.ts";
import { runtimeHandlers } from "./handlers.ts";
import { registerWorkspaceTools } from "./register.ts";

const templateGet = acmeTool("template_get", {
  parameters: {
    id: { type: "string", description: "The template's id.", required: false, maxLength: 64 },
  },
  action: { run: "paperclip.template", with: {} },
});

const templates = [
  { id: "card", title: "Board card", body: "## Question\n\n## Options" },
  { id: "task-spec", body: "## Goal\n\nDone when: …" },
];

/** A plugin built with `template_get` and the two templates, served by the runtime's own handlers. */
function plugin(served = templates) {
  const builtIn = acmeSnapshot({ tools: [templateGet], templates: served });
  const host = fakeHost({ githubToken }, {});
  const declaration = {
    name: "template_get",
    displayName: "template_get",
    description: templateGet.description,
    parametersSchema: { type: "object", properties: { id: { type: "string" } } },
  };
  registerWorkspaceTools(host.ctx, {
    declarations: [declaration],
    builtIn,
    handlers: runtimeHandlers,
  });
  return host;
}

verifies("runtime.template-action", () => {
  describe("paperclip.template", () => {
    test("serves one template by its id, read only", async () => {
      const { call, sent } = plugin();
      expect(await call("template_get", { id: "task-spec" })).toEqual({
        content: "## Goal\n\nDone when: …",
        data: templates[1],
      });
      expect(sent).toEqual([]);
    });

    test("lists the templates when no id is given", async () => {
      const { call } = plugin();
      expect(await call("template_get", {})).toEqual({
        content: "The workspace's templates:\ncard: Board card\ntask-spec",
        data: [
          { id: "card", title: "Board card" },
          { id: "task-spec", title: undefined },
        ],
      });
    });

    test("names the templates there are when the id is unknown, and refuses an id that isn't text", async () => {
      const { call } = plugin();
      expect(await call("template_get", { id: "pr-body" })).toEqual({
        error:
          "template_get: there is no template 'pr-body'. The workspace's templates:\ncard: Board card\ntask-spec",
      });
      expect(await call("template_get", { id: 7 })).toEqual({
        error: "template_get: give the template's id as text.",
      });
    });

    test("says so when the snapshot has no templates", async () => {
      const { call } = plugin([]);
      expect(await call("template_get", {})).toEqual({
        content: "The workspace has no templates.",
        data: [],
      });
    });
  });
});
