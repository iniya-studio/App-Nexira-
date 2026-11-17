export function isMatchDeadlineReached(deadlineAt, now = Date.now()) {
  if (typeof deadlineAt !== 'string' || !deadlineAt) return false;
  const deadline = Date.parse(deadlineAt);
  return Number.isFinite(deadline) && deadline <= now;
}
