# Aveniq application UI/UX audit

Date: 12 August 2026  
Scope: Customer ordering, Kitchen, Front Desk, split billing, Attendance, Staff Clock, Reports, onboarding, authentication, restaurant setup, and Settings.  
Evidence: Fresh screenshots from the local built application at 320×568, 390×844, 844×390, 834×1194, 1024×768, and 1440×900.

## Executive summary

Aveniq already has a recognisable product language: warm neutral surfaces, dark operational chrome, brick-red actions, restrained cards, and strong use of plain-language labels. The newer onboarding and management surfaces are calmer and better structured than several operational and customer states, but that visual direction should remain a foundation rather than a template. Kitchen needs higher density and distance readability; Front Desk needs persistent financial actions; customer ordering needs stronger table reassurance and small-screen resilience.

The most serious confirmed problem is not cosmetic: a valid QR route displayed **Loading table…** while Review Order identified **Table 6**. Until table resolution is reliable, a first-time customer cannot be sure the order is going to the correct table. The final submit path performs another validation, but the earlier screens communicate contradictory state.

Five low-risk UI improvements were implemented. They do not change business logic: Review Order focus correction, authentication background isolation, 320px dish-name reflow, 44px cart steppers, and iPad portfolio reflow. Asset/cache versioning supports delivery of those changes.

## Severity legend

- **HIGH**: likely to cause a wrong action, abandonment, inaccessible task, or material restaurant-operation delay.
- **MEDIUM**: repeated friction, poor comprehension, or a meaningful responsive/accessibility problem with a workaround.
- **LOW**: visual polish, consistency, or an optional efficiency improvement.

## 1. Design-system inconsistencies

| Severity | Finding | Recommendation |
|---|---|---|
| MEDIUM | Radius, shadow, and type values are partly tokenised but still repeated as many one-off values (10/11/12/14/16/18/20/22/24px radii and several ad-hoc shadows). | Finish the existing `--ds-*` migration; keep only contextual exceptions such as round buttons and bottom sheets. |
| MEDIUM | The same brick red represents primary actions, selected navigation, destructive actions, and some status accents. | Separate `action-primary`, `action-danger`, `selection`, and `status-critical` semantic tokens even if some currently share values. |
| MEDIUM | Operational screens mix 40px general controls, 44px customer controls, and 53px Kitchen actions without an explicit context rule. | Define 44px customer/management, 52px Front Desk, and 56–64px Kitchen target tiers. |
| MEDIUM | Selected states vary between filled pills, red tabs, bordered cards, pressed buttons, and thin underlines. Some expose `aria-selected`/`aria-pressed`; category pills do not. | Standardise `SegmentedTabs`, `FilterChip`, and `SelectableCard` primitives with semantic selected state. |
| LOW | Uppercase eyebrow labels work well for hierarchy but appear at several sizes and letter spacings. | Use one 12px utility label token and one 11px dense-data token. |
| LOW | Cards range from flat hairline containers to elevated panels without a consistent rule for hierarchy. | Reserve elevation for sticky/overlay/interactive surfaces; use borders for ordinary sections. |

## 2. UX friction points

| Severity | Finding | Evidence / impact |
|---|---|---|
| HIGH | QR table context is contradictory: the header remains **Loading table…**, while Review Order says **Table 6** and items can be added. | Customer menu and Review Order captures. A first-time customer cannot verify the destination table. |
| HIGH | The platform card for an onboarding restaurant links to a dashboard that responds “This account does not have access to this restaurant.” | Platform → Coffee Shop → Open dashboard. The entry point and authorisation model disagree. |
| MEDIUM | Customer ordering exposes Menu, Orders, and Account even before the primary menu flow has resolved the table. | The extra navigation competes with the primary “choose food” task and Account is ambiguous for a QR guest. |
| MEDIUM | Customer category pills scroll horizontally without a visible continuation cue beyond clipping/fade. | Long categories such as “Nigiri & Sashimi combo” are hard to discover. |
| MEDIUM | Review Order duplicates item-level instructions and an order-level note without explaining when each should be used. | Customers may repeat allergy information or place it at the wrong scope. |
| MEDIUM | Front Desk payment, split, and print actions appear after order lines. On an iPad, the cashier may need to scroll before the main task becomes available. | Front Desk iPad capture. |
| MEDIUM | Split bill expands inline inside an already long invoice. The title and allocation controls appear below the payment area with weak spatial reset. | Split bill capture. A focused workspace or side sheet would reduce context switching. |
| MEDIUM | Kitchen item rows show an `active` label that does not help cooks distinguish preparation state. | Repeated low-value labels add scan noise across simultaneous orders. |
| MEDIUM | Kitchen status buttons show invalid next states as disabled controls rather than emphasising the one safe next action. | Slower recognition and greater accidental-action risk during service. |
| MEDIUM | Attendance shows a 118-hour open shift alongside ordinary Start Break and Clock Out actions. | Exception handling is present, but the abnormal state is not visually dominant enough. |
| LOW | Reports show five summary cards and another three-value summary in the Sales panel. | Repetition increases page length without adding decision value. |

