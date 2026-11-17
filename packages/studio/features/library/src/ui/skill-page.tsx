import type { SkillChange } from "@halonicjs/app";
import {
  Button,
  Callout,
  EmptyState,
  Field,
  FormRows,
  Input,
  TextArea,
} from "@halonicjs/studio-kit";
import { ItemGone, type ItemViewProps, PageBackLinkSlot } from "@halonicjs/studio-shell";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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

function refOf(hub: string, id: string): SkillRef {
  return { hub: hub === sharedHubKey ? null : hub, id };
}

/**
 * The `skill` item kind's page: Name, When to use it and Instructions, each saved when you leave
 * it; the header fields the page doesn't edit, read-only; the other files in the skill's folder;
 * and who uses it (flow-library 5.1). An emptied Name or When to use it keeps its old value with
 * a hint that stays until the next edit.
 */
export function SkillPage({ item, context }: ItemViewProps) {
  const host = context.services.find(SkillHostService);
  const model = useMemo(
    () => (host === undefined ? undefined : new SkillModel(host, refOf(item.hub, item.id))),
    [host, item.hub, item.id],
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

function SaveFailureLine({
  failure,
  onRetry,
}: {
  readonly failure: { readonly reason: string } | undefined;
  readonly onRetry: () => void;
}) {
  if (failure === undefined) return null;
  return (
    <Callout
      tone="danger"
      title={skillWords.saveFailed}
      action={{ label: skillWords.tryAgain, onClick: onRetry }}
    >
      {failure.reason}
    </Callout>
  );
}

function LoadedSkillPage({
  item,
  context,
  model,
}: Pick<ItemViewProps, "item" | "context"> & { readonly model: SkillModel }) {
  const subscribe = useCallback((listener: () => void) => model.subscribe(listener), [model]);
  const {
    loaded,
    failed,
    failureReason,
    gone,
    unreadable,
    parts,
    files,
    usage,
    kept,
    saveFailure,
  } = useSyncExternalStore(subscribe, () => model.state);
  const trash = useItemTrash(context, {
    kind: "skill",
    hub: item.hub === sharedHubKey ? null : item.hub,
    id: item.id,
    name: parts?.name || item.id,
    ...(usage === undefined ? {} : { usage }),
  });
  const [drafts, setDrafts] = useState<Drafts>({});
  const instructions = useRef<HTMLTextAreaElement>(null);
  const ready = loaded && !gone && !unreadable && parts !== undefined;
  // A skill just made in New skill opens with the cursor in Instructions, ready to write.
  useEffect(() => {
    if (ready && takeSkillInstructionsFocus(refOf(item.hub, item.id))) {
      instructions.current?.focus();
    }
  }, [ready, item.hub, item.id]);

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
    return <p className="px-4 py-5 text-small text-fg-muted">{skillWords.loading}</p>;
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
    if (field !== "instructions") model.edited(field);
  };
  const leave = async (field: Edited) => {
    const draft = drafts[field];
    if (draft === undefined) return;
    if (await model.leave({ [field]: draft })) {
      setDrafts(without(field));
    }
  };
  const retrySave = async () => {
    for (const field of Object.keys(drafts) as Edited[]) await leave(field);
  };
  const keptHint = (field: SkillField, text: string) => (kept.includes(field) ? text : undefined);

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 px-4 py-5 wide:px-6">
      <PageBackLinkSlot />
      <div className="flex items-start justify-between gap-2">
        <h1 ref={trash.titleRef} tabIndex={-1} className="text-title [overflow-wrap:anywhere]">
          {parts.name || item.id}
        </h1>
        {trash.menu}
      </div>
      <SaveFailureLine failure={saveFailure} onRetry={() => void retrySave()} />
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
            maxRows={24}
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
