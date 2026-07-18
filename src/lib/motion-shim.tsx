// Lightweight framer-motion replacement. Only implements what the app uses:
// - motion.div  (accepts initial/animate/exit/transition/whileHover/whileTap and ignores them, keeping className/style/children/onClick)
// - AnimatePresence (pass-through)
import * as React from "react";

type AnyProps = Record<string, any>;

const FRAMER_PROPS = new Set([
  "initial", "animate", "exit", "transition", "variants",
  "whileHover", "whileTap", "whileFocus", "whileInView", "whileDrag",
  "layout", "layoutId", "drag", "dragConstraints", "dragElastic",
  "onAnimationStart", "onAnimationComplete", "onHoverStart", "onHoverEnd",
  "onTap", "onTapStart", "onTapCancel", "custom", "viewport",
]);

function stripFramerProps(props: AnyProps) {
  const clean: AnyProps = {};
  for (const k in props) if (!FRAMER_PROPS.has(k)) clean[k] = props[k];
  return clean;
}

const makeTag = (tag: string) =>
  React.forwardRef<any, AnyProps>((props, ref) =>
    React.createElement(tag, { ...stripFramerProps(props), ref })
  );

export const motion: any = new Proxy(
  {},
  {
    get: (_t, tag: string) => makeTag(tag),
  }
);

export const AnimatePresence: React.FC<{ children?: React.ReactNode; mode?: string }> = ({ children }) => <>{children}</>;

export default { motion, AnimatePresence };
