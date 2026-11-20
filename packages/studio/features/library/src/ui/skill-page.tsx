import type { SkillChange } from "@halonicjs/app";
import {
  Button,
  EmptyState,
  Field,
  FormRows,
  Input,
  settleOnClose,
  TextArea,
} from "@halonicjs/studio-kit";
import { ItemGone, type ItemViewProps, PageBackLinkSlot } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { savingFor } from "../saving.ts";
import { takeSkillInstructionsFocus } from "../skill-focus-request.ts";
import { SkillHostService, type SkillRef } from "../skill-host.ts";
import { type SkillField, SkillModel } from "../skill-model.ts";
import { skillWords } from "../skill-words.ts";
import { useItemTrash } from "./item-trash.tsx";
import { sharedHubKey } from "./library-place.tsx";
import { LoadFailed } from "./load-failed.tsx";
import { UsedByField } from "./used-by-field.tsx";

type Edited = keyof SkillChange;
type Drafts = Partial<Record<Edited, string>>;
/** Instructions are saved this long after the last key, so a pause saves without waiting for Tab. */
const INSTRUCTIONS_SAVE_AFTER_MS = 800;
const editedFields: readonly Edited[] = ["name", "description", "instructions"];

function refOf(hub: string, id: string): SkillRef {
  return { hub: hub === sharedHubKey ? null : hub, id };
}

/**
 * The `skill` item kind's page: Name, When to use it and Instructions, each saved when you leave
 * it (Instructions also after a short pause in typing); the header fields the page doesn't edit,
 * read-only; the other files in the skill's folder; and who uses it (flow-library 5.1). An emptied
 * Name or When to use it keeps its old value with a hint that stays until the next edit.
 */
export function SkillPage({ item, context }: ItemViewProps) {
  const host = context.services.find(SkillHostService);
  const model = useMemo(
    () =>
      host === undefined
        ? undefined
        : new SkillModel(
            host,
            refOf(item.hub, item.id),
            savingFor(context.saving, `skill/${item.hub}/${item.id}`),
          ),
    [host, context.saving, item.hub, item.id],
  );
  if (model === undefined) {
    return <Gone context={context} />;
  }
  return (
    <LoadedSkillPage
      key={`${item.hub ?? ""}/${item.id}`}
      item={item}
      context={context}
      model={model}
    />
  );
}

function Gone({ context }: Pick<ItemViewProps, "context">) {
  return (
    <ItemGone
      kindName={skillWords.kindName}
      place={skillWords.place}
      onGoTo={() => context.openPlace?.("library")}
    />
  );
}

