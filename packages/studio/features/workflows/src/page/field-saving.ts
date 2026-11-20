import { findSecretShape } from "@halonicjs/std";
import type { AutoSaved } from "@halonicjs/studio-shell";
import { pageWords } from "./page-words.ts";

/** Save model 8.4: a key pasted into a field is not saved. */
export const keyCheck = (text: string): string | null =>
  findSecretShape(text) === undefined ? null : pageWords.stepCard.looksLikeKey;

/** For a field whose every text can be saved. */
export const noCheck = (): null => null;

/** A picker's change: the pick is a finished edit, so it is saved at once. */
export const pickNow =
  (field: AutoSaved) =>
  (next: string): void => {
    field.onChange(next);
    field.flush();
  };
