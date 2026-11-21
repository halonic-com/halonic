// @vitest-environment jsdom
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { UnfencedYesHost } from "../api.ts";
import { click } from "../test-support/controls.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { AgentSandboxHostView } from "./agent-sandbox-section.tsx";
import { allowedDay, UnfencedYesBlock } from "./unfenced-yes.tsx";

afterEach(unmountAll);

type Status = Awaited<ReturnType<UnfencedYesHost["status"]>>;

const allowed: Status = { run: "allowed", reason: "windows", allowedAt: "2026-11-09T10:00:00" };

/** A host whose status the test sets, and whose Take back ends when the test says. */
function fakeHost(first: Status) {
  let status = first;
  let endTakeBack: (error?: Error) => void = () => {};
  const host = {
    status: vi.fn(async () => status),
    takeBack: vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          endTakeBack = (error) => (error ? reject(error) : resolve());
        }),
    ),
  } satisfies UnfencedYesHost;
  return {
    host,
    setStatus: (next: Status) => {
      status = next;
    },
    endTakeBack: async (error?: Error) => {
      await act(async () => endTakeBack(error));
    },
  };
}

async function show(host: UnfencedYesHost, announce = vi.fn()) {
  const toasts = createToastStore();
  const view = render(
    <ToastStoreProvider store={toasts}>
      <UnfencedYesBlock host={host} announce={announce} />
    </ToastStoreProvider>,
  );
  await act(async () => {});
  return { view, toasts, announce };
}

function takeBackButton(view: HTMLElement): HTMLButtonElement | undefined {
  return [...view.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Take back"),
  );
}

