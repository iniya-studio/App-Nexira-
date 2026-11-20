export const CATEGORY_CATALOG = Object.freeze([
  { id: 'gaming', icon: 'gamepad', tone: 'cyan', subcategories: ['famous-games', 'game-characters', 'esports', 'studios', 'gaming-history'] },
  { id: 'movies-tv', icon: 'film', tone: 'purple', subcategories: ['movies', 'tv-series', 'actors', 'characters', 'awards'] },
  { id: 'music', icon: 'music', tone: 'pink', subcategories: ['pop', 'rock', 'hip-hop-rap', 'k-pop', 'artists-bands'] },
  { id: 'sports', icon: 'trophy', tone: 'gold', subcategories: ['football', 'basketball', 'combat-sports', 'world-competitions', 'famous-athletes'] },
  { id: 'technology', icon: 'cpu', tone: 'cyan', subcategories: ['ai', 'mobile-gadgets', 'computers', 'internet', 'technology-companies'] },
  { id: 'internet-social-media', icon: 'globe', tone: 'purple', subcategories: ['youtube', 'streamers', 'social-networks', 'popular-memes', 'internet-trends'] },
  { id: 'anime-manga', icon: 'sparkles', tone: 'pink', subcategories: ['anime-series', 'characters', 'manga', 'studios', 'japanese-world'] },
  { id: 'superheroes-comics', icon: 'shield', tone: 'gold', subcategories: ['marvel', 'dc', 'superheroes', 'comics', 'antiheroes'] },
  { id: 'geography', icon: 'globe', tone: 'cyan', subcategories: ['countries', 'cities', 'flags', 'landmarks', 'world-wonders'] },
  { id: 'history', icon: 'landmark', tone: 'purple', subcategories: ['civilizations', 'kingdoms', 'wars', 'revolutions', 'historical-figures'] },
  { id: 'space', icon: 'rocket', tone: 'pink', subcategories: ['solar-system', 'planets', 'space-missions', 'space-agencies', 'discoveries'] },
  { id: 'science', icon: 'atom', tone: 'gold', subcategories: ['physics', 'chemistry', 'biology', 'inventions', 'scientists'] },
  { id: 'cars-motorsports', icon: 'car', tone: 'cyan', subcategories: ['car-brands', 'supercars', 'motorcycles', 'formula-one', 'racing'] },
  { id: 'animals-nature', icon: 'paw-print', tone: 'purple', subcategories: ['animals', 'oceans', 'forests', 'nature', 'animal-records'] },
  { id: 'food-drinks', icon: 'utensils', tone: 'pink', subcategories: ['world-cuisines', 'fast-food', 'desserts', 'beverages', 'food-brands'] },
  { id: 'art-design', icon: 'palette', tone: 'gold', subcategories: ['painting', 'architecture', 'photography', 'design', 'famous-artworks'] },
  { id: 'books-stories', icon: 'book-open', tone: 'cyan', subcategories: ['novels', 'authors', 'fantasy', 'science-fiction', 'fictional-characters'] },
  { id: 'culture-lifestyle', icon: 'users', tone: 'purple', subcategories: ['national-cultures', 'festivals', 'traditions', 'fashion', 'lifestyle'] },
  { id: 'brands-business', icon: 'briefcase', tone: 'pink', subcategories: ['global-brands', 'companies', 'startups', 'entrepreneurs', 'commerce'] },
  { id: 'mythology-legends', icon: 'wand-sparkles', tone: 'gold', subcategories: ['greek-mythology', 'norse-mythology', 'egyptian-mythology', 'iranian-mythology', 'world-mythologies'] },
  { id: 'travel-tourism', icon: 'plane', tone: 'cyan', subcategories: ['destinations', 'famous-attractions', 'scenic-cities', 'hotels', 'adventure-and-unique-places'] },
  { id: 'education-mathematics', icon: 'graduation-cap', tone: 'purple', subcategories: ['mathematics', 'logic-puzzles', 'mental-calculations', 'general-knowledge', 'thinking-challenges'] },
  { id: 'fashion-beauty', icon: 'shirt', tone: 'pink', subcategories: ['fashion-clothing', 'fashion-brands', 'makeup-beauty', 'personal-style', 'trends-and-designers'] },
]);

export const CATEGORY_IDS = Object.freeze(CATEGORY_CATALOG.map(({ id }) => id));

export function getCategoryById(categoryId) {
  return CATEGORY_CATALOG.find(({ id }) => id === categoryId) ?? null;
}
