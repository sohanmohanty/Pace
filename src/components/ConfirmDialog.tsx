import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Button } from "./ui";

/** Confirmation dialog on React Aria: focus trap, Escape, and scroll lock handled. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  tone = "danger"
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: "danger" | "primary";
}) {
  return (
    <ModalOverlay
      isOpen={open}
      onOpenChange={(o) => !o && onCancel()}
      isDismissable
      className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.15_0.02_240/0.45)] p-4 backdrop-blur-[2px] data-[entering]:animate-[rise_0.2s_ease-out]"
    >
      <Modal className="w-full max-w-sm outline-none">
        <Dialog role="alertdialog" className="card p-5 outline-none">
          <Heading slot="title" className="text-[1.2rem] leading-tight">
            {title}
          </Heading>
          <p className="mt-2 text-soft">{body}</p>
          <div className="mt-5 flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={onCancel} autoFocus>
              Cancel
            </Button>
            <Button variant={tone} className="flex-1" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
