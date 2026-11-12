import assert from 'node:assert/strict';
import test from 'node:test';
import { getHardwareBackDestination } from './navigation.js';

test('Gameplay hardware Back returns to Categories; all other secondary screens return Home', () => {
  assert.equal(getHardwareBackDestination('game'), 'categories');
  for (const screen of ['splash', 'categories', 'modes', 'results', 'profile', 'rankings', 'settings', 'language', 'store']) {
    assert.equal(getHardwareBackDestination(screen), 'home', `${screen} Back destination changed`);
  }
});
