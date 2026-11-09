import { PresentationProvider } from "../src/presentation/presentation.tsx";
import { SECTIONS } from "./sections/index.ts";
import { StateTable, usePhoneLayout } from "./state-table.tsx";

/**
 * The kit states page: every part in every state, light and dark, in the order of the states
 * sheet (VRK T1-F1, F2). `?part=button` draws only that section, for a pull request's
 * screenshots. Below 600px the parts get the phone presentation, as the shell gives it. Not part
 * of the app.
 */
export function StatesPage({ only }: { readonly only: string | null }) {
  const phone = usePhoneLayout();
  const shown = only === null ? SECTIONS : SECTIONS.filter((section) => section.id === only);
  return (
    <PresentationProvider presentation={phone ? "phone" : "desktop"}>
      <main className="flex flex-col gap-12 p-8 phone:p-0 phone:py-4">
        <header className="flex flex-col gap-2 phone:px-4">
          <h1 className="text-title">Kit states</h1>
          <p className="text-small text-fg-muted">
            Every kit part in every state, light and dark. Matches the states sheet (VRK T1-F1, F2).
            Not part of the app.
          </p>
          <nav aria-label="Parts" className="text-small">
            {SECTIONS.map((section, index) => (
              <span key={section.id}>
                {index === 0 ? null : " · "}
                <a href={`#${section.id}`} className="rounded-xs text-accent-text focus-ring">
                  {section.name}
                </a>
              </span>
            ))}
          </nav>
        </header>
        {shown.map((section) => (
          <StateTable key={section.id} section={section} />
        ))}
      </main>
    </PresentationProvider>
  );
}
