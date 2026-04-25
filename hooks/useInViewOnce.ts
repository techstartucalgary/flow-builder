'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Fires once when the target element enters the viewport.
 *
 * @param threshold  – fraction of the element visible (0–1)  default 0.15
 * @returns [ref, hasBeenSeen]
 */
export function useInViewOnce<T extends HTMLElement = HTMLDivElement>(
  threshold = 0.15,
): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null) as React.RefObject<T>;
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;

    if (typeof window === 'undefined') return;
    // Never let sections remain hidden if observer support/behavior is inconsistent.
    const visibilityFailSafe = window.setTimeout(() => setSeen(true), 900);

    if (!('IntersectionObserver' in window)) {
      clearTimeout(visibilityFailSafe);
      setSeen(true);
      return;
    }

    try {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            clearTimeout(visibilityFailSafe);
            setSeen(true);
            observer.disconnect();
          }
        },
        { threshold },
      );

      observer.observe(el);
      return () => {
        clearTimeout(visibilityFailSafe);
        observer.disconnect();
      };
    } catch {
      clearTimeout(visibilityFailSafe);
      setSeen(true);
      return;
    }
  }, [threshold, seen]);

  return [ref, seen];
}
