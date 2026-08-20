'use client';

import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

/**
 * Types `text` out one character at a time.
 *
 * @param text       Full string to reveal. `\n` is preserved, so the consumer
 *                   should render inside `whitespace-pre-wrap`.
 * @param speed      Milliseconds between characters.
 * @param startDelay Milliseconds to wait before the first character.
 *
 * Returns the visible slice and whether the animation has finished, so the caller
 * can drop the blinking caret once typing completes. With reduced motion the full
 * string is returned immediately and `done` is true from the first render.
 */
export function useTypewriter(text: string, speed = 38, startDelay = 600) {
  const reduced = usePrefersReducedMotion();
  const [count, setCount] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (reduced) {
      setCount(text.length);
      return;
    }

    // Guard against the effect re-running and rewinding a finished animation.
    if (startedRef.current) return;
    startedRef.current = true;

    let interval: ReturnType<typeof setInterval>;

    const timeout = setTimeout(() => {
      interval = setInterval(() => {
        setCount((c) => {
          if (c >= text.length) {
            clearInterval(interval);
            return c;
          }
          return c + 1;
        });
      }, speed);
    }, startDelay);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [text, speed, startDelay, reduced]);

  return { displayed: text.slice(0, count), done: count >= text.length };
}
