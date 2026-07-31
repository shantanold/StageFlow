import { ReactNode, MouseEvent } from "react";
import { createPortal } from "react-dom";

interface ModalOverlayProps {
  children: ReactNode;
  onClose?: () => void;
  /** Extra class names on the overlay (e.g. for tests). */
  className?: string;
}

/**
 * Renders a full-screen modal dimmer on document.body.
 *
 * Modals inside `.page-scroll` lose to the fixed tab bar on iOS Safari:
 * the tab bar's `transform` creates a stacking context that paints above
 * in-page `position: fixed` overlays, hiding Save/Cancel behind the blur.
 * Portaling escapes that trap.
 */
export function ModalOverlay({ children, onClose, className }: ModalOverlayProps) {
  function handleOverlayClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose?.();
  }

  return createPortal(
    <div
      className={className ? `modal-overlay ${className}` : "modal-overlay"}
      onClick={onClose ? handleOverlayClick : undefined}
      role="presentation"
    >
      {children}
    </div>,
    document.body,
  );
}