## 3. Accessibility concerns

| Severity | Finding | Recommendation |
|---|---|---|
| HIGH | Before the fix, Review Order programmatically focused **Confirm order**, producing the persistent rectangular focus ring and priming the final action. | Initial focus now goes to the dialog container. Keyboard focus rings remain visible when the user tabs. |
| HIGH | Before the fix, hidden customer cart/navigation controls remained exposed behind login in the accessibility snapshot. | Account-flow mode now hides the header, main content, mobile cart, and mobile navigation together. |
| HIGH | Split-bill payment-method comboboxes have no accessible name in the captured accessibility tree. | Add a visible or screen-reader label such as “Payment method for Bill 1”. |
| MEDIUM | Category filter buttons communicate selection visually but do not expose `aria-pressed` or a tab pattern. | Add `aria-pressed` and keep it in sync with `.active`. |
| MEDIUM | Status changes rely heavily on colour, especially green/amber pills. | Keep text labels and add shape/icon redundancy only where it improves rapid scanning. |
| MEDIUM | Some 10–12px metadata is low contrast on warm surfaces and in the dark Kitchen shell. | Validate WCAG contrast for all muted text and raise operational metadata to at least 14px where read at distance. |
| MEDIUM | The modifier experience could not be reached in the captured fixture, so required-choice announcements, grouped labels, and validation remain unverified. | Test with a modifier-heavy item using VoiceOver and keyboard navigation. |
| LOW | Repeated “More” buttons are well labelled in the accessibility tree, but the visible label alone is generic. | Keep the accessible name; consider a visible kebab icon with tooltip in dense Kitchen layouts. |

Screenshot inspection alone cannot establish WCAG conformance. Screen-reader reading order, zoom at 200–400%, reduced motion, high contrast, and actual hardware keyboard behaviour still require dedicated testing.

## 4. Mobile problems

| Severity | Finding | Recommendation |
|---|---|---|
| HIGH | At 320px, long dish names and prices clipped into neighbouring columns. | **Fixed:** the image/action rails contract and names wrap to two lines at ≤360px. |
| HIGH | The QR route can remain on **Loading table…** while the cart remains usable. | Block ordering controls or show a clear retry/error state until the table is resolved. Do not silently fall back to a stored table. |
| MEDIUM | In landscape, the fixed cart and bottom navigation consume most of the 390px height before menu content begins. | Collapse to one compact bottom action bar in landscape; hide secondary navigation until requested. |
| MEDIUM | Review Order landscape leaves only a shallow item viewport above the sticky totals/actions. | Use a compact landscape dock, reduce header height, and account for virtual-keyboard `visualViewport` changes. |
| MEDIUM | Menu images occupy a large fixed rail even when the name/description needs more room. | Use 28–32% image width with bounds instead of a single fixed width across all small phones. |
| MEDIUM | Cart quantity controls were 34px. | **Fixed:** controls are 44×44px on mobile. |
| MEDIUM | Sticky bars use safe-area tokens, but bottom browser chrome and keyboard behaviour were not fully testable in the in-app browser. | Verify on Safari with the address bar collapsed/expanded and with item/order note keyboards open. |
| LOW | The public header truncates long restaurant names without a secondary accessible way to read the full name. | Allow two lines on narrow phones or expose the full name via title/accessible description. |

## 5. iPad problems

| Severity | Finding | Recommendation |
|---|---|---|
| HIGH | The platform restaurant portfolio overflowed horizontally at 1024px because the two-column shell left too little room for card actions. | **Fixed:** the console becomes one column through 1100px. |
| MEDIUM | At iPad portrait width with desktop pointer characteristics, the staff header compresses and wraps the venue identity. | The code has a coarse-pointer iPad shell; validate it on real portrait and landscape iPads and add a width-only fallback if needed. |
| MEDIUM | Front Desk payment actions are not persistent while reviewing long bills. | Make a totals/action rail sticky within the invoice, preserving table context. |
| MEDIUM | Split bill uses a long inline expansion; two bills fit, but more people will push payment actions far below the fold. | Use a side sheet on landscape and full-height sheet on portrait with sticky allocation totals. |
| MEDIUM | Kitchen fits two readable columns in landscape, but three or more simultaneous orders require vertical scrolling with no lane grouping. | Add status lanes or filters only if they improve scan speed; keep table/order identity dominant. |
| MEDIUM | Mounted Staff Clock needs burn-in-resistant, high-contrast, large-target presentation and inactivity reset. | Validate the dedicated PIN surface on real mounted hardware; keep controls ≥68px as currently intended. |

