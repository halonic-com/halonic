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
  AgentOrb,
  type AgentOrbProps,
  type AgentOrbSize,
  type AgentOrbState,
  characterPairOf,
} from "./agent-orb/agent-orb.tsx";
export {
  type AppGlyphShape,
  type AppLogoId,
  appGlyphScale,
  appGlyphs,
  appLogoIds,
} from "./app-logo/app-glyphs.ts";
export { AppLogo, type AppLogoProps } from "./app-logo/app-logo.tsx";
export { type AgentTint, agentTint } from "./avatar/agent-tint.ts";
export { AuthorLine, type AuthorLineProps } from "./avatar/author-line.tsx";
export { Avatar, type AvatarProps, type AvatarSize } from "./avatar/avatar.tsx";
export { type PictureRead, type Pictures, usePictures } from "./avatar/use-pictures.ts";
export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonUnavailable,
  type ButtonVariant,
  OnTintContext,
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
export { type DoneLabel, useDoneLabel } from "./callout/done-label.ts";
export { Card, type CardProps, type CardState } from "./card/card.tsx";
export type { ChatAction } from "./chat/chat-actions.tsx";
export {
  ChatBoxLine,
  type ChatBoxLineProps,
  type ChatBoxLineTone,
} from "./chat/chat-box-line.tsx";
export { ChatComposer, type ChatComposerProps } from "./chat/chat-composer.tsx";
export {
  ChatEndLine,
  type ChatEndLineProps,
  type ChatEndLineTone,
} from "./chat/chat-end-line.tsx";
export { ChatLoading, type ChatLoadingProps } from "./chat/chat-loading.tsx";
export { ChatMessage, type ChatMessageProps } from "./chat/chat-message.tsx";
export type { ChatComposerPicker, ChatPickerOption } from "./chat/chat-picker.tsx";
export { ChatStart, type ChatStartProps } from "./chat/chat-start.tsx";
export { ChatText, type ChatTextProps } from "./chat/chat-text.tsx";
export {
  ChatToolLine,
  type ChatToolLineProps,
  type ChatToolState,
} from "./chat/chat-tool-line.tsx";
export { ChatTranscript, type ChatTranscriptProps } from "./chat/chat-transcript.tsx";
export { ChatUi, type ChatUiProps } from "./chat/chat-ui.tsx";
export {
  BUTTONS_LINE,
  buttonSentLine,
  type ChatUiSend,
  EARLIER_LINE,
  FORM_LINE,
  FORM_SENT_LINE,
} from "./chat/chat-ui-controls.tsx";
export { CHAT_UI_ROWS_SHOWN } from "./chat/chat-ui-parts.tsx";
export {
  Checkbox,
  type CheckboxProps,
  type CheckboxUnavailable,
} from "./checkbox/checkbox.tsx";
export { CodeDisplay, type CodeDisplayProps } from "./code-display/code-display.tsx";
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
export { ContentHeader, type ContentHeaderProps } from "./content-header/content-header.tsx";
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
  DialogAlternative,
  DialogCancelReason,
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
  useModalPolite,
} from "./dialog/modal-regions.tsx";
export { useModalOpen } from "./dialog/open-modals.ts";
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
  isWebAddress,
  standaloneLinkClasses,
} from "./external-link/external-link.tsx";
export {
  type ExternalAddress,
  type OpenExternal,
  OpenExternalProvider,
  type OpenExternalProviderProps,
  openInNewTab,
  useOpenExternal,
  useOpenSignIn,
} from "./external-link/open-external.tsx";
export {
  Field,
  type FieldControl,
  type FieldPrefix,
  type FieldProps,
  useFieldControl,
} from "./field/field.tsx";
export {
  type FieldAnnounce,
  FieldAnnounceProvider,
  type FieldAnnounceProviderProps,
  useFieldAnnounce,
  useFieldErrorAnnouncement,
} from "./field/field-announce.tsx";
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
export { type HaloPreset, haloPresets } from "./halo-presets.ts";
export { HalonicMark, type HalonicMarkProps } from "./halonic-mark/halonic-mark.tsx";
export {
  HeaderBadge,
  type HeaderBadgeButton,
  type HeaderBadgeMenu,
  type HeaderBadgePhoneLine,
  type HeaderBadgeProps,
  type HeaderBadgeStatus,
  type HeaderBadgeStatusTone,
  headerBadgeMenuClasses,
} from "./header-badge/header-badge.tsx";
export {
  HeaderBadgeSheet,
  type HeaderBadgeSheetProps,
} from "./header-badge/header-badge-sheet.tsx";
export { HeaderBadgeSheetDialog } from "./header-badge/header-badge-sheet-dialog.tsx";
export { IconTile, type IconTileProps } from "./icon-tile/icon-tile.tsx";
export { AddReactionIcon } from "./icons/add-reaction-icon.tsx";
export { AlertIcon } from "./icons/alert-icon.tsx";
export { BackIcon } from "./icons/back-icon.tsx";
export { BarsIcon } from "./icons/bars-icon.tsx";
export { ChevronDownIcon } from "./icons/chevron-down-icon.tsx";
export { ChevronRightIcon } from "./icons/chevron-right-icon.tsx";
export { CloseIcon } from "./icons/close-icon.tsx";
export { DashedRingIcon } from "./icons/dashed-ring-icon.tsx";
export { FileIcon } from "./icons/file-icon.tsx";
export { ForwardIcon } from "./icons/forward-icon.tsx";
export { HandIcon } from "./icons/hand-icon.tsx";
export { HelpIcon } from "./icons/help-icon.tsx";
export { InfoIcon } from "./icons/info-icon.tsx";
export { KindIcon, type KindIconName } from "./icons/kind-icon.tsx";
export { LaptopIcon } from "./icons/laptop-icon.tsx";
export { LockIcon } from "./icons/lock-icon.tsx";
export { MaximiseIcon } from "./icons/maximise-icon.tsx";
export { MenuIcon } from "./icons/menu-icon.tsx";
export { MoreIcon } from "./icons/more-icon.tsx";
export { OpenAsTabIcon } from "./icons/open-as-tab-icon.tsx";
export { PeopleIcon } from "./icons/people-icon.tsx";
export {
  PlaceIcon,
  type PlaceIconName,
  type PlaceIconProps,
  placeIconNames,
} from "./icons/place-icon.tsx";
export { PlusIcon } from "./icons/plus-icon.tsx";
export { RefreshIcon } from "./icons/refresh-icon.tsx";
export { RestoreIcon } from "./icons/restore-icon.tsx";
export { RunningIcon } from "./icons/running-icon.tsx";
export { SearchIcon } from "./icons/search-icon.tsx";
export {
  SectionIcon,
  type SectionIconName,
  sectionIconNames,
} from "./icons/section-icon.tsx";
export { SettingsIcon } from "./icons/settings-icon.tsx";
export { ShieldIcon } from "./icons/shield-icon.tsx";
export { SparkIcon } from "./icons/spark-icon.tsx";
export { TickIcon } from "./icons/tick-icon.tsx";
export { UnreadIcon } from "./icons/unread-icon.tsx";
export { UpdateReadyIcon } from "./icons/update-ready-icon.tsx";
export { WarningIcon } from "./icons/warning-icon.tsx";
export type { FieldSize, FieldWidth } from "./input/field-box.ts";
export { Input, type InputProps } from "./input/input.tsx";
export type { InputLeadingButton } from "./input/leading-button.tsx";
export { TextArea, type TextAreaProps } from "./input/text-area.tsx";
export { Kbd, type KbdProps, keyShortcutsLabel } from "./kbd/kbd.tsx";
export { isComposing } from "./keyboard/is-composing.ts";
export {
  LetterTile,
  type LetterTileProps,
  type LetterTileSize,
} from "./letter-tile/letter-tile.tsx";
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
  ListRowAction,
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
  type ListHeadingTone,
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
export { breakableAtSeparators, MiddleCut, middleCutAt } from "./middle-cut/middle-cut.tsx";
export {
  type EnterMove,
  type EnterOptions,
  enter,
  flip,
  leave,
  type SwapDirection,
  swap,
} from "./motion/motion.ts";
export { NoteLines, type NoteLinesProps } from "./note-lines/note-lines.tsx";
export { settleOnClose, settlePendingSaves } from "./pending-saves/pending-saves.ts";
export { type PhoneTab, PhoneTabBar } from "./phone-tab-bar/phone-tab-bar.tsx";
export {
  PICKER_SEARCH_FROM,
  type PickerOption,
  PickerSheet,
  type PickerSheetProps,
} from "./picker-sheet/picker-sheet.tsx";
export {
  PlainList,
  type PlainListProps,
  PlainRow,
  type PlainRowAction,
  type PlainRowProps,
} from "./plain-list/plain-list.tsx";
export type { PlainRowUnread } from "./plain-list/unread-mark.tsx";
export { PHONE_MAX_WIDTH, WIDE_MIN_WIDTH } from "./presentation/breakpoints.ts";
export {
  NarrowProvider,
  type NarrowProviderProps,
  type Presentation,
  PresentationProvider,
  type PresentationProviderProps,
  useNarrow,
  usePresentation,
} from "./presentation/presentation.tsx";
export { QrTile, type QrTileProps } from "./qr-tile/qr-tile.tsx";
export {
  answerLabels,
  type FormAnswer,
  type FormQuestion,
} from "./question-form/question-answers.ts";
export {
  QuestionForm,
  type QuestionFormProps,
  questionFormWords,
} from "./question-form/question-form.tsx";
export {
  RadioGroup,
  type RadioGroupProps,
  type RadioOption,
} from "./radio/radio-group.tsx";
export { RailButton, type RailButtonProps } from "./rail-button/rail-button.tsx";
export { SecretText } from "./secret-text/secret-text.ts";
export { Select, type SelectOption, type SelectProps } from "./select/select.tsx";
export { MAX_SERIES, OTHER_NAME, type Series } from "./series-chart/series.ts";
export { SeriesChart, type SeriesChartProps } from "./series-chart/series-chart.tsx";
export {
  type SetupStep,
  type SetupStepCheck,
  SetupSteps,
  type SetupStepsProps,
} from "./setup-steps/setup-steps.tsx";
export {
  PanelSheetDialog,
  type PanelSheetDialogProps,
} from "./sheet/panel-sheet-dialog.tsx";
export { SheetFrame, type SheetFrameProps } from "./sheet/sheet-frame.tsx";
export { SidePanel, type SidePanelProps } from "./side-panel/side-panel.tsx";
export { FramedPanel, framedPanelClass, SidebarFrame } from "./sidebar-frame/sidebar-frame.tsx";
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
export type { TabOrientation } from "./tabs/tab-keys.ts";
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
export { sizeText } from "./text/file-size.ts";
export { type MarkdownBlock, type MarkdownInline, readMarkdown } from "./text/markdown.ts";
export { questionBody, questionTitle } from "./text/question-text.ts";
export { fullTime, shortTime } from "./text/short-time.ts";
export {
  calendarDay,
  clockTime,
  decidedAt,
  endedAgo,
  isLate,
  movesOnLine,
  movesOnMeta,
  waitingFor,
  waitingSince,
} from "./text/waiting-time.ts";
export { TextSheet, type TextSheetProps } from "./text-sheet/text-sheet.tsx";
export {
  FormatLocaleProvider,
  type FormatLocaleProviderProps,
  followedFormat,
  formatTag,
  useFormatLocale,
} from "./time-stamp/format-locale.tsx";
export { TimeStamp, type TimeStampProps } from "./time-stamp/time-stamp.tsx";
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
export { TrashStrip, type TrashStripProps } from "./trash-strip/trash-strip.tsx";
export { ViewOnlyLine, type ViewOnlyLineProps } from "./view-only-line/view-only-line.tsx";
export {
  useWaitedMs,
  WAITING_LINE_AFTER_MS,
  WAITING_REASON_AFTER_MS,
  WaitingLine,
  type WaitingLineAction,
  type WaitingLinePlacement,
  type WaitingLineProps,
  type WaitingLineRoom,
  waitedTime,
} from "./waiting-line/waiting-line.tsx";
export { Window, WindowBar, type WindowBarProps, type WindowProps } from "./window/window.tsx";

/** The npm name of this package. */
export const packageName = "@halonicjs/studio-kit";

export {
  MONTH_COUNT,
  type Month,
  MonthBars,
  type MonthBarsProps,
} from "./month-bars/month-bars.tsx";
