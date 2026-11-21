export function getHardwareBackDestination(screen) {
 if(screen==='subcategories')return 'categories';
 if(screen==='matchmaking')return 'categories';
 return 'home';
}
