// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { breakableAtSeparators, MiddleCut } from "./middle-cut.tsx";

afterEach(unmountAll);

describe("MiddleCut", () => {
  it("leaves a cut start at least 2em, its first letter and a whole …, not a letter and ..", () => {
    const { container } = render(<MiddleCut text="C:\Users\Sam\Documents\Support workflows" />); // leak-guard: allow absolute-path made-up Windows paths for the test
    const end = container.querySelector(".shrink-0");
    expect(end?.className).toContain("max-w-[calc(100%-2em)]");
    expect(container.querySelector(".truncate")?.textContent).toBe("C:\\Users\\Sam\\Documents"); // leak-guard: allow absolute-path made-up Windows paths for the test
  });

  it("keeps no empty start for a folder that isn't cut, and lets it wrap in the whole row", () => {
    const { container } = render(<MiddleCut text="~/Work/acme" />);
    const line = container.firstElementChild;
    expect(line?.children).toHaveLength(1);
    expect(container.querySelector(".truncate")).toBeNull();
    expect(line?.firstElementChild?.className).not.toContain("max-w-");
    expect(line?.textContent).toBe("~/Work/acme");
  });

  it("takes an id, so a row can be described by its whole folder", () => {
    const folder = "/work/projects/Customer Support/Halonic Workspaces/Q3 Renewals";
    const { container } = render(<MiddleCut id="folder" text={folder} />);
    expect(container.querySelector("#folder")?.textContent).toBe(folder);
  });
});

describe("breakableAtSeparators", () => {
  it("allows a break before each separator after the first character, and keeps the text", () => {
    const path = "/hubs/support/agents/triage.agent.yaml changed";
    const { container } = render(<span>{breakableAtSeparators(path)}</span>);
    const line = container.firstElementChild;
    expect(line?.querySelectorAll("wbr")).toHaveLength(3);
    expect(line?.innerHTML).toContain("<wbr>/triage.agent.yaml changed");
    expect(line?.textContent).toBe(path);
  });
});
