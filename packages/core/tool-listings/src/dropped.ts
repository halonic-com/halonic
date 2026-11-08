/** Why the rebuild drops a keyword or an entry. The tool is still offered without it. */
export class Dropped {
  /** The reason, as a refusal shows it. It never repeats the listing's text. */
  readonly why: string;

  /** @param why - the reason, which never repeats the listing's text */
  constructor(why: string) {
    this.why = why;
  }
}

/** A kept keyword whose value doesn't have the shape JSON Schema defines. */
export const wrongShape = new Dropped("its value has the wrong shape");

/** Thrown inside the rebuild when the whole tool must be refused. */
export class ParametersRefused extends Error {}
