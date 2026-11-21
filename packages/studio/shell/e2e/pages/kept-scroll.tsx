import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { emptyPageMemory, KeptScroll, type PhonePageMemory } from "../../src/phone/page-memory.tsx";

/**
 * A phone page and a page pushed above it, each in `KeptScroll` with its own memory, as the phone
 * window draws them: "Open" pushes the page with a fresh memory, "Back" draws the list again. The
 * pushed page is as long as the list, so the browser clamping the scroll can't hide a page that
 * opens part way down. In a short window (`short:`) the whole column scrolls instead of `main`,
 * bars included, as the window's phone column does (HAL-12665).
 */
function Rows({ name }: { readonly name: string }) {
  return (
    <ul>
      {Array.from({ length: 40 }, (_, index) => (
        <li key={index} className="h-12">{`${name} ${index}`}</li>
      ))}
    </ul>
  );
}

function Page() {
  const list = useRef(emptyPageMemory());
  const [pushed, setPushed] = useState<PhonePageMemory | undefined>(undefined);
  return (
    <div className="flex h-dvh flex-col short:overflow-y-auto">
      <header className="flex gap-2">
        <button type="button" onClick={() => setPushed(emptyPageMemory())}>
          Open
        </button>
        <button type="button" onClick={() => setPushed(undefined)}>
          Back
        </button>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto short:flex-[1_0_auto] short:overflow-visible">
        {pushed === undefined ? (
          <KeptScroll key="list" memory={list.current}>
            <h1>Changes</h1>
            <Rows name="Version" />
          </KeptScroll>
        ) : (
          <KeptScroll key="pushed" memory={pushed}>
            <h1>A version</h1>
            <Rows name="Change" />
          </KeptScroll>
        )}
      </main>
    </div>
  );
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The kept scroll page needs its #root element (kept-scroll.html).");
}
createRoot(root).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
