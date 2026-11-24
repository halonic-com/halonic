import { Button } from "@halonicjs/studio-kit";
import { useState } from "react";
import type { RunFileSaveHost } from "../api.ts";
import type { SavedFile } from "./receipt-model.ts";
import { receiptWords } from "./receipt-words.ts";

/** How the last **Save…** of a file went; none while it wasn't pressed or was cancelled. */
type SaveState = "saving" | "saved" | "failed";

/**
 * **Save…** for one file a run saved, after its **Open** on the Items line
 * (`runs.run-view.receipt-items-save`): it asks the app to save the file by its run and the hash
 * of its last save, never a path, and the shell asks where in its own save dialog. Then what the
 * save came to. Each row keeps its own state, so two files with the same bytes don't share it.
 */
export function SaveFile({
  runId,
  file,
  save,
}: {
  readonly runId: string;
  readonly file: SavedFile;
  readonly save: RunFileSaveHost["save"];
}) {
  const [state, setState] = useState<SaveState | undefined>();
  const press = () => {
    setState("saving");
    save(runId, file.hash).then(
      (answer) => setState(answer === "saved" ? "saved" : undefined),
      (error: unknown) => {
        console.error("Couldn't save the run's file.", error);
        setState("failed");
      },
    );
  };
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        busy={state === "saving"}
        busyLabel={receiptWords.savingFile}
        name={receiptWords.saveFileName(file.shown)}
        onClick={press}
      >
        {receiptWords.saveFile}
      </Button>
      <SaveLine state={state} name={file.shown} />
    </>
  );
}

/** What the last **Save…** came to, read out as it changes. */
function SaveLine({
  state,
  name,
}: {
  readonly state: SaveState | undefined;
  readonly name: string;
}) {
  let text = "";
  if (state === "saved") text = receiptWords.fileSaved(name);
  if (state === "failed") text = receiptWords.fileNotSaved(name);
  return (
    <span role="status" className={state === "failed" ? "text-danger" : "text-fg-muted"}>
      {text}
    </span>
  );
}
