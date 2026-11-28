import test from 'node:test';
import assert from 'node:assert/strict';
import { isUiClickTarget, playUiClick } from './uiClickAudio.js';

const selector = 'button, a, [role="button"], [role="switch"], [role="tab"]';

test('recognizes enabled interactive controls as click-sound targets', () => {
  const control = { disabled: false, getAttribute: () => null };
  const target = { closest: (value) => value === selector ? control : null };
  assert.equal(isUiClickTarget(target), true);
});

test('ignores disabled and aria-disabled controls', () => {
  const disabled = { disabled: true, getAttribute: () => null };
  const ariaDisabled = { disabled: false, getAttribute: () => 'true' };
  assert.equal(isUiClickTarget({ closest: () => disabled }), false);
  assert.equal(isUiClickTarget({ closest: () => ariaDisabled }), false);
});

test('ignores clicks that did not originate in an interactive control', () => {
  assert.equal(isUiClickTarget({ closest: () => null }), false);
  assert.equal(isUiClickTarget(null), false);
});

test('restarts the short click sound and safely handles rejected playback', async () => {
  let plays = 0;
  const audio = {
    currentTime: 0.7,
    play() {
      plays += 1;
      return Promise.reject(new Error('autoplay blocked'));
    },
  };
  playUiClick(audio);
  assert.equal(audio.currentTime, 0);
  assert.equal(plays, 1);
  await Promise.resolve();
});

test('does nothing when audio is unavailable', () => {
  assert.doesNotThrow(() => playUiClick(null));
  assert.doesNotThrow(() => playUiClick({}));
});