verifies("settings.unfenced-yes-take-back", () => {
  it("shows the saved yes with its reason, its day and Take back", async () => {
    const { view } = await show(fakeHost(allowed).host);

    expect(view.querySelector("h4")?.textContent).toBe("Plugins and integrations");
    expect(view.textContent).toContain(
      "The agent sandbox runs agents' programs. On Windows, plugin and integration code can't run in it yet, so it needs your yes.",
    );
    expect(view.textContent).toContain("Allowed without the sandbox");
    // The block's line already says why for windows; the row adds only the day (C553 row 18).
    expect(view.textContent).toContain("Allowed without the sandboxAllowed on 9 Nov.");
    expect(view.textContent).not.toContain("plugin code can't run in the sandbox");
    expect(takeBackButton(view)).toBeDefined();
    expect(view.textContent).toContain(
      "Taking it back stops plugins and integrations that run without the sandbox. Halonic asks again the next time one starts.",
    );
  });

  it("shows the heading and its line without Take back while a yes is needed", async () => {
    const { view } = await show(fakeHost({ run: "needs-yes", reason: "container" }).host);

    expect(view.textContent).toContain("Plugins and integrations");
    expect(view.textContent).not.toContain("Allowed without the sandbox");
    expect(takeBackButton(view)).toBeUndefined();
  });

  it("says Windows in its line only for the reason windows", async () => {
    const container = await show(fakeHost({ run: "needs-yes", reason: "container" }).host);
    expect(container.view.textContent).toContain(
      "The agent sandbox runs agents' programs. Plugin and integration code can't run in it on this computer, so it needs your yes.",
    );
    expect(container.view.textContent).not.toContain("On Windows");

    const windows = await show(fakeHost({ run: "needs-yes", reason: "windows" }).host);
    expect(windows.view.textContent).toContain(
      "On Windows, plugin and integration code can't run in it yet, so it needs your yes.",
    );
  });

  it("keeps the reason before the day for every saved yes but windows", async () => {
    const { view } = await show(fakeHost({ ...allowed, reason: "container" }).host);

    expect(view.textContent).toMatch(/Allowed without the sandbox.+ Allowed on 9 Nov\./u);
  });

  it("keeps Take back for a saved yes whose day can't be read, and leaves out the day", async () => {
    const { view } = await show(fakeHost({ ...allowed, allowedAt: "not a time" }).host);

    expect(view.textContent).toContain("Allowed without the sandbox");
    expect(view.textContent).not.toContain("Allowed on");
    expect(takeBackButton(view)).toBeDefined();
  });

  it("shows nothing while plugin code runs in the sandbox", async () => {
    const fenced = await show(fakeHost({ run: "fenced" }).host);
    expect(fenced.view.textContent).toBe("");
  });

  it("says it couldn't check, with Try again, when the host can't say, and claims no yes", async () => {
    const status = vi
      .fn<UnfencedYesHost["status"]>()
      .mockRejectedValueOnce(new Error("no host"))
      .mockResolvedValueOnce(allowed);
    const { view } = await show({ status, takeBack: vi.fn(async () => {}) });

    expect(view.querySelector("h4")?.textContent).toBe("Plugins and integrations");
    expect(view.textContent).toContain(
      "Couldn't check whether plugins may run without the sandbox.",
    );
    expect(view.textContent).not.toContain("Allowed without the sandbox");
    expect(view.textContent).not.toContain("needs your yes");
    expect(takeBackButton(view)).toBeUndefined();

    const tryAgain = [...view.querySelectorAll("button")].find(
      (button) => button.textContent === "Try again",
    );
    await click(tryAgain as HTMLButtonElement);

    expect(status).toHaveBeenCalledTimes(2);
    expect(takeBackButton(view)).toBeDefined();
  });

  it("takes the yes back through the host, says so once it's done and reads the status again", async () => {
    const fake = fakeHost(allowed);
    const { view, toasts } = await show(fake.host);
    const shown = vi.spyOn(toasts, "show");

    await click(takeBackButton(view) as HTMLButtonElement);
    expect(fake.host.takeBack).toHaveBeenCalledTimes(1);
    // Nothing is said before the host has stopped what runs without the sandbox.
    expect(shown).not.toHaveBeenCalled();
    expect(takeBackButton(view)?.getAttribute("aria-busy")).toBe("true");

    fake.setStatus({ run: "needs-yes", reason: "windows" });
    await fake.endTakeBack();

    expect(shown).toHaveBeenCalledWith({
      tone: "success",
      title: "Taken back.",
      text: "Plugins and integrations won't start without the sandbox until you allow it again.",
    });
    expect(takeBackButton(view)).toBeUndefined();
    expect(document.activeElement?.textContent).toBe("Plugins and integrations");
  });

  it("shows in Agent sandbox even while the section reads Not available", async () => {
    const view = render(
      <AgentSandboxHostView
        host={undefined}
        place="app"
        announce={vi.fn()}
        unfencedYes={fakeHost(allowed).host}
      />,
    );
    await act(async () => {});

    expect(view.textContent).toContain("Not available");
    expect(takeBackButton(view)).toBeDefined();
  });

  it("keeps the yes and says why when the host can't take it back", async () => {
    const fake = fakeHost(allowed);
    const { view, toasts } = await show(fake.host);
    const shown = vi.spyOn(toasts, "show");

    await click(takeBackButton(view) as HTMLButtonElement);
    await fake.endTakeBack(
      Object.assign(new Error("The agent host didn't answer."), { kind: "unavailable" }),
    );

    expect(shown).toHaveBeenCalledWith({
      tone: "danger",
      title: "Couldn't take it back",
      text: "The agent host didn't answer.",
      action: { label: "Try again", onClick: expect.any(Function) },
    });
    expect(takeBackButton(view)?.getAttribute("aria-busy")).not.toBe("true");
    expect(view.textContent).toContain("Allowed without the sandbox");

    // Try again on the toast asks the host once more.
    shown.mock.calls[0]?.[0].action?.onClick();
    expect(fake.host.takeBack).toHaveBeenCalledTimes(2);
  });

  it("never shows an internal error's own text when Take back fails", async () => {
    const fake = fakeHost(allowed);
    const { view, toasts } = await show(fake.host);
    const shown = vi.spyOn(toasts, "show");

    await click(takeBackButton(view) as HTMLButtonElement);
    await fake.endTakeBack(new Error("EPIPE: broken pipe, write"));

    expect(shown).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Halonic ran into a problem it can't explain yet." }),
    );
  });
});

it("writes the day a yes was given, with the year only when it isn't this year", () => {
  const now = new Date("2026-11-21T12:00:00");
  expect(allowedDay("2026-11-09T10:00:00", now)).toBe("9 Nov");
  expect(allowedDay("2025-03-02T10:00:00", now)).toBe("2 Mar 2025");
  expect(allowedDay("not a time", now)).toBeUndefined();
});
