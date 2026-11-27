const HARDWARE_BACK_DESTINATIONS = Object.freeze({
  categories: 'home',
  language: 'settings',
  matchmaking: 'categories',
  modes: 'home',
  profile: 'home',
  rankings: 'home',
  settings: 'home',
  store: 'home',
  subcategories: 'categories',
});

export function getHardwareBackDestination(screen) {
  return HARDWARE_BACK_DESTINATIONS[screen] ?? 'home';
}
