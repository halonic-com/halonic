import type { Ref } from "react";

/** Sets a ref the caller passed, whether it's a function or an object. */
export function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref !== undefined && ref !== null) {
    ref.current = value;
  }
}

/** The ids a control is described by (its unavailable reason, the Field's line), or none. */
export function describedBy(...ids: readonly (string | undefined)[]): string | undefined {
  const present = ids.filter((id) => id !== undefined);
  return present.length === 0 ? undefined : present.join(" ");
}
