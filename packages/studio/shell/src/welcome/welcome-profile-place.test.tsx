// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { cantOpenProblem } from "./cant-open.ts";
import { Welcome } from "./welcome.tsx";

afterEach(() => {
  unmountAll();
});

function button(root: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll("button")].find((each) => each.textContent === text);
}

verifies("shell.profile-place-words", () => {
  it("shows the fix after the reason for a pick that holds the profile folder", async () => {
    const refusal = { kind: "profile_inside", message: "holds it", reason: "HALONIC_HOME" };
    const root = render(
      <Welcome onOpenFolder={async () => cantOpenProblem("the folder", refusal)} />,
    );

    // The first button is Open folder.
    await act(async () => root.querySelector("button")?.click());

    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Can't open the folder: your profile folder is inside it. A change to this workspace could change what you trust. Move the profile folder out, set HALONIC_HOME to its new place, then quit Halonic and open it again.",
    );
  });

  it("offers Remove from Recent for a row inside the profile folder", async () => {
    const removed: string[] = [];
    const refusal = { kind: "workspace_inside_profile", message: "inside it" };
    const root = render(
      <Welcome
        onOpenFolder={async () => undefined}
        recent={{
          workspaces: [{ location: "/work/acme", name: "acme" }],
          onOpen: async (location) => cantOpenProblem(location, refusal),
          onRemove: (location) => removed.push(location),
        }}
      />,
    );

    await act(async () =>
      root.querySelector<HTMLButtonElement>('button[aria-label="acme, /work/acme"]')?.click(),
    );
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Can't open /work/acme: it's inside your profile folder, where Halonic keeps its own files. Move the workspace out of it, then open it from its new place.",
    );
    await act(async () => button(root, "Remove from Recent")?.click());
    expect(removed).toEqual(["/work/acme"]);
  });
});
