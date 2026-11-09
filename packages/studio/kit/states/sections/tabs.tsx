import { type Tab, Tabs } from "../../src/tabs/tabs.tsx";
import { FlowIcon, ListIcon, SlidersIcon } from "../icons.tsx";
import type { PartSection } from "../state-table.tsx";

type View = "flow" | "configuration" | "runs";

interface SampleTabsProps {
  /** Configuration counts two errors. */
  readonly errors?: boolean;
  /** Runs can't be opened. */
  readonly runsDisabled?: boolean;
}

/** The sheet's two Tabs: inline with words, then fill with icons, Flow selected in both. */
function SampleTabs({ errors = false, runsDisabled = false }: SampleTabsProps) {
  const count = errors ? { count: { value: 2, tone: "danger", name: "2 errors" } as const } : {};
  const inline: Tab<View>[] = [
    { id: "flow", label: "Flow" },
    { id: "configuration", label: "Configuration", ...count },
    { id: "runs", label: "Runs", disabled: runsDisabled },
  ];
  const fill: Tab<View>[] = [
    { id: "flow", label: "Flow", icon: <FlowIcon /> },
    { id: "configuration", label: "Setup", icon: <SlidersIcon />, ...count },
    { id: "runs", label: "Runs", icon: <ListIcon />, disabled: runsDisabled },
  ];
  const ignore = () => undefined;
  return (
    // 384px on desktop, so a fill tab holds "Setup" and its count on one line, as on the sheet.
    <div className="flex w-96 flex-col items-start gap-3 phone:w-full">
      <Tabs label="Workflow views" tabs={inline} selected="flow" onSelect={ignore} fill={false}>
        {null}
      </Tabs>
      <div className="w-full">
        <Tabs label="Workflow views" tabs={fill} selected="flow" onSelect={ignore} fill>
          {null}
        </Tabs>
      </div>
    </div>
  );
}

/** Hover and focus go on the second tab of each Tabs, as on the sheet. */
const secondTab = '[role="tab"]:nth-child(2)';

export const tabsSection: PartSection = {
  id: "tabs",
  number: "5",
  name: "Tabs",
  order:
    "kit 5 · top to bottom: inline, then fill with icons. Hover, focus and error are on the second tab",
  notApplicable: "read-only, busy",
  rows: [
    { name: "Default", copies: () => <SampleTabs /> },
    { name: "Hover", force: "hover", target: secondTab, copies: () => <SampleTabs /> },
    { name: "Focus", force: "focus", target: secondTab, copies: () => <SampleTabs /> },
    { name: "Disabled", copies: () => <SampleTabs runsDisabled /> },
    { name: "Error", copies: () => <SampleTabs errors /> },
  ],
};
