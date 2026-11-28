import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { button, type FakeStudio, fakeStudio } from "./fake-studio.test-helper.ts";
import {
  fileMenuButton,
  fileMenuToast,
  firstFileRow,
  menuOf,
  newFileDialog,
  newFileDialogXpath,
  toastCard,
  toastClose,
} from "./steps/files-kit.ts";
import { sidebarSwitch } from "./steps/files-tree-parts.ts";
import { lastTab, tabTooltip, tooltipXpath } from "./steps/tab-tooltip.ts";
import { tabXpath } from "./steps/window-tabs.ts";
import { clickTestSteps } from "./steps.ts";
import { keys } from "./webdriver.ts";
import { buttonLabels, kitText } from "./words.ts";

/** The ⋮'s `id`, which its kit menu names in `aria-labelledby`. */
const triggerId = "menu-trigger-1";
const menuDisplay = `${menuOf(triggerId)} display`;

/** How the fake Files view answers: what the ⋮ and Escape do, and what the toast says. */
interface FilesViewScript {
  readonly menuShows?: boolean;
  readonly menuExpands?: boolean;
  readonly escapeCollapsesMenu?: boolean;
  readonly escapeHidesMenu?: boolean;
  readonly toast?: string;
  readonly toastCardShows?: boolean;
  readonly toastCloses?: boolean;
  readonly dialogOpens?: boolean;
  readonly escapeClosesDialog?: boolean;
}

/** The demo with the sidebar's Files switch, a file row, its header's ⋮, Copy path and New file. */
function studioWithFiles(script: FilesViewScript = {}): FakeStudio {
  const { menuShows = true, menuExpands = true } = script;
  const { escapeCollapsesMenu = true, escapeHidesMenu = true } = script;
  const { toast = "Copied workflows/support.yaml", toastCardShows = true } = script;
  const studio = fakeStudio("Acme");
  const main = () => studio.windows.get("main") ?? { text: "", buttons: new Map() };
  const menu = (expanded: boolean, shown: boolean) => {
    studio.rootAttributes.set("aria-expanded", String(expanded));
    studio.styles.set(menuDisplay, shown ? "block" : "none");
  };
  let open: "menu" | "dialog" | undefined;
  studio.rootAttributes.set("id", triggerId);
  button(studio, "main", sidebarSwitch.files.text, () => {
    main().text = "Files Search files workflows";
  });
  button(studio, "main", sidebarSwitch.studio.text);
  button(studio, "main", firstFileRow);
  button(studio, "main", fileMenuButton, () => {
    open = "menu";
    menu(menuExpands, menuShows);
  });
  button(studio, "main", keys.escape, () => {
    if (open === "menu") menu(!escapeCollapsesMenu, !escapeHidesMenu);
    if (open === "dialog" && script.escapeClosesDialog !== false) {
      studio.elements.set(newFileDialogXpath, 0);
    }
  });
  button(studio, "main", kitText.copyPath.text, () => {
    menu(false, false);
    main().text = `Files ${toast}`;
    if (toastCardShows) studio.elements.set(toastCard, 1);
  });
  button(studio, "main", toastClose, () => {
    if (script.toastCloses !== false) studio.elements.set(toastCard, 0);
  });
  button(studio, "main", kitText.newFile.text, () => {
    open = "dialog";
    if (script.dialogOpens !== false) studio.elements.set(newFileDialogXpath, 1);
  });
  return studio;
}

/**
 * A strip with one tab; the last tab's ArrowLeft shows the tooltip as `display`, and Escape hides
 * it unless `escapeHides` is false.
 */
function studioWithTabs(display: string, escapeHides = true): FakeStudio {
  const studio = fakeStudio("Home");
  studio.elements.set(tabXpath, 1);
  button(studio, "main", buttonLabels.newTab.text, () => studio.elements.set(tabXpath, 2));
  button(studio, "main", lastTab);
  button(studio, "main", keys.arrowLeft, () => {
    studio.styles.set(`${tooltipXpath} display`, display);
  });
  button(studio, "main", keys.escape, () => {
    if (escapeHides) studio.styles.set(`${tooltipXpath} display`, "none");
  });
  button(studio, "main", `${keys.control}+w`, () => studio.elements.set(tabXpath, 1));
  return studio;
}

