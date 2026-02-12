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

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, seen]);

  return [ref, seen];
}
