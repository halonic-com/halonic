// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { MiddleCut, middleCutAt } from "./middle-cut.tsx";

afterEach(unmountAll);

/** The end of `text` that always shows. */
const tailOf = (text: string) => text.slice(middleCutAt(text));

// Where a Recent row's folder is cut (and the switcher's, which uses the same cut).
verifies("shell.welcome-recent", () => {
  it("cuts a Windows folder at a backslash, so its end starts on a whole folder name", () => {
    const folder = "C:\\Users\\Ada\\OneDrive - Acme BV\\Documents\\Acme sample"; // leak-guard: allow absolute-path made-up Windows paths for the test
    expect(tailOf(folder)).toBe("\\OneDrive - Acme BV\\Documents\\Acme sample");
  });

  it("cuts a POSIX folder at a slash, as before", () => {
    const folder = "/work/projects/Customer Support/Halonic Workspaces/Q3 Renewals";
    expect(tailOf(folder)).toBe("/Halonic Workspaces/Q3 Renewals");
  });

  it("keeps a short folder whole in its end", () => {
    expect(middleCutAt("~/Work/acme")).toBe(0);
  });

  it("cuts mid-name when there is no separator to cut at", () => {
    const name = "a".repeat(30);
    expect(tailOf(name)).toHaveLength(24);
  });
});

describe("MiddleCut", () => {
  it("shows the whole folder, its start cut with … and its end kept", () => {
    const folder = "C:\\Users\\Ada\\Documents\\Acme sample"; // leak-guard: allow absolute-path made-up Windows paths for the test
    const container = render(<MiddleCut text={folder} />);
    expect(container.textContent).toBe(folder);
    expect(container.querySelector(".truncate")?.textContent).toBe("C:\\Users"); // leak-guard: allow absolute-path made-up Windows paths for the test
    expect(container.querySelector(".shrink-0")?.textContent).toBe("\\Ada\\Documents\\Acme sample");
  });

  it("lets an end too wide for its row wrap, between folder names first, and not draw past it", () => {
    const folder = "/work/projects/Customer Support/Halonic Workspaces/Q3 Renewals";
    const container = render(<MiddleCut text={folder} />);
    const end = container.querySelector(".shrink-0");
    expect(end?.className).toContain("whitespace-pre-wrap");
    expect(end?.className).toContain("max-w-");
    // A break is allowed before each "/" in the end but its first, which already starts the end.
    const breaksBefore = [...(end?.querySelectorAll("wbr") ?? [])].map(
      (lineBreak) => lineBreak.nextSibling?.textContent,
    );
    expect(breaksBefore).toEqual(["/Q3 Renewals"]);
    expect(end?.textContent).toBe("/Halonic Workspaces/Q3 Renewals");
  });
});
