import { useEffect, useRef } from "react";

/** Keep keyboard/native Back inside the topmost mobile overlay. */
export function useModalFocus(open: boolean, close: () => void) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open || !ref.current) return;
    const dialog = ref.current;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
        ),
      ).filter(
        (el) => el.getClientRects().length && !el.closest("[hidden], [inert]"),
      );
    const topmost = () =>
      Array.from(
        document.querySelectorAll(
          '[role="dialog"][aria-modal="true"], dialog[open]',
        ),
      ).at(-1) === dialog;
    (focusable()[0] ?? dialog).focus();
    const dismiss = (event: Event) => {
      if (!topmost()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeRef.current();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (!topmost()) return;
      if (event.key === "Escape") dismiss(event);
      if (event.key !== "Tab") return;
      const nodes = focusable();
      const first = nodes[0] ?? dialog,
        last = nodes.at(-1) ?? dialog;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", keyboard, true);
    window.addEventListener("mobile-dismiss-overlay", dismiss);
    return () => {
      window.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("mobile-dismiss-overlay", dismiss);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  return ref;
}
