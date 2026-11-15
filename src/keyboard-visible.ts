import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";

/** Native resize events and web visual viewport both leave space for writing. */
export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let disposed = false;
    if (Capacitor.isNativePlatform()) {
      const subscriptions = [
        Keyboard.addListener("keyboardWillShow", () => { if (!disposed) setVisible(true); }),
        Keyboard.addListener("keyboardWillHide", () => { if (!disposed) setVisible(false); }),
      ];
      return () => {
        disposed = true;
        for (const subscription of subscriptions) void subscription.then(handle => handle.remove()).catch(() => {});
      };
    }
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const element = document.activeElement;
      const editing = element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "range", "file"].includes(element.type)) || (element instanceof HTMLElement && element.isContentEditable);
      const shown = editing && viewport.scale === 1 && window.innerHeight - viewport.height > 140;
      setVisible(shown);
      document.documentElement.style.setProperty("--mobile-viewport-height", `${viewport.height}px`);
    };
    let frame = 0;
    const afterFocus = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    update();
    viewport.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", afterFocus);
    return () => {
      viewport.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", afterFocus);
      cancelAnimationFrame(frame);
      document.documentElement.style.removeProperty("--mobile-viewport-height");
    };
  }, []);
  return visible;
}
