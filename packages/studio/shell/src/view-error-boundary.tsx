import { Component, type ReactNode } from "react";

interface ViewErrorBoundaryState {
  /** The error the view threw, in an object, since a view may throw anything, even `undefined`. */
  readonly failed: { readonly error: unknown } | undefined;
}

/** Props for {@link ViewErrorBoundary}. */
export interface ViewErrorBoundaryProps {
  /** What stands in for the view once it failed. Without it, nothing does. */
  readonly fallback?: (error: unknown) => ReactNode;
  readonly children: ReactNode;
}

/**
 * Catches a feature's view that fails to load or draw, such as an import that fails or a
 * `ShellError` from `loadView` for a wrong view name, so one broken feature doesn't take
 * down the frame. Put one round each lazily loaded view, outside its `Suspense`.
 *
 * React reports every error a boundary catches with `console.error`, naming this boundary in
 * development, so the boundary doesn't log it again. React has no hook for this: an error
 * boundary is a class.
 *
 * @example
 * <ViewErrorBoundary>
 *   <Suspense fallback={null}><ItemView context={context} /></Suspense>
 * </ViewErrorBoundary>
 */
export class ViewErrorBoundary extends Component<ViewErrorBoundaryProps, ViewErrorBoundaryState> {
  override state: ViewErrorBoundaryState = { failed: undefined };

  static getDerivedStateFromError(error: unknown): ViewErrorBoundaryState {
    return { failed: { error } };
  }

  override render(): ReactNode {
    const { failed } = this.state;
    if (failed === undefined) {
      return this.props.children;
    }
    return this.props.fallback?.(failed.error) ?? null;
  }
}
