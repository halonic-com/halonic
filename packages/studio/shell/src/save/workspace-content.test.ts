// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  isInWorkspaceContent,
  workspaceContentAttribute,
  workspaceContentProps,
} from "./workspace-content.ts";

verifies("shell.workspace-content-fields", () => {
  it("finds a field inside a marked form, and not one outside it", () => {
    const form = document.createElement("div");
    form.setAttribute(workspaceContentAttribute, workspaceContentProps[workspaceContentAttribute]);
    const instructions = document.createElement("textarea");
    form.append(instructions);
    const message = document.createElement("textarea");
    document.body.append(form, message);
    expect(isInWorkspaceContent(instructions)).toBe(true);
    expect(isInWorkspaceContent(message)).toBe(false);
    form.remove();
    message.remove();
  });

  it("says no when there is no target", () => {
    expect(isInWorkspaceContent(null)).toBe(false);
  });
});
