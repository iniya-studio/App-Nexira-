import { CATEGORY_SUBCATEGORIES, isSupportedCategorySelection } from './category-catalog';

describe('match category catalog', () => {
  it('contains the complete 23-category and 115-subcategory taxonomy', () => {
    const categories = Object.entries(CATEGORY_SUBCATEGORIES);
    expect(categories).toHaveLength(23);
    expect(categories.reduce((total, [, subcategories]) => total + subcategories.length, 0)).toBe(115);
    for (const [, subcategories] of categories) {
      expect(subcategories).toHaveLength(5);
      expect(new Set(subcategories).size).toBe(5);
    }
  });

  it('accepts only a subcategory belonging to its selected category', () => {
    expect(isSupportedCategorySelection('science', 'physics')).toBe(true);
    expect(isSupportedCategorySelection('science', 'formula-one')).toBe(false);
    expect(isSupportedCategorySelection('science', null)).toBe(false);
    expect(isSupportedCategorySelection('unknown-category', 'physics')).toBe(false);
  });

  it('keeps legacy categories valid only without a subcategory', () => {
    expect(isSupportedCategorySelection('general')).toBe(true);
    expect(isSupportedCategorySelection('cars')).toBe(true);
    expect(isSupportedCategorySelection('cars', 'physics')).toBe(false);
  });
});
