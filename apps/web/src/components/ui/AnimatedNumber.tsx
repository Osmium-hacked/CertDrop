import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { useEffect } from 'react';

/** Counts smoothly to each new value; jumps straight there when the OS asks for reduced motion. */
export function AnimatedNumber({ value }: { value: number }) {
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(value);
  const display = useTransform(motionValue, (v) => Math.round(v).toLocaleString());

  useEffect(() => {
    if (reduceMotion) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, { duration: 0.6, ease: 'easeOut' });
    return () => controls.stop();
  }, [value, reduceMotion, motionValue]);

  return <motion.span className="tabular-nums">{display}</motion.span>;
}
