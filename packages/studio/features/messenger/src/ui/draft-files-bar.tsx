import { sendableAttachments } from "@halonicjs/ports";
import { Button } from "@halonicjs/studio-kit";
import { useRef } from "react";
import type { DraftFile } from "../draft-files.ts";
import { messengerWords } from "../messenger-words.ts";
import { sizeOf } from "./file-size.ts";

/** The props of {@link DraftFilesBar}. */
export interface DraftFilesBarProps {
  readonly files: readonly DraftFile[];
  readonly onAdd: (files: readonly DraftFile[]) => void;
  readonly onRemove: (index: number) => void;
}

/**
 * The files waiting in a chat's box, each with its size and Remove, and
 * "Attach a file", which picks only the types the port sends. Nothing is
 * read or sent until the person sends the message.
 */
export function DraftFilesBar({ files, onAdd, onRemove }: DraftFilesBarProps) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => picker.current?.click()}>
        {messengerWords.files.attach}
      </Button>
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        accept={sendableAttachments.types.join(",")}
        aria-label={messengerWords.files.attach}
        onChange={(event) => {
          onAdd([...(event.target.files ?? [])]);
          // Picking the same file again after removing it should add it again.
          event.target.value = "";
        }}
      />
      {files.length === 0 ? null : (
        <ul className="flex w-full flex-wrap gap-2">
          {files.map((file, index) => (
            <li
              // A box can hold two files of the same name; their place tells them apart.
              key={`${index}-${file.name}`}
              className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-small"
            >
              <bdi className="max-w-48 truncate">{file.name}</bdi>
              <span className="text-fg-muted">{sizeOf(file.size)}</span>
              <Button variant="ghost" size="xs" onClick={() => onRemove(index)}>
                <span className="sr-only">{messengerWords.files.remove(file.name)}</span>
                <span aria-hidden="true">×</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * The pictures pasted into the box, such as a screenshot. A pasted picture
 * often has no name, so it is called "Screenshot.png" in the box.
 */
export function pastedFiles(clipboard: DataTransfer): readonly DraftFile[] {
  return [...clipboard.files]
    .filter((file) => file.type.startsWith("image/"))
    .map((file) => ({
      name:
        file.name === "" || file.name === "image.png" ? messengerWords.files.pastedName : file.name,
      type: file.type,
      size: file.size,
      arrayBuffer: () => file.arrayBuffer(),
    }));
}
