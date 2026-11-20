import { Dialog, isComposing } from "@halonicjs/studio-kit";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import type { Announcer } from "../announcer/announcer.ts";
import { PartErrorBoundary, unreachableWords } from "../page/page-unreachable.tsx";
import type { SettingsSectionContribution } from "../points/frame.ts";
import type { KeyboardPlatform } from "../points/keybindings.ts";
import type { Registered } from "../points/point-store.ts";
import { settingsSectionToOpen } from "../points/settings-sections.ts";
import { LoadedView } from "../view-loading.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import {
  listedSections,
  type SettingsPlace,
  type SettingsSurface,
  settingsGroups,
} from "./settings-groups.ts";
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
  /** `window` in the Settings dialog, `phone` on the phone's Settings page. */
  readonly surface: SettingsSurface;
  /**
   * The system's region format as a language tag (`nl-NL`), when the desktop app knows it. The
   * window's own language is the webview's, which isn't the user's region setting (B17).
   */
  readonly regionFormat?: string | undefined;
}

/**
 * The line under a `display` section's name: where its values are saved (flow-settings 5 and 6).
 * The same for Appearance, Formats and Developer, so the container writes it, not each section.
 */
export const displaySavedLines: Readonly<Record<SettingsPlace, string>> = {
  app: "Saved on this computer, for every workspace.",
  served: "Saved in this browser. The computer running Halonic keeps its own.",
};

/** The same line on the phone's Settings page, where the values are saved on the phone itself. */
export const phoneSavedLine = "Saved on this phone. Your computer keeps its own.";

/**
 * The line under the name of a workspace section: whose settings these are. The same for Models
 * and Workspace (not Trust: it is kept by the app), so the container writes it (flow-settings 4).
 * It no longer promises Changes and undo, which a workspace with history off has neither of
 * (HAL-12859).
 */
export function workspaceSectionLine(workspaceName: string): string {
  return `Part of ${workspaceName}.`;
}

/** Props for {@link SettingsDialog}. */
export interface SettingsDialogProps {
  /** `shell.contributions.settings.list()`. */
  readonly sections: readonly Registered<SettingsSectionContribution>[];
  /** The open workspace's name, or `undefined` when none is open. */
  readonly workspaceName: string | undefined;
  readonly place: SettingsPlace;
  /** The system's region format, handed on to each section. */
  readonly regionFormat?: string | undefined;
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
  /**
   * Where the focus goes on close when the opener is gone or hidden, such as the Settings row of
   * the narrow window's closed Places drawer: the title bar's Places button.
   */
  readonly returnFocus?: (() => HTMLElement | null) | undefined;
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
  const { sections, workspaceName, place, announcer, onShown, regionFormat } = props;
  const groups = useMemo(
    () => settingsGroups({ sections, workspaceName, place }),
    [sections, workspaceName, place],
  );
  const listed = useMemo(() => listedSections(groups), [groups]);
  const [current, setCurrent] = useState(
    () => settingsSectionToOpen(listed, props.requested, props.lastShown) ?? "",
  );
  const nav = useRef<HTMLElement>(null);
  const attention = useAttention(listed, props.contextFor, current);
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
      {...(props.returnFocus === undefined ? {} : { returnFocus: props.returnFocus })}
      initialFocus={() => currentRow(nav.current)}
    >
      <div className="flex h-full min-h-0">
        <SettingsNav
          groups={groups}
          current={current}
          attention={attention}
          onShow={show}
          navRef={nav}
        />
        <div className="min-w-0 flex-1 overflow-y-auto bg-surface-raised px-6 pt-5 pb-6">
          {section === undefined ? null : (
            <SectionView
              key={section.id}
              section={section}
              context={props.contextFor(section.featureId)}
              closeSettings={props.onClose}
              place={place}
              surface="window"
              regionFormat={regionFormat}
              workspaceName={workspaceName}
              announce={(words) => announcer.announce(words)}
            />
          )}
        </div>
      </div>
    </Dialog>
  );
}

/**
 * The ids of the sections that have a problem, asked again whenever the section shown changes
 * (a section's own chips may have just been fixed). A section that answers late has no mark until
 * it does; one that fails to answer has none.
 */
