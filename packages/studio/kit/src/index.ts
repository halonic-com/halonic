/**
 * The Studio's shared kit: the design tokens and the base components. The tokens are CSS, not
 * TypeScript: import them from CSS with `@import "@halonicjs/studio-kit";` (see README.md). The
 * components arrive here one by one, each with its own named export.
 */

export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonUnavailable,
  type ButtonVariant,
} from "./button/button.tsx";
export {
  CALLOUT_FILES_SHOWN,
  Callout,
  type CalloutAction,
  type CalloutHandle,
  type CalloutProps,
  type CalloutTone,
} from "./callout/callout.tsx";
export { Card, type CardProps, type CardState } from "./card/card.tsx";
export {
  Checkbox,
  type CheckboxProps,
  type CheckboxUnavailable,
} from "./checkbox/checkbox.tsx";
export { COPIED_FOR_MS, CopyButton, type CopyButtonProps } from "./copy-button/copy-button.tsx";
export { Dialog } from "./dialog/dialog.tsx";
export type { DialogConfirm, DialogProps, DialogSize } from "./dialog/dialog-props.ts";
export {
  EmptyState,
  type EmptyStateAction,
  type EmptyStateProps,
  type EmptyStateTone,
} from "./empty-state/empty-state.tsx";
export { ExternalLink, type ExternalLinkProps } from "./external-link/external-link.tsx";
export {
  type ExternalAddress,
  type OpenExternal,
  OpenExternalProvider,
  type OpenExternalProviderProps,
  openInNewTab,
  useOpenExternal,
} from "./external-link/open-external.tsx";
export {
  Field,
  type FieldControl,
  type FieldProps,
  useFieldControl,
} from "./field/field.tsx";
export {
  type GridCellProps,
  type GridNavigation,
  type GridPosition,
  type GridRow,
  useGridNavigation,
} from "./grid-navigation/use-grid-navigation.ts";
export { IconTile, type IconTileProps } from "./icon-tile/icon-tile.tsx";
export type { FieldSize } from "./input/field-box.ts";
export { Input, type InputProps } from "./input/input.tsx";
export { TextArea, type TextAreaProps } from "./input/text-area.tsx";
export { Kbd, type KbdProps, keyShortcutsLabel } from "./kbd/kbd.tsx";
export { isComposing } from "./keyboard/is-composing.ts";
export type { ListEmpty } from "./list/empty-list.tsx";
export { List } from "./list/list.tsx";
export type { ListProps, ListRow, ListSelection } from "./list/list-props.ts";
export {
  type ListSkeletonShape,
  SKELETON_AFTER_MS,
  STILL_LOADING_AFTER_MS,
} from "./list/list-skeleton.tsx";
export {
  ListHeading,
  type ListHeadingLayout,
  type ListHeadingProps,
} from "./list-heading/list-heading.tsx";
export {
  type Presentation,
  PresentationProvider,
  type PresentationProviderProps,
  usePresentation,
} from "./presentation/presentation.tsx";
export { SecretText } from "./secret-text/secret-text.ts";
export {
  SkeletonBar,
  type SkeletonBarKind,
  type SkeletonBarProps,
  type SkeletonBarWidth,
} from "./skeleton-bar/skeleton-bar.tsx";
export {
  StatusChip,
  type StatusChipProps,
  type StatusChipTone,
} from "./status-chip/status-chip.tsx";
export { type Tab, type TabCount, Tabs, type TabsProps } from "./tabs/tabs.tsx";
export { Window, WindowBar, type WindowBarProps, type WindowProps } from "./window/window.tsx";

/** The npm name of this package. */
export const packageName = "@halonicjs/studio-kit";

/**
 * Below this width (in CSS pixels) the Studio uses its phone layout, the same width as the
 * `phone:` variant in theme.css. For the shell's `matchMedia("(width < 600px)")`; a media query
 * can't read a CSS variable, so the number lives in both places and a test keeps them equal.
 */
export const PHONE_MAX_WIDTH = 600;
