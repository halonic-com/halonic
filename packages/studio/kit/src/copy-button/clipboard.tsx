import { createContext, type ReactNode, useContext } from "react";
import { copyText } from "./copy-text.ts";

/**
 * Puts text on the clipboard. Resolves `true` when it's there and `false` when it couldn't be
 * put there; it never rejects, so a caller always has an answer to show.
 */
export type WriteClipboard = (text: string) => Promise<boolean>;

const ClipboardContext = createContext<WriteClipboard>(copyText);

/** The props of `ClipboardProvider`. */
export interface ClipboardProviderProps {
  readonly writeClipboard: WriteClipboard;
  readonly children: ReactNode;
}

/**
 * Sets how the CopyButton and CommandBox inside it copy. The desktop app's shell passes Tauri's
 * clipboard, which needs no secure context. Without a provider the kit uses `navigator.clipboard`
 * and falls back to the browser's copy command, for served mode over plain http.
 *
 * @example
 * <ClipboardProvider writeClipboard={(text) => desktop.writeClipboard(text)}>
 *   <App />
 * </ClipboardProvider>
 */
export function ClipboardProvider({ writeClipboard, children }: ClipboardProviderProps) {
  return <ClipboardContext value={writeClipboard}>{children}</ClipboardContext>;
}

/** The clipboard writer in force where a component renders. */
export function useWriteClipboard(): WriteClipboard {
  return useContext(ClipboardContext);
}
