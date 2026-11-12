import { Dialog, isComposing } from "@halonicjs/studio-kit";
import {
  type ComponentType,
  lazy,
  type RefObject,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Announcer } from "../announcer/announcer.ts";
import type { SettingsSectionContribution } from "../points/frame.ts";
import type { KeyboardPlatform } from "../points/keybindings.ts";
import type { Registered } from "../points/point-store.ts";
import { settingsSectionToOpen } from "../points/settings-sections.ts";
import { loadView } from "../view.ts";
import { ViewErrorBoundary } from "../view-error-boundary.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { listedSections, type SettingsPlace, settingsGroups } from "./settings-groups.ts";
import { SettingsNav } from "./settings-nav.tsx";
import { isSettingsKey } from "./settings-opening.ts";

/** What a settings section's view gets. */
export interface SettingsSectionProps {
  /** The context of the feature that added the section. */
  readonly context: WorkspaceContext;
  /**
   * Closes Settings. A link to a page calls it first and then opens the page, so the focus can go
   * to the page's heading (flow-settings 3).
   */
  readonly closeSettings: () => void;
  /** In the desktop app, or in a browser: "Follow this computer" or "Follow this browser". */
  readonly place: SettingsPlace;
}

/**
 * The line under a `display` section's name: where its values are saved (flow-settings 5 and 6).
 * The same for Appearance, Formats and Developer, so the container writes it, not each section.
 */
export const displaySavedLines: Readonly<Record<SettingsPlace, string>> = {
  app: "Saved on this computer, for every workspace.",
  served: "Saved in this browser. The computer running Halonic keeps its own.",
};

/** Props for {@link SettingsDialog}. */
export interface SettingsDialogProps {
  /** `shell.contributions.settings.list()`. */
  readonly sections: readonly Registered<SettingsSectionContribution>[];
  /** The open workspace's name, or `undefined` when none is open. */
  readonly workspaceName: string | undefined;
  readonly place: SettingsPlace;
  /** The section a caller asked for, such as `assistant` from the session picker. */
  readonly requested?: string | undefined;
  /** The section shown when Settings last closed in this window. */
  readonly lastShown?: string | undefined;
  /** Called with each section shown, the first one too, so the window can remember it for `lastShown`. */
  readonly onShown?: (sectionId: string) => void;
  /**
   * In the desktop app, its platform: Mod , then puts the focus back on the current section's row.
   * Served Studio leaves it out, so the key stays the browser's.
   */
  readonly rowKey?: KeyboardPlatform | undefined;
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
 * per Escape and gives the focus back to the opener. In the desktop app, Mod , while it is open
 * puts the focus back on the current section's row, unless a dialog on top of it has the focus.
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
  useRowKey(nav, props.rowKey);

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
              place={place}
            />
          )}
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Mod , pressed inside Settings puts the focus on the current section's row, as opening it does.
 * A press inside a dialog on top of Settings, such as a confirmation, is that dialog's.
 */
function useRowKey(nav: RefObject<HTMLElement | null>, platform: KeyboardPlatform | undefined) {
  useEffect(() => {
    const dialog = nav.current?.closest("dialog");
    if (platform === undefined || dialog == null) {
      return;
    }
    const keys = platform;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isComposing(event) || !isSettingsKey(event, keys)) {
        return;
      }
      if (event.target instanceof Element && event.target.closest("dialog") !== dialog) {
        return;
      }
      event.preventDefault();
      currentRow(nav.current)?.focus();
    }
    dialog.addEventListener("keydown", onKeyDown);
    return () => dialog.removeEventListener("keydown", onKeyDown);
  }, [nav, platform]);
}

/** The current section's row, which takes the focus when Settings opens (a11y checklist 3.2). */
function currentRow(nav: HTMLElement | null): HTMLElement | null {
  return nav?.querySelector<HTMLElement>('[aria-current="page"]') ?? null;
}

/** Props for {@link SectionView}. */
export interface SectionViewProps extends SettingsSectionProps {
  readonly section: Registered<SettingsSectionContribution>;
  /**
   * The section's page on a phone: its name is the page's `h1` for screen readers only, since the
   * top bar shows it. In the dialog it is a visible `h3`.
   */
  readonly page?: boolean;
}

/** A section's name, its saved line where it has one, and its view, as the dialog and the phone show it. */
export function SectionView({ section, context, closeSettings, place, page }: SectionViewProps) {
  const View = useSectionView(section);
  return (
    <section aria-labelledby={`settings-section-${section.id}`}>
      {page === true ? (
        <h1 id={`settings-section-${section.id}`} tabIndex={-1} className="sr-only">
          {section.title}
        </h1>
      ) : (
        <h3 id={`settings-section-${section.id}`} className="text-section text-fg">
          {section.title}
        </h3>
      )}
      {section.scope === "display" ? (
        <p className="mt-1 text-small text-fg-muted">{displaySavedLines[place]}</p>
      ) : null}
      {/* A view that fails to load or draw shows nothing; the list and the other sections keep working. */}
      <ViewErrorBoundary>
        <Suspense fallback={null}>
          <View context={context} closeSettings={closeSettings} place={place} />
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
