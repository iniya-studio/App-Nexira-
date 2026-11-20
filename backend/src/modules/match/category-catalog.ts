export const LEGACY_MATCH_CATEGORIES = new Set([
  'general','general-knowledge','english','math','mathematics','programming','cars','chess',
  'memory','logic','knowledge','reaction','focus','language','science',
]);

export const CATEGORY_SUBCATEGORIES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  gaming: ['famous-games','game-characters','esports','studios','gaming-history'],
  'movies-tv': ['movies','tv-series','actors','characters','awards'],
  music: ['pop','rock','hip-hop-rap','k-pop','artists-bands'],
  sports: ['football','basketball','combat-sports','world-competitions','famous-athletes'],
  technology: ['ai','mobile-gadgets','computers','internet','technology-companies'],
  'internet-social-media': ['youtube','streamers','social-networks','popular-memes','internet-trends'],
  'anime-manga': ['anime-series','characters','manga','studios','japanese-world'],
  'superheroes-comics': ['marvel','dc','superheroes','comics','antiheroes'],
  geography: ['countries','cities','flags','landmarks','world-wonders'],
  history: ['civilizations','kingdoms','wars','revolutions','historical-figures'],
  space: ['solar-system','planets','space-missions','space-agencies','discoveries'],
  science: ['physics','chemistry','biology','inventions','scientists'],
  'cars-motorsports': ['car-brands','supercars','motorcycles','formula-one','racing'],
  'animals-nature': ['animals','oceans','forests','nature','animal-records'],
  'food-drinks': ['world-cuisines','fast-food','desserts','beverages','food-brands'],
  'art-design': ['painting','architecture','photography','design','famous-artworks'],
  'books-stories': ['novels','authors','fantasy','science-fiction','fictional-characters'],
  'culture-lifestyle': ['national-cultures','festivals','traditions','fashion','lifestyle'],
  'brands-business': ['global-brands','companies','startups','entrepreneurs','commerce'],
  'mythology-legends': ['greek-mythology','norse-mythology','egyptian-mythology','iranian-mythology','world-mythologies'],
  'travel-tourism': ['destinations','famous-attractions','scenic-cities','hotels','adventure-and-unique-places'],
  'education-mathematics': ['mathematics','logic-puzzles','mental-calculations','general-knowledge','thinking-challenges'],
  'fashion-beauty': ['fashion-clothing','fashion-brands','makeup-beauty','personal-style','trends-and-designers'],
});

export function isSupportedCategorySelection(category: string, subcategoryId?: string | null): boolean {
  const normalizedSubcategory = subcategoryId?.trim().toLowerCase() || null;
  const allowed = CATEGORY_SUBCATEGORIES[category];
  if (allowed) return Boolean(normalizedSubcategory && allowed.includes(normalizedSubcategory));
  return LEGACY_MATCH_CATEGORIES.has(category) && normalizedSubcategory === null;
}
