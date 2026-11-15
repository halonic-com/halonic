import { Button, Dialog, Field, Input } from "@halonicjs/studio-kit";
import { useRef, useState } from "react";
import { failureReason } from "../list/list-words.ts";
import { runsWords as words } from "./runs-words.ts";

/** What a run card needs to offer **Save as test** for its run. */
export interface SaveAsTestProps {
  /** The name the field starts with: "Run 01jd8q". */
  readonly defaultName: string;
  /** The names the workflow's tests already have. */
  readonly taken: readonly string[];
  /** Writes the case; rejects with the reason it couldn't be written. */
  readonly save: (name: string) => Promise<void>;
  /** After the case is written: the page goes to Configuration › Tests with it picked. */
  readonly onSaved: (name: string) => void;
}

/** What is wrong with a test's name, in the field's words, or `undefined` when it is fine. */
export function testNameProblem(name: string, taken: readonly string[]): string | undefined {
  const trimmed = name.trim();
  if (trimmed === "") return words.nameMissing;
  return taken.includes(trimmed) ? words.nameTaken(trimmed) : undefined;
}

/**
 * **Save as test** (`workflows.tests.save-run-as-test`) and the small dialog it opens: one field,
 * **Name**, starting as the run's number and selected. **Create test** stays pressable with an
 * empty or taken name and says what is wrong under the field.
 */
export function SaveAsTest({ defaultName, taken, save, onSaved }: SaveAsTestProps) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={opener} variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {words.saveAsTest}
      </Button>
      {open && (
        <SaveAsTestDialog
          defaultName={defaultName}
          taken={taken}
          save={save}
          onSaved={onSaved}
          onCancel={() => setOpen(false)}
          returnFocus={() => opener.current}
        />
      )}
    </>
  );
}

function SaveAsTestDialog({
  defaultName,
  taken,
  save,
  onSaved,
  onCancel,
  returnFocus,
}: SaveAsTestProps & {
  readonly onCancel: () => void;
  readonly returnFocus: () => HTMLElement | null;
}) {
  const [name, setName] = useState(defaultName);
  const [problem, setProblem] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  async function submit() {
    setFailure(undefined);
    const wrong = testNameProblem(name, taken);
    if (wrong !== undefined) {
      setProblem(wrong);
      field.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await save(name.trim());
      onSaved(name.trim());
    } catch (error) {
      setFailure(words.saveFailed(failureReason(error).replace(/\.$/, "")));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={words.saveTitle}
      size="md"
      form
      confirm={{ label: words.createTest, busyLabel: words.creatingTest }}
      retryLabel={words.tryAgain}
      busy={busy}
      {...(failure === undefined ? {} : { error: failure })}
      onConfirm={() => void submit()}
      onCancel={onCancel}
      returnFocus={returnFocus}
    >
      <Field label={words.nameField} error={problem ?? null}>
        <Input
          ref={field}
          autoFocus
          readOnly={busy}
          value={name}
          onFocus={(event) => event.target.select()}
          onChange={(event) => {
            setProblem(undefined);
            setName(event.target.value);
          }}
        />
      </Field>
    </Dialog>
  );
}
