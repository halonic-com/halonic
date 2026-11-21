// @vitest-environment jsdom

import type { MenuEntry } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { MorePage } from "./more-page.tsx";

afterEach(unmountAll);

verifies("shell.phone-help", () => {
  it("lists the Help menu's groups on the phone's More page, each under its heading", () => {
    const picked: string[] = [];
    const help: MenuEntry[] = [
      {
        id: "doctor.help:check",
        label: "Check this computer",
        onSelect: () => picked.push("check"),
      },
      "divider",
      { heading: "First run" },
      {
        id: "first-run.help:show-guide",
        label: "Show the guide again",
        onSelect: () => picked.push("guide"),
      },
      { id: "first-run.help:start-over", label: "Start over", onSelect: () => picked.push("over") },
    ];
    const page = render(<MorePage places={[]} onOpen={() => {}} help={help} />);
    expect([...page.querySelectorAll("h2")].map((heading) => heading.textContent)).toEqual([
      "Help",
      "First run",
    ]);
    const startOver = [...page.querySelectorAll("[role=gridcell]")].find((cell) =>
      cell.textContent?.includes("Start over"),
    ) as HTMLElement;
    act(() => startOver.click());
    expect(picked).toEqual(["over"]);
  });

  it("shows an item's description in full under its name, and describes the row with it", () => {
    const sentence =
      "Copies Acme to a new folder and begins again at the first step. Your old copy stays where it is.";
    const help: MenuEntry[] = [
      { heading: "First run" },
      {
        id: "first-run.help:start-over",
        label: "Start over",
        detail: sentence,
        detailCut: "wrap",
        onSelect: () => {},
      },
    ];
    const page = render(<MorePage places={[]} onOpen={() => {}} help={help} />);
    const cell = page.querySelector("[role=gridcell]") as HTMLElement;
    expect(cell.textContent).toContain(sentence);
    const describedBy = cell.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy ?? "")?.textContent).toBe(sentence);
  });

  it("shows no Help lists without entries", () => {
    const page = render(<MorePage places={[]} onOpen={() => {}} />);
    expect(page.querySelectorAll("h2")).toHaveLength(0);
  });
});
