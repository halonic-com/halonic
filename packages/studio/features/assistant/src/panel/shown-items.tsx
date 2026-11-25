import { Button, CloseIcon, Menu, PlaceIcon, type PlaceIconName } from "@halonicjs/studio-kit";
import type { ItemRef } from "@halonicjs/studio-shell";
import { type RefObject, useId, useRef } from "react";
import type { ShownItem } from "../api.ts";
import { buildChatWords as words } from "../chat/build-chat-words.ts";
import type { Announce } from "../chat/build-chats.ts";

/** How many chips show before the rest go into the "+2" menu (flow-assistant 5.7). */
const chipsShown = 3;

interface ShownItemsProps {
  readonly shown: readonly ShownItem[];
  readonly onOpen: (item: ItemRef) => void;
  readonly onRemove: (shown: ShownItem) => void;
  /** The message box, which takes focus once × removed the last chip. */
  readonly box: RefObject<HTMLElement | null>;
  readonly announce: Announce;
}

/**
 * The shown items under the status line (flow-assistant 2.2, 5.7): a chip per item, up to three,
 * then "+2" with a menu of the rest. Nothing while the chat shows nothing. × moves focus to the
 * next chip's ×, else the previous one's, else the box, and says what it removed (a11y AS4).
 */
export function ShownItems({ shown, onOpen, onRemove, box, announce }: ShownItemsProps) {
  const labelId = useId();
  const group = useRef<HTMLDivElement>(null);
  if (shown.length === 0) return null;
  const rest = shown.slice(chipsShown);
  const remove = (each: ShownItem, removing: HTMLElement) => {
    const removes = [
      ...(group.current?.querySelectorAll<HTMLElement>("[data-remove-shown]") ?? []),
    ];
    const at = removes.indexOf(removing);
    const next = removes[at + 1] ?? removes[at - 1] ?? box.current;
    next?.focus();
    onRemove(each);
    announce(words.removedShown(each.name), "polite");
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: chips that open and remove items, not form fields, so not a fieldset.
    <div
      ref={group}
      role="group"
      aria-labelledby={labelId}
      className="flex flex-wrap items-center gap-1 px-4 pt-1"
    >
      <span id={labelId} className="text-caption text-fg-muted">
        {words.shown}
      </span>
      {shown.slice(0, chipsShown).map((each) => (
        <ShownChip
          key={`${each.item.kind}/${each.item.hub}/${each.item.id}`}
          shown={each}
          onOpen={onOpen}
          onRemove={remove}
        />
      ))}
      {rest.length === 0 ? null : (
        <Menu
          trigger={(props) => (
            <Button {...props} variant="ghost" size="sm">
              {words.moreShown(rest.length)}
            </Button>
          )}
          entries={rest.map((each) => ({
            id: `${each.item.kind}/${each.item.hub}/${each.item.id}`,
            label: each.name,
            onSelect: () => onOpen(each.item),
          }))}
        />
      )}
    </div>
  );
}

/**
 * One removable chip (flow-assistant 9, part 3): the kind's icon, the name as a button that opens
 * the item, and ×. It stays in this feature until a second one needs it (then the kit's
 * `RemovableChip`, agreed with Noah).
 */
function ShownChip({
  shown,
  onOpen,
  onRemove,
}: {
  readonly shown: ShownItem;
  readonly onOpen: (item: ItemRef) => void;
  readonly onRemove: (shown: ShownItem, removing: HTMLElement) => void;
}) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-muted pr-0.5 pl-2">
      <span aria-hidden="true" className="size-4 text-fg-muted">
        <PlaceIcon name={placeOfKind(shown.item.kind)} />
      </span>
      <button
        type="button"
        className="focus-ring rounded-full text-small text-fg"
        onClick={() => onOpen(shown.item)}
      >
        {shown.name}
      </button>
      <button
        type="button"
        aria-label={words.removeShown(shown.name)}
        className="focus-ring inline-flex size-5 items-center justify-center rounded-full text-fg-muted hover:bg-border"
        // Marks each ×, so removing one can move focus to its neighbour's.
        data-remove-shown=""
        onClick={(event) => onRemove(shown, event.currentTarget)}
      >
        <span aria-hidden="true" className="size-3">
          <CloseIcon />
        </span>
      </button>
    </span>
  );
}

/** The place a shown item's chip takes its icon from: a skill lives in the Library. */
function placeOfKind(kind: string): PlaceIconName {
  if (kind === "agent") return "agents";
  if (kind === "skill") return "library";
  return "workflows";
}
