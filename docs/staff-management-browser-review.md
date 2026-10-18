# Staff Management browser / UX review

## Scope and isolation

`node tests/test-staff-management-browser.mjs` runs real headless Chrome against a localhost server with synthetic accounts and fixture records. Every Auth/REST/function request terminates in that mock. External fetches, HTTPS browser requests and non-loopback DNS resolution are blocked. This suite validates browser rendering, request contracts and client session fences; actual PostgreSQL/RLS and email delivery must be validated separately with local Supabase.

## Executed scenarios

- Owner edit, trimmed name, role change, blank name rejection, cloud confirmation, Save/Cancel and duplicate submission prevention.
- Protected Owner membership has no edit/disable control; Owner is absent from invitation roles.
- Active/disabled lists, disable confirmation/cancel, reactivation and duplicate status submission protection.
- Legacy empty display name with a valid email exceeding 100 characters can be disabled/reactivated using the bounded `Staff` fallback; membership/user/restaurant/role identities remain unchanged.
- Conflict/error feedback retains existing details; retry can succeed.
- Untrusted staff names are inert text rather than markup.
- Invitation uses the server function, normalizes email, blocks duplicate submissions, and never calls Auth Admin from the browser.
- Manager keeps invitations and has no membership edit/status controls.
- All-round Staff can enter Customer, Kitchen and Front Desk but cannot enter Admin.
- Late save and late list responses cannot restore staff state after logout; Owner team controls and member DOM are scrubbed.
- Ambiguous invitation transport failure preserves the same operation key on unchanged retry and creates only one mock invitation.
- Existing-account invitation acceptance does not sign up a duplicate identity; optional password setup validates mismatch and can update once or keep the existing password.
- Invalid/expired invitation feedback fails closed before password setup.
- Responsive layouts at 375, 768 and 1280 pixels, including no horizontal overflow and captured editor/list screenshots.

## Findings during review

1. New staff labels contained invalid UTF-8 replacement characters. Fixed by lead; screenshot rerun confirmed clean labels.
2. Logout initially retained the old edit draft. Fixed by lead by clearing staff state and fencing async completions; regression passes.
3. Authenticated expired invitation error was cleared when switching to login mode. Fixed by lead; final regression confirms a visible friendly error and hidden password-setup form.
4. Legacy unnamed members with long valid emails could not be disabled because the email exceeded the name limit. Fixed by lead with the bounded `Staff` fallback; explicit browser regression passes for disable and reactivation.
5. An empty red error box appears in an untouched edit form. Fixed by lead; empty alerts are hidden.

The pre-existing authenticated mobile cart footer is outside this change; it does not cover the new edit controls in the tested viewport.

## Evidence

Screenshots are generated beneath `artifacts/staff-management/` as `staff-management-{375,768,1280}.png` and `staff-editor-{375,768,1280}.png`. Only synthetic fixture names and emails appear. No Production credentials, bearer URLs or tokens are used.

## Status

Final expanded browser suite passed on 18 October 2026 after the confirmed fixes. Screenshots at all three widths were regenerated. No uncaught browser exceptions occurred. No Production interaction or deployment was performed.

Commands executed: `npm run build` (PASS), `node --check tests/test-staff-management-browser.mjs` (PASS), `node tests/test-staff-management-browser.mjs` (initial legacy UI RED, subsequent finding reproductions RED, final expanded suite GREEN). The build printed the existing outdated Browserslist-data notice; it completed successfully.
