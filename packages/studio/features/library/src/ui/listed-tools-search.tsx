import { Button, CloseIcon, Field, Input, SearchIcon } from "@halonicjs/studio-kit";
import { listedToolsWords } from "../listed-tools-words.ts";

/** Props for {@link ListedToolsSearch}. */
export interface ListedToolsSearchProps {
  readonly sourceName: string;
  readonly search: string;
  /** How many tools the search leaves on the screen, across every group. */
  readonly shownCount: number;
  readonly onSearch: (search: string) => void;
}

/**
 * The search over a long list of tools. It says how many tools it leaves, in a status line that
 * is read out, and offers Clear search when nothing matches.
 */
export function ListedToolsSearch({
  sourceName,
  search,
  shownCount,
  onSearch,
}: ListedToolsSearchProps) {
  const text = search.trim();
  return (
    <div className="flex flex-col gap-1 pb-2">
      <Field label={listedToolsWords.searchLabel(sourceName)}>
        <Input
          type="search"
          leadingIcon={<SearchIcon />}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          trailing={
            search === "" ? undefined : (
              <Button
                variant="ghost"
                size="sm"
                icon={<CloseIcon />}
                label={listedToolsWords.clearSearch}
                onClick={() => onSearch("")}
              />
            )
          }
        />
      </Field>
      <p role="status" className="text-small text-fg-muted [overflow-wrap:anywhere]">
        {statusLine(text, shownCount)}
      </p>
    </div>
  );
}

/** Nothing while there's no search; else how many tools it leaves, or that none match. */
function statusLine(text: string, shownCount: number): string {
  if (text === "") return "";
  return shownCount === 0
    ? listedToolsWords.noMatch(text)
    : listedToolsWords.searchCount(shownCount);
}
