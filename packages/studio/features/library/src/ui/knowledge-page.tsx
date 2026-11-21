import type { KnowledgeLookupMode } from "@halonicjs/app";
import { EmptyState, Field, FormRows, RadioGroup } from "@halonicjs/studio-kit";
import {
  engineWordsOf,
  ItemGone,
  type ItemViewProps,
  PageBackLinkSlot,
} from "@halonicjs/studio-shell";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { KnowledgeHostService, type KnowledgeRef } from "../knowledge-host.ts";
import { KnowledgeModel } from "../knowledge-model.ts";
import { knowledgeWords } from "../knowledge-words.ts";
import { savingFor } from "../saving.ts";
import { useItemTrash } from "./item-trash.tsx";
import { sharedHubKey } from "./library-place.tsx";
import { LoadFailed } from "./load-failed.tsx";
import { SummaryField } from "./summary-field.tsx";
import { UsedByField } from "./used-by-field.tsx";

/** The command that opens Models (`workspace.open-models`); the library only runs it by id. */
const openModelsCommand = "workspace.open-models";

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
    () =>
      host === undefined
        ? undefined
        : new KnowledgeModel(
            host,
            refOf(item.hub, item.id),
            savingFor(context.saving, `knowledge/${item.hub}/${item.id}`),
          ),
    [host, context.saving, item.hub, item.id],
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
  const { loaded, failed, failureReason, gone, unreadable, parts, source, usage, summarize } =
    useSyncExternalStore(subscribe, () => model.state);

  const trash = useItemTrash(context, {
    kind: "knowledge",
    hub: item.hub === sharedHubKey ? null : item.hub,
    id: item.id,
    name: parts?.name || item.id,
    ...(usage === undefined ? {} : { usage }),
  });
  const announce = useCallback(
    (text: string) => context.announcer.announceState("knowledge-summary", text),
    [context.announcer],
  );
  const runCommand = context.runCommand;
  const openModels =
    runCommand === undefined ? undefined : () => void runCommand(openModelsCommand);

  if (gone) {
    return trash.strip ?? <Gone context={context} />;
  }
  if (failed && !loaded) {
    return (
      <LoadFailed
        title={knowledgeWords.couldntLoad}
        reason={failureReason}
        retryLabel={knowledgeWords.tryAgain}
        context={context}
        onRetry={() => void model.refresh()}
      />
    );
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
      <div className="flex items-start justify-between gap-2">
        <h1 ref={trash.titleRef} tabIndex={-1} className={trash.titleClassName}>
          {parts.name || item.id}
        </h1>
        {trash.menu}
      </div>
      <FormRows>
        <Field label={knowledgeWords.source} align="text">
          <p className="[overflow-wrap:anywhere]">{source}</p>
        </Field>
        <SummaryField
          model={model}
          name={parts.name || item.id}
          summary={parts.summary}
          summarize={summarize}
          announce={announce}
          openModels={openModels}
          notAnswering={engineWordsOf(context).notAnswering}
        />
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
