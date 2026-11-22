import {
  Button,
  LetterTile,
  Menu,
  MoreIcon,
  type Tab,
  type TabIds,
  TabList,
  usePresentation,
  useToastStore,
} from "@halonicjs/studio-kit";
import { NameField, RenameSheet } from "@halonicjs/studio-shell";
import { type RefObject, useState } from "react";
import type { RoutinesHost, RoutineView } from "../api.ts";
import { runsWords } from "../runs/runs-words.ts";
import { failureReason, pageWords } from "./page-words.ts";
import type { RunNowGate } from "./run-now-gate.ts";
import type { RunNow } from "./use-run-now.tsx";

/** The routine page's two views. */
export type RoutineViewId = "schedule" | "runs";

/**
 * The page's header: the avatar, "ROUTINE" and the name, which is a rename field once the routine
 * is read, then its ⋮ menu with Open as file (where tabs open) and Delete, and **Run now** at the right (only where the host can start a run). On a phone the top bar already names the routine, so the
 * page keeps only its type, and Run now is in the bar at the bottom.
 */
export function RoutineHeader({
  host,
  routine,
  name,
  title,
  tabs,
  onDelete,
  openFile,
  gate,
  runNow,
}: {
  readonly host: RoutinesHost;
  /** The routine, once it is read; before that the header has no menu. */
  readonly routine: RoutineView | undefined;
  readonly name: string;
  readonly title: RefObject<HTMLHeadingElement | null>;
  /** The page's views, shown as tabs once the routine is read. */
  readonly tabs: {
    readonly ids: TabIds;
    readonly views: readonly Tab<RoutineViewId>[];
    readonly selected: RoutineViewId;
    readonly onSelect: (view: RoutineViewId) => void;
  };
  /** Deletes the routine, for the ⋮ menu's Delete. */
  readonly onDelete: (routine: RoutineView) => void;
  readonly openFile: ((path: string) => void) | undefined;
  /** Whether Run now can start a run while the sandbox can't start, and its button. */
  readonly gate: RunNowGate;
  readonly runNow: RunNow;
}) {
  const phone = usePresentation() === "phone";
  const toasts = useToastStore();
  const [renaming, setRenaming] = useState(false);
  const rename = ({ hubId, id }: RoutineView, next: string) => {
    host.save({ hubId, id }, { name: next }).catch((error: unknown) => {
      toasts?.show({
        tone: "danger",
        title: pageWords.couldntRename(name, undefined),
        text: failureReason(error),
      });
    });
  };
  const heading =
    routine !== undefined && !phone ? (
      <NameField
        name={name}
        label={pageWords.nameLabel}
        onRename={(next) => rename(routine, next)}
      />
    ) : (
      name
    );
  return (
    <header
      className={
        phone
          ? "flex flex-col gap-3 border-b border-border px-4 py-3"
          : "flex items-center gap-3 border-b border-border px-6 py-3"
      }
    >
      <div className="flex min-w-0 items-center gap-3">
        <LetterTile name={name} />
        <div className="flex min-w-0 flex-col">
          <p className="text-caption text-fg-muted">{pageWords.kind}</p>
          <h1 ref={title} tabIndex={-1} className={phone ? "sr-only" : "text-title"}>
            {heading}
          </h1>
        </div>
        {routine !== undefined && (
          <Menu
            entries={[
              // The phone has no name field in the header, so renaming is a sheet from ⋮.
              ...(phone
                ? [{ id: "rename", label: pageWords.rename, onSelect: () => setRenaming(true) }]
                : []),
              ...(openFile === undefined || phone
                ? []
                : [
                    {
                      id: "open-as-file",
                      label: pageWords.openAsFile,
                      onSelect: () => openFile(routine.file),
                    },
                  ]),
              {
                id: "delete",
                label: pageWords.delete,
                danger: true,
                onSelect: () => onDelete(routine),
              },
            ]}
            trigger={(trigger) => (
              <Button
                {...trigger}
                variant="ghost"
                size="sm"
                icon={<MoreIcon />}
                label={pageWords.more(name)}
              />
            )}
          />
        )}
      </div>
      {routine !== undefined && (
        <TabList
          label={runsWords.viewsLabel}
          tabs={tabs.views}
          selected={tabs.selected}
          onSelect={tabs.onSelect}
          ids={tabs.ids}
        />
      )}
      {!phone && routine !== undefined && host.runNow !== undefined && (
        <div className="ml-auto">
          <Button
            ref={gate.runNow}
            variant="secondary"
            size="sm"
            busy={runNow.starting}
            unavailable={gate.unavailable}
            onClick={runNow.press}
          >
            {pageWords.runNow}
          </Button>
        </div>
      )}
      {routine !== undefined && renaming && (
        <RenameSheet
          kindName="routine"
          name={name}
          onRename={(next) => rename(routine, next)}
          onClose={() => setRenaming(false)}
        />
      )}
    </header>
  );
}
