export const listTransition = {
  type: 'spring',
  stiffness: 360,
  damping: 28,
  mass: 0.8,
};

export const itemVariants = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.98 },
};
