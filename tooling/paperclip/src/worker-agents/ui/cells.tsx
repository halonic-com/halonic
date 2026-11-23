import { StatusBadge } from "@paperclipai/plugin-sdk/ui";
import type { CheckLink, RuleCheck, RuleName } from "../rule-checks.ts";
import { badgeStatus, checkWords, ruleHeaders } from "./check-view.ts";
import { taskHref } from "./view.ts";

/**
 * Table cells shared by the Worker agents page's rows (HAL-16249, HAL-16250).
 * Each check reads "Problem", "Check" or "OK", then its link and the reason
 * (HAL-16208, section 3.3); a check that couldn't run is plain text, never a badge.
 */

/** Visually hidden, still read by screen readers. */
export const hidden = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
} as const;

/** A task's key, as a link when the company's prefix is known; `extra` is read after the key. */
export function TaskLink({
  identifier,
  companyPrefix,
  extra,
  describedBy,
}: {
  readonly identifier: string;
  readonly companyPrefix: string | null;
  readonly extra?: string;
  readonly describedBy?: string;
}) {
  const href = taskHref(companyPrefix, identifier);
  const label = (
    <>
      {identifier}
      {extra === undefined ? null : <span style={hidden}>{extra}</span>}
    </>
  );
  return href === undefined ? (
    <span aria-describedby={describedBy}>{label}</span>
  ) : (
    <a href={href} aria-describedby={describedBy}>
      {label}
    </a>
  );
}

function FindingLink({
  link,
  companyPrefix,
  extra,
  describedBy,
}: {
  readonly link: CheckLink;
  readonly companyPrefix: string | null;
  readonly extra: string;
  readonly describedBy: string;
}) {
  if (link.kind === "task") {
    return (
      <TaskLink
        identifier={link.identifier}
        companyPrefix={companyPrefix}
        extra={extra}
        describedBy={describedBy}
      />
    );
  }
  return (
    <a href={link.url} aria-describedby={describedBy}>
      <span style={hidden}>PR </span>#{link.number}
      <span style={hidden}>{extra}</span>
    </a>
  );
}

/** One check's cell: its result, then for each thing to fix the link and the reason. */
export function CheckCell({
  agent,
  rule,
  check,
  companyPrefix,
}: {
  readonly agent: string;
  readonly rule: RuleName;
  readonly check: RuleCheck | undefined;
  readonly companyPrefix: string | null;
}) {
  if (check === undefined || check.status === "unavailable" || check.status === "not_checked") {
    const status = check?.status ?? "unavailable";
    return (
      <td>
        <em>{checkWords[status]}</em>
        {check?.reason === undefined ? null : `, ${check.reason}`}
      </td>
    );
  }
  const extra = `, ${agent}, ${ruleHeaders[rule].toLowerCase()}`;
  const idBase = `check-${agent}-${rule}`.replace(/\W+/g, "-");
  return (
    <td>
      <StatusBadge label={checkWords[check.status]} status={badgeStatus[check.status]} />
      {check.reason === undefined ? null : <div>{check.reason}</div>}
      {check.findings.map((finding, index) => (
        <div key={`${idBase}-${index}`} style={{ lineHeight: "24px" }}>
          <FindingLink
            link={finding.link}
            companyPrefix={companyPrefix}
            extra={extra}
            describedBy={`${idBase}-${index}`}
          />{" "}
          <span id={`${idBase}-${index}`}>{finding.reason}</span>
        </div>
      ))}
    </td>
  );
}
