import { useTabIds } from "@halonicjs/studio-kit";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { ItemHeader } from "../../src/item-page/item-header.tsx";

/**
 * The item page's header (UX checklist 1.10) with the name field and the ⋮ it sizes against, for
 * the field's width in a real browser. The name starts as the page's `name` query parameter, or
 * "Run", and renaming it in the field keeps it, as an item page does.
 */
function Header() {
  const [name, setName] = useState(new URLSearchParams(location.search).get("name") ?? "Run");
  const tabIds = useTabIds();
  return (
    <ItemHeader
      icon={<svg viewBox="0 0 16 16" />}
      kind="Workflow"
      name={name}
      onRename={setName}
      actions={[{ id: "duplicate", label: "Duplicate", onSelect: () => undefined }]}
      views={[
        { id: "flow", label: "Flow" },
        { id: "configuration", label: "Configuration" },
        { id: "runs", label: "Runs" },
      ]}
      view="flow"
      onPickView={() => undefined}
      tabIds={tabIds}
      end={<button type="button">Run</button>}
    />
  );
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The item header page needs its #root element (item-header.html).");
}
createRoot(root).render(
  <StrictMode>
    <Header />
  </StrictMode>,
);