function useAttention(
  listed: readonly Registered<SettingsSectionContribution>[],
  contextFor: (featureId: string) => WorkspaceContext,
  current: string,
): ReadonlySet<string> {
  const [marked, setMarked] = useState<ReadonlySet<string>>(new Set());
  // The caller's `contextFor` is usually a new function each render; only the sections and the
  // section shown should ask again.
  const context = useRef(contextFor);
  context.current = contextFor;
  useEffect(() => {
    let live = true;
    void Promise.all(
      listed.map(async (section) => {
        try {
          return (await section.attention?.(context.current(section.featureId))) === true
            ? section.id
            : undefined;
        } catch {
          return undefined;
        }
      }),
    ).then((ids) => {
      if (live) setMarked(new Set(ids.filter((id) => id !== undefined)));
    });
    return () => {
      live = false;
    };
  }, [listed, current]);
  return marked;
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
  /** The open workspace's name: a workspace section then shows `workspaceSectionLine` under its name. */
  readonly workspaceName?: string | undefined;
  /**
   * Reads a state's title politely when the section's view can't load: the focus stays in the
   * dialog's list, or on the phone page's hidden name, so nothing else reads it. After Try again
   * or Reload page the focus goes to the state's title, which reads it, so this stays quiet.
   */
  readonly announce?: ((words: string) => void) | undefined;
}

/**
 * A section's `description` as the container draws it: a string at once, a function once it
 * answers. A function that fails, or answers `undefined`, leaves the line out.
 */
function useDescription(
  section: Registered<SettingsSectionContribution>,
  context: WorkspaceContext,
  place: SettingsPlace,
): string | undefined {
  const { description } = section;
  const [answer, setAnswer] = useState<string | undefined>(undefined);
  // `contextFor` builds a new context on every call; only the description and the place should
  // ask again, as in `useAttention`.
  const latest = useRef(context);
  latest.current = context;
  useEffect(() => {
    if (typeof description !== "function") return;
    let live = true;
    void Promise.resolve()
      .then(() => description(latest.current, place))
      .then(
        (line) => live && setAnswer(line),
        () => undefined,
      );
    return () => {
      live = false;
    };
  }, [description, place]);
  return typeof description === "function" ? answer : description;
}

/**
 * A section's name, its saved line where it has one, its description and its view, as the dialog
 * and the phone show it. The container owns the spacing (settings rhythm, HAL-11844): 8px under
 * the name and under each line, then 20px before the view, so no section puts a margin of its own
 * on its root.
 */
export function SectionView({
  section,
  context,
  closeSettings,
  place,
  surface,
  page,
  regionFormat,
  workspaceName,
  announce,
}: SectionViewProps) {
  const description = useDescription(section, context, place);
  const heading = useRef<HTMLHeadingElement>(null);
  const retried = useRef(false);
  // After Reload page or Try again, which goes away, the section's name takes the focus once the
  // view draws, unless the user put the focus somewhere else meanwhile (a11y 2.4.3).
  const onDrawn = () => {
    const active = document.activeElement;
    if (retried.current && (active === null || active === document.body)) {
      heading.current?.focus();
    }
    retried.current = false;
  };
  return (
    <section aria-labelledby={`settings-section-${section.id}`}>
      {page === true ? (
        <h1 ref={heading} id={`settings-section-${section.id}`} tabIndex={-1} className="sr-only">
          {section.title}
        </h1>
      ) : (
        <h3
          ref={heading}
          id={`settings-section-${section.id}`}
          tabIndex={-1}
          className="text-section text-fg"
        >
          {section.title}
        </h3>
      )}
      {section.scope === "display" ? (
        <p className="mt-2 text-small text-fg-muted">
          {place === "served" && surface === "phone" ? phoneSavedLine : displaySavedLines[place]}
        </p>
      ) : null}
      {section.scope === "workspace" &&
      section.workspaceLine !== false &&
      workspaceName !== undefined ? (
        <p className="mt-2 text-small text-fg-muted">{workspaceSectionLine(workspaceName)}</p>
      ) : null}
      {description === undefined ? null : (
        <p className="mt-2 max-w-120 text-small text-fg-muted">{description}</p>
      )}
      {/* A view that fails to load or draw shows "Couldn't load these settings" one level under the
          section's name: with Reload page in the desktop app, with Try again when the computer
          can't be reached, else nothing. The list and the other sections keep working. */}
      <div className="mt-5">
        <PartErrorBoundary
          name={`${section.title} settings`}
          title={unreachableWords.settingsTitle}
          headingLevel={page === true ? 2 : 4}
          announce={announce}
          onRetry={() => {
            retried.current = true;
          }}
        >
          <LoadedView<SettingsSectionProps>
            view={section}
            name={section.title}
            props={{ context, closeSettings, place, surface, regionFormat }}
            onDrawn={onDrawn}
          />
        </PartErrorBoundary>
      </div>
    </section>
  );
}
