// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { letterMark, WorkspaceSwitcher } from "./workspace-switcher.tsx";

afterEach(unmountAll);

const menu = [{ id: "open", label: "Open a folder…", onSelect: () => {} }];

describe("WorkspaceSwitcher", () => {
  it("is one button named by its workspace, which opens the workspace menu", () => {
    const container = render(
      <WorkspaceSwitcher workspace={{ name: "Acme", folder: "~/Work/acme" }} menu={menu} />,
    );
    const switcher = container.querySelector('button[aria-haspopup="menu"]');
    expect(switcher?.getAttribute("aria-label")).toBe("Workspace: Acme");
    expect(switcher?.getAttribute("aria-expanded")).toBe("false");
    const opens = document.getElementById(switcher?.getAttribute("popovertarget") ?? "");
    expect(opens?.getAttribute("role")).toBe("menu");
    expect(opens?.textContent).toContain("Open a folder…");
  });

  it("shows the letter mark, then the name over the folder, each on one line", () => {
    const container = render(
      <WorkspaceSwitcher workspace={{ name: "acme", folder: "~/Work/acme" }} menu={menu} />,
    );
    const switcher = container.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
    expect(switcher.textContent).toBe("Aacme~/Work/acme");
    const [name, folder] = [...switcher.querySelectorAll(".truncate")];
    expect(name?.textContent).toBe("acme");
    expect(folder?.textContent).toBe("~/Work/acme");
  });
});

describe("letterMark", () => {
  it("is the name's first character as a capital", () => {
    expect(letterMark("acme")).toBe("A");
    expect(letterMark("  émile")).toBe("É");
    expect(letterMark("𝒜lpha")).toBe("𝒜");
    expect(letterMark("")).toBe("");
  });
});
