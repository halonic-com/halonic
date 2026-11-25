// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { AgentSandboxHost, SandboxCheckFacts, UpdaterHost } from "../api.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { AboutHostView } from "./about-section.tsx";
import { SETUP_AGAIN } from "./about-text.ts";
import type { UpdateState, UpdateStatus } from "./updater-status.ts";

afterEach(unmountAll);

const ready: UpdateState = { kind: "ready", version: "0.2.0", notesUrl: "https://example.test/n" };

function statusOf(rest: Partial<UpdateStatus> = {}): UpdateStatus {
  return {
    current: "0.1.0",
    automatic: true,
    checking: false,
    lastChecked: Date.now(),
    justUpdated: null,
    managed: null,
    sandboxSetupAgain: true,
    state: ready,
    ...rest,
  };
}

/** An updater that only ever reports `status`. */
function updaterOf(status: UpdateStatus): UpdaterHost {
  return {
    status: async () => status,
    subscribe: (listener) => {
      listener(status);
      return () => undefined;
    },
    check: async () => status,
    download: async () => status,
    cancel: async () => status,
    restart: async () => undefined,
    setAutomatic: async () => status,
    setTrack: async () => status,
  };
}

/** A sandbox whose check answers `facts`; nothing else is asked of it here. */
function sandboxOf(facts: SandboxCheckFacts) {
  const check = vi.fn(async () => facts);
  const unused = async () => null;
  const sandbox: AgentSandboxHost = {
    available: true,
    check,
    running: async () => null,
    setUp: unused,
    remove: unused,
    follow: unused,
  };
  return { sandbox, check };
}

async function show(status: UpdateStatus, sandbox: AgentSandboxHost): Promise<HTMLElement> {
  const view = render(
    <AboutHostView
      host={updaterOf(status)}
      announce={() => undefined}
      onRestart={() => undefined}
      sandbox={sandbox}
    />,
  );
  await act(async () => {});
  return view;
}

const checkedAt = "2026-11-21T09:00:00.000Z";

verifies("settings.about-setup-again", () => {
  it("says the update asks for administrator rights once, under Restart to update", async () => {
    const { sandbox } = sandboxOf({ state: "ready", checkedAt });
    const view = await show(statusOf(), sandbox);
    expect(view.textContent).toContain(SETUP_AGAIN);
    const line = [...view.querySelectorAll("p")].find((each) => each.textContent === SETUP_AGAIN);
    expect(line?.className).toContain("text-fg-muted");
  });

  it("says it under Download too, and for a sandbox that needs a repair", async () => {
    const { sandbox } = sandboxOf({ state: "needs-repair", reason: "the folder grant is missing" });
    const available: UpdateState = {
      kind: "available",
      version: "0.2.0",
      notesUrl: "https://example.test/n",
    };
    const view = await show(statusOf({ state: available }), sandbox);
    expect(view.textContent).toContain(SETUP_AGAIN);
  });

  it("says nothing where the sandbox isn't set up, since no prompt comes", async () => {
    const { sandbox } = sandboxOf({ state: "needs-setup" });
    const view = await show(statusOf(), sandbox);
    expect(view.textContent).not.toContain(SETUP_AGAIN);
  });

  it("asks the sandbox nothing for an update that doesn't set it up again", async () => {
    const { sandbox, check } = sandboxOf({ state: "ready", checkedAt });
    const view = await show(statusOf({ sandboxSetupAgain: false }), sandbox);
    expect(view.textContent).not.toContain(SETUP_AGAIN);
    expect(check).not.toHaveBeenCalled();
  });

  it("says nothing when Scoop installs the update", async () => {
    const { sandbox } = sandboxOf({ state: "ready", checkedAt });
    const managed = { by: "scoop", command: "scoop update halonic" } as const;
    const available: UpdateState = {
      kind: "available",
      version: "0.2.0",
      notesUrl: "https://example.test/n",
    };
    const view = await show(statusOf({ managed, state: available }), sandbox);
    expect(view.textContent).not.toContain(SETUP_AGAIN);
  });
});
