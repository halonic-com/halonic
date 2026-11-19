// @vitest-environment jsdom
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { createShell, type DialogHostProps, loadView } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChangesSourceService, type Identity, VersionDialogService } from "../api.ts";
import { ChangesListService } from "../changes-list.ts";
import { sourceControlFeature } from "../feature.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { WorkspaceServices } from "../test-support/services.ts";
import { ChangesView } from "./changes-page.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const triage = "agents/triage.agent.yaml";

/**
 * A Studio with the source control feature over a workspace where the triage agent and the
 * README changed, with the feature's dialog host drawn as the window draws it.
 */
async function studioWith({ identity }: { readonly identity?: Identity } = {}) {
  const fake = fakeSource({
    kind: "ready",
    changes: [
      { path: triage, status: "modified", staged: false },
      { path: "README.md", status: "modified", staged: false },
    ],
  });
  fake.setTexts(triage, { before: "model: claude\n", after: "model: gpt\n" });
  fake.setTexts("README.md", { before: "a\n", after: "b\n" });
  if (identity !== undefined) fake.setIdentity(identity);
  const shell = createShell({
    features: [sourceControlFeature],
    hostServices: [ChangesSourceService],
  });
  const workspace = new WorkspaceServices();
  workspace.provide(ChangesSourceService, fake.source);
  shell.services.instantiate(workspace);
  const context = shell.services.contextFor("source-control", workspace);
  const [host] = shell.contributions.dialogs.list();
  if (host === undefined) throw new Error("No dialog host");
  const Dialogs = await loadView<ComponentType<DialogHostProps>>(host);
  render(
    <ToastStoreProvider store={createToastStore()}>
      <Dialogs context={context} />
    </ToastStoreProvider>,
  );
  await act(settle);
  return { fake, workspace, versionDialog: workspace.get(VersionDialogService) };
}

const dialogs = () => [...document.querySelectorAll("dialog[open]")];
const title = () => dialogs()[0]?.querySelector("h2")?.textContent;
const button = (label: string) =>
  [...(dialogs()[0]?.querySelectorAll("button") ?? [])].find((b) =>
    b.textContent?.trim().startsWith(label),
  );
const press = (label: string) =>
  act(async () => {
    button(label)?.click();
    await settle();
  });

verifies("source-control.create-version-elsewhere", () => {
  describe("VersionDialogService", () => {
    it("opens Create version over any page with only the given item, and answers made", async () => {
      const { fake, versionDialog } = await studioWith();
      expect(dialogs()).toEqual([]);

      let answer: Promise<string> = Promise.resolve("not opened");
      await act(async () => {
        answer = versionDialog.open([triage]);
        await settle();
      });
      expect(title()).toBe("Create version");
      expect(dialogs()[0]?.textContent).toContain("triage");
      expect(dialogs()[0]?.textContent).not.toContain("README");

      await press("Create version");
      expect(await answer).toBe("made");
      expect(fake.versions.map((version) => version.paths)).toEqual([[triage]]);
      expect(dialogs()).toEqual([]);
    });

    it("answers cancelled when the person presses Cancel", async () => {
      const { fake, versionDialog } = await studioWith();
      let answer: Promise<string> = Promise.resolve("not opened");
      await act(async () => {
        answer = versionDialog.open([triage]);
        await settle();
      });
      await press("Cancel");
      expect(await answer).toBe("cancelled");
      expect(fake.versions).toEqual([]);
      expect(dialogs()).toEqual([]);
    });

    it("asks who versions are from first when the workspace has no name or email", async () => {
      const { versionDialog } = await studioWith({ identity: { name: "", email: "" } });
      let answer: Promise<string> = Promise.resolve("not opened");
      await act(async () => {
        answer = versionDialog.open([triage]);
        await settle();
      });
      expect(title()).toBe("Who should versions be from?");
      await press("Cancel");
      expect(await answer).toBe("cancelled");
      expect(dialogs()).toEqual([]);
    });

    it("draws one dialog while the Changes page is open too", async () => {
      const { workspace, versionDialog } = await studioWith();
      render(<ChangesView list={workspace.get(ChangesListService)} />);
      await act(async () => {
        void versionDialog.open([triage]);
        await settle();
      });
      expect(dialogs()).toHaveLength(1);
    });
  });
});
