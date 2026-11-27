import assert from 'node:assert/strict';
import test from 'node:test';
import { getHardwareBackDestination } from './navigation.js';

test('hardware Back follows the explicit screen hierarchy', () => {
  assert.equal(getHardwareBackDestination('categories'), 'home');
  assert.equal(getHardwareBackDestination('subcategories'), 'categories');
  assert.equal(getHardwareBackDestination('matchmaking'), 'categories');
  assert.equal(getHardwareBackDestination('language'), 'settings');
  assert.equal(getHardwareBackDestination('settings'), 'home');
  assert.equal(getHardwareBackDestination('profile'), 'home');
  assert.equal(getHardwareBackDestination('rankings'), 'home');
  assert.equal(getHardwareBackDestination('store'), 'home');
  assert.equal(getHardwareBackDestination('modes'), 'home');
});

test('unknown screens have a safe Home fallback', () => {
  assert.equal(getHardwareBackDestination('unknown-screen'), 'home');
});
