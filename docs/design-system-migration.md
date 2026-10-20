# Aveniq UI consistency audit and migration plan

## Direction and system

The onboarding flow establishes a deliberately calm product character: warm paper and panel surfaces, dark ink typography, oxblood as the decisive action colour, mint for success and a light 32px grid texture. Its most reusable qualities are hierarchy, deliberate whitespace around decisions, clear labels and selected states—not its wizard layout.

| Token group | Extracted system |
| --- | --- |
| Typography | Inter/system stack; page title 26–36px, section title 20–24px, body 14–16px, compact metadata 12px uppercase |
| Spacing | 4, 8, 12, 16, 20, 24, 32px (`--ds-space-*`) |
| Shape | 8px controls, 12px panels, 16px section cards, 24px dialogs |
| Surfaces | paper `#f5efe5`, panel `#fffdf8`, ink `#211b18`, line `#dfd2c0` |
| Semantic colours | oxblood primary `#ad2b25`, mint success `#426f5b`, blue in-progress `#334f69`, amber attention `#a46514` |
| Elevation | quiet control, card and dialog shadows (`--ds-shadow-*`) |

Shared primitives are now `ds-page-header`, `ds-section-heading`, `ds-section-card`, `ds-control`, button variants, `ds-selectable-card`, `ds-badge`, `ds-alert`, `ds-dialog` and `ds-state`. Existing button, field, status-pill, empty-state and modal classes remain compatible aliases while screens progressively migrate.

## Consistency audit

| Area | Current strength | Migration need |
| --- | --- | --- |
| Setup/auth/onboarding | Strongest hierarchy, responsive card treatment and clear selected states | Become the `SetupLayout`; retain focused single-task form width |
| Admin setup/menu | Existing cards and palette are compatible, but all configuration is stacked in one long view | `AdminLayout`, common header, section navigation and form/card primitives |
| Reports | Good data table and filter foundations | Align summary cards, tabs, empty/error/loading states without reducing density |
| Attendance | Strong operational card pattern and kiosk dialog | Standardise metrics, filters and manager-review alert treatment |
| Front Desk | Deliberately fast table/payment layout and large payment controls | Reuse primitives only; retain checkout panel structure and sticky payment actions |
| Kitchen | Clear current status colours and order cards | Introduce an operations high-contrast variant with larger task text/touch targets |
| Customer menu | Tenant theming is intentionally independent | Apply accessibility and control foundations only; never impose Aveniq admin palette |
| External Staff Clock | Focused PIN-only kiosk shell | Keep independent `OperationsLayout` kiosk variant—no admin navigation |

The audit also found duplicated external Staff Clock link markup/IDs in the Attendance view. It should be removed as a small, separately verified cleanup before Phase 2 because duplicate IDs make updates target-dependent.

## Layout families

```
SetupLayout       account gateway → auth, invitation, verification, onboarding
AdminLayout       app header + admin header + settings navigation + dense section workspace
OperationsLayout  task shell → customer menu | kitchen board | front desk | staff-clock kiosk
```

## Representative layout mockups

### SetupLayout — onboarding

```
┌ Aveniq ─────────────────────────────────── Step 2 of 5 ┐
│ Complete your setup                                      │
│ [Restaurant] [Tables] [Menu] [QR] [Done]                 │
│                                                          │
│  Add your tables                                         │
│  [ Number of tables                           10 ]       │
│                                         [Save and continue]│
└──────────────────────────────────────────────────────────┘
```

### AdminLayout — menu management

```
Manage your restaurant
Keep your venue, menu, tables and team ready for service.
[Overview] [Menu] [Restaurant] [Team] [Tables]
┌ Add menu item ──────────────────────────────────────────┐
│ Dish name  Category  Price  Tags                         │
│ Description                                              │
│                                  [Clear] [Add dish]      │
└─────────────────────────────────────────────────────────┘
```

### OperationsLayout — Front Desk

```
┌ Tables ──────┬ Selected order / bill ───────────────────┐
│ Table 6      │ Items, status, split details             │
│ Table 7      │                                           │
│ Table 8      │                 [Take payment]           │
└──────────────┴───────────────────────────────────────────┘
```

## Page migration priority

1. **Phase 1:** shared tokens and primitives; Admin settings and menu management.
2. **Phase 2:** Reports and Attendance filters, metrics, tables and states; Front Desk payment dialogs/surfaces. **Completed:** dense review cards, larger filters, tabular numerals, focused empty/loading treatment, and stronger payment surfaces.
3. **Phase 3:** Kitchen high-contrast board; Customer accessibility-only foundations; external Staff Clock kiosk refinements. **Completed:** high-contrast Kitchen order board, large touch status actions, customer keyboard-focus foundations without overriding tenant theming, and a high-contrast PIN kiosk treatment.

Every phase requires desktop (1440px), tablet (768px) and mobile (390px) visual checks, plus the narrowest relevant functional tests. No database, RLS, RPC or business-logic changes are in scope.
