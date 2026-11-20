export function getHardwareBackDestination(screen) {
  if (screen === 'game') return 'categories';
  if (screen === 'subcategories') return 'categories';
  if (screen === 'modes') return 'subcategories';
  return 'home';
}
