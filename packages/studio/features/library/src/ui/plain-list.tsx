import type { ReactNode } from "react";

/** A list without bullets that keeps its list semantics in Safari, which drops them for `list-none`. */
export function PlainList({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noRedundantRoles: Safari drops the list semantics of a list without bullets
    <ul role="list" className={`m-0 list-none p-0 ${className}`}>
      {children}
    </ul>
  );
}