function LoadedSkillPage({
  item,
  context,
  model,
}: Pick<ItemViewProps, "item" | "context"> & { readonly model: SkillModel }) {
  const subscribe = useCallback((listener: () => void) => model.subscribe(listener), [model]);
  const { loaded, failed, failureReason, gone, unreadable, parts, files, usage, kept } =
    useSyncExternalStore(subscribe, () => model.state);
  const trash = useItemTrash(context, {
    kind: "skill",
    hub: item.hub === sharedHubKey ? null : item.hub,
    id: item.id,
    name: parts?.name || item.id,
    ...(usage === undefined ? {} : { usage }),
  });
  const [drafts, setDrafts] = useState<Drafts>({});
  const instructions = useRef<HTMLTextAreaElement>(null);
  const draftsNow = useRef<Drafts>(drafts);
  draftsNow.current = drafts;
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The latest `leave`, so the pause timer and leaving the page save what is typed now.
  const saveInstructions = useRef<() => void>(() => undefined);
  useEffect(
    () => () => {
      // Leaving the page with the cursor in Instructions saves what was typed.
      if (saveTimer.current !== undefined) {
        clearTimeout(saveTimer.current);
        saveInstructions.current();
      }
    },
    [],
  );
  const ready = loaded && !gone && !unreadable && parts !== undefined;
  // A skill just made in New skill opens with the cursor in Instructions, ready to write.
  useEffect(() => {
    if (ready && takeSkillInstructionsFocus(refOf(item.hub, item.id))) {
      instructions.current?.focus();
    }
  }, [ready, item.hub, item.id]);

  // A write that the window's Try again runs later never reaches `leave`, so a draft that now equals
  // the saved text is dropped here, and the field follows the file again (a change from outside shows).
  useEffect(() => {
    if (parts === undefined) return;
    setDrafts((current) => {
      const settled = editedFields.filter((field) => current[field] === parts[field]);
      return settled.length === 0
        ? current
        : settled.reduce((rest, field) => without(field)(rest), current);
    });
  }, [parts]);

  if (gone) {
    return trash.strip ?? <Gone context={context} />;
  }
  if (failed && !loaded) {
    return (
      <LoadFailed
        title={skillWords.couldntLoad}
        reason={failureReason}
        retryLabel={skillWords.tryAgain}
        context={context}
        onRetry={() => void model.refresh()}
      />
    );
  }
  if (!loaded) {
    return <p className="px-4 py-5 text-small text-fg-muted">{skillWords.loading(item.id)}</p>;
  }
  if (unreadable || parts === undefined) {
    return <EmptyState title={skillWords.unreadable} />;
  }

  const stored: Required<Drafts> = {
    name: parts.name,
    description: parts.description,
    instructions: parts.instructions,
  };
  const shown = (field: Edited) => drafts[field] ?? stored[field];
  const change = (field: Edited, value: string) => {
    setDrafts((current) => ({ ...current, [field]: value }));
    draftsNow.current = { ...draftsNow.current, [field]: value };
    if (field !== "instructions") {
      model.edited(field);
      return;
    }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveInstructions.current(), INSTRUCTIONS_SAVE_AFTER_MS);
  };
  const leaveField = async (field: Edited) => {
    if (field === "instructions") {
      clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
    }
    const draft = draftsNow.current[field];
    if (draft === undefined) return;
    if (await model.leave({ [field]: draft })) {
      // Keys typed while the write ran keep their draft.
      if (draftsNow.current[field] === draft) setDrafts(without(field));
    }
  };
  const leave = (field: Edited) => settleOnClose(leaveField(field));
  saveInstructions.current = () => void leave("instructions");
  const keptHint = (field: SkillField, text: string) => (kept.includes(field) ? text : undefined);

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 px-4 py-5 wide:px-6">
      <PageBackLinkSlot />
      <div className="flex items-start justify-between gap-2">
        <h1 ref={trash.titleRef} tabIndex={-1} className={trash.titleClassName}>
          {parts.name || item.id}
        </h1>
        {trash.menu}
      </div>
      <FormRows>
        <Field label={skillWords.name} hint={keptHint("name", skillWords.nameKept)}>
          <Input
            value={shown("name")}
            onChange={(event) => change("name", event.target.value)}
            onBlur={() => void leave("name")}
          />
        </Field>
        <Field
          label={skillWords.description}
          hint={
            <>
              {skillWords.descriptionHint}
              {kept.includes("description") ? (
                <>
                  <br />
                  {skillWords.descriptionKept}
                </>
              ) : null}
            </>
          }
        >
          <Input
            value={shown("description")}
            onChange={(event) => change("description", event.target.value)}
            onBlur={() => void leave("description")}
          />
        </Field>
        <Field label={skillWords.instructions} wide>
          <TextArea
            ref={instructions}
            value={shown("instructions")}
            minRows={8}
            maxRows={24}
            placeholder={skillWords.instructionsPlaceholder}
            onChange={(event) => change("instructions", event.target.value)}
            onBlur={() => void leave("instructions")}
          />
        </Field>
        {parts.otherHeader.length === 0 ? null : (
          <Field label={skillWords.otherHeader} align="text" hint={skillWords.otherHeaderHint}>
            <p className="[overflow-wrap:anywhere]">
              {parts.otherHeader.map((field) => `${field.key}: ${field.value}`).join(" · ")}
            </p>
          </Field>
        )}
        {files.length === 0 ? null : (
          <Field label={skillWords.files} align="text">
            <ul className="flex flex-wrap gap-x-3 gap-y-1">
              {files.map((file) => (
                <li key={file.id}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => context.openItem?.({ kind: "file", hub: item.hub, id: file.id })}
                  >
                    {file.label}
                  </Button>
                </li>
              ))}
            </ul>
          </Field>
        )}
        <UsedByField usage={usage} notUsed={skillWords.notUsed} context={context} />
      </FormRows>
    </div>
  );
}

function without(field: Edited) {
  return (drafts: Drafts): Drafts => {
    const { [field]: _left, ...rest } = drafts;
    return rest;
  };
}
