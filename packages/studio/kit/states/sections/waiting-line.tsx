import { WaitingLine } from "../../src/waiting-line/waiting-line.tsx";
import type { PartSection } from "../state-table.tsx";

const noAction = () => undefined;

export const waitingLineSection: PartSection = {
  id: "waiting-line",
  number: "15.7",
  name: "WaitingLine",
  order:
    "first-run-progress section 2 · top to bottom: inline, row, banner · nothing shows before 2 s",
  notApplicable: "hover, focus, disabled, error (the actions are the LineFrame's text buttons)",
  rows: [
    {
      name: "3 s",
      copies: () => (
        <div className="grid w-full gap-4">
          <WaitingLine placement="inline" what="Starting Halonic…" waitedMs={3_000} />
          <WaitingLine
            placement="row"
            what={
              <>
                Checking Ollama at <code className="font-mono">localhost:11434</code>…
              </>
            }
            waitedMs={3_000}
          />
          <WaitingLine placement="banner" what="Waiting for Anthropic" waitedMs={3_000} />
        </div>
      ),
    },
    {
      name: "14 s, reason",
      copies: () => (
        <div className="grid w-full gap-4">
          <WaitingLine
            placement="inline"
            what="Starting Halonic…"
            reason="The first start can take a moment. Nothing is wrong yet."
            waitedMs={14_000}
            actions={[{ label: "Something wrong?", onClick: noAction }]}
          />
          <WaitingLine
            placement="banner"
            what="Waiting for Ollama on this computer"
            reason="It loads the model first, so the start is slow."
            waitedMs={14_000}
            actions={[{ label: "Something wrong?", onClick: noAction }]}
          />
        </div>
      ),
    },
    {
      name: "Escalated, m:ss",
      copies: () => (
        <div className="w-full">
          <WaitingLine
            placement="banner"
            what="Still no answer"
            reason="This is taking longer than usual."
            waitedMs={190_000}
            actions={[
              { label: "Pick another model", onClick: noAction },
              { label: "Something wrong?", onClick: noAction },
            ]}
          />
        </div>
      ),
    },
  ],
};
