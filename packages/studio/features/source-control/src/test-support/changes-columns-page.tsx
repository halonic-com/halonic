import type { VcsChange } from "@halonicjs/ports";
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import { act } from "react";
import type { ChangesRead, UpdateMerge, Version } from "../api.ts";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { ChangesView } from "../ui/changes-page.tsx";
import { render } from "./render.tsx";

const lines = (...all: string[]) => `${all.join("\n")}\n`;

/** An agent, "Triage", that changed. */
export const agentChange: VcsChange = {
  path: "agents/triage.agent.yaml",
  status: "modified",
  staged: false,
};

/** A file no kind places, "README.md", that changed. */
export const readmeChange: VcsChange = { path: "README.md", status: "modified", staged: false };

/** What {@link openColumnsPage} starts from; a ready repository with `changes` by default. */
export interface ColumnsPageOptions {
  readonly changes?: readonly VcsChange[];
  /** A read other than a ready repository, such as a folder without history. */
  readonly read?: ChangesRead;
  readonly phone?: boolean;
  /** A folder with a remote, so the header has Get updates. */
  readonly remote?: boolean;
  /** A Get updates left half done, with its strip and Continue. */
  readonly left?: UpdateMerge;
  readonly history?: readonly Version[];
}

/**
 * Draws the Changes page as the Studio does, on the desktop unless `phone`, from a fake history,
 * and waits for its first read.
 */
export async function openColumnsPage(options: ColumnsPageOptions = {}) {
  const fake = fakeSource(options.read ?? { kind: "ready", changes: options.changes ?? [] });
  fake.setRemote(options.remote === true || options.left !== undefined);
  if (options.left !== undefined) fake.setMerge(options.left);
  if (options.history !== undefined) fake.setHistory(options.history);
  fake.setTexts(agentChange.path, {
    before: lines("id: triage", "name: Triage", "model: claude"),
    after: lines("id: triage", "name: Triage", "model: gpt"),
  });
  fake.setTexts(readmeChange.path, { before: "a\n", after: "b\n" });
  const list = new ChangesList(fake.source);
  const view = <ChangesView list={list} />;
  const root = render(
    <ToastStoreProvider store={createToastStore()}>
      {options.phone ? (
        <PresentationProvider presentation="phone">{view}</PresentationProvider>
      ) : (
        view
      )}
    </ToastStoreProvider>,
  );
  await act(settle);
  return { fake, root, list };
}

/** The desktop's content pane, or `null` where there is none. */
export const pane = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-pane="content"]');

/** The desktop's list column, or `null` where there is none. */
export const listColumn = (root: HTMLElement) =>
  root.querySelector<HTMLElement>('[data-pane="list"]');

/** The button whose text is `label`. */
export const buttonNamed = (root: ParentNode, label: string) =>
  [...root.querySelectorAll<HTMLElement>("button")].find(
    (button) => button.textContent?.trim() === label,
  );

/** Presses the button whose text is `label` and waits for what it reads. */
export async function press(root: ParentNode, label: string): Promise<void> {
  await act(async () => {
    buttonNamed(root, label)?.click();
    await settle();
  });
}

/** One version, "Sorter replies in Dutch", for History. */
export const sorterVersion: Version = {
  id: "v1",
  name: "Sorter replies in Dutch",
  notes: "",
  author: "Sam Lee",
  at: Date.now() - 60_000,
  files: [],
};
