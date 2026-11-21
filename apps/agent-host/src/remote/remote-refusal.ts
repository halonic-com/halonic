/**
 * Remote refused a step that its rules don't allow now: remote isn't offered,
 * no phone waits for Allow, or the pairing has ended. The routes answer it as
 * 409, apart from a failure such as a profile file that can't be written.
 */
export class RemoteRefusal extends Error {
  override readonly name = "RemoteRefusal";
}
