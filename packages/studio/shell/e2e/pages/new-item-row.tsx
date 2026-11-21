import {
  Dialog,
  Field,
  Input,
  PresentationProvider,
  Select,
  TextArea,
} from "@halonicjs/studio-kit";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { NameAndHubRow } from "../../src/dialogs/new-item-parts.tsx";

/**
 * A "New …" sheet on a phone, built as New routine builds it: the Name and Hub row, then a Prompt
 * field under it. New agent and New workflow use the same row. Whether the row fits the sheet
 * depends on the inputs' real widths, which only a real browser has (HAL-14648). `?one-hub` shows
 * the row without the Hub picker.
 */
const hubs = [
  { value: "acme", label: "acme" },
  { value: "support", label: "support" },
  { value: "sales", label: "sales" },
];

function Page() {
  const oneHub = new URLSearchParams(location.search).has("one-hub");
  const [name, setName] = useState("");
  const [hub, setHub] = useState("acme");
  const [prompt, setPrompt] = useState("");
  return (
    <Dialog
      title="New routine"
      size="md"
      form
      confirm={{ label: "Create", busyLabel: "Creating…" }}
      onConfirm={() => undefined}
      onCancel={() => undefined}
    >
      <div className="flex flex-col gap-3">
        <NameAndHubRow
          name={
            <Field label="Name" hint="routines/morning-report.yaml">
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
          }
          hub={
            oneHub ? undefined : (
              <Field label="Hub">
                <Select options={hubs} value={hub} onChange={setHub} />
              </Field>
            )
          }
        />
        <Field label="Prompt">
          <TextArea
            value={prompt}
            minRows={3}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The new item row page needs its #root element (new-item-row.html).");
}
createRoot(root).render(
  <StrictMode>
    <PresentationProvider presentation="phone">
      <Page />
    </PresentationProvider>
  </StrictMode>,
);
