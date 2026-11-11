import { ShellError } from "../shell-error.ts";
import { type SettingsScope, type SettingsSectionContribution, settingsScopes } from "./frame.ts";
import { byOrder, type Registered } from "./point-store.ts";

/** The section Settings opens on when nothing else was asked for or shown before (flow-settings 2). */
export const firstSettingsSection = "appearance";

/** The settings list's groups, in the order they are shown: the workspace's, then this computer's. */
const groupOf: Readonly<Record<SettingsScope, number>> = { workspace: 0, display: 1, host: 1 };

/**
 * The settings sections in the order the settings list shows them: the workspace group first, then
 * "On this computer", where `display` and `host` sections mix; within a group by `order`, then `id`.
 */
export function bySettingsGroup(
  sections: readonly Registered<SettingsSectionContribution>[],
): Registered<SettingsSectionContribution>[] {
  return byOrder(sections).sort((left, right) => groupOf[left.scope] - groupOf[right.scope]);
}

/**
 * Which section `settings.open` shows: the one asked for, else the one shown last, else
 * Appearance, else the first in the list. One that isn't in the list is passed over, so a link to
 * a section whose feature didn't load still opens Settings.
 *
 * @param sections the sections in the list's order, as `bySettingsGroup` gives them
 * @param requested the section a caller asked for, such as `models` from a Models link
 * @param lastShown the section shown when Settings last closed in this window
 * @returns the id to show, or `undefined` when no feature added a section
 */
export function settingsSectionToOpen(
  sections: readonly Pick<SettingsSectionContribution, "id">[],
  requested?: string,
  lastShown?: string,
): string | undefined {
  const listed = (id: string | undefined) => sections.some((section) => section.id === id);
  for (const candidate of [requested, lastShown, firstSettingsSection]) {
    if (listed(candidate)) {
      return candidate;
    }
  }
  return sections[0]?.id;
}

/**
 * Checks a section's `scope`, because it decides where its values are saved: a section without
 * one could end up writing a person's own choices into a workspace file.
 *
 * @throws ShellError naming the feature and the section
 */
export function checkSettingsScope(featureId: string, section: SettingsSectionContribution): void {
  if (!(settingsScopes as readonly unknown[]).includes(section.scope)) {
    throw new ShellError(
      `settings.add: the feature "${featureId}" gives the section ${JSON.stringify(section.id)} the scope ${JSON.stringify(section.scope)}. Use one of ${settingsScopes.map((scope) => `"${scope}"`).join(", ")}: where the section's values are saved.`,
    );
  }
}
