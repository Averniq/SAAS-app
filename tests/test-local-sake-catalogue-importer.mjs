import assert from 'node:assert/strict';
import { validateSanitizedCatalogue } from '../scripts/import-local-sake-product-catalogue.mjs';

const categoryNames = [
  'Soups', 'Mains', 'Salads', 'Sides', 'Cold Plates', 'Hot Plates',
  'Sashimi', 'Nigiri', 'Nigiri & Sashimi combo', 'Maki', 'Sushi rolls', 'Ramen',
];

function catalogue() {
  return {
    restaurant: {
      name: 'Sake Street', slug: 'sake-street', restaurant_type: 'Japanese',
      logo_url: '/assets/brand/sake-street-logo-mark.webp',
      subtitle: 'Japanese QR table ordering', theme_config: { themePreset: 'japaneseIzakaya' },
    },
    counts: { categories: 12, menu_items: 71, with_tags: 71, with_option_config: 71, with_image_or_photo: 69 },
    categories: categoryNames.map((name, index) => ({ name, sort_order: index + 1, is_active: true })),
    menu_items: Array.from({ length: 71 }, (_, index) => ({
      category_name: categoryNames[index % categoryNames.length], name: `Item ${index + 1}`,
      description: `Description ${index + 1}`, price: 10 + index, image_url: `/images/${index + 1}.webp`,
      photo_url: `/photos/${index + 1}.webp`, tags: ['test'], option_template: 'none', option_config: [],
      is_available: true, sold_out: false, is_active: true, sort_order: index + 1,
    })),
  };
}

function catalogueV2() {
  const result = catalogue();
  result.menu_items[1] = { ...result.menu_items[1], name: 'Karaage ramen', image_url: '', photo_url: '' };
  result.menu_items[3] = { ...result.menu_items[3], name: 'Spicy edamame', image_url: '', photo_url: '' };
  return result;
}

const valid = catalogueV2();
assert.strictEqual(validateSanitizedCatalogue(valid), valid, 'validation preserves the supplied JSON values');

const forbidden = catalogueV2();
forbidden.menu_items[0].organization_id = 'production-identity';
assert.throws(() => validateSanitizedCatalogue(forbidden), /not accepted|forbidden/i);

const unresolved = catalogueV2();
unresolved.menu_items[0].category_name = 'Missing category';
assert.throws(() => validateSanitizedCatalogue(unresolved), /does not resolve/i);

const duplicate = catalogueV2();
duplicate.menu_items[1] = { ...duplicate.menu_items[0] };
assert.throws(() => validateSanitizedCatalogue(duplicate), /duplicate category\/name/i);

const wrongCount = catalogueV2();
wrongCount.categories.pop();
assert.throws(() => validateSanitizedCatalogue(wrongCount), /exactly 12 categories/i);

const unexpectedEmptyImage = catalogueV2();
unexpectedEmptyImage.menu_items[2] = { ...unexpectedEmptyImage.menu_items[2], image_url: '', photo_url: '' };
assert.throws(() => validateSanitizedCatalogue(unexpectedEmptyImage), /image metadata/i);

console.log('local Sake catalogue importer validation: PASS');
