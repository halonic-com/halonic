import type { SkillChange } from "@halonicjs/app";
import { Button, EmptyState, Field, FormRows, Input, TextArea } from "@halonicjs/studio-kit";
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
import { sharedHubKey } from "./library-place.tsx";

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

function LoadedSkillPage({
  item,
  context,
  model,
}: Pick<ItemViewProps, "item" | "context"> & { readonly model: SkillModel }) {
  const subscribe = useCallback((listener: () => void) => model.subscribe(listener), [model]);
  const { loaded, gone, unreadable, parts, files, usage, kept } = useSyncExternalStore(
    subscribe,
    () => model.state,
  );
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
    return <Gone context={context} />;
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
  const keptHint = (field: SkillField, text: string) => (kept.includes(field) ? text : undefined);

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 px-4 py-5 wide:px-6">
      <PageBackLinkSlot />
      <h1 tabIndex={-1} className="text-title [overflow-wrap:anywhere]">
        {parts.name || item.id}
      </h1>
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
        <Field label={skillWords.usedBy} align="text">
          {usage === undefined || usage.agents.length === 0 ? (
            <p>{skillWords.notUsed}</p>
          ) : (
            <p>
              {usage.agents.map((agent, index) => (
                <Fragment key={`${agent.hub ?? ""}/${agent.id}`}>
                  {index === 0 ? null : " · "}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      context.openItem?.({
                        kind: "agent",
                        hub: agent.hub ?? sharedHubKey,
                        id: agent.id,
                      })
                    }
                  >
                    {agent.name}
                  </Button>
                </Fragment>
              ))}
            </p>
          )}
        </Field>
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
