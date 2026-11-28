const INTERACTIVE_CONTROL_SELECTOR = 'button, a, [role="button"], [role="switch"], [role="tab"]';

export function isUiClickTarget(target) {
  const control = target?.closest?.(INTERACTIVE_CONTROL_SELECTOR);
  if (!control || control.disabled === true) return false;
  return control.getAttribute?.('aria-disabled') !== 'true';
}

export function playUiClick(audio) {
  if (!audio || typeof audio.play !== 'function') return;
  try {
    audio.currentTime = 0;
    const playback = audio.play();
    if (playback && typeof playback.catch === 'function') {
      void playback.catch(() => {});
    }
  } catch {
    // Browser autoplay restrictions must never interrupt the game UI.
  }
}
