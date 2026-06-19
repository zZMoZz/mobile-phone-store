import { useEffect } from 'react';

/**
 * Keeps a scan/search input focused so a keyboard-wedge scanner always works
 * without clicking. While `active` is true it focuses the element on mount and
 * returns focus whenever it drops to a non-interactive area (focus lands on
 * document.body — e.g. the user clicked empty space inside a modal). It does
 * NOT steal focus when the user intentionally moves to another field/button.
 *
 * @param {React.RefObject<HTMLElement>} ref  the input to keep focused
 * @param {boolean} active                    whether the behavior is enabled
 */
export function useStickyFocus(ref, active = true) {
  useEffect(() => {
    if (!active) return undefined;

    const focus = () => ref.current?.focus();
    const initial = setTimeout(focus, 0);

    const refocusIfIdle = () => {
      // Defer so document.activeElement reflects where focus actually landed.
      setTimeout(() => {
        const el = document.activeElement;
        if (!el || el === document.body) focus();
      }, 0);
    };

    document.addEventListener('focusout', refocusIfIdle);
    return () => {
      clearTimeout(initial);
      document.removeEventListener('focusout', refocusIfIdle);
    };
  }, [ref, active]);
}
