# shell.search-page-names

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); search frames VK T2-F7 and T2-F26 (HAL-1494); microcopy 3.5 (HAL-751); C3 (HAL-991); `search.files.plain-text-is-literal`, `search.files.options-and-limit` and `search.studio.items-by-name-or-file` (req-search, HAL-110)

When words are searched on the Search page, the page shall list under "Names and descriptions" every item a search provider found whose name or description contains the words, each once. The page shall read the words as plain text, never as a pattern. Where "Match case" is on, the words shall match only with the same capitals; otherwise capitals shall not matter. Where "Whole word" is on, no letter or digit shall touch the words on either side. Where an item kind is picked in the In chip, or a hub in the Hub chip, the page shall list only items of that kind or hub, and the chips shall offer the kinds and hubs of every match. Items whose name matches shall come first, ranked as Ctrl K ranks names (the whole name, then its start, then a word's start, then anywhere) from where the words match under these options, then items whose description alone matches. An item found by more than one provider shall show once, with the first description any of them gave. When nothing matches, the page shall say that nothing matches, and offer to search all hubs while a hub is picked. If a search provider failed and nothing matches, then the page shall say that it couldn't search, not that nothing matches. Each search shall be its own place, whose tab reads "Search:" and the words, so Back brings back the words searched before.

## Examples

- Given agent "Refund checker" described "Checks refund requests against the policy." and agent "Mail triage" described "Sorts refund mail.",
  when the user searches for `refund`,
  then "Refund checker" is listed first with "Refund" highlighted in its name, then "Mail triage" with "refund" highlighted in its description.
- Given agent "Billing (EU)",
  when the user searches for `(EU)`,
  then "Billing (EU)" is listed, and a search for `workspace.yaml` doesn't list "workspaceXyaml".
- Given agents "Triage" and "triage helper",
  when the user searches for `triage` with "Match case" on,
  then only "triage helper" is listed.
- Given agents "refund Refund" and "Refund checker", in that order,
  when the user searches for `Refund` with "Match case" on,
  then "Refund checker" is listed first, and "refund Refund" has its second "Refund" highlighted.
- Given one provider found agent "Refund checker" with no description and another found it described "Checks requests against the policy.",
  when the user searches for `policy`,
  then "Refund checker" is listed once, with "policy" highlighted in its description.
- Given agent "Triaged mail",
  when the user searches for `triage` with "Whole word" on,
  then it isn't listed.
- Given agent "Refund checker" in hub "acme" and workflow "Refund flow" in hub "beta",
  when the user searches for `refund` with hub "beta" picked,
  then only "Refund flow" is listed, and the Hub chip offers "acme" and "beta".
- Given hub "beta" is picked and nothing in it matches `refnud`,
  when the user searches,
  then the page says that nothing matches and offers "Search all hubs".
- Given the only search provider fails,
  when the user searches for `refund`,
  then the page says that it couldn't search.
- Given the user searched for `refund`, then for `policy` in the same tab,
  when the user goes Back,
  then the tab reads "Search: refund" again.
