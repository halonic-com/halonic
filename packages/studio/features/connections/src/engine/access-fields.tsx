import { Field, Input } from "@halonicjs/studio-kit";
import * as words from "../server-engine-words.ts";

/** A Cloudflare Access service token as typed. */
export interface AccessInput {
  readonly clientId: string;
  readonly clientSecret: string;
}

/**
 * The two optional Access fields (HAL-19107), for a server behind Cloudflare Access. The secret is
 * masked, and neither value is read back from the host: an update starts from empty fields.
 */
export function AccessFields(props: {
  readonly value: AccessInput;
  readonly onChange: (value: { clientId: string; clientSecret: string }) => void;
  readonly readOnly: boolean;
  readonly error: string | null;
}) {
  const { value, onChange, readOnly } = props;
  return (
    <>
      <Field label={words.ACCESS_ID_LABEL} hint={words.ACCESS_HINT} error={props.error}>
        <Input
          mono
          readOnly={readOnly}
          value={value.clientId}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onChange({ ...value, clientId: event.target.value })}
        />
      </Field>
      <Field label={words.ACCESS_SECRET_LABEL}>
        <Input
          mono
          type="password"
          readOnly={readOnly}
          value={value.clientSecret}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onChange({ ...value, clientSecret: event.target.value })}
        />
      </Field>
    </>
  );
}
