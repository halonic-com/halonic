import { Button, Menu, MoreIcon } from "@halonicjs/studio-kit";
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
  /** What the ⋮ menu's items do. The tab is open already, so it has no Open items. */
  readonly actions: Pick<FileMenuActions, "rename" | "remove" | "copyPath">;
}

/**
 * The head of a file's tab: the file's name, the folder in muted text, then the ⋮ menu with
 * Rename, Copy path and Delete (`files.ui.file-tab-header`). The name is the page's `h1`.
 */
export function FileHeader({ path, actions }: FileHeaderProps) {
  const folder = folderOf(path);
  return (
    <header className="flex items-center gap-2 px-4 py-2">
      <h1 className="min-w-0 truncate text-base font-medium" title={path}>
        {fileName(path)}
      </h1>
      {folder !== "" && <span className="min-w-0 truncate text-small text-fg-muted">{folder}</span>}
      <span className="ml-auto shrink-0">
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
      </span>
    </header>
  );
}
