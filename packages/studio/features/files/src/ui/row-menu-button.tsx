import { Button, MoreIcon } from "@halonicjs/studio-kit";
import type { MouseEvent } from "react";
import { filesWords } from "../files-words.ts";

/** Props for {@link RowMenuButton}. */
export interface RowMenuButtonProps {
  /** The file's name, which the button's name carries. */
  readonly name: string;
  /** Whether the file's menu is open, which keeps the button in sight. */
  readonly open: boolean;
  readonly onPress: (event: MouseEvent<HTMLButtonElement>) => void;
}

/**
 * The ⋮ at the right of a file row: it shows while the row is hovered or has focus and opens the
 * file's menu. It is not a Tab stop, since the tree has one and the keyboard opens the menu with
 * Shift F10 or the Menu key.
 */
export function RowMenuButton({ name, open, onPress }: RowMenuButtonProps) {
  const shown = open ? "" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100";
  return (
    <span className={`shrink-0 ${shown}`}>
      <Button
        variant="ghost"
        size="sm"
        tabIndex={-1}
        aria-haspopup="menu"
        icon={<MoreIcon />}
        label={filesWords.moreActions(name)}
        onClick={(event) => {
          event.stopPropagation();
          onPress(event);
        }}
      />
    </span>
  );
}
