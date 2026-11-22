// @vitest-environment jsdom

import { ClipboardProvider } from "@halonicjs/studio-kit";
import { createShell, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckComputerSourceService, checkComputerCommand } from "../api.ts";
import type { CheckFact } from "../check-facts.ts";
import { checkComputerFeature } from "../feature.ts";
import { FakeCheckSource, WorkspaceServices } from "../test-support/fake-source.test-helper.ts";
import { CheckComputerHost } from "./check-computer-host.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; element: HTMLElement } | undefined;
const writeClipboard = vi.fn(async (_text: string) => true);

beforeEach(() => {
  // jsdom has `<dialog>` but no `showModal()`; opening it is all these tests need.
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
    close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  writeClipboard.mockClear();
});

afterEach(() => {
  const done = mounted;
  mounted = undefined;
  if (done === undefined) return;
  act(() => done.root.unmount());
  done.element.remove();
});

const engine: CheckFact = { check: "engine", running: true };
const notTrusted: CheckFact = {
  check: "workspace",
  status: "warning",
  name: "My workspace",
  trust: "new",
};
const ollamaDown: CheckFact = {
  check: "models",
  servers: {
    check: "models",
    status: "failed",
    ready: [],
    problems: [
      { problem: "unreachable", provider: "ollama", name: "Ollama", address: "localhost:11434" },
    ],
  },
  keys: [],
  sampleAnswers: false,
  tests: [],
};

/** The feature in a shell, with `source` for the open folder, and the context its views get. */
function featureWith(source: FakeCheckSource | undefined) {
  // The source is a host service the app may leave out, as the browser demo does.
  const shell = createShell({
    features: [checkComputerFeature],
    hostServices: source === undefined ? [] : [CheckComputerSourceService],
  });
  const workspace = new WorkspaceServices();
  if (source !== undefined) workspace.provide(CheckComputerSourceService, source);
  shell.services.instantiate(workspace);
  const commands: string[] = [];
  const context: WorkspaceContext = {
    ...shell.services.contextFor("check-computer", workspace),
    runCommand: (id: string) => {
      commands.push(id);
      return true;
    },
  };
  return { shell, context, commands };
}

/** Draws the dialog host, then runs the command that opens it, as every Something wrong? does. */
async function openDialog(source: FakeCheckSource | undefined) {
  const { shell, context, commands } = featureWith(source);
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  mounted = { root, element };
  await act(async () =>
    root.render(
      <ClipboardProvider writeClipboard={writeClipboard}>
        <CheckComputerHost context={context} />
      </ClipboardProvider>,
    ),
  );
  await act(async () => shell.contributions.commands.get(checkComputerCommand)?.run(context));
  return { commands, dialog: () => document.querySelector("dialog") };
}

function items(dialog: HTMLElement | null): string[] {
  return [...(dialog?.querySelectorAll("li") ?? [])].map((each) => each.textContent ?? "");
}

function button(dialog: HTMLElement | null, label: string): HTMLButtonElement {
  const found = [...(dialog?.querySelectorAll("button") ?? [])].find(
    // A kit button keeps its busy label beside its label, so it reads "Check againChecking…".
    (each) => each.textContent?.startsWith(label),
  );
  if (found === undefined) throw new Error(`No ${label} button`);
  return found;
}

verifies("check-computer.dialog", () => {
  it("opens already checking, shows each line as it answers, and counts when the check ends", async () => {
    const source = new FakeCheckSource([ollamaDown, engine]);
    const { dialog } = await openDialog(source);

    expect(dialog()?.textContent).toContain(
      "Includes everything halonic doctor checks in a terminal.",
    );
    expect(dialog()?.querySelector("[role=status]")?.textContent).toBe("Checking this computer");
    expect(items(dialog())).toEqual([
      "Engine, works:Running · Halonic 0.1.0 · macOS arm64",
      "Models, problem:Ollama isn't answering at localhost:11434.Fix: start Ollama on this computer, then check again.Check againOpen Models",
    ]);

    await act(async () => source.finish());
    expect(dialog()?.querySelector("[role=status]")?.textContent).toBe("1 problem");
  });

  it("closes, then opens the trust page, when Review is pressed", async () => {
    const source = new FakeCheckSource([notTrusted]);
    const { dialog, commands } = await openDialog(source);
    await act(async () => source.finish());

    await act(async () => button(dialog(), "Review").click());

    expect(commands).toEqual(["workspace.open-trust"]);
    expect(dialog()).toBeNull();
  });

  it("aborts the running check when the dialog closes, so nothing runs on", async () => {
    const source = new FakeCheckSource([engine]);
    const { dialog } = await openDialog(source);

    await act(async () => button(dialog(), "Close").click());

    expect(source.signals[0]?.aborted).toBe(true);
    expect(dialog()).toBeNull();
  });

  it("runs every check again on Check again", async () => {
    const source = new FakeCheckSource([engine]);
    const { dialog } = await openDialog(source);
    await act(async () => source.finish());
    source.facts = [engine, notTrusted];

    await act(async () => button(dialog(), "Check again").click());

    expect(source.signals).toHaveLength(2);
    expect(items(dialog())).toHaveLength(2);
  });

  describe("with no problem", () => {
    it("says so, says what to do if it still doesn't work, and copies the report", async () => {
      const source = new FakeCheckSource(
        [engine, { check: "not-checked", parts: ["sandbox", "harnesses"] }],
        true,
      );
      const { dialog } = await openDialog(source);
      await act(async () => source.finish());

      expect(dialog()?.querySelector("[role=status]")?.textContent).toBe("No problems found");
      expect(dialog()?.textContent).toContain(
        "Not checked here: the sandbox and harnesses, because the demo doesn't use them.",
      );
      expect(dialog()?.textContent).toContain("If something still doesn't work, copy the report");

      await act(async () => button(dialog(), "Copy report").click());
      expect(writeClipboard.mock.calls[0]?.[0]).toContain("✓ Engine          running");
      expect(dialog()?.querySelector("pre")?.textContent).toBe(writeClipboard.mock.calls[0]?.[0]);
    });
  });

  it("has no Help item and draws nothing without the app's check source", async () => {
    const { shell, context } = featureWith(undefined);
    const group = shell.contributions.help.list().find((each) => each.id === "check-computer.help");
    expect(group?.items(context)).toEqual([]);

    const { dialog } = await openDialog(undefined);
    expect(dialog()).toBeNull();
  });

  it("is the Help menu's first group, without a title", () => {
    const { shell, context } = featureWith(new FakeCheckSource([]));
    const group = shell.contributions.help.list().find((each) => each.id === "check-computer.help");

    expect(group?.order).toBe(10);
    expect(group?.title).toBeUndefined();
    expect(group?.items(context).map((item) => item.label)).toEqual(["Check this computer"]);
  });
});
