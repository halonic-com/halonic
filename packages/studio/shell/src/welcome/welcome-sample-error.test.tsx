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

const failure: WelcomeSampleProblem = { folder: "Documents", reason: "permission denied." };
const failedLine = "Couldn't copy the demo to Documents: permission denied.";

const recent = {
  workspaces: [{ name: "Acme", location: "~/Documents/Acme" }],
  onOpen: async () => undefined,
  onRemove: () => {},
};

function buttonNamed(root: HTMLElement, name: RegExp): HTMLButtonElement | undefined {
  return [...root.querySelectorAll("button")].find((each) => name.test(each.textContent ?? ""));
}

function sampleAlert(root: HTMLElement): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>('[role="alert"]')].find(
    (each) => each.textContent === failedLine,
  );
}

verifies("shell.welcome-sample-error", () => {
  it("says why inside the Open demo block under Recent, with Try again and Choose a folder…", async () => {
    const root = render(
      <Welcome
        onOpenFolder={async () => undefined}
        onTrySample={async () => failure}
        onTrySampleInChosen={async () => undefined}
        recent={recent}
      />,
    );

    await act(async () => buttonNamed(root, /^Open demo/)?.click());

    // The block right after the quiet Open demo, under Recent, holds the line and its ways out.
    const errorBlock = buttonNamed(root, /^Open demo/)?.nextElementSibling;
    const folderBlock = buttonNamed(root, /^Open folder/)?.parentElement;
    const alert = sampleAlert(root);
    expect(alert).toBeDefined();
    expect(errorBlock?.contains(alert ?? null)).toBe(true);
    expect(folderBlock?.contains(alert ?? null)).toBe(false);
    expect(errorBlock?.contains(buttonNamed(root, /^Try again$/) ?? null)).toBe(true);
    expect(errorBlock?.contains(buttonNamed(root, /^Choose a folder…$/) ?? null)).toBe(true);
  });

  it("copies the demo into a picked folder on Choose a folder…", async () => {
    const onTrySampleInChosen = vi.fn(async () => undefined);
    const root = render(
      <Welcome
        onOpenFolder={async () => undefined}
        onTrySample={async () => failure}
        onTrySampleInChosen={onTrySampleInChosen}
        recent={recent}
      />,
    );

    await act(async () => buttonNamed(root, /^Open demo/)?.click());
    await act(async () => buttonNamed(root, /^Choose a folder…$/)?.click());

    expect(onTrySampleInChosen).toHaveBeenCalledTimes(1);
    expect(sampleAlert(root)).toBeUndefined();
    expect(buttonNamed(root, /^Try again$/)).toBeUndefined();
    expect(document.activeElement).toBe(buttonNamed(root, /^Open demo/));
  });

  it("says no Documents while it copies into a picked folder", async () => {
    let finish: (problem: WelcomeSampleProblem | undefined) => void = () => {};
    const onTrySampleInChosen = () =>
      new Promise<WelcomeSampleProblem | undefined>((resolve) => {
        finish = resolve;
      });
    const root = render(
      <Welcome
        onOpenFolder={async () => undefined}
        onTrySample={async () => failure}
        onTrySampleInChosen={onTrySampleInChosen}
        recent={recent}
      />,
    );

    await act(async () => buttonNamed(root, /^Open demo/)?.click());
    await act(async () => buttonNamed(root, /^Choose a folder…$/)?.click());

    expect(document.activeElement?.getAttribute("aria-label")).toBe("Copying the demo…");
    await act(async () => finish(undefined));
  });

  it("copies the demo to Documents again on Try again", async () => {
    const onTrySample = vi
      .fn<() => Promise<WelcomeSampleProblem | undefined>>()
      .mockResolvedValueOnce(failure)
      .mockResolvedValue(undefined);
    const root = render(
      <Welcome onOpenFolder={async () => undefined} onTrySample={onTrySample} recent={recent} />,
    );

    await act(async () => buttonNamed(root, /^Open demo/)?.click());
    // Without the app's other folder there is only the one way out.
    expect(buttonNamed(root, /^Choose a folder…$/)).toBeUndefined();
    await act(async () => buttonNamed(root, /^Try again$/)?.click());

    expect(onTrySample).toHaveBeenCalledTimes(2);
    expect(sampleAlert(root)).toBeUndefined();
    expect(document.activeElement).toBe(buttonNamed(root, /^Open demo/));
  });

  it("keeps focus on the leading Open demo after Try again", async () => {
    const onTrySample = vi
      .fn<() => Promise<WelcomeSampleProblem | undefined>>()
      .mockResolvedValueOnce(failure)
      .mockResolvedValue(undefined);
    const root = render(<Welcome onOpenFolder={async () => undefined} onTrySample={onTrySample} />);

    await act(async () => buttonNamed(root, /^Open demo/)?.click());
    await act(async () => buttonNamed(root, /^Try again$/)?.click());

    expect(document.activeElement).toBe(buttonNamed(root, /^Open demo/));
  });

  it("keeps the error out of the button row while Open demo leads", async () => {
    const root = render(
      <Welcome
        onOpenFolder={async () => undefined}
        onTrySample={async () => failure}
        onTrySampleInChosen={async () => undefined}
      />,
    );

    await act(async () => buttonNamed(root, /^Open demo/)?.click());

    const alert = sampleAlert(root);
    const row = buttonNamed(root, /^Open folder/)?.parentElement;
    expect(alert).toBeDefined();
    expect(row?.contains(alert ?? null)).toBe(false);
    expect(row?.compareDocumentPosition(alert ?? root)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(buttonNamed(root, /^Choose a folder…$/)).toBeDefined();
  });
});