The responsive browser could change viewport dimensions but not emulate iPad coarse-pointer media queries, Safari chrome, or a hardware keyboard. Those remain manual checks.

## 6. Desktop problems

| Severity | Finding | Recommendation |
|---|---|---|
| MEDIUM | Reports spreads low-density content across a very wide canvas; the main insight and empty state are visually distant. | Constrain analytical content to a readable measure while keeping export controls aligned to the page header. |
| MEDIUM | Settings uses several equally prominent actions (`Import Sample Menu`, `Upload Current Menu`, `Load Cloud Data`) without explaining consequences. | Group setup actions by intent and mark any overwriting/import behaviour before action. |
| LOW | The desktop header is information-rich but devotes persistent space to Sound, sync, identity, logout, and Menu simultaneously. | Move infrequent account actions into Menu while keeping operational status visible. |

## 7. Recommended reusable components

1. `ProductShell` with explicit variants: `customer`, `operations`, `management`, `setup`, and `auth`.
2. `OperationalHeader` with venue/table/order identity and context-specific actions.
3. `PageHeader` with eyebrow, title, supporting text, and one primary action group.
4. `MenuItemCard` with responsive image rail, two-line title, dietary tags, price, and 44px add target.
5. `QuantityStepper` with 44px customer and 52px operational variants.
6. `MoneySummary` for subtotal/GST/paid/remaining with consistent terminology and tabular numbers.
7. `StickyActionDock` that owns safe-area, keyboard, and browser-chrome spacing.
8. `OrderDocket` optimised for Kitchen distance reading and one safe next action.
9. `TableRail` for Front Desk with table, open-order count, balance, and payment state.
10. `StatePanel` for loading, empty, error, success, reconnecting, and permission-denied states.
11. `AccessibleDialog` with focus entry, trap, return focus, Escape handling, and labelled controls.
12. `FilterChip`/`SegmentedTabs` with consistent selected semantics.

## 8. Recommended design tokens

Build on the existing `--ds-*` aliases rather than replacing them.

| Token family | Recommendation |
|---|---|
| Colour | `surface-canvas`, `surface-panel`, `surface-raised`, `text-primary`, `text-muted`, `border-default`, `action-primary`, `action-danger`, `status-success`, `status-warning`, `status-info`, `focus-ring`. |
| Type | 12 utility, 14 metadata, 16 body/control, 20 section title, 28 page title, 36 display; tabular numerals for money/time/order IDs. |
| Spacing | 4, 8, 12, 16, 20, 24, 32, 48. Avoid new one-off gaps. |
| Radius | 8 control, 12 card, 16 large card, 24 dialog/sheet, full pill. |
| Elevation | `shadow-control`, `shadow-card`, `shadow-sticky`, `shadow-dialog`; no shadow for ordinary Kitchen cards. |
| Motion | 120ms control, 180ms panel, 240ms dialog; respect reduced motion. |
| Targets | 44px customer/management, 52px Front Desk, 56–64px Kitchen primary actions, 68px mounted PIN pad. |
| Safe area | One shared `safe-top`, `safe-bottom`, `mobile-nav-height`, `mobile-action-height`, and `keyboard-inset` contract. |
| Layer | Base 0, sticky header 30, sticky action 40, menu/popover 100, backdrop 500, dialog 510, toast 600. |

## 9. Page-by-page recommendations

| Page / workflow | Health | Priority recommendations |
|---|---|---|
| Customer menu | Needs redesign in table state | Resolve table before enabling ordering; preserve food-first cards; expose filter selection semantically; keep long names readable. |
| Cart | Usable with friction | Keep item scope versus order note clear; preserve totals and action visibility; keep 44px steppers. |
| Review Order | Improved, still needs table fix | Initial focus is corrected; add explicit “Ordering for Table X” reassurance and modifier summary; compact landscape dock. |
| Confirm / Order Sent / status | Partially unverified | Do not submit without explicit test-data authority. Code shows success toast/status polling, but live confirmation, reconnect, repeat action, and Continue Ordering need end-to-end verification. |
| Kitchen | Operationally strong base | Increase metadata size, remove low-value `active` labels, emphasise only the next valid state, add stale-order handling. |
| Front Desk | Clear invoice, slow primary action | Keep table/balance visible; make pay/split/print sticky; reduce taps to change order/table. |
| Split bill | Functionally understandable | Move into a dedicated responsive workspace; label payment-method selects; keep original/allocated/paid/remaining sticky. |
| Attendance | Good hierarchy, weak exception dominance | Promote missed/open-shift warning above ordinary shift actions and clarify the resolution path. |
| Staff Clock | Unverified dedicated route | Validate PIN error, lockout/rate limit, success, repeated attempt, idle reset, portrait/landscape, and mounted-device behaviour. |
| Reports | Clear but repetitive | Reduce duplicated summaries; keep empty states actionable; verify table horizontal scrolling and sticky first column on iPad. |
| Onboarding | Visual direction is appropriate | Keep guided choices and explicit outcomes; do not apply its spacious cadence to Kitchen/Front Desk. Live onboarding was blocked by the current account/restaurant access mismatch. |
| Settings | Visually coherent | Clarify destructive/import consequences, group actions by job, and keep navigation sticky on long sections. |
| Authentication | Strong visual baseline | Background accessibility leak is fixed; add visible password affordance only if consistent with security policy; verify validation and recovery states. |
| Restaurant setup / platform | Improved at iPad width | Portfolio reflow is fixed; repair onboarding restaurant dashboard access and constrain card actions on very long names/addresses. |

