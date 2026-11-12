/**
 * The Studio's shared kit: the design tokens and the base components. The tokens are CSS, not
 * TypeScript: import them from CSS with `@import "@halonicjs/studio-kit";` (see README.md). The
 * components arrive here one by one, each with its own named export.
 */

export {
  ActionBar,
  type ActionBarButton,
  type ActionBarNoteTone,
  type ActionBarProps,
  type ActionBarRow,
} from "./action-bar/action-bar.tsx";
export { type DecisionEvent, decisionRows } from "./action-bar/decision-rows.ts";
export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonUnavailable,
  type ButtonVariant,
} from "./button/button.tsx";
export { Spinner } from "./button/spinner.tsx";
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
export {
  ColourPopover,
  type ColourPopoverProps,
  type ColourPreset,
} from "./colour-popover/colour-popover.tsx";
export { parseHex } from "./colour-popover/hex.ts";
export {
  COMMAND_COPIED,
  COMMAND_NOT_COPIED,
  CommandBox,
  type CommandBoxProps,
} from "./command-box/command-box.tsx";
export {
  ClipboardProvider,
  type ClipboardProviderProps,
  useWriteClipboard,
  type WriteClipboard,
} from "./copy-button/clipboard.tsx";
export { COPIED_FOR_MS, CopyButton, type CopyButtonProps } from "./copy-button/copy-button.tsx";
export { copyText } from "./copy-button/copy-text.ts";
export { Dialog } from "./dialog/dialog.tsx";
export type {
  ConfirmingDialogProps,
  DialogConfirm,
  DialogProps,
  DialogSize,
  FooterlessDialogProps,
} from "./dialog/dialog-props.ts";
export {
  type ModalLiveRegion,
  type ModalLiveRegions,
  ModalRegionsProvider,
  type ModalRegionsProviderProps,
  type PushModalRegions,
} from "./dialog/modal-regions.tsx";
export { PaletteBox, type PaletteBoxProps } from "./dialog/palette-box.tsx";
export {
  Disclosure,
  type DisclosureProps,
  type DisclosureTone,
} from "./disclosure/disclosure.tsx";
export {
  EmptyState,
  type EmptyStateAction,
  type EmptyStateProps,
  type EmptyStateTone,
} from "./empty-state/empty-state.tsx";
export {
  ExternalLink,
  type ExternalLinkProps,
  inlineLinkClasses,
} from "./external-link/external-link.tsx";
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
  type FieldPrefix,
  type FieldProps,
  useFieldControl,
} from "./field/field.tsx";
export { FormRows, type FormRowsProps } from "./field/form-rows.tsx";
export {
  FilterChips,
  type FilterChipsOneOf,
  type FilterChipsProps,
  type FilterChipsToggles,
  type FilterOption,
  type FilterPicker,
  type FilterToggle,
} from "./filter-chips/filter-chips.tsx";
export {
  type GridCellProps,
  type GridNavigation,
  type GridPosition,
  type GridRow,
  useGridNavigation,
} from "./grid-navigation/use-grid-navigation.ts";
export {
  HeaderBadge,
  type HeaderBadgeButton,
  type HeaderBadgeMenu,
  type HeaderBadgeProps,
  headerBadgeMenuClasses,
} from "./header-badge/header-badge.tsx";
export {
  HeaderBadgeSheet,
  type HeaderBadgeSheetProps,
} from "./header-badge/header-badge-sheet.tsx";
export { IconTile, type IconTileProps } from "./icon-tile/icon-tile.tsx";
export { AlertIcon } from "./icons/alert-icon.tsx";
export { BackIcon } from "./icons/back-icon.tsx";
export { ChevronDownIcon } from "./icons/chevron-down-icon.tsx";
export { ChevronRightIcon } from "./icons/chevron-right-icon.tsx";
export { CloseIcon } from "./icons/close-icon.tsx";
export { DashedRingIcon } from "./icons/dashed-ring-icon.tsx";
export { ForwardIcon } from "./icons/forward-icon.tsx";
export { InfoIcon } from "./icons/info-icon.tsx";
export { MaximiseIcon } from "./icons/maximise-icon.tsx";
export { MenuIcon } from "./icons/menu-icon.tsx";
export { MoreIcon } from "./icons/more-icon.tsx";
export {
  PlaceIcon,
  type PlaceIconName,
  type PlaceIconProps,
  placeIconNames,
} from "./icons/place-icon.tsx";
export { PlusIcon } from "./icons/plus-icon.tsx";
export { RefreshIcon } from "./icons/refresh-icon.tsx";
export { RestoreIcon } from "./icons/restore-icon.tsx";
export { SearchIcon } from "./icons/search-icon.tsx";
export { WarningIcon } from "./icons/warning-icon.tsx";
export type { FieldSize } from "./input/field-box.ts";
export { Input, type InputProps } from "./input/input.tsx";
export type { InputLeadingButton } from "./input/leading-button.tsx";
export { TextArea, type TextAreaProps } from "./input/text-area.tsx";
export { Kbd, type KbdProps, keyShortcutsLabel } from "./kbd/kbd.tsx";
export { isComposing } from "./keyboard/is-composing.ts";
export {
  LineFrame,
  type LineFrameAction,
  type LineFrameProps,
} from "./line-frame/line-frame.tsx";
export type { ListEmpty } from "./list/empty-list.tsx";
export { List } from "./list/list.tsx";
export type {
  ListCell,
  ListColumn,
  ListColumnKind,
  ListColumnsRow,
  ListGroup,
  ListProps,
  ListRow,
  ListSelection,
} from "./list/list-props.ts";
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
export { LongText, type LongTextProps } from "./long-text/long-text.tsx";
export {
  ContextMenu,
  type ContextMenuProps,
  type ContextMenuTarget,
} from "./menu/context-menu.tsx";
export {
  isMenuItem,
  Menu,
  type MenuEntry,
  type MenuHeading,
  type MenuItem,
  type MenuProps,
  type MenuTriggerProps,
} from "./menu/menu.tsx";
export {
  PICKER_SEARCH_FROM,
  type PickerOption,
  PickerSheet,
  type PickerSheetProps,
} from "./picker-sheet/picker-sheet.tsx";
export {
  type Presentation,
  PresentationProvider,
  type PresentationProviderProps,
  usePresentation,
} from "./presentation/presentation.tsx";
export {
  RadioGroup,
  type RadioGroupProps,
  type RadioOption,
} from "./radio/radio-group.tsx";
export { SecretText } from "./secret-text/secret-text.ts";
export { Select, type SelectOption, type SelectProps } from "./select/select.tsx";
export { SheetFrame, type SheetFrameProps } from "./sheet/sheet-frame.tsx";
export { SidePanel, type SidePanelProps } from "./side-panel/side-panel.tsx";
export {
  SkeletonBar,
  type SkeletonBarKind,
  type SkeletonBarProps,
  type SkeletonBarWidth,
} from "./skeleton-bar/skeleton-bar.tsx";
export { Slider, type SliderProps, type SliderUnavailable } from "./slider/slider.tsx";
export {
  StatusChip,
  type StatusChipProps,
  type StatusChipTone,
} from "./status-chip/status-chip.tsx";
export { Switch, type SwitchProps, type SwitchUnavailable } from "./switch/switch.tsx";
export {
  type Tab,
  type TabCount,
  type TabIds,
  TabList,
  type TabListProps,
  TabPanel,
  type TabPanelProps,
  Tabs,
  type TabsProps,
  useTabIds,
} from "./tabs/tabs.tsx";
export { TextSheet, type TextSheetProps } from "./text-sheet/text-sheet.tsx";
export {
  TOAST_CLOSES_AFTER_MS,
  TOAST_WITH_ACTION_CLOSES_AFTER_MS,
} from "./toast/toast-card.tsx";
export {
  ToastStoreProvider,
  type ToastStoreProviderProps,
  useToastStore,
} from "./toast/toast-provider.tsx";
export { TOASTS_SHOWN, ToastRegion, type ToastRegionProps } from "./toast/toast-region.tsx";
export {
  createToastStore,
  type Toast,
  type ToastAction,
  type ToastMessage,
  type ToastStore,
  type ToastTone,
} from "./toast/toast-store.ts";
export {
  TOOLTIP_DELAY_MS,
  Tooltip,
  type TooltipAnchorProps,
  type TooltipOptions,
  type TooltipParts,
  type TooltipProps,
  type TooltipTriggerProps,
  useTooltip,
} from "./tooltip/tooltip.tsx";
export { ViewOnlyLine, type ViewOnlyLineProps } from "./view-only-line/view-only-line.tsx";
export { Window, WindowBar, type WindowBarProps, type WindowProps } from "./window/window.tsx";

/** The npm name of this package. */
export const packageName = "@halonicjs/studio-kit";

/**
 * Below this width (in CSS pixels) the Studio uses its phone layout, the same width as the
 * `phone:` variant in theme-utilities.css. For the shell's `matchMedia("(width < 600px)")`; a
 * media query can't read a CSS variable, so the number lives in both places and a test keeps them
 * equal.
 */
export const PHONE_MAX_WIDTH = 600;

/**
 * From this width (in CSS pixels) the desktop shows its full layout; between `PHONE_MAX_WIDTH`
 * and this it is the narrow window, with the sidebar as a drawer (component specs 24.4). The same
 * width as `--breakpoint-wide` in theme.css, kept equal by a test.
 */
export const WIDE_MIN_WIDTH = 900;
