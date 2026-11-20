import assert from 'node:assert/strict';
import test from 'node:test';
import { getHardwareBackDestination } from './navigation.js';

test('hardware Back follows the category, subcategory, and mode selection hierarchy', () => {
  assert.equal(getHardwareBackDestination('game'), 'categories');
  assert.equal(getHardwareBackDestination('subcategories'), 'categories');
  assert.equal(getHardwareBackDestination('modes'), 'subcategories');
  assert.equal(getHardwareBackDestination('profile'), 'home');
  assert.equal(getHardwareBackDestination('settings'), 'home');
});
