import {
  EmptyState,
  SkeletonBar,
  type Tab,
  TabList,
  TabPanel,
  usePresentation,
  useTabIds,
} from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { WorkflowConfiguration } from "../api.ts";
import type { Load } from "../page/use-load.ts";
import { type ConfigurationPage, configurationPages } from "./configuration-pages.ts";
import { configurationWords as words } from "./configuration-words.ts";
import { countProblems, problemRows } from "./problem-lines.ts";

/** Props for {@link Configuration}. */
export interface ConfigurationProps {
  /** The workflow's name, for the words while its settings load. */
  readonly name: string;
  readonly load: Load<WorkflowConfiguration>;
  readonly retry: () => void;
  /** The page that starts picked; General when absent. */
  readonly startOn?: ConfigurationPage | undefined;
  /** The Tests page, which loads its own cases. */
  readonly tests: ReactNode;
  /** Called when a problem's step is picked; the page goes to Flow with that card open. */
  readonly onOpenStep: (stepId: string) => void;
}

/**
 * The workflow's Configuration (`workflows.configuration`): a list of pages on the left (General,
 * Request form, Tests, Problems) and the picked page beside it, in side-label rows. It is read-only until
 * the save model's fields land. On a phone the list goes across the top instead and the rows put the
 * label above the value, so the page keeps the full width (`workflows.configuration.pages-phone`).
 */
export function Configuration({
  name,
  load,
  retry,
  tests,
  startOn = "general",
  onOpenStep,
}: ConfigurationProps) {
  const [page, setPage] = useState<ConfigurationPage>(startOn);
  const ids = useTabIds();
  const phone = usePresentation() === "phone";
  const pageList = useFocusOnProblems(startOn === "problems" && load.kind === "ready");
  if (load.kind === "failed") {
    return (
      <EmptyState
        tone="error"
        title={words.loadFailedTitle(name)}
        description={load.reason}
        action={{ label: words.tryAgain, onClick: retry, busy: load.retrying }}
      />
    );
  }
  const configuration = load.kind === "ready" ? load.value : undefined;
  const pages = configuration === undefined ? [] : pageTabs(configuration);

  return (
    <div className={phone ? "flex min-h-0 flex-1 flex-col" : "flex min-h-0 flex-1"}>
      <div
        ref={pageList}
        className={
          phone
            ? "border-b border-border px-4 py-3"
            : "w-52 shrink-0 border-e border-border px-2 py-4"
        }
      >
        {configuration === undefined ? (
          <div aria-hidden="true" className={phone ? "flex gap-1" : "flex flex-col gap-1"}>
            {configurationPages.map((one) => (
              <div
                key={one}
                className={
                  phone
                    ? "flex h-control-md flex-1 items-center px-3"
                    : "flex h-control-md items-center px-3"
                }
              >
                <SkeletonBar kind="meta" width="1/2" />
              </div>
            ))}
          </div>
        ) : (
          <TabList
            label={words.pages}
            orientation={phone ? "horizontal" : "vertical"}
            tabs={pages}
            selected={page}
            onSelect={setPage}
            ids={ids}
          />
        )}
      </div>
      <TabPanel ids={ids} tabs={pages} selected={page} className="min-w-0 flex-1 overflow-auto p-6">
        {configuration === undefined ? (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{words.loading(name)}</span>
            <SkeletonBar kind="value" />
            <SkeletonBar kind="value" />
          </div>
        ) : (
          <div className={page === "tests" ? undefined : "max-w-column"}>
            <ConfigurationBody
              page={page}
              configuration={configuration}
              tests={tests}
              onOpenStep={onOpenStep}
            />
          </div>
        )}
      </TabPanel>
    </div>
  );
}

/**
 * Puts the focus on the picked page in the page list once, when `ready`: Configuration opened on
 * Problems by the start card's **Open Problems**, which closes the card the focus was in, so it
 * would fall to the page's body (C471-5). A moment later, after the shell focused the page's heading
 * as the tab showed. Returns the ref for the element that holds the page list.
 */
function useFocusOnProblems(ready: boolean) {
  const pageList = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  useEffect(() => {
    if (!ready || focused.current) return;
    const timer = window.setTimeout(() => {
      focused.current = true;
      pageList.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ready]);
  return pageList;
}

/** The list's tabs; Problems carries the number of errors, read as "Problems, 1 error". */
function pageTabs(configuration: WorkflowConfiguration): readonly Tab<ConfigurationPage>[] {
  const errors = countProblems(configuration.problems).errors;
  return configurationPages.map((one) => ({
    id: one,
    label: words.pageNames[one],
    ...(one === "problems" && errors > 0
      ? { count: { value: errors, tone: "danger", name: words.errors(errors) } as const }
      : {}),
  }));
}

/** A side-label row: the label in a column on the left, the value beside it; on a phone the label is above it. */
function Row({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  const phone = usePresentation() === "phone";
  return (
    <div
      className={
        phone
          ? "flex flex-col gap-1 border-b border-border py-4"
          : "flex gap-6 border-b border-border py-4"
      }
    >
      <dt className={phone ? "text-small text-fg-muted" : "w-40 shrink-0 text-small text-fg-muted"}>
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-body wrap-anywhere">{children}</dd>
    </div>
  );
}

function ConfigurationBody({
  page,
  configuration,
  tests,
  onOpenStep,
}: {
  readonly page: ConfigurationPage;
  readonly configuration: WorkflowConfiguration;
  readonly tests: ReactNode;
  readonly onOpenStep: (stepId: string) => void;
}) {
  if (page === "general") {
    return (
      <dl>
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
      <dl>
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
                      {field.type !== undefined && (
                        <span className="text-small text-fg-muted">
                          {words.fieldTypes[field.type]}
                        </span>
                      )}
                      {field.required === true && (
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
  if (page === "tests") return tests;
  const rows = problemRows(configuration.problems);
  if (rows.length === 0) return <p className="text-fg-muted">{words.noProblems}</p>;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {rows.map((row, at) => (
        <li key={at} className="flex items-center gap-3 py-3">
          <span aria-hidden="true" className={row.severity === "error" ? "text-danger" : ""}>
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
