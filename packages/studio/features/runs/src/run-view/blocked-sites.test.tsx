// @vitest-environment jsdom
import { blockedSites, type RunEvent, type StepBlockedSites } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import {
  BlockedSitesBannerText,
  BlockedSitesLine,
  BlockedSitesLogLines,
  BlockedSitesPanel,
  entrySiteLimit,
  logSiteLimit,
  seeTheStepText,
} from "./blocked-sites.tsx";
import { fill, fillText } from "./blocked-sites-text.tsx";
import { type BlockedSitesKey, blockedSitesWords } from "./blocked-sites-words.ts";

afterEach(unmountAll);

/** A run log of one step, Install, that was refused these sites with these running counts. */
function runLog(...blocks: [host: string, count: number][]): RunEvent[] {
  const entered: RunEvent = {
    runId: "r",
    seq: 1,
    at: "2026-11-11T08:00:00Z",
    type: "state.entered",
    state: "install",
  };
  return [
    entered,
    ...blocks.map(
      ([host, count], index): RunEvent => ({
        runId: "r",
        seq: index + 2,
        at: "2026-11-11T08:00:01Z",
        type: "sandbox.blocked",
        state: "install",
        agent: "writer",
        block: { kind: "network", host, port: 443 },
        count,
      }),
    ),
  ];
}

function stepOf(events: readonly RunEvent[], limit = entrySiteLimit): StepBlockedSites {
  const [step] = blockedSites(events, { limit });
  if (step === undefined) throw new Error("no blocked sites");
  return step;
}

/** `count` sites, each refused once. */
function manySites(count: number): [string, number][] {
  return Array.from({ length: count }, (_, index) => [
    `site-${String(index).padStart(2, "0")}.example`,
    1,
  ]);
}

// registry.npmjs.org retried: its running count went from 1 to 12.
const install = stepOf(
  runLog(
    ["registry.npmjs.org", 1],
    ["registry.npmjs.org", 12],
    ["objects.githubusercontent.com", 1],
  ),
);

function texts(container: HTMLElement, selector: string): string[] {
  return [...container.querySelectorAll(selector)].map((element) => element.textContent ?? "");
}

describe("blocked sites words", () => {
  it("fills every placeholder of every key, and refuses a missing value", () => {
    const values = { agent: "Writer", count: 3, site: "npmjs.org", tries: "12 tries" };
    for (const key of Object.keys(blockedSitesWords) as BlockedSitesKey[]) {
      const text = fillText(key, values);
      expect(text.trim(), key).not.toBe("");
      expect(text, key).not.toMatch(/[{}]/);
    }
    expect(() => fill("sandbox.blocked-sites.action")).toThrow("no value for {agent}");
  });

  it("never says that nothing reached the site", () => {
    for (const words of Object.values(blockedSitesWords))
      expect(words).not.toMatch(/nothing reached/i);
  });
});

