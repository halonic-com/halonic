// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { ClipboardProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { createShell } from "../shell.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { cantOpenProblem, type WelcomeOpenProblem } from "./cant-open.ts";
import { Welcome } from "./welcome.tsx";
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
    expect(document.activeElement).toBe(openButton(root));
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

  it("shows New workspace… only with a dialog to open, and a press opens it", async () => {
    const without = render(<Welcome onOpenFolder={async () => undefined} />);
    expect(without.textContent).not.toContain("New workspace…");
    unmountAll();
    const onNewWorkspace = vi.fn();
    const root = render(
      <Welcome onOpenFolder={async () => undefined} onNewWorkspace={onNewWorkspace} />,
    );
    const button = [...root.querySelectorAll("button")].find((each) =>
      each.textContent?.includes("New workspace…"),
    );

    await act(async () => button?.click());
    expect(onNewWorkspace).toHaveBeenCalledOnce();
  });

  it("caps the column at a width the theme defines, so a long path can't widen it", () => {
    const root = render(<Welcome onOpenFolder={async () => undefined} />);

    const column = root.querySelector("h1")?.parentElement?.parentElement;
    expect(column?.className).toContain("max-w-dialog-sm");
    expect(column?.className).toContain("min-w-0");
    expect(column?.className).not.toContain("max-w-md");
    expect(root.querySelector('[role="alert"]')?.className).toContain("break-words");
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
        onOpenFolder={async () => ({
          folder: "/work/old",
          kind: "not_found",
          reason: "the folder is gone.",
        })}
      />,
    );

    await act(async () => openButton(root).click());
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Can't open /work/old: the folder is gone.",
    );
    expect(openButton(root).getAttribute("aria-busy")).not.toBe("true");
  });

  it("asks the picker once and doesn't retry it, as the folder's opening is retried elsewhere", async () => {
    vi.useFakeTimers();
    try {
      const onOpenFolder = vi.fn(async () =>
        cantOpenProblem("/work/odd", new KindedError("unavailable", "no answer")),
      );
      const root = render(<Welcome onOpenFolder={onOpenFolder} />);

      await act(async () => openButton(root).click());
      await act(async () => vi.advanceTimersByTimeAsync(11_000));

      expect(onOpenFolder).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the message on the next press", async () => {
    const opener = pendingOpener();
    const root = render(<Welcome onOpenFolder={opener.onOpenFolder} />);
    await act(async () => openButton(root).click());
    await opener.finish({ folder: "/work/old", kind: "not_found", reason: "the folder is gone." });

    await act(async () => openButton(root).click());
    expect(root.querySelector('[role="alert"]')?.textContent).toBe("");
    await opener.finish();
  });

  it("offers Copy details only when Halonic can't explain the reason", async () => {
    const writeClipboard = vi.fn(async () => true);
    const opener = pendingOpener();
    const root = render(
      <ClipboardProvider writeClipboard={writeClipboard}>
        <Welcome onOpenFolder={opener.onOpenFolder} />
      </ClipboardProvider>,
    );
    const copyLink = () =>
      [...root.querySelectorAll("button")].find((each) => each.textContent === "Copy details");

    await act(async () => openButton(root).click());
    await opener.finish({ folder: "/work/old", kind: "not_found", reason: "the folder is gone." });
    expect(copyLink()).toBeUndefined();

    await act(async () => openButton(root).click());
    await opener.finish({
      folder: "/work/old",
      kind: "internal",
      reason: "Halonic ran into a problem it can't explain yet.",
      details: "Can't open /work/old\nTypeError: x is undefined",
    });
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Can't open /work/old: Halonic ran into a problem it can't explain yet.",
    );
    await act(async () => copyLink()?.click());
    expect(writeClipboard).toHaveBeenCalledWith("Can't open /work/old\nTypeError: x is undefined");
  });
});

