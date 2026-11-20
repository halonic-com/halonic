import { Button, type GridCellProps, Menu, MoreIcon } from "@halonicjs/studio-kit";
import type { Ref } from "react";
import { collectionWords } from "../collection-words.ts";

/** Puts the element in each of the refs, whether a callback or an object. */
function joinRefs<T>(...refs: readonly (Ref<T> | undefined)[]): (element: T | null) => void {
  return (element) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(element);
      else if (ref) ref.current = element;
    }
  };
}

/** What a row's menu needs: the record's name, its place in the grid's arrow keys and what Remove does. */
interface RowMenuProps {
  /** The record's first field's text; `undefined` when that is empty. */
  readonly name: string | undefined;
  readonly cell: GridCellProps;
  readonly onRemove: () => void;
}

/** A row's ⋮ menu: Remove. Its button is one more cell of the grid's arrow keys. */
export function RowMenu({ name, cell, onRemove }: RowMenuProps) {
  return (
    <Menu
      align="end"
      trigger={({ ref, ...props }) => (
        <Button
          {...props}
          ref={joinRefs(ref, cell.ref)}
          tabIndex={cell.tabIndex}
          onFocus={cell.onFocus}
          variant="ghost"
          size="sm"
          icon={<MoreIcon />}
          label={collectionWords.rowMenuLabel(name)}
        />
      )}
      entries={[{ id: "remove", label: collectionWords.remove, danger: true, onSelect: onRemove }]}
    />
  );
}