## 10. Screens and workflows requiring redesign

### HIGH

1. **QR table-resolution state**: Menu → Cart → Review must use one verified table identity before ordering is enabled.
2. **Platform → onboarding restaurant access**: entry points, membership, and onboarding routing must agree.
3. **Front Desk payment workspace**: table identity, remaining balance, and pay/split actions should stay visible throughout long bills.

### MEDIUM

4. **Split bill responsive workspace**: dedicated side sheet/full-height sheet with sticky allocation totals.
5. **Kitchen next-action model**: reduce status-button noise and make stale/new/ready recognition faster.
6. **iPhone landscape ordering/review**: consolidate bottom chrome and increase the usable content viewport.
7. **Attendance exception resolution**: separate abnormal open shifts from ordinary live shifts.

### LOW

8. **Reports information density**: remove repeated summaries and constrain empty analytical content.

## Five highest-impact low-risk improvements implemented

1. **Review Order focus correction**
   - Review Order focuses the dialog container, not Confirm.
   - Shift+Tab remains trapped from the initial dialog focus.
   - Quantity/remove rerenders restore focus to the equivalent surviving control.
   - Keyboard users retain a consistent `:focus-visible` ring.
2. **Authentication background isolation**
   - Login/account flows hide customer cart/navigation from interaction and accessibility exposure.
   - The underlying document is scroll-locked so the gateway owns scrolling.
3. **Small-phone menu cards**
   - At ≤360px, the image and action rails shrink and long names wrap to two lines.
4. **Mobile cart touch targets**
   - Quantity stepper buttons are 44×44px at mobile widths.
5. **iPad restaurant-portfolio reflow**
   - The platform console switches to one column from 641–1100px, eliminating 1024px horizontal overflow.

Supporting delivery change:

- **Cache-safe delivery**
   - CSS/JS asset versions and the service-worker cache were bumped so existing PWA clients receive the fixes.

## Evidence steps

| Step | Screen | Health |
|---|---|---|
| 1 | Customer menu, iPhone 390×844 | Needs table-state fix |
| 2 | Item/modifier attempt | Modifier fixture unavailable; not verified |
| 3 | Cart, iPhone 390×844 | Usable; touch targets improved |
| 4 | Review Order, iPhone portrait | Improved; contradictory table state remains |
| 5 | Kitchen, iPad landscape | Good operational base; scan-noise issues |
| 6 | Front Desk, iPad landscape | Clear invoice; actions too low |
| 7 | Split bill, iPad landscape | Understandable; needs dedicated workspace |
| 8 | Reports, desktop | Healthy structure; excess empty density |
| 9 | Settings, desktop | Healthy structure; action clarity needed |
| 10 | Attendance, iPad portrait | Good hierarchy; exception state under-emphasised |
| 11 | Platform / restaurant setup, iPad landscape | Reflow fixed; onboarding access mismatch |
| 12 | Login, iPhone | Healthy visual baseline; background accessibility leak fixed |
| 13 | Customer menu, 320×568 | Dish-name clipping fixed |
| 14 | Customer menu, iPhone landscape | Too little usable content height |
| 15 | Review Order, iPhone landscape | Sticky dock dominates viewport |

Accepted screenshots are in `artifacts/ui-ux-audit-2026-08-12/`.

## Evidence limits

- No real customer order was submitted because that would create external test data. Order Sent, live status progression, and Continue Ordering remain end-to-end verification gaps.
- The current session could not enter the onboarding flow for Coffee Shop; the platform dashboard link returned an access error. Onboarding recommendations combine the accessible platform surface, current onboarding implementation, and code inspection rather than a completed live walkthrough.
- The external Staff Clock link was disabled, so its live PIN workflow could not be opened without changing restaurant configuration.
- The browser viewport tool does not emulate iPad coarse-pointer media queries, Safari bottom chrome, virtual keyboard, or mounted-device inactivity.
- Screenshots support a combined UX/accessibility audit but not a claim of WCAG conformance.
