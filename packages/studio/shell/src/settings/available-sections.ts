import { useEffect, useMemo, useState } from "react";
import type { SettingsSectionContribution } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import type { WorkspaceContext } from "../workspace-context.ts";

/**
 * The sections that show now: every section without `available`, and each one with it once it
 * has said `true`. Each `available` is asked once per `sections`, and stopped when they change or
 * the window goes. `contextFor` should keep its identity, or every render asks again.
 *
 * @example
 * const shown = useAvailableSections(shell.contributions.settings.list(), contextFor);
 */
export function useAvailableSections(
  sections: readonly Registered<SettingsSectionContribution>[],
  contextFor: (featureId: string) => WorkspaceContext,
): readonly Registered<SettingsSectionContribution>[] {
  const [available, setAvailable] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    const stops = sections.flatMap((section) => {
      if (section.available === undefined) return [];
      const set = (shown: boolean) => setAvailable((now) => withSection(now, section.id, shown));
      return [section.available(contextFor(section.featureId), set)];
    });
    return () => {
      for (const stop of stops) stop();
    };
  }, [sections, contextFor]);
  return useMemo(
    () =>
      sections.filter((section) => section.available === undefined || available.has(section.id)),
    [sections, available],
  );
}

function withSection(ids: ReadonlySet<string>, id: string, shown: boolean): ReadonlySet<string> {
  if (ids.has(id) === shown) return ids;
  const next = new Set(ids);
  if (shown) next.add(id);
  else next.delete(id);
  return next;
}
