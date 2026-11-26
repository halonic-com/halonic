// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { Welcome } from "./welcome.tsx";
import { WelcomeRecent } from "./welcome-recent.tsx";
import type { WelcomeSampleProblem } from "./welcome-sample.tsx";

afterEach(() => {
  unmountAll();
});

const timeLine = "New here? The demo takes about 4 minutes.";

function sampleButton(root: HTMLElement): HTMLButtonElement | undefined {
  return [...root.querySelectorAll("button")].find((each) =>
    /Open demo|Copying the demo…/.test(each.textContent ?? ""),
  );
}

const recent = {
  workspaces: [{ name: "Acme", location: "~/Documents/Acme" }],
  onOpen: async () => undefined,
  onRemove: () => {},
};

verifies("shell.welcome-sample", () => {
  it("has no demo button without the app's demo, and Open folder leads", () => {
    const root = render(<Welcome onOpenFolder={async () => undefined} />);

    expect(sampleButton(root)).toBeUndefined();
    expect(root.textContent).not.toContain(timeLine);
    expect(document.activeElement?.textContent).toMatch(/^Open folder/);
  });

  it("puts the time line right under the buttons, above the New workspace… link", () => {
    const root = render(
      <Welcome
        onOpenFolder={async () => undefined}
        onNewWorkspace={() => {}}
        onTrySample={async () => undefined}
      />,
    );
    const text = root.textContent ?? "";

    expect(text.indexOf("Open folder")).toBeLessThan(text.indexOf(timeLine));
    expect(text.indexOf(timeLine)).toBeLessThan(text.indexOf("New workspace…"));
  });

  it("leads with Open demo, then Open folder and the New workspace… link, while Recent is empty", () => {
    const root = render(
      <Welcome
        onOpenFolder={async () => undefined}
        onNewWorkspace={() => {}}
        onTrySample={async () => undefined}
      />,
    );

    const buttons = [...root.querySelectorAll("button")];
    // A busy button keeps its busy words hidden after its label, so each row starts with its label.
    expect(buttons.map((each) => each.textContent)).toEqual([
      expect.stringMatching(/^Open demo/),
      expect.stringMatching(/^Open folder/),
      "New workspace…",
    ]);
    expect(buttons.map((each) => each.className.includes("bg-primary "))).toEqual([
      true,
      false,
      false,
    ]);
    expect(document.activeElement).toBe(sampleButton(root));
    expect(root.textContent).toContain(timeLine);
    const described = sampleButton(root)?.getAttribute("aria-describedby");
    expect(described).toBeTruthy();
    expect(document.getElementById(described ?? "")?.textContent).toBe(timeLine);
  });

  it("moves under Recent without the time line once Recent has entries", () => {
    const root = render(
      <Welcome
        onOpenFolder={async () => undefined}
        onTrySample={async () => undefined}
        recent={recent}
      />,
    );

    expect(root.textContent).not.toContain(timeLine);
    expect(root.textContent?.indexOf("Recent")).toBeLessThan(
      root.textContent?.indexOf("Open demo") ?? -1,
    );
    expect(document.activeElement?.textContent).toMatch(/^Open folder/);
  });

  it("is busy while the demo is copied and ignores more presses", async () => {
    let finish: (problem: WelcomeSampleProblem | undefined) => void = () => {};
    const onTrySample = vi.fn(
      () => new Promise<WelcomeSampleProblem | undefined>((resolve) => (finish = resolve)),
    );
    const root = render(<Welcome onOpenFolder={async () => undefined} onTrySample={onTrySample} />);
    const button = sampleButton(root);
    button?.focus();

    await act(async () => button?.click());
    await act(async () => sampleButton(root)?.click());

    expect(onTrySample).toHaveBeenCalledTimes(1);
    expect(sampleButton(root)?.textContent).toContain("Copying the demo…");
    expect(sampleButton(root)?.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(sampleButton(root));
    await act(async () => finish(undefined));
    expect(sampleButton(root)?.getAttribute("aria-busy")).not.toBe("true");
  });

  it("keeps Open folder and New workspace… usable while the demo is copied", async () => {
    let finish: (problem: WelcomeSampleProblem | undefined) => void = () => {};
    const onOpenFolder = vi.fn(async () => undefined);
    const onNewWorkspace = vi.fn();
    const root = render(
      <Welcome
        onOpenFolder={onOpenFolder}
        onNewWorkspace={onNewWorkspace}
        onTrySample={() => new Promise<WelcomeSampleProblem | undefined>((r) => (finish = r))}
      />,
    );
    const named = (label: string) =>
      [...root.querySelectorAll("button")].find((each) => each.textContent?.includes(label));

    await act(async () => sampleButton(root)?.click());
    await act(async () => named("Open folder")?.click());
    await act(async () => named("New workspace…")?.click());

    expect(sampleButton(root)?.getAttribute("aria-busy")).toBe("true");
    expect(onOpenFolder).toHaveBeenCalledTimes(1);
    expect(onNewWorkspace).toHaveBeenCalledTimes(1);
    await act(async () => finish(undefined));
  });

  it("says why under the text when the demo can't be copied", async () => {
    const root = render(
      <Welcome
        onOpenFolder={async () => undefined}
        onTrySample={async () => ({ folder: "Documents", reason: "permission denied." })}
      />,
    );

    await act(async () => sampleButton(root)?.click());

    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Couldn't copy the demo to Documents: permission denied.",
    );
    expect(sampleButton(root)?.getAttribute("aria-busy")).not.toBe("true");
  });

  it("shows the copy error after the time line and above New workspace…", async () => {
    const root = render(
      <Welcome
        onOpenFolder={async () => undefined}
        onNewWorkspace={() => {}}
        onTrySample={async () => ({ folder: "Documents", reason: "permission denied." })}
      />,
    );

    await act(async () => sampleButton(root)?.click());

    const alert = root.querySelector('[role="alert"]');
    const timeParagraph = [...root.querySelectorAll("p")].find((each) =>
      each.textContent?.includes(timeLine),
    );
    const newWorkspace = [...root.querySelectorAll("button")].find(
      (each) => each.textContent === "New workspace…",
    );
    const follows = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(timeParagraph?.compareDocumentPosition(alert as Node) ?? 0).toBe(follows);
    expect(alert?.compareDocumentPosition(newWorkspace as Node) ?? 0).toBe(follows);
  });

  it("stacks Open demo and Open folder at one width on a narrow window", () => {
    const root = render(
      <Welcome onOpenFolder={async () => undefined} onTrySample={async () => undefined} />,
    );
    const column = root.querySelector("h1")?.parentElement?.parentElement;
    const row = sampleButton(root)?.closest("div.flex-wrap");

    expect(column?.className).toContain("@container");
    expect(row?.className).toContain("@max-xs:flex-col");
    expect(row?.className).toContain("@max-xs:self-stretch");
  });

  it("tries again by itself, then says the engine isn't answering after 10 seconds", async () => {
    vi.useFakeTimers();
    try {
      const onTrySample = vi.fn(async () => ({
        folder: "Documents",
        reason: "The desktop shell gave no answer",
        unavailable: true as const,
      }));
      const root = render(
        <Welcome onOpenFolder={async () => undefined} onTrySample={onTrySample} />,
      );

      await act(async () => sampleButton(root)?.click());
      await act(async () => vi.advanceTimersByTimeAsync(5_000));

      expect(sampleButton(root)?.getAttribute("aria-busy")).toBe("true");
      expect(root.querySelector('[role="alert"]')?.textContent).toBe("");

      await act(async () => vi.advanceTimersByTimeAsync(6_000));

      const line = root.querySelector('[role="alert"]')?.textContent;
      expect(line).toBe(
        "Couldn't copy the demo to Documents: the engine isn't answering. It may still be starting.",
      );
      expect(line).not.toMatch(/shell/i);
      expect(sampleButton(root)?.getAttribute("aria-busy")).not.toBe("true");
      expect(onTrySample.mock.calls.length).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("carries on by itself when the engine answers during the wait", async () => {
    vi.useFakeTimers();
    try {
      const onTrySample = vi
        .fn<() => Promise<WelcomeSampleProblem | undefined>>()
        .mockResolvedValueOnce({ folder: "Documents", reason: "x", unavailable: true })
        .mockResolvedValue(undefined);
      const root = render(
        <Welcome onOpenFolder={async () => undefined} onTrySample={onTrySample} />,
      );

      await act(async () => sampleButton(root)?.click());
      await act(async () => vi.advanceTimersByTimeAsync(1_500));

      expect(onTrySample).toHaveBeenCalledTimes(2);
      expect(root.querySelector('[role="alert"]')?.textContent).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("ends a sample's Recent row in a Demo tag, and names it in the row's label", () => {
    const root = render(
      <Welcome
        onOpenFolder={async () => undefined}
        recent={{
          ...recent,
          workspaces: [
            { name: "Acme", location: "~/Documents/Acme sample", sample: true },
            { name: "Acme", location: "~/Work/Acme" },
          ],
        }}
      />,
    );

    const rows = [...root.querySelectorAll("li button")];
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "Acme, ~/Documents/Acme sample, Demo",
      "Acme, ~/Work/Acme",
    ]);
    expect(rows[0]?.textContent).toBe("AcmeDemo~/Documents/Acme sample");
    expect(rows[1]?.textContent).toBe("Acme~/Work/Acme");
  });

  it.each(["desktop", "phone"] as const)(
    "puts a sample's tag right after its name on a %s",
    (presentation) => {
      const sample = [{ name: "Acme", location: "C:\\Users\\Sam\\Documents\\Acme", sample: true }]; // leak-guard: allow absolute-path made-up Windows paths for the test
      const container = render(
        <PresentationProvider presentation={presentation}>
          <WelcomeRecent
            workspaces={sample}
            opening={undefined}
            onOpen={() => {}}
            rowRef={() => null}
          />
        </PresentationProvider>,
      );
      const row = container.querySelector("li button") as HTMLButtonElement;

      expect(row.querySelector(".text-body")?.textContent).toBe("AcmeDemo");
      // Only the name and the folder's column: no tag at the right (HAL-19399 G12).
      expect(row.children).toHaveLength(1);
      expect(row.getAttribute("aria-label")).toBe("Acme, C:\\Users\\Sam\\Documents\\Acme, Demo"); // leak-guard: allow absolute-path made-up Windows paths for the test
    },
  );
});
