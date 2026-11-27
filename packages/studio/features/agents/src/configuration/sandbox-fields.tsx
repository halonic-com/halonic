import { Button, Input } from "@halonicjs/studio-kit";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import type { AgentChange, AgentSettings } from "../api.ts";
import { ReviewMark } from "../review/review-marks.tsx";
import { configurationWords } from "./configuration-words.ts";
import { type ChipWords, OptionChips } from "./option-chips.tsx";

const words = configurationWords.sandboxFields;

const siteWords: ChipWords = {
  add: words.addSite,
  addName: words.addSite,
  newItem: words.newSite,
  remove: words.removeSite,
};

/** Props for {@link SandboxFields}. */
export interface SandboxFieldsProps {
  readonly settings: AgentSettings;
  /** Saves one change; resolves to whether it was written. */
  readonly save: (change: AgentChange) => Promise<boolean>;
}

/**
 * The Harness page's fields from the agent's file that say what its program may touch (flow-agents
 * 5.3): the one folder it writes to, with **Change…**, and the sites it may reach, as a chip list.
 * Each saves when it changes; the host refuses a folder or site the sandbox can't give, and the
 * page says why, as for any save that fails.
 */
export function SandboxFields({ settings, save }: SandboxFieldsProps) {
  return (
    <div className="flex flex-col gap-6">
      <ReviewMark agent={settings} field="workingFolder">
        <WorkingFolder folder={settings.workingFolder} save={save} />
      </ReviewMark>
      <ReviewMark agent={settings} field="allowedSites">
        <AllowedSites sites={settings.allowedSites} save={save} />
      </ReviewMark>
    </div>
  );
}

interface WorkingFolderProps {
  readonly folder: string;
  readonly save: (change: AgentChange) => Promise<boolean>;
}

/** The working folder as text with **Change…**, which turns it into a box until it is saved. */
function WorkingFolder({ folder, save }: WorkingFolderProps) {
  const headingId = useId();
  const [editing, setEditing] = useState(false);
  const changeButton = useRef<HTMLButtonElement>(null);
  const close = () => {
    setEditing(false);
    queueMicrotask(() => changeButton.current?.focus());
  };
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <h2 id={headingId} className="text-caption text-fg-muted">
        {words.workingFolder}
      </h2>
      {editing ? (
        <FolderBox folder={folder} save={save} close={close} />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <code className="font-mono text-code text-fg">{folder}</code>
          <Button
            ref={changeButton}
            variant="secondary"
            size="sm"
            aria-describedby={headingId}
            onClick={() => setEditing(true)}
          >
            {words.change}
          </Button>
        </div>
      )}
    </section>
  );
}

interface FolderBoxProps {
  readonly folder: string;
  readonly save: (change: AgentChange) => Promise<boolean>;
  /** Puts the folder's text and **Change…** back. */
  readonly close: () => void;
}

/**
 * The box for a new working folder, focused when it opens. Enter or leaving the box saves what
 * was typed and closes it; a folder the host refused stays in the box. Esc closes it unsaved.
 */
function FolderBox({ folder, save, close }: FolderBoxProps) {
  const box = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(folder);
  // Enter saves, and the blur that closing the box may cause must not save a second time.
  const finished = useRef(false);

  useEffect(() => {
    box.current?.focus();
  }, []);

  const commit = async () => {
    if (finished.current) return;
    const next = draft.trim();
    if (next === "" || next === folder) {
      finished.current = true;
      close();
      return;
    }
    finished.current = true;
    const saved = await save({ workingFolder: next });
    if (saved) close();
    else finished.current = false;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit();
    } else if (event.key === "Escape") {
      // Esc closes the box only, not the panel around it.
      event.preventDefault();
      event.stopPropagation();
      finished.current = true;
      close();
    }
  };

  return (
    <div className="max-w-md">
      <Input
        ref={box}
        size="sm"
        mono
        aria-label={words.workingFolder}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => void commit()}
      />
    </div>
  );
}

interface AllowedSitesProps {
  readonly sites: readonly string[];
  readonly save: (change: AgentChange) => Promise<boolean>;
}

/**
 * The allowed sites as a chip list. Adding or removing one saves the whole list at once, and the
 * list goes back to the saved one when the save fails, as the harness choice does.
 */
function AllowedSites({ sites, save }: AllowedSitesProps) {
  const headingId = useId();
  const noSitesId = useId();
  const [shown, setShown] = useState(sites);
  useEffect(() => setShown(sites), [sites]);
  // Counts the changes, so a slow failed save doesn't undo a newer one.
  const newestChange = useRef(0);
  const change = async (next: readonly string[]) => {
    const mine = ++newestChange.current;
    setShown(next);
    const saved = await save({ allowedSites: next });
    if (!saved && mine === newestChange.current) setShown(sites);
  };
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <h2 id={headingId} className="text-caption text-fg-muted">
        {words.allowedSites}
      </h2>
      {shown.length === 0 && (
        <p id={noSitesId} className="text-small text-fg-muted">
          {words.noSites}
        </p>
      )}
      <OptionChips
        label={words.allowedSites}
        options={shown}
        describedBy={shown.length === 0 ? noSitesId : undefined}
        onChange={(next) => void change(next)}
        chipWords={siteWords}
      />
    </section>
  );
}
