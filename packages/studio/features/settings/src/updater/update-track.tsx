import { Field, RadioGroup, type RadioOption, StatusChip } from "@halonicjs/studio-kit";
import * as text from "./about-text.ts";
import { isPreviewBuild, trackOf, type UpdateStatus, type UpdateTrack } from "./updater-status.ts";

const options: readonly RadioOption<UpdateTrack>[] = [
  { value: "stable", label: text.STABLE, note: text.STABLE_NOTE },
  { value: "preview", label: text.PREVIEW, note: text.PREVIEW_NOTE },
];

/** The props of {@link UpdateTrackField}. */
export interface UpdateTrackFieldProps {
  readonly status: UpdateStatus;
  readonly onPick: (track: UpdateTrack) => void;
}

/**
 * "Update track" under the automatic switch (`settings.about-update-track`). Stable picked on a
 * Preview build says the install stays put: Halonic never installs an older version. Scoop ships
 * Stable only, so a managed install has no track to pick.
 */
export function UpdateTrackField({ status, onPick }: UpdateTrackFieldProps) {
  if (status.managed !== null) return null;
  const track = trackOf(status);
  const { current } = status;
  return (
    <div className="flex flex-col gap-2">
      <Field label={text.TRACK}>
        <RadioGroup options={options} value={track} onChange={onPick} />
      </Field>
      {track === "stable" && isPreviewBuild(current) ? (
        <p className="text-small text-fg-muted">{text.stayOnPreview(current)}</p>
      ) : null}
    </div>
  );
}

/** The version's heading, with a neutral "Preview" chip while a Preview build runs. */
export function VersionHeading({
  level,
  version,
}: {
  readonly level: 2 | 3;
  readonly version: string;
}) {
  const Heading = `h${level}` as const;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Heading className="text-body font-medium">{text.versionHeading(version)}</Heading>
      {isPreviewBuild(version) ? <StatusChip tone="neutral">{text.PREVIEW_CHIP}</StatusChip> : null}
    </div>
  );
}
