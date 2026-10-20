import { useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 600;
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Counts smoothly to each new value; jumps straight there when the OS asks for reduced motion.
 * A plain requestAnimationFrame tween: importing framer-motion's animation engine here would pull
 * it into the initial bundle just for a counter.
 */
export function AnimatedNumber({ value }: { value: number }) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const shown = useRef(value);

  useEffect(() => {
    const from = shown.current;
    if (from === value) return;
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const progress = reduceMotion ? 1 : Math.min(1, (now - start) / DURATION_MS);
      shown.current = from + (value - from) * easeOut(progress);
      setDisplay(shown.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value, reduceMotion]);

  return <span className="tabular-nums">{Math.round(display).toLocaleString()}</span>;
}
