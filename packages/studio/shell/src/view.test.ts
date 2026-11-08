import { describe, expect, it } from "vitest";
import { ShellError } from "./shell-error.ts";
import { loadView } from "./view.ts";

describe("shell.view-loading", () => {
  it("returns the named export of the loaded module", async () => {
    const AgentEditorView = () => "editor";
    const view = await loadView({
      view: "AgentEditorView",
      load: async () => ({ AgentEditorView }),
    });
    expect(view).toBe(AgentEditorView);
  });

  it("refuses a name the module doesn't export, listing what it does", async () => {
    const loading = loadView({
      view: "AgentEditorView",
      load: async () => ({ default: () => "editor" }),
    });
    await expect(loading).rejects.toThrow(ShellError);
    await expect(
      loadView({ view: "AgentEditorView", load: async () => ({ default: () => "editor" }) }),
    ).rejects.toThrow(
      'The view "AgentEditorView" is not exported by its module (it exports default).',
    );
  });
});
