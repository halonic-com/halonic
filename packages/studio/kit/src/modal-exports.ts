// The dialogs part of the public API of @halonicjs/studio-kit, re-exported by `index.ts` to keep
// that file under the size limit.
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
  BlockingDialog,
  type BlockingDialogProps,
} from "./sign-in-needed/blocking-dialog.tsx";
export {
  SignInBand,
  type SignInBandProps,
  SignInModal,
  type SignInModalProps,
  type SignInRowItem,
  type SignInRowProgress,
} from "./sign-in-needed/sign-in-prompt.tsx";
