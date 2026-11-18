import type { PhonePageMemory } from "@halonicjs/studio-shell";
import { type ReactNode, useState } from "react";
import type { ChangesPhonePages } from "../ui/phone-pages.ts";

/** A page on the stack: the Changes page (`sub` is `undefined`) or one pushed above it. */
interface StackPage {
  readonly sub: string | undefined;
  readonly title: string;
  readonly memory: PhonePageMemory;
}

function stackPage(sub: string | undefined, title: string): StackPage {
  return { sub, title, memory: { scroll: undefined, row: undefined } };
}

/**
 * The phone's stack above the Changes page, as the window keeps it, for a test: a top bar with the
 * page's title and Back, which goes one page up, and the page shown, drawn fresh each time it
 * shows and given its own memory. `children` draws the page from the stack's pages.
 *
 * @example
 * render(<PhoneStack>{(pages) => <ChangesView list={list} phonePages={pages} />}</PhoneStack>);
 */
export function PhoneStack({
  children,
}: {
  readonly children: (pages: ChangesPhonePages) => ReactNode;
}) {
  const [stack, setStack] = useState<readonly StackPage[]>(() => [stackPage(undefined, "Changes")]);
  const shown = stack[stack.length - 1] as StackPage;
  const pages: ChangesPhonePages = {
    sub: shown.sub,
    memory: shown.memory,
    open: (sub, title) => setStack((before) => [...before, stackPage(sub, title)]),
    close: (sub) =>
      setStack((before) => (before[before.length - 1]?.sub === sub ? before.slice(0, -1) : before)),
  };
  return (
    <>
      <header data-part="top-bar">
        <span data-part="title">{shown.title}</span>
        {stack.length > 1 ? (
          <button type="button" onClick={() => setStack((before) => before.slice(0, -1))}>
            Back
          </button>
        ) : null}
      </header>
      <div data-part="page" key={`${stack.length}:${shown.sub ?? ""}`}>
        {children(pages)}
      </div>
    </>
  );
}

/** The top bar's title, as the test's {@link PhoneStack} shows it. */
export function topBarTitle(root: ParentNode): string | undefined {
  return root.querySelector('[data-part="top-bar"] [data-part="title"]')?.textContent ?? undefined;
}

/** The top bar's Back, or `undefined` at the Changes page. */
export function topBarBack(root: ParentNode): HTMLButtonElement | undefined {
  return root.querySelector<HTMLButtonElement>('[data-part="top-bar"] button') ?? undefined;
}
