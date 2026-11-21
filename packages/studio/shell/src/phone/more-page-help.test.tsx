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
        label: "Show the guide",
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

  it("shows no Help lists without entries", () => {
    const page = render(<MorePage places={[]} onOpen={() => {}} />);
    expect(page.querySelectorAll("h2")).toHaveLength(0);
  });
});