verifies("shell.welcome-recent", () => {
  const workspaces = ["acme", "beta", "gamma", "delta", "eps", "zeta", "eta"].map((name) => ({
    location: `/work/${name}`,
    name,
  }));

  function recentRow(root: HTMLElement, name: string): HTMLButtonElement | null {
    return root.querySelector<HTMLButtonElement>(`button[aria-label="${name}, /work/${name}"]`);
  }

  function removeLink(root: HTMLElement): HTMLButtonElement | undefined {
    return [...root.querySelectorAll("button")].find(
      (each) => each.textContent === "Remove from Recent",
    );
  }

  it("shows Recent and the five most recent, each its name over its folder", () => {
    const root = render(
      <Welcome
        onOpenFolder={async () => undefined}
        recent={{ workspaces, onOpen: async () => undefined, onRemove: () => {} }}
      />,
    );

    expect(root.querySelector("h2")?.textContent).toBe("Recent");
    const rows = [...root.querySelectorAll("li button")];
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "acme, /work/acme",
      "beta, /work/beta",
      "gamma, /work/gamma",
      "delta, /work/delta",
      "eps, /work/eps",
    ]);
    expect(rows[0]?.textContent).toBe("acme/work/acme");
    expect(document.activeElement).toBe(openButton(root));
  });

  it("hides the heading while nothing is remembered", () => {
    const root = render(
      <Welcome
        onOpenFolder={async () => undefined}
        recent={{ workspaces: [], onOpen: async () => undefined, onRemove: () => {} }}
      />,
    );

    expect(root.querySelector("h2")).toBeNull();
    expect(root.textContent).not.toContain("Recent");
  });

  it("opens a row, busy meanwhile, and ignores presses until it's done", async () => {
    let finish: () => void = () => {};
    const onOpen = vi.fn(
      () =>
        new Promise<undefined>((resolve) => {
          finish = () => resolve(undefined);
        }),
    );
    const onOpenFolder = vi.fn(async () => undefined);
    const root = render(
      <Welcome onOpenFolder={onOpenFolder} recent={{ workspaces, onOpen, onRemove: () => {} }} />,
    );

    await act(async () => recentRow(root, "beta")?.click());
    expect(onOpen).toHaveBeenCalledWith("/work/beta");
    expect(recentRow(root, "beta")?.getAttribute("aria-busy")).toBe("true");
    expect(openButton(root).getAttribute("aria-busy")).not.toBe("true");

    await act(async () => recentRow(root, "acme")?.click());
    await act(async () => openButton(root).click());
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onOpenFolder).not.toHaveBeenCalled();

    await act(async () => finish());
    expect(recentRow(root, "beta")?.hasAttribute("aria-busy")).toBe(false);
  });

  it("a Recent row stays busy and tries again for 10 seconds, then says the engine isn't answering", async () => {
    vi.useFakeTimers();
    try {
      const onOpen = vi.fn(async () =>
        cantOpenProblem(
          "~/Documents/Acme",
          new KindedError("unavailable", "The desktop shell gave no answer"),
        ),
      );
      const root = render(
        <Welcome
          onOpenFolder={async () => undefined}
          recent={{ workspaces, onOpen, onRemove: () => {} }}
        />,
      );

      const row = recentRow(root, "acme");
      await act(async () => row?.click());
      await act(async () => vi.advanceTimersByTimeAsync(5_000));
      expect(row?.getAttribute("aria-busy")).toBe("true");
      expect(root.querySelector('[role="alert"]')?.textContent).toBe("");

      await act(async () => vi.advanceTimersByTimeAsync(6_000));
      const line = root.querySelector('[role="alert"]')?.textContent;
      expect(line).toBe(
        "Can't open ~/Documents/Acme: the engine isn't answering. It may still be starting.",
      );
      expect(line).not.toMatch(/shell/i);
      expect(row?.getAttribute("aria-busy")).not.toBe("true");
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks the row that failed and describes it by the alert line", async () => {
    const root = render(
      <Welcome
        onOpenFolder={async () => undefined}
        recent={{
          workspaces,
          onOpen: async (location) => ({
            folder: location,
            kind: "not_found",
            reason: "the folder is gone.",
          }),
          onRemove: () => {},
        }}
      />,
    );

    await act(async () => recentRow(root, "beta")?.click());
    const alertId = root.querySelector('[role="alert"]')?.id;
    expect(alertId).toBeTruthy();
    expect(recentRow(root, "beta")?.getAttribute("aria-describedby")).toBe(alertId);
    expect(recentRow(root, "beta")?.className).toContain("border-danger");
    expect(recentRow(root, "acme")?.hasAttribute("aria-describedby")).toBe(false);
    expect(recentRow(root, "acme")?.className).not.toContain("border-danger");
  });

  it("cuts a long folder in the middle and keeps its end", () => {
    const location = "/work/projects/Customer Support/Halonic Workspaces/Q3 Renewals";
    const root = render(
      <Welcome
        onOpenFolder={async () => undefined}
        recent={{
          workspaces: [{ location, name: "Q3" }],
          onOpen: async () => undefined,
          onRemove: () => {},
        }}
      />,
    );

    const row = root.querySelector("li button");
    expect(row?.getAttribute("aria-label")).toBe(`Q3, ${location}`);
    expect(row?.textContent).toContain(location);
    expect(row?.querySelector(".shrink-0")?.textContent).toBe(location.slice(-24));
  });

  it("says a row's folder is gone, offers Remove from Recent and keeps the row", async () => {
    const root = render(
      <Welcome
        onOpenFolder={async () => undefined}
        recent={{
          workspaces,
          onOpen: async (location) => ({
            folder: location,
            kind: "not_found",
            reason: "the folder is gone.",
          }),
          onRemove: () => {},
        }}
      />,
    );

    await act(async () => recentRow(root, "acme")?.click());
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Can't open /work/acme: the folder is gone.",
    );
    expect(removeLink(root)).toBeDefined();
    expect(recentRow(root, "acme")).not.toBeNull();
  });

  it("offers no Remove from Recent for a picked folder or another reason", async () => {
    const root = render(
      <Welcome
        onOpenFolder={async () => ({
          folder: "/work/old",
          kind: "not_found",
          reason: "the folder is gone.",
        })}
        recent={{
          workspaces,
          onOpen: async (location) => ({
            folder: location,
            kind: "denied",
            reason: "you don't have permission to read it.",
          }),
          onRemove: () => {},
        }}
      />,
    );

    await act(async () => openButton(root).click());
    expect(removeLink(root)).toBeUndefined();
    await act(async () => recentRow(root, "acme")?.click());
    expect(removeLink(root)).toBeUndefined();
  });

  it("removes the row and moves focus to the next row, else to Open folder", async () => {
    function Harness() {
      const [remembered, setRemembered] = useState(workspaces.slice(0, 2));
      return (
        <Welcome
          onOpenFolder={async () => undefined}
          recent={{
            workspaces: remembered,
            onOpen: async (location) => ({
              folder: location,
              kind: "not_found",
              reason: "the folder is gone.",
            }),
            onRemove: (location) =>
              setRemembered((rows) => rows.filter((row) => row.location !== location)),
          }}
        />
      );
    }
    const root = render(<Harness />);

    await act(async () => recentRow(root, "acme")?.click());
    await act(async () => removeLink(root)?.click());
    expect(recentRow(root, "acme")).toBeNull();
    expect(document.activeElement).toBe(recentRow(root, "beta"));
    expect(root.querySelector('[role="alert"]')?.textContent).toBe("");

    await act(async () => recentRow(root, "beta")?.click());
    await act(async () => removeLink(root)?.click());
    expect(root.querySelector("h2")).toBeNull();
    expect(document.activeElement).toBe(openButton(root));
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