verifies("runs.run-view.blocked-sites", () => {
  it("names the step's sites once under its meta line, as a warning button named by its text", () => {
    const onOpen = vi.fn();
    const container = render(<BlockedSitesLine step={install} expanded={false} onOpen={onOpen} />);

    const button = container.querySelector("button");
    expect(button?.textContent).toBe("Blocked 2 sites");
    expect(button?.className).toContain("text-warning");
    expect(button?.getAttribute("aria-expanded")).toBe("false");
    act(() => button?.click());
    expect(onOpen).toHaveBeenCalledOnce();

    const one = render(
      <BlockedSitesLine step={stepOf(runLog(["a.example", 1]))} expanded onOpen={onOpen} />,
    );
    expect(one.textContent).toBe("Blocked 1 site");
  });

  it("lists each site once in the entry, most tries first, read as the site and its tries", () => {
    const container = render(
      <BlockedSitesPanel
        step={install}
        agent="Writer"
        noConnectionProven
        place="desktop"
        onOpenAllowedSites={vi.fn()}
      />,
    );

    expect(container.querySelector("h3")?.textContent).toBe("Blocked sites");
    expect(texts(container, "li")).toEqual([
      "registry.npmjs.org, 12 tries",
      "objects.githubusercontent.com, 1 try",
    ]);
  });

  it("counts over 999 tries as 999+", () => {
    const container = render(
      <BlockedSitesPanel
        step={stepOf(runLog(["a.example", 1000]))}
        agent="Writer"
        noConnectionProven
        place="phone"
      />,
    );
    expect(texts(container, "li")).toEqual(["a.example, 999+ tries"]);
  });

  it("shows 5 sites in the entry, then a line for the rest that isn't a link", () => {
    const container = render(
      <BlockedSitesPanel
        step={stepOf(runLog(...manySites(12)))}
        agent="Writer"
        noConnectionProven
        place="phone"
      />,
    );

    expect(container.querySelectorAll("li")).toHaveLength(5);
    expect(texts(container, "p")).toContain("and 7 more sites");
    expect(container.querySelector("a")).toBeNull();
  });

  it("shows a site's name as plain text, its registrable domain apart (J)", () => {
    const step = stepOf(
      runLog(
        ["registry.npmjs.org.evil.example", 3],
        ["xn--pple-43d.com", 2],
        ["x".repeat(200) + ".evil.example", 1],
      ),
    );
    const container = render(
      <BlockedSitesPanel step={step} agent="Writer" noConnectionProven place="phone" />,
    );

    expect(container.querySelector("a, [href]")).toBeNull();
    const bold = texts(container, "li .font-medium");
    expect(bold).toEqual(["evil.example", "xn--pple-43d.com", "evil.example"]);
    expect(container.querySelector("li .text-fg-muted")?.textContent).toBe("registry.npmjs.org.");
    expect(container.querySelector("li:last-child")?.textContent).toContain("…");
  });

  it("gives the hint and one action that opens the agent's allowed sites, never adding a site itself", () => {
    const onOpenAllowedSites = vi.fn();
    const container = render(
      <BlockedSitesPanel
        step={install}
        agent="Writer"
        noConnectionProven
        place="desktop"
        onOpenAllowedSites={onOpenAllowedSites}
      />,
    );

    const hint = texts(container, "p").at(-1);
    expect(hint).toBe(
      "These sites aren't in Writer's allowed sites. No connection was made. To allow one, add it to Writer's allowed sites. Writer can then send that site anything it can read.",
    );
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toBe("Open Writer's allowed sites");
    act(() => buttons[0]?.click());
    expect(onOpenAllowedSites).toHaveBeenCalledOnce();
  });

  it("doesn't say no connection was made where that isn't proven yet (a run on Windows)", () => {
    const container = render(
      <BlockedSitesPanel
        step={stepOf(runLog(["a.example", 1]))}
        agent="Writer"
        noConnectionProven={false}
        place="desktop"
        onOpenAllowedSites={vi.fn()}
      />,
    );

    expect(container.textContent).toContain(
      "This site isn't in Writer's allowed sites. To allow it, add it to Writer's allowed sites.",
    );
    expect(container.textContent).not.toContain("No connection");
  });

  it("on a phone, names where to fix it, with no link or button", () => {
    const container = render(
      <BlockedSitesPanel step={install} agent="Writer" noConnectionProven place="phone" />,
    );

    expect(container.querySelector("button, a")).toBeNull();
    expect(texts(container, "p").at(-1)).toBe(
      "Fix this on your computer: Writer › Harness › Allowed sites",
    );
  });

  it("puts the heading in reach of focus, for the line that opened the entry", () => {
    const headingRef = { current: null as HTMLHeadingElement | null };
    render(
      <BlockedSitesPanel
        step={install}
        agent="Writer"
        noConnectionProven
        place="phone"
        headingRef={headingRef}
      />,
    );

    act(() => headingRef.current?.focus());
    expect(document.activeElement?.textContent).toBe("Blocked sites");
  });

  it("writes one run log line per site per step however often it retried, at most 20", () => {
    const events = runLog(
      ["registry.npmjs.org", 1],
      ["registry.npmjs.org", 12],
      ["objects.githubusercontent.com", 1],
    );
    const container = render(<BlockedSitesLogLines step={stepOf(events, logSiteLimit)} />);
    expect(texts(container, "p")).toEqual([
      "Blocked: registry.npmjs.org (12 tries)",
      "Blocked: objects.githubusercontent.com (1 try)",
    ]);
    expect(container.querySelector("p .font-medium")?.textContent).toBe("npmjs.org");

    const many = render(
      <BlockedSitesLogLines step={stepOf(runLog(...manySites(23)), logSiteLimit)} />,
    );
    const lines = texts(many, "p");
    expect(lines).toHaveLength(21);
    expect(lines.at(-1)).toBe("and 3 more sites");
  });

  it("gives the failed banner the several-sites sentence with the most-tried site as example", () => {
    const container = render(
      <BlockedSitesBannerText step={install} agent="Reporter" noConnectionProven />,
    );
    expect(container.textContent).toBe(
      "The sandbox stopped Reporter from reaching 2 sites that aren't in its allowed sites, such as registry.npmjs.org. No connection was made.",
    );
    expect(container.querySelector(".font-medium")?.textContent).toBe("npmjs.org");
    expect(seeTheStepText()).toBe("See the step");

    const one = render(
      <BlockedSitesBannerText
        step={stepOf(runLog(["a.example", 1]))}
        agent="Reporter"
        noConnectionProven
      />,
    );
    expect(one.textContent).toBe("");
  });
});
