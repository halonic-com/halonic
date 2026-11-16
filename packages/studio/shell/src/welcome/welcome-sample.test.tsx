// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { Welcome } from "./welcome.tsx";
import type { WelcomeSampleProblem } from "./welcome-sample.tsx";

afterEach(() => {
  unmountAll();
});

const costLine = "Runs on the built-in test model, with scripted replies. No key, no cost.";

function sampleButton(root: HTMLElement): HTMLButtonElement | undefined {
  return [...root.querySelectorAll("button")].find((each) =>
    /Try the Acme sample|Creating the sample…/.test(each.textContent ?? ""),
  );
}

const recent = {
  workspaces: [{ name: "Acme", location: "~/Documents/Acme" }],
  onOpen: async () => undefined,
  onRemove: () => {},
};

verifies("shell.welcome-sample", () => {
  it("has no sample button without the app's sample creator", () => {
    const root = render(<Welcome onOpenFolder={async () => undefined} />);

    expect(sampleButton(root)).toBeUndefined();
  });

  it("shows the button with the cost line while Recent is empty", () => {
    const root = render(
      <Welcome onOpenFolder={async () => undefined} onTrySample={async () => undefined} />,
    );

    expect(sampleButton(root)?.getAttribute("aria-busy")).not.toBe("true");
    expect(root.textContent).toContain(costLine);
    const described = sampleButton(root)?.getAttribute("aria-describedby");
    expect(described).toBeTruthy();
    expect(document.getElementById(described ?? "")?.textContent).toBe(costLine);
  });

  it("moves under Recent without the cost line once Recent has entries", () => {
    const root = render(
      <Welcome
        onOpenFolder={async () => undefined}
        onTrySample={async () => undefined}
        recent={recent}
      />,
    );

    expect(root.textContent).not.toContain(costLine);
    expect(root.textContent?.indexOf("Recent")).toBeLessThan(
      root.textContent?.indexOf("Try the Acme sample") ?? -1,
    );
  });

  it("is busy while the sample is created and ignores more presses", async () => {
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
    expect(sampleButton(root)?.textContent).toContain("Creating the sample…");
    expect(sampleButton(root)?.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(sampleButton(root));
    await act(async () => finish(undefined));
    expect(sampleButton(root)?.getAttribute("aria-busy")).not.toBe("true");
  });

  it("keeps Open folder and New workspace… usable while the sample is created", async () => {
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

  it("says why under the text when the sample can't be created", async () => {
    const root = render(
      <Welcome
        onOpenFolder={async () => undefined}
        onTrySample={async () => ({ folder: "~/Documents", reason: "permission denied." })}
      />,
    );

    await act(async () => sampleButton(root)?.click());

    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Can't create the sample in ~/Documents: permission denied.",
    );
    expect(sampleButton(root)?.getAttribute("aria-busy")).not.toBe("true");
  });
});
