/**
 * Puts text on the clipboard. `navigator.clipboard` works only in a secure context, and a phone
 * that reaches Studio over plain http doesn't have one, so this falls back to selecting the text
 * in a hidden text box and running the browser's copy command.
 *
 * @returns `true` when the text is on the clipboard, `false` when both ways failed
 */
export async function copyText(text: string): Promise<boolean> {
  if (await copyWithClipboardApi(text)) {
    return true;
  }
  return copyWithSelection(text);
}

async function copyWithClipboardApi(text: string): Promise<boolean> {
  // Missing outside a secure context, even though the DOM types say it's always there.
  const clipboard = navigator.clipboard as Clipboard | undefined;
  if (clipboard === undefined) {
    return false;
  }
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    // Refused, for example when the page isn't focused. The fallback may still work.
    return false;
  }
}

function copyWithSelection(text: string): boolean {
  const previousFocus = document.activeElement;
  const box = document.createElement("textarea");
  box.value = text;
  box.readOnly = true;
  // Out of sight and out of the layout, but still selectable.
  box.style.position = "fixed";
  box.style.opacity = "0";
  box.setAttribute("aria-hidden", "true");
  // An open modal dialog makes everything outside it inert, so a box in the body couldn't take
  // the focus, and the copy would find nothing selected yet may still report success.
  const host = previousFocus?.closest("dialog[open]") ?? document.body;
  host.append(box);
  try {
    box.focus();
    box.select();
    // Deprecated, but the only way to copy without a secure context.
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    box.remove();
    if (previousFocus instanceof HTMLElement) {
      previousFocus.focus();
    }
  }
}
