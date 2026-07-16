-- Additive Sake Street test-menu baseline. Existing records are never altered or removed.
with tenant as (
  select id from public.restaurants where slug = 'sake-street'
), category_seed(name, sort_order) as (
  values
    ('Soups', 1), ('Salads', 2), ('Cold Plates', 3), ('Hot Plates', 4),
    ('Sashimi', 5), ('Nigiri', 6), ('Nigiri & Sashimi combo', 7), ('Maki', 8),
    ('Sushi rolls', 9), ('Ramen', 10), ('Mains', 11), ('Sides', 12)
), menu_seed(local_id, category, name, description, price, tags, photo_url, sort_order) as (
  values
    ('sake_kimchi','Salads','Kimchi','Japanese menu item.',7,'["Vegetarian"]'::jsonb,'/assets/menu-photos/kimchi.webp',2),
    ('sake_seaweed_salad','Salads','Seaweed salad','Japanese menu item.',8,'["Vegetarian"]'::jsonb,'/assets/menu-photos/seaweed-salad.webp',3),
    ('sake_wakame_salad','Salads','Wakame salad','Shiso dressing.',8,'["Vegetarian"]'::jsonb,'/assets/menu-photos/seaweed-salad.webp',4),
    ('sake_tofu_avocado_salad','Salads','Tofu & avocado salad','Sesame dressing.',14,'["Vegetarian"]'::jsonb,'/assets/menu-photos/tofu-avocado-salad.webp',5),
    ('sake_salmon_salad','Salads','Salmon salad','With avocado and cucumber.',19,'[]'::jsonb,'/assets/menu-photos/salmon-salad.webp',6),
    ('sake_kingfish_carpaccio','Cold Plates','Kingfish carpaccio','Japanese menu item.',21,'[]'::jsonb,'/assets/menu-photos/kingfish-carpaccio.webp',7),
    ('sake_salmon_carpaccio','Cold Plates','Salmon carpaccio','Japanese menu item.',19,'[]'::jsonb,'/assets/menu-photos/salmon-sashimi.webp',8),
    ('sake_scallop_carpaccio','Cold Plates','Scallop carpaccio','Japanese menu item.',24,'[]'::jsonb,'/assets/menu-photos/dynamite-scallops.webp',9),
    ('sake_tuna_tataki','Cold Plates','Tuna tataki','Spicy, shiso, ponzu dressing.',24,'["Spicy"]'::jsonb,'/assets/menu-photos/tuna-tataki.webp',10),
    ('sake_edamame_salty','Hot Plates','Edamame - salty','Japanese menu item.',6,'["Vegetarian"]'::jsonb,'/assets/menu-photos/edamame.webp',11),
    ('sake_edamame_spicy','Hot Plates','Edamame - spicy or garlic & cheese','Japanese menu item.',8,'["Vegetarian"]'::jsonb,'/assets/menu-photos/spicy-edamame.webp',12),
    ('sake_agedashi_tofu','Hot Plates','Agedashi tofu (8p)','Japanese menu item.',13,'["Vegetarian"]'::jsonb,'/assets/menu-photos/miso-eggplant-2.webp',13),
    ('sake_sweet_potato_tempura','Hot Plates','Sweet potato tempura fries','Japanese menu item.',13,'["Vegetarian"]'::jsonb,'/assets/menu-photos/tempura-white-fish-2.webp',14),
    ('sake_karaage_chicken','Hot Plates','Karaage chicken','Marinated, crispy fried.',22,'[]'::jsonb,'/assets/menu-photos/karaage-chicken.webp',15),
    ('sake_katsu_chicken','Hot Plates','Katsu chicken','Panko, crispy fried.',22,'[]'::jsonb,'/assets/menu-photos/katsu-chicken.webp',16),
    ('sake_spicy_soft_shell_crab_hot','Hot Plates','Spicy soft shell crab','Japanese menu item.',24,'["Spicy"]'::jsonb,'/assets/menu-photos/soft-shell-crab.webp',17),
    ('sake_pork_gyoza','Hot Plates','Pork gyoza (6p)','Japanese menu item.',17,'[]'::jsonb,'/assets/menu-photos/pork-gyoza.webp',18),
    ('sake_popcorn_prawn','Hot Plates','Popcorn prawn (5p)','Japanese menu item.',22,'[]'::jsonb,'/assets/menu-photos/fried-prawn-roll.webp',19),
    ('sake_miso_eggplant','Hot Plates','Miso eggplant','Japanese menu item.',17,'["Vegetarian"]'::jsonb,'/assets/menu-photos/miso-eggplant.webp',20),
    ('sake_salmon_rice_bowl','Hot Plates','Salmon rice bowl','Aburi + $1.',21,'[]'::jsonb,'/assets/menu-photos/salmon-rice-bowl.webp',21),
    ('sake_dynamite_scallops','Hot Plates','Dynamite scallops (5p)','Japanese menu item.',29,'[]'::jsonb,'/assets/menu-photos/dynamite-scallops.webp',22),
    ('sake_tempura_white_fish','Hot Plates','Tempura white fish (6p)','Japanese menu item.',28,'[]'::jsonb,'/assets/menu-photos/tempura-white-fish.webp',23),
    ('sake_tempura_veggies','Hot Plates','Tempura veggies','5 types, chef''s choice.',22,'["Vegetarian"]'::jsonb,'/assets/menu-photos/tempura-white-fish-2.webp',24),
    ('sake_seared_salmon_belly','Sashimi','Seared salmon belly 6p','Japanese menu item.',20,'[]'::jsonb,'/assets/menu-photos/salmon-sashimi.webp',25),
    ('sake_seared_kingfish','Sashimi','Seared King fish 6p','Japanese menu item.',21,'[]'::jsonb,'/assets/menu-photos/kingfish-sashimi.webp',26),
    ('sake_kingfish_sashimi','Sashimi','Kingfish sashimi 7p','Japanese menu item.',23,'[]'::jsonb,'/assets/menu-photos/kingfish-sashimi.webp',27),
    ('sake_salmon_ocean','Sashimi','Salmon ocean 7p','Japanese menu item.',21,'[]'::jsonb,'/assets/menu-photos/salmon-sashimi.webp',28),
    ('sake_tuna_salmon_sashimi','Sashimi','Tuna & salmon sashimi 7p','Japanese menu item.',23,'[]'::jsonb,'/assets/menu-photos/mixed-sashimi.webp',29),
    ('sake_tuna_sashimi','Sashimi','Tuna sashimi 7p','Japanese menu item.',25,'[]'::jsonb,'/assets/menu-photos/mixed-sashimi-2.webp',30),
    ('sake_sashimi_ocean','Sashimi','Sashimi ocean 9p','Salmon, tuna, kingfish.',27,'[]'::jsonb,'/assets/menu-photos/sashimi-platter.webp',31),
    ('sake_mixed_sashimi','Sashimi','Mixed sashimi 16p','Salmon, tuna, kingfish, scallops.',43,'[]'::jsonb,'/assets/menu-photos/mixed-sashimi-2.webp',32),
    ('sake_salmon_nigiri','Nigiri','Salmon nigiri (4p)','No wasabi.',15,'[]'::jsonb,'/assets/menu-photos/salmon-nigiri.webp',33),
    ('sake_kingfish_nigiri','Nigiri','Kingfish nigiri (4p)','No wasabi.',16,'[]'::jsonb,'/assets/menu-photos/kingfish-nigiri.webp',34),
    ('sake_tuna_nigiri','Nigiri','Tuna nigiri (4p)','No wasabi.',16,'[]'::jsonb,'/assets/menu-photos/tuna-nigiri.webp',35),
    ('sake_aburi_salmon_nigiri','Nigiri','Aburi salmon nigiri (4p)','No wasabi.',17,'[]'::jsonb,'/assets/menu-photos/salmon-nigiri.webp',36),
    ('sake_aburi_kingfish_nigiri','Nigiri','Aburi King fish (4p)','No wasabi.',18,'[]'::jsonb,'/assets/menu-photos/kingfish-nigiri.webp',37),
    ('sake_aburi_scallop_nigiri','Nigiri','Aburi scallop nigiri (4p)','No wasabi.',24,'[]'::jsonb,'/assets/menu-photos/nigiri-platter.webp',38),
    ('sake_nigiri_platter','Nigiri','Nigiri platter assorted (8p)','No wasabi.',30,'[]'::jsonb,'/assets/menu-photos/nigiri-platter.webp',39),
    ('sake_nigiri_sashimi_combo','Nigiri & Sashimi combo','Assorted sashimi & nigiri combo (10p)','6p sashimi, 4p nigiri.',32,'[]'::jsonb,'/assets/menu-photos/nigiri-platter-2.webp',40),
    ('sake_maki_cucumber','Maki','Cucumber maki (6p)','Baby sushi roll, one ingredient only.',6,'["Vegetarian"]'::jsonb,'/assets/menu-photos/cucumber-maki.webp',41),
    ('sake_maki_avocado','Maki','Avocado maki (6p)','Baby sushi roll, one ingredient only.',6,'["Vegetarian"]'::jsonb,'/assets/menu-photos/cucumber-maki-2.webp',42),
    ('sake_maki_teriyaki_chicken','Maki','Teriyaki Chicken maki (6p)','Baby sushi roll, one ingredient only.',7,'[]'::jsonb,'/assets/menu-photos/teriyaki-chicken-maki.webp',43),
    ('sake_maki_salmon','Maki','Salmon maki (6p)','Baby sushi roll, one ingredient only.',7,'[]'::jsonb,'/assets/menu-photos/salmon-maki.webp',44),
    ('sake_maki_cooked_tuna','Maki','Cooked tuna maki (6p)','Baby sushi roll, one ingredient only.',6,'[]'::jsonb,'/assets/menu-photos/cooked-tuna-roll.webp',45),
    ('sake_maki_fresh_tuna','Maki','Fresh tuna maki (6p)','Baby sushi roll, one ingredient only.',8,'[]'::jsonb,'/assets/menu-photos/tuna-maki.webp',46),
    ('sake_maki_egg','Maki','Egg (Tamago) maki (6p)','Baby sushi roll, one ingredient only.',6,'["Vegetarian"]'::jsonb,'/assets/menu-photos/egg-tamago-maki.webp',47),
    ('sake_roll_vegetarian','Sushi rolls','Vegetarian sushi roll (8p)','Salad, avocado, cucumber, seaweed, sesame, no mayo.',16.5,'["Vegetarian"]'::jsonb,'/assets/menu-photos/vegetarian-sushi-roll.webp',48),
    ('sake_roll_cooked_tuna','Sushi rolls','Cooked tuna sushi roll (8p)','With avocado, sesame, topped with mayo.',17.5,'[]'::jsonb,'/assets/menu-photos/cooked-tuna-roll.webp',49),
    ('sake_roll_chicken_schnitzel','Sushi rolls','Chicken schnitzel sushi roll (8p)','With avocado, sesame, topped with mayo.',17.5,'[]'::jsonb,'/assets/menu-photos/teriyaki-chicken-roll.webp',50),
    ('sake_roll_teriyaki_chicken','Sushi rolls','Teriyaki chicken sushi roll (8p)','With avocado, sesame, topped with mayo.',19,'[]'::jsonb,'/assets/menu-photos/teriyaki-chicken-roll.webp',51),
    ('sake_roll_fresh_salmon_deluxe','Sushi rolls','Fresh salmon deluxe sushi roll (8p)','With avocado, tobiko, topped with mayo.',21,'[]'::jsonb,'/assets/menu-photos/fresh-salmon-deluxe-roll.webp',52),
    ('sake_roll_seared_salmon','Sushi rolls','Seared salmon sushi roll (8p)','With avocado, cream cheese, topped with mayo.',22,'[]'::jsonb,'/assets/menu-photos/fresh-salmon-deluxe-roll-2.webp',53),
    ('sake_roll_fried_prawn','Sushi rolls','Fried prawn sushi roll (8p)','With avocado, cucumber, sesame, topped with mayo.',17.5,'[]'::jsonb,'/assets/menu-photos/fried-prawn-roll.webp',54),
    ('sake_roll_spicy_soft_shell_crab','Sushi rolls','Spicy soft shell crab sushi roll (8p)','Avocado, cucumber, sesame, topped with mayo.',19.5,'["Spicy"]'::jsonb,'/assets/menu-photos/soft-shell-crab.webp',55),
    ('sake_roll_fresh_tuna','Sushi rolls','Fresh tuna sushi roll (8p)','With cucumber, sesame, topped with mayo.',19,'[]'::jsonb,'/assets/menu-photos/sushi-roll.webp',56),
    ('sake_roll_spicy_fresh_tuna_deluxe','Sushi rolls','Spicy fresh tuna deluxe sushi roll (8p)','Cucumber, chilli mayo, topped with mayo.',21,'["Spicy"]'::jsonb,'/assets/menu-photos/sushi-roll-2.webp',57),
    ('sake_roll_california','Sushi rolls','California sushi roll (8p)','Crab, avocado, cucumber, egg, tobiko.',17.5,'[]'::jsonb,'/assets/menu-photos/california-roll.webp',58),
    ('sake_ramen_vegetable','Ramen','Vegetable ramen','Noodle soup with wakame, nori, sesame. Udon + $1.',18,'["Vegetarian"]'::jsonb,'/assets/menu-photos/ramen.webp',59),
    ('sake_ramen_karaage_chicken','Ramen','Karaage chicken ramen','Noodle soup with wakame, nori, sesame. Udon + $1.',22,'[]'::jsonb,'/assets/menu-photos/karaage-ramen.webp',60),
    ('sake_ramen_pork_belly','Ramen','Pork-belly ramen','Noodle soup with wakame, nori, sesame. Udon + $1.',24,'[]'::jsonb,'/assets/menu-photos/ramen.webp',61),
    ('sake_ramen_seafood','Ramen','Seafood ramen','Whitefish, scallop, prawn. Udon + $1.',29,'[]'::jsonb,'/assets/menu-photos/ramen.webp',62),
    ('sake_stir_fried_vegetables','Mains','Stir fried vegetables','Seasonal vegetable, chef recommend.',18,'["Vegetarian"]'::jsonb,'/assets/menu-photos/stir-fried-vegetables.webp',63),
    ('sake_teriyaki_chicken','Mains','Teriyaki chicken','With salad.',28,'[]'::jsonb,'/assets/menu-photos/teriyaki-chicken-roll.webp',64),
    ('sake_teriyaki_tasmanian_salmon','Mains','Teriyaki Tasmanian salmon','With salad.',29,'[]'::jsonb,'/assets/menu-photos/salmon-rice-bowl-2.webp',65),
    ('sake_teriyaki_kingfish','Mains','Teriyaki King fish','With salad.',32,'[]'::jsonb,'/assets/menu-photos/kingfish-sashimi.webp',66),
    ('sake_aburi_pork_belly','Mains','Aburi Pork Belly (4p)','Japanese menu item.',16,'[]'::jsonb,'/assets/menu-photos/pork-gyoza-2.webp',67),
    ('sake_pork_bun','Mains','Pork bun','Japanese hamburger. Price per each.',8,'[]'::jsonb,'/assets/menu-photos/pork-bun.webp',68),
    ('sake_white_rice','Sides','White rice','Japanese menu item.',3,'["Vegetarian"]'::jsonb,'/assets/menu-photos/vegetarian-roll-2.webp',69)
)
insert into public.menu_items (
  restaurant_id, category_id, local_id, category, name, description, price,
  tags, photo_url, option_template, option_config, sort_order, is_active, is_available, sold_out
)
select tenant.id, category.id, seed.local_id, seed.category, seed.name, seed.description, seed.price,
  seed.tags, seed.photo_url, 'none', '[]'::jsonb, seed.sort_order, true, true, false
from tenant
join menu_seed seed on true
join public.categories category on category.restaurant_id = tenant.id and category.name = seed.category
on conflict (restaurant_id, local_id) do nothing;


