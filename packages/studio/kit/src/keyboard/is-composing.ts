import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/**
 * True while an input method (Japanese, Chinese, Korean and others) is still composing text.
 * Enter then picks a word; it must never submit, send or save (component specs 23, A6).
 *
 * `isComposing` alone isn't enough: WebKit (macOS and WebKitGTK) sends the Enter that ends a
 * composition with `isComposing` false, but with the key code 229.
 *
 * @example
 * if (event.key === "Enter" && !isComposing(event)) send();
 */
export function isComposing(event: KeyboardEvent | ReactKeyboardEvent): boolean {
  const native = "nativeEvent" in event ? event.nativeEvent : event;
  // keyCode is deprecated, but it is the only sign WebKit gives (see above).
  return native.isComposing || native.keyCode === 229;
}