verifies("studio-click-test.kit-steps", () => {
  it("come after the file tree's step, in order", () => {
    const ids = clickTestSteps.map((step) => step.id);
    const start = ids.indexOf("files-tree-search");
    expect(ids.slice(start, start + 4)).toEqual([
      "files-tree-search",
      "file-menu-toast",
      "new-file-dialog",
      "tab-tooltip",
    ]);
  });

  describe("a file's menu and a toast", () => {
    it("passes when Escape closes the menu and the toast's close button removes it", async () => {
      const studio = studioWithFiles();
      await expect(fileMenuToast.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks).toEqual([
        sidebarSwitch.files.text,
        firstFileRow,
        fileMenuButton,
        keys.escape,
        fileMenuButton,
        kitText.copyPath.text,
        toastClose,
        sidebarSwitch.studio.text,
      ]);
    });

    it("still passes on the toast a refused clipboard shows", async () => {
      const studio = studioWithFiles({ toast: kitText.pathNotCopied.text });
      await expect(fileMenuToast.run(studio.context)).resolves.toEqual({ passed: true });
    });

    it("fails as MENU_NOT_OPEN when the ⋮'s own menu stays display: none", async () => {
      const studio = studioWithFiles({ menuShows: false });
      const outcome = await fileMenuToast.run(studio.context);
      expect(outcome).toMatchObject({ passed: false, code: "MENU_NOT_OPEN" });
      expect(outcome.note).toContain("Screen: Files Search files workflows");
      expect(studio.clicks.at(-1)).toBe(sidebarSwitch.studio.text);
    });

    it("fails as MENU_NOT_OPEN when the menu shows but aria-expanded stays false", async () => {
      const studio = studioWithFiles({ menuExpands: false });
      await expect(fileMenuToast.run(studio.context)).resolves.toMatchObject({
        passed: false,
        code: "MENU_NOT_OPEN",
      });
    });

    it.each([
      ["Escape leaves the menu open", { escapeCollapsesMenu: false, escapeHidesMenu: false }],
      ["Escape sets aria-expanded to false but the menu stays shown", { escapeHidesMenu: false }],
      ["Escape hides the menu but aria-expanded stays true", { escapeCollapsesMenu: false }],
    ])("fails as MENU_NOT_CLOSED when %s", async (_case, script) => {
      const studio = studioWithFiles(script);
      await expect(fileMenuToast.run(studio.context)).resolves.toMatchObject({
        passed: false,
        code: "MENU_NOT_CLOSED",
      });
    });

    it("fails as NO_TOAST when Copy path says nothing", async () => {
      const studio = studioWithFiles();
      studio.windows.get("main")?.buttons.set(kitText.copyPath.text, () => undefined);
      await expect(fileMenuToast.run(studio.context)).resolves.toMatchObject({
        passed: false,
        code: "NO_TOAST",
      });
    });

    it("fails as NO_TOAST when the words show but no toast card does", async () => {
      const studio = studioWithFiles({ toastCardShows: false });
      await expect(fileMenuToast.run(studio.context)).resolves.toMatchObject({
        passed: false,
        code: "NO_TOAST",
      });
    });

    it("fails as NO_TOAST when a toast card shows other words", async () => {
      const studio = studioWithFiles({ toast: "Saved" });
      await expect(fileMenuToast.run(studio.context)).resolves.toMatchObject({
        passed: false,
        code: "NO_TOAST",
      });
    });

    it("fails as TOAST_STAYED when the close button leaves the toast shown", async () => {
      const studio = studioWithFiles({ toastCloses: false });
      await expect(fileMenuToast.run(studio.context)).resolves.toMatchObject({
        passed: false,
        code: "TOAST_STAYED",
      });
    });

    it("fails as NO_FILES_VIEW when the sidebar has no Files switch", async () => {
      const studio = studioWithFiles();
      studio.windows.get("main")?.buttons.delete(sidebarSwitch.files.text);
      await expect(fileMenuToast.run(studio.context)).resolves.toMatchObject({
        passed: false,
        code: "NO_FILES_VIEW",
      });
    });
  });

  describe("a dialog", () => {
    it("passes when New file opens the dialog and Escape closes it", async () => {
      const studio = studioWithFiles();
      await expect(newFileDialog.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks).toEqual([
        sidebarSwitch.files.text,
        kitText.newFile.text,
        keys.escape,
        sidebarSwitch.studio.text,
      ]);
    });

    it("fails as NO_DIALOG when New file opens no dialog", async () => {
      const studio = studioWithFiles({ dialogOpens: false });
      await expect(newFileDialog.run(studio.context)).resolves.toMatchObject({
        passed: false,
        code: "NO_DIALOG",
      });
    });

    it("fails as DIALOG_STAYED when Escape leaves it open", async () => {
      const studio = studioWithFiles({ escapeClosesDialog: false });
      await expect(newFileDialog.run(studio.context)).resolves.toMatchObject({
        passed: false,
        code: "DIALOG_STAYED",
      });
    });
  });

  describe("a tooltip", () => {
    it("passes when keyboard focus shows the tab's tooltip and Escape hides it", async () => {
      const studio = studioWithTabs("block");
      await expect(tabTooltip.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks).toEqual([
        buttonLabels.newTab.text,
        keys.escape,
        lastTab,
        keys.arrowLeft,
        keys.escape,
        `${keys.control}+w`,
      ]);
    });

    it("fails as NO_TOOLTIP with the screen's words, and still closes the new tab", async () => {
      const studio = studioWithTabs("none");
      const outcome = await tabTooltip.run(studio.context);
      expect(outcome).toMatchObject({ passed: false, code: "NO_TOOLTIP" });
      expect(outcome.note).toContain("Screen: Home");
      expect(studio.elements.get(tabXpath)).toBe(1);
    });

    it("fails as TOOLTIP_STAYED when Escape leaves the tooltip shown", async () => {
      const studio = studioWithTabs("block", false);
      const outcome = await tabTooltip.run(studio.context);
      expect(outcome).toMatchObject({ passed: false, code: "TOOLTIP_STAYED" });
      expect(studio.elements.get(tabXpath)).toBe(1);
    });

    it("fails as NO_TABS with the screen's words when there's no tab strip", async () => {
      const studio = studioWithTabs("block");
      studio.elements.set(tabXpath, 0);
      const outcome = await tabTooltip.run(studio.context);
      expect(outcome).toMatchObject({ passed: false, code: "NO_TABS" });
      expect(outcome.note).toContain("Screen: Home");
    });
  });
});
