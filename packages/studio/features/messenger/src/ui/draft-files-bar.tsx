import { Button, CloseIcon, sizeText } from "@halonicjs/studio-kit";
import { type Ref, useRef } from "react";
import type { DraftFile } from "../draft-files.ts";
import { messengerFileLimits } from "../file-limits.ts";
import { messengerWords } from "../messenger-words.ts";
import { AttachIcon } from "./attach-icon.tsx";

/**
 * "Attach a file", a round paperclip inside the box at its left (HAL-19142), which picks only the
 * types the port sends. Nothing is
 * read or sent until the person sends the message.
 */
export function AttachFileButton({
  onAdd,
  buttonRef,
}: {
  readonly onAdd: (files: readonly DraftFile[]) => void;
  readonly buttonRef: Ref<HTMLButtonElement>;
}) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        ref={buttonRef}
        variant="soft"
        size="prompt"
        round
        icon={<AttachIcon />}
        label={messengerWords.files.attach}
        onClick={() => picker.current?.click()}
      />
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        accept={messengerFileLimits.types.join(",")}
        aria-label={messengerWords.files.attach}
        onChange={(event) => {
          onAdd([...(event.target.files ?? [])]);
          // Picking the same file again after removing it should add it again.
          event.target.value = "";
        }}
      />
    </>
  );
}

/**
 * The files waiting in a chat's box, on their own row under the box's
 * buttons: each by its whole name, which wraps and is never cut, its size
 * and Remove.
 */
export function DraftFileList({
  files,
  onRemove,
}: {
  readonly files: readonly DraftFile[];
  readonly onRemove: (index: number) => void;
}) {
  if (files.length === 0) return null;
  return (
    <ul data-draft-files className="flex flex-wrap gap-2">
      {files.map((file, index) => (
        <li
          // A box can hold two files of the same name; their place tells them apart.
          key={`${index}-${file.name}`}
          className="flex min-w-0 items-center gap-2 rounded-md border border-border py-1 ps-2 text-small"
        >
          <span className="min-w-0 wrap-anywhere">
            <bdi>{file.name}</bdi>
            <span className="text-fg-muted"> · {sizeText(file.size)}</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            icon={<CloseIcon />}
            label={messengerWords.files.remove(file.name)}
            onClick={() => onRemove(index)}
          />
        </li>
      ))}
    </ul>
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
