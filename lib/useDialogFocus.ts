/**
 * @module useDialogFocus
 * @description Shared focus management for modal dialogs: move focus into the
 *              dialog on open, trap Tab inside it, and restore focus to the
 *              trigger on close. `IncidentTimeline` and the Kwik 112 voice
 *              station both need exactly this; extracting it here is what stops
 *              the two dialogs solving the same accessibility problem two
 *              different ways (or one of them not solving it at all).
 *
 *              The hook owns the dialog container ref. Spread it onto the
 *              element that has `role="dialog"`, give that element `tabIndex={-1}`
 *              and `onKeyDown={onKeyDown}`, and the rest is automatic. `open`
 *              gates the focus effect so a dialog that mounts already-open still
 *              gets initial focus and restore-on-unmount.
 */

'use client';

import { useCallback, useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogFocus(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Move focus into the dialog on open; return it to the trigger on close.
  // Focus directly rather than via requestAnimationFrame: the ref is already
  // attached when this post-commit effect runs, and rAF callbacks are throttled
  // in a backgrounded tab, which would leave focus stranded on the trigger.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;
    // Focus the dialog container so a screen reader lands on the labelled dialog.
    dialogRef.current?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        // Trap focus inside the dialog so Tab cycles within it.
        const root = dialogRef.current;
        if (!root) return;
        const focusable = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey) {
          if (active === first || active === root) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose],
  );

  return { dialogRef, onKeyDown };
}
