import { readFile } from "node:fs/promises";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { button, type FakeStudio, fakeStudio } from "./fake-studio.test-helper.ts";
import { settingsFormats, settingsTheme } from "./steps/settings-display.ts";
import { settingsHostSections } from "./steps/settings-host.ts";
import { buttonLabels, sandboxChips, screenText, settingsText } from "./words.ts";

const repo = new URL("../../../../", import.meta.url);

function setText(studio: FakeStudio, text: string) {
  const main = studio.windows.get("main");
  if (main === undefined) throw new Error("no main window");
  main.text = text;
}

/** A workspace whose Settings opens from Places, with `sections` as its rows. */
function studioWithSettings(sections: Record<string, () => void>): FakeStudio {
  const studio = fakeStudio("Acme");
  button(studio, "main", screenText.places.text, () => {
    button(studio, "main", buttonLabels.settings.text, () => {
      for (const [row, open] of Object.entries(sections)) button(studio, "main", row, open);
    });
  });
  return studio;
}

/** Appearance, whose Theme options set the root's `data-theme` unless `applies` is off. */
function studioWithThemes(applies = true): FakeStudio {
  const studio = studioWithSettings({
    [settingsText.appearance.text]: () => {
      button(studio, "main", settingsText.themeDark.text, () => {
        if (applies) studio.rootAttributes.set("data-theme", "dark");
      });
      button(studio, "main", settingsText.themeSystem.text, () => {
        studio.rootAttributes.delete("data-theme");
      });
    },
  });
  return studio;
}

/** Formats, whose example reads `afterDutch` once Dutch (Netherlands) is picked. */
function studioWithFormats(afterDutch: string): FakeStudio {
  const { formatExample, dutch, followComputer } = settingsText;
  const own = `${formatExample.text} 12,345.60 · Tue 17 Nov, 08:00`;
  const studio = studioWithSettings({
    [settingsText.formats.text]: () => {
      setText(studio, own);
      button(studio, "main", dutch.text, () => setText(studio, afterDutch));
      button(studio, "main", followComputer.text, () => setText(studio, own));
    },
  });
  return studio;
}

/** Agent sandbox showing `sandbox`, and About Halonic showing `about`. */
function studioWithHostSections(sandbox: string, about: string): FakeStudio {
  const studio = studioWithSettings({
    [settingsText.agentSandbox.text]: () => {
      setText(studio, sandbox);
      button(studio, "main", settingsText.about.text, () => setText(studio, about));
    },
  });
  return studio;
}

const updateStatus = `Halonic 0.2.0 Up to date. ${settingsText.checkNow.text} ${settingsText.automatic.text}`;

verifies("studio-click-test.settings-steps", () => {
  describe("settingsText and sandboxChips", () => {
    it.each([...Object.values(settingsText), ...sandboxChips])(
      "$text is still in $file",
      async ({ text, file }) => {
        const source = await readFile(new URL(file, repo), "utf8");
        expect(source).toContain(text);
      },
    );
  });

  describe("the theme step", () => {
    it("picks Dark, sees the window's data-theme, then picks System again", async () => {
      const studio = studioWithThemes();
      await expect(settingsTheme.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks).toEqual([
        screenText.places.text,
        buttonLabels.settings.text,
        settingsText.appearance.text,
        settingsText.themeDark.text,
        settingsText.themeSystem.text,
      ]);
      expect(studio.rootAttributes.has("data-theme")).toBe(false);
    });

    it("uses a Settings an earlier step left open", async () => {
      const studio = studioWithThemes();
      button(studio, "main", settingsText.appearance.text, () => {
        button(studio, "main", settingsText.themeDark.text, () => {
          studio.rootAttributes.set("data-theme", "dark");
        });
        button(studio, "main", settingsText.themeSystem.text, () => {
          studio.rootAttributes.delete("data-theme");
        });
      });
      await expect(settingsTheme.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks[0]).toBe(settingsText.appearance.text);
    });

    it("fails as THEME_NOT_APPLIED when the window keeps its theme", async () => {
      const outcome = await settingsTheme.run(studioWithThemes(false).context);
      expect(outcome).toMatchObject({ passed: false, code: "THEME_NOT_APPLIED" });
      expect(outcome.passed ? "" : outcome.note).toContain("data-theme is unset");
    });

    it("fails as NO_SETTINGS when Settings has no Appearance row", async () => {
      const outcome = await settingsTheme.run(studioWithSettings({}).context);
      expect(outcome).toMatchObject({ passed: false, code: "NO_SETTINGS" });
    });
  });

  describe("the formats step", () => {
    it("sees the Dutch example after Dutch (Netherlands), then follows the computer again", async () => {
      const { formatExample, dutchNumber, dutch, followComputer } = settingsText;
      const studio = studioWithFormats(`${formatExample.text} ${dutchNumber.text} · di 17 nov`);
      await expect(settingsFormats.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks.slice(-2)).toEqual([dutch.text, followComputer.text]);
    });

    it("fails as EXAMPLE_UNCHANGED when the example stays the computer's", async () => {
      const studio = studioWithFormats(`${settingsText.formatExample.text} 12,345.60`);
      await expect(settingsFormats.run(studio.context)).resolves.toMatchObject({
        passed: false,
        code: "EXAMPLE_UNCHANGED",
      });
    });
  });

  describe("the Agent sandbox and About Halonic step", () => {
    it("passes on a state chip and the updater's status", async () => {
      const studio = studioWithHostSections("Agent sandbox Needs setting up", updateStatus);
      await expect(settingsHostSections.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks.slice(-2)).toEqual([
        settingsText.agentSandbox.text,
        settingsText.about.text,
      ]);
    });

    it("waits while the check runs, though a chip's word shows elsewhere", async () => {
      const sandbox = `Ready to run · ${settingsText.sandboxChecking.text}`;
      const studio = studioWithHostSections(sandbox, updateStatus);
      await expect(settingsHostSections.run(studio.context)).resolves.toMatchObject({
        passed: false,
        code: "NO_SANDBOX_STATE",
      });
    });

    it("fails as SANDBOX_NOT_CHECKED when the check couldn't run", async () => {
      const sandbox = `${settingsText.sandboxNotChecked.text}the agent host didn't answer.`;
      const studio = studioWithHostSections(sandbox, updateStatus);
      await expect(settingsHostSections.run(studio.context)).resolves.toMatchObject({
        passed: false,
        code: "SANDBOX_NOT_CHECKED",
      });
    });

    it("fails as UPDATER_DIDNT_ANSWER when the updater is silent", async () => {
      const about = settingsText.updaterDidntAnswer.text;
      const studio = studioWithHostSections("Agent sandbox Ready", about);
      await expect(settingsHostSections.run(studio.context)).resolves.toMatchObject({
        passed: false,
        code: "UPDATER_DIDNT_ANSWER",
      });
    });
  });
});
