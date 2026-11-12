import { Dialog } from "@halonicjs/studio-kit";
import { type ComponentType, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Announcer } from "../announcer/announcer.ts";
import type { SettingsSectionContribution } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import { settingsSectionToOpen } from "../points/settings-sections.ts";
import { loadView } from "../view.ts";
import { ViewErrorBoundary } from "../view-error-boundary.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { listedSections, type SettingsPlace, settingsGroups } from "./settings-groups.ts";
import { SettingsNav } from "./settings-nav.tsx";

/** What a settings section's view gets. */
export interface SettingsSectionProps {
  /** The context of the feature that added the section. */
  readonly context: WorkspaceContext;
  /**
   * Closes Settings. A link to a page calls it first and then opens the page, so the focus can go
   * to the page's heading (flow-settings 3).
   */
  readonly closeSettings: () => void;
}

/** Props for {@link SettingsDialog}. */
export interface SettingsDialogProps {
  /** `shell.contributions.settings.list()`. */
  readonly sections: readonly Registered<SettingsSectionContribution>[];
  /** The open workspace's name, or `undefined` when none is open. */
  readonly workspaceName: string | undefined;
  readonly place: SettingsPlace;
  /** The section a caller asked for, such as `assistant` from the session picker. */
  readonly requested?: string;
  /** The section shown when Settings last closed in this window. */
  readonly lastShown?: string;
  /** Called with each section shown, the first one too, so the window can remember it for `lastShown`. */
  readonly onShown?: (sectionId: string) => void;
  /** A feature's context: `(featureId) => shell.services.contextFor(featureId, workspace)`. */
  readonly contextFor: (featureId: string) => WorkspaceContext;
  /** Says the section's name when it switches; while Settings is open it speaks in the dialog. */
  readonly announcer: Announcer;
  /** The ✕, Escape, a click outside, and a section's link to a page. */
  readonly onClose: () => void;
}

/** Settings' height on a desktop window taller than 704px; a shorter one gets the window less 64px. */
const settingsHeight = 640;

/**
 * Settings (flow-settings 3, UX checklist 3.1 to 3.3): the kit's `lg` Dialog, 640px tall, with no
 * footer, because every change saves by itself (HAL-1102). On the left, `SettingsNav` lists the
 * sections under their group headings; on the right, the current section's name and its view.
 * Each column scrolls on its own, and the dialog keeps its height across sections.
 *
 * It opens on the section asked for, else the one shown last, else Appearance
 * (`settingsSectionToOpen`), with the focus on that section's row, never on a field. Switching
 * says the section's name through the announcer, which speaks inside the dialog while it is open.
 * Escape closes it unless a menu or a confirmation on top of it is open: the kit closes one layer
 * per Escape and gives the focus back to the opener.
 *
 * Render it while Settings is open; each opening starts on the section `settingsSectionToOpen` picks.
 *
 * @example
 * {settingsOpen ? (
 *   <SettingsDialog sections={shell.contributions.settings.list()} workspaceName="Acme" place="app"
 *     lastShown={lastShown} onShown={setLastShown} contextFor={contextFor}
 *     announcer={shell.announcer} onClose={() => setSettingsOpen(false)} />
 * ) : null}
 */
export function SettingsDialog(props: SettingsDialogProps) {
  const { sections, workspaceName, place, announcer, onShown } = props;
  const groups = useMemo(
    () => settingsGroups({ sections, workspaceName, place }),
    [sections, workspaceName, place],
  );
  const listed = listedSections(groups);
  const [current, setCurrent] = useState(
    () => settingsSectionToOpen(listed, props.requested, props.lastShown) ?? "",
  );
  const nav = useRef<HTMLElement>(null);
  const section = listed.find((candidate) => candidate.id === current);

  // The section it opened on counts as shown too, so Ctrl , returns to a section a link opened.
  useEffect(() => {
    if (current !== "") {
      onShown?.(current);
    }
  }, [current, onShown]);

  function show(sectionId: string) {
    if (sectionId === current) {
      return;
    }
    setCurrent(sectionId);
    const shown = listed.find((candidate) => candidate.id === sectionId);
    if (shown !== undefined) {
      announcer.announce(shown.title);
    }
  }

  return (
    <Dialog
      title="Settings"
      size="lg"
      height={settingsHeight}
      flush
      onCancel={props.onClose}
      initialFocus={() => currentRow(nav.current)}
    >
      <div className="flex h-full min-h-0">
        <SettingsNav groups={groups} current={current} onShow={show} navRef={nav} />
        <div className="min-w-0 flex-1 overflow-y-auto bg-surface-raised px-6 pt-5 pb-6">
          {section === undefined ? null : (
            <SectionView
              key={section.id}
              section={section}
              context={props.contextFor(section.featureId)}
              closeSettings={props.onClose}
            />
          )}
        </div>
      </div>
    </Dialog>
  );
}

/** The current section's row, which takes the focus when Settings opens (a11y checklist 3.2). */
function currentRow(nav: HTMLElement | null): HTMLElement | null {
  return nav?.querySelector<HTMLElement>('[aria-current="page"]') ?? null;
}

function SectionView({
  section,
  context,
  closeSettings,
}: {
  readonly section: Registered<SettingsSectionContribution>;
  readonly context: WorkspaceContext;
  readonly closeSettings: () => void;
}) {
  const View = useSectionView(section);
  return (
    <section aria-labelledby={`settings-section-${section.id}`}>
      <h3 id={`settings-section-${section.id}`} className="text-section text-fg">
        {section.title}
      </h3>
      {/* A view that fails to load or draw shows nothing; the list and the other sections keep working. */}
      <ViewErrorBoundary>
        <Suspense fallback={null}>
          <View context={context} closeSettings={closeSettings} />
        </Suspense>
      </ViewErrorBoundary>
    </section>
  );
}

/** The section's view, imported the first time it shows; one import per section. */
function useSectionView(section: SettingsSectionContribution): ComponentType<SettingsSectionProps> {
  return useMemo(
    () =>
      lazy(async () => ({
        default: await loadView<ComponentType<SettingsSectionProps>>(section),
      })),
    [section],
  );
}
