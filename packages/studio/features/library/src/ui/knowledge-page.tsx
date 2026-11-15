import type { KnowledgeLookupMode } from "@halonicjs/app";
import { Button, EmptyState, Field, FormRows, RadioGroup } from "@halonicjs/studio-kit";
import { ItemGone, type ItemViewProps, PageBackLinkSlot } from "@halonicjs/studio-shell";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { KnowledgeHostService, type KnowledgeRef } from "../knowledge-host.ts";
import { KnowledgeModel } from "../knowledge-model.ts";
import { knowledgeWords } from "../knowledge-words.ts";
import { sharedHubKey } from "./library-place.tsx";
import { UsedByField } from "./used-by-field.tsx";

function refOf(hub: string, id: string): KnowledgeRef {
  return { hub: hub === sharedHubKey ? null : hub, id };
}

/**
 * The `knowledge` item kind's page: where the documents are, the summary, how agents look
 * things up (picking one saves at once) and who uses it (flow-library 5.2). The name has no
 * field: a source's name lives in its file.
 */
export function KnowledgePage({ item, context }: ItemViewProps) {
  const host = context.services.find(KnowledgeHostService);
  const model = useMemo(
    () => (host === undefined ? undefined : new KnowledgeModel(host, refOf(item.hub, item.id))),
    [host, item.hub, item.id],
  );
  if (model === undefined) {
    return <Gone context={context} />;
  }
  return (
    <LoadedKnowledgePage
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
      kindName={knowledgeWords.kindName}
      place={knowledgeWords.place}
      onGoTo={() => context.openPlace?.("library")}
    />
  );
}

function LoadedKnowledgePage({
  item,
  context,
  model,
}: Pick<ItemViewProps, "item" | "context"> & { readonly model: KnowledgeModel }) {
  const subscribe = useCallback((listener: () => void) => model.subscribe(listener), [model]);
  const { loaded, gone, unreadable, parts, source, usage } = useSyncExternalStore(
    subscribe,
    () => model.state,
  );

  if (gone) {
    return <Gone context={context} />;
  }
  if (!loaded) {
    return <p className="px-4 py-5 text-small text-fg-muted">{knowledgeWords.loading}</p>;
  }
  if (unreadable || parts === undefined) {
    return <EmptyState title={knowledgeWords.unreadable} />;
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 px-4 py-5 wide:px-6">
      <PageBackLinkSlot />
      <h1 tabIndex={-1} className="text-title [overflow-wrap:anywhere]">
        {parts.name || item.id}
      </h1>
      <FormRows>
        <Field
          label={knowledgeWords.source}
          align="text"
          hint={parts.writable ? knowledgeWords.writableNote : undefined}
        >
          <p className="[overflow-wrap:anywhere]">{source}</p>
        </Field>
        <Field label={knowledgeWords.summary} align="text">
          <p className="[overflow-wrap:anywhere]">{parts.summary || knowledgeWords.noSummary}</p>
          {parts.summary === "" ? null : (
            <Button variant="ghost" size="sm" onClick={() => void model.save({ summary: null })}>
              {knowledgeWords.removeSummary}
            </Button>
          )}
        </Field>
        <Field label={knowledgeWords.lookup}>
          <RadioGroup<KnowledgeLookupMode>
            options={[
              { value: "tools", label: knowledgeWords.lookupTools },
              { value: "auto", label: knowledgeWords.lookupAuto },
            ]}
            value={parts.mode}
            onChange={(mode) => void model.save({ mode })}
          />
        </Field>
        <UsedByField usage={usage} notUsed={knowledgeWords.notUsed} context={context} />
      </FormRows>
    </div>
  );
}
