import assert from 'node:assert/strict';
import test from 'node:test';
import {getHardwareBackDestination} from './navigation.js';
test('hardware Back follows category selection without modes',()=>{assert.equal(getHardwareBackDestination('subcategories'),'categories');assert.equal(getHardwareBackDestination('matchmaking'),'categories');assert.equal(getHardwareBackDestination('modes'),'home');assert.equal(getHardwareBackDestination('profile'),'home');});
