import { EmptyState, SkeletonBar, StatusChip } from "@halonicjs/studio-kit";
import { type KeyboardEvent, useId, useState } from "react";
import type { WorkflowConfiguration } from "../api.ts";
import type { Load } from "../page/use-workflow.ts";
import { type ConfigurationPage, configurationPages, pageForKey } from "./configuration-pages.ts";
import { configurationWords as words } from "./configuration-words.ts";
import { countProblems, problemRows } from "./problem-lines.ts";

/** Props for {@link Configuration}. */
export interface ConfigurationProps {
  /** The workflow's name, for the words while its settings load. */
  readonly name: string;
  readonly load: Load<WorkflowConfiguration>;
  readonly retry: () => void;
  /** Called when a problem's step is picked; the page goes to Flow with that card open. */
  readonly onOpenStep: (stepId: string) => void;
}

/**
 * The workflow's Configuration (`workflows.configuration`): a list of pages on the left (General,
 * Request form, Problems) and the picked page beside it, in side-label rows. It is read-only until
 * the save model's fields land.
 */
export function Configuration({ name, load, retry, onOpenStep }: ConfigurationProps) {
  const [page, setPage] = useState<ConfigurationPage>("general");
  const ids = useId();
  if (load.kind === "failed") {
    return (
      <EmptyState
        tone="error"
        title={words.loadFailedTitle(name)}
        description={load.reason}
        action={{ label: words.tryAgain, onClick: retry }}
      />
    );
  }
  const configuration = load.kind === "ready" ? load.value : undefined;
  const errors = configuration ? countProblems(configuration.problems).errors : 0;

  const onKeyDown = (event: KeyboardEvent) => {
    const next = pageForKey(page, event.key);
    if (next === undefined) return;
    event.preventDefault();
    setPage(next);
    document.getElementById(`${ids}-${next}`)?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1">
      <div
        role="tablist"
        aria-orientation="vertical"
        aria-label={words.pages}
        onKeyDown={onKeyDown}
        className="flex w-52 shrink-0 flex-col gap-1 border-e border-border px-2 py-4"
      >
        {configurationPages.map((one) => (
          <button
            key={one}
            id={`${ids}-${one}`}
            type="button"
            role="tab"
            aria-selected={page === one}
            aria-controls={`${ids}-panel`}
            tabIndex={page === one ? 0 : -1}
            onClick={() => setPage(one)}
            className={`focus-ring flex h-control-md items-center justify-between rounded-sm px-3 text-start text-body ${
              page === one ? "bg-accent-soft font-medium text-fg" : "text-fg-muted hover:text-fg"
            }`}
          >
            {words.pageNames[one]}
            {one === "problems" && errors > 0 && (
              <StatusChip tone="danger" shape="count" name={words.errors(errors)}>
                {errors}
              </StatusChip>
            )}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${ids}-panel`}
        aria-labelledby={`${ids}-${page}`}
        className="min-w-0 flex-1 overflow-auto p-6"
      >
        {configuration === undefined ? (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{words.loading(name)}</span>
            <SkeletonBar kind="value" />
            <SkeletonBar kind="value" />
          </div>
        ) : (
          <ConfigurationBody page={page} configuration={configuration} onOpenStep={onOpenStep} />
        )}
      </div>
    </div>
  );
}

/** A side-label row: the label in a column on the left, the value beside it. */
function Row({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="flex gap-6 border-b border-border py-4">
      <dt className="w-40 shrink-0 text-small text-fg-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-body">{children}</dd>
    </div>
  );
}

function ConfigurationBody({
  page,
  configuration,
  onOpenStep,
}: {
  readonly page: ConfigurationPage;
  readonly configuration: WorkflowConfiguration;
  readonly onOpenStep: (stepId: string) => void;
}) {
  if (page === "general") {
    return (
      <dl className="max-w-[744px]">
        <Row label={words.description}>
          {configuration.description ?? (
            <span className="text-fg-muted">{words.noDescription}</span>
          )}
          <p className="text-small text-fg-muted">{words.fileLater}</p>
        </Row>
        <Row label={words.firstStep}>{configuration.initial}</Row>
        <Row label={words.file}>
          <span className="text-fg-muted">{configuration.file}</span>
        </Row>
      </dl>
    );
  }
  if (page === "request-form") {
    const { request } = configuration;
    return (
      <dl className="max-w-[744px]">
        <Row label={words.inbox}>
          {request ? words.offered : words.notOffered}
          <p className="text-small text-fg-muted">{words.inboxLater}</p>
        </Row>
        {request && (
          <>
            <Row label={words.formTitle}>{request.label}</Row>
            <Row label={words.fields}>
              {request.fields.length === 0 ? (
                <span className="text-fg-muted">{words.noFields}</span>
              ) : (
                <ul className="flex flex-col gap-2">
                  {request.fields.map((field) => (
                    <li key={field.name} className="flex items-center gap-3">
                      <span>{field.name}</span>
                      <span className="text-small text-fg-muted">
                        {words.fieldTypes[field.type]}
                      </span>
                      {field.required && (
                        <span className="ms-auto text-small text-fg-muted">{words.required}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Row>
          </>
        )}
      </dl>
    );
  }
  const rows = problemRows(configuration.problems);
  if (rows.length === 0) return <p className="max-w-[744px] text-fg-muted">{words.noProblems}</p>;
  return (
    <ul className="flex max-w-[744px] flex-col divide-y divide-border">
      {rows.map((row, at) => (
        <li key={at} className="flex items-center gap-3 py-3">
          <span aria-hidden="true" className={row.severity === "error" ? "text-danger-text" : ""}>
            {row.glyph}
          </span>
          <span className="sr-only">{row.severity === "error" ? words.error : words.warning}:</span>
          <span>{row.text}</span>
          {row.stepId !== undefined && (
            <button
              type="button"
              aria-label={words.openStep(row.stepId)}
              className="focus-ring text-small text-accent-text underline"
              onClick={() => onOpenStep(row.stepId as string)}
            >
              {row.stepId}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
