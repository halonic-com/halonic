// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { createShell } from "../shell.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { Welcome, type WelcomeOpenProblem } from "./welcome.tsx";
import { WelcomeWindow } from "./welcome-window.tsx";

afterEach(() => {
  unmountAll();
});

function openButton(root: HTMLElement): HTMLButtonElement {
  const button = root.querySelector("button");
  if (button === null) {
    throw new Error("No Open folder button");
  }
  return button;
}

/** An opener whose result the test hands over when it likes. */
function pendingOpener() {
  let finish: (problem: WelcomeOpenProblem | undefined) => void = () => {};
  const onOpenFolder = vi.fn(
    () =>
      new Promise<WelcomeOpenProblem | undefined>((resolve) => {
        finish = resolve;
      }),
  );
  return {
    onOpenFolder,
    finish: async (problem?: WelcomeOpenProblem) => {
      await act(async () => finish(problem));
    },
  };
}

verifies("shell.welcome-open", () => {
  it("shows the title, what a workspace is and Open folder", () => {
    const root = render(<Welcome onOpenFolder={async () => undefined} />);

    expect(root.querySelector("h1")?.textContent).toBe("Halonic Studio");
    expect(root.textContent).toContain("Your workspace is a folder of plain files.");
    expect(root.textContent).toContain("Local first, private, and yours.");
    expect(openButton(root).textContent).toContain("Open folder");
  });

  it("is busy while the folder opens and ignores more presses", async () => {
    const opener = pendingOpener();
    const root = render(<Welcome onOpenFolder={opener.onOpenFolder} />);

    await act(async () => openButton(root).click());
    expect(openButton(root).getAttribute("aria-busy")).toBe("true");
    expect(openButton(root).textContent).toContain("Opening…");
    await act(async () => openButton(root).click());
    expect(opener.onOpenFolder).toHaveBeenCalledOnce();

    await opener.finish();
    expect(openButton(root).getAttribute("aria-busy")).not.toBe("true");
  });

  it("stays as it was when the picker is cancelled", async () => {
    const root = render(<Welcome onOpenFolder={async () => undefined} />);

    await act(async () => openButton(root).click());
    expect(root.querySelector('[role="alert"]')?.textContent).toBe("");
  });
});

verifies("shell.welcome-cant-open", () => {
  it("says why under the text and lets the user try again", async () => {
    const root = render(
      <Welcome
        onOpenFolder={async () => ({ folder: "/work/old", reason: "the folder is gone." })}
      />,
    );

    await act(async () => openButton(root).click());
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Can't open /work/old: the folder is gone.",
    );
    expect(openButton(root).getAttribute("aria-busy")).not.toBe("true");
  });

  it("clears the message on the next press", async () => {
    const opener = pendingOpener();
    const root = render(<Welcome onOpenFolder={opener.onOpenFolder} />);
    await act(async () => openButton(root).click());
    await opener.finish({ folder: "/work/old", reason: "the folder is gone." });

    await act(async () => openButton(root).click());
    expect(root.querySelector('[role="alert"]')?.textContent).toBe("");
    await opener.finish();
  });
});

it("draws the welcome screen in the shell's frame, titled with the app's name alone", () => {
  const restoreMedia = new FakeMediaQueries(1280).install();
  document.title = "Home · Acme · Halonic";
  const shell = createShell({ features: [], host: "desktop-app", platform: "windows" });
  const root = render(
    <WelcomeWindow shell={shell} language="en" onOpenFolder={async () => undefined} />,
  );

  expect(root.querySelector("h1")?.textContent).toBe("Halonic Studio");
  expect(root.querySelector("nav")).toBeNull();
  expect(document.title).toBe("Halonic");
  unmountAll();
  restoreMedia();
});
