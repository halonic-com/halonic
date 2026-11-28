import { Button, FileIcon, Menu, MoreIcon } from "@halonicjs/studio-kit";
import type { RefObject } from "react";
import { fileName } from "../file-item.ts";
import { type FileMenuActions, fileMenuEntries } from "../file-menu.ts";
import { filesWords } from "../files-words.ts";

/** The folder part of a path, `hubs/p/agents` for `hubs/p/agents/a.agent.yaml`; empty for a file at the top. */
export function folderOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? "" : path.slice(0, cut);
}

/** Props for {@link FileHeader}. */
export interface FileHeaderProps {
  readonly path: string;
  /** What the ⋮ menu's items do. The tab is open already, so it has no Open items but Open as *kind*. */
  readonly actions: Pick<FileMenuActions, "openAsItem" | "rename" | "remove" | "copyPath">;
  /** The file's heading, for the focus once the assistant's last change in it is decided. */
  readonly titleRef?: RefObject<HTMLHeadingElement | null> | undefined;
  /** The file is in Code's content pane, under the "Code" title (`files.code-pane-header`). */
  readonly inPane?: boolean;
}

/** The ⋮ menu of the file's head, named after the file. */
function MoreMenu({ path, actions }: Pick<FileHeaderProps, "path" | "actions">) {
  return (
    <Menu
      align="end"
      trigger={(props) => (
        <Button
          {...props}
          variant="ghost"
          size="sm"
          icon={<MoreIcon />}
          label={filesWords.moreActions(fileName(path))}
        />
      )}
      entries={fileMenuEntries(actions)}
    />
  );
}

/**
 * The head of a file in Code's content pane (`files.code-pane-header`): the content-pane header of
 * HAL-20742's SCREENS.md, the chat header with a 40px file tile in place of the avatar and a
 * hairline under it in place of the shadow, as the pane under it has the same colour. The name is
 * an `h2` under the list column's "Code", over the folder in muted text.
 */
function PaneFileHeader({ path, actions, titleRef }: FileHeaderProps) {
  const folder = folderOf(path);
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-border border-b bg-surface px-4">
      <span
        aria-hidden="true"
        className="inline-grid size-10 shrink-0 place-items-center rounded-md bg-surface-muted text-fg-muted"
      >
        <span className="inline-grid size-icon-md place-items-center *:size-full">
          <FileIcon />
        </span>
      </span>
      <div className="-ml-px flex min-w-0 flex-1 flex-col">
        <h2 ref={titleRef} tabIndex={-1} className="truncate text-chat-title" title={path}>
          {fileName(path)}
        </h2>
        {folder !== "" && <p className="truncate text-small text-fg-muted">{folder}</p>}
      </div>
      <MoreMenu path={path} actions={actions} />
    </header>
  );
}

/**
 * The head of a file's tab: the file's name, the folder in muted text, then the ⋮ menu with
 * Open as *kind* for an agent's, a workflow's or a routine's file, Rename, Copy path and Delete
 * (`files.ui.file-tab-header`). The name is the page's `h1`; in Code's pane, an `h2`.
 */
export function FileHeader({ path, actions, titleRef, inPane = false }: FileHeaderProps) {
  if (inPane) return <PaneFileHeader path={path} actions={actions} titleRef={titleRef} />;
  const folder = folderOf(path);
  return (
    <header className="flex items-center gap-2 px-4 py-2">
      <h1 ref={titleRef} tabIndex={-1} className="min-w-0 truncate text-body-strong" title={path}>
        {fileName(path)}
      </h1>
      {folder !== "" && <span className="min-w-0 truncate text-small text-fg-muted">{folder}</span>}
      <span className="ml-auto shrink-0">
        <MoreMenu path={path} actions={actions} />
      </span>
    </header>
  );
}
