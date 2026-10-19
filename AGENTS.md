\# Aveniq Development Instructions



\## Project Overview



Aveniq is a multi-tenant restaurant management platform.



Major functional areas may include:



\* Front Desk and POS

\* QR ordering

\* Kitchen display

\* Payments and split billing

\* Staff attendance

\* Rostering

\* Inventory

\* Reports

\* Restaurant settings

\* Roles and permissions

\* Supabase database and authentication



Before making changes, inspect the repository and identify the actual architecture, relevant files, existing patterns, and available test commands. Do not assume paths, frameworks, database tables, or scripts that have not been verified.



\## General Development Rules



\* Make the smallest safe change that fully satisfies the request.

\* Follow existing project patterns before introducing new architecture.

\* Reuse existing components, services, hooks, utilities, and styles.

\* Do not rewrite unrelated code.

\* Do not remove working functionality unless explicitly requested.

\* Preserve backward compatibility where practical.

\* Use clear names and maintainable code.

\* Avoid unnecessary dependencies.

\* Do not commit secrets, API keys, passwords, service-role keys, or environment files.

\* Do not deploy to production unless explicitly requested.

\* Do not make changes to the production database unless explicitly requested.



\## Required Workflow



For substantial feature development, use the following workflow.



\### 1. Developer



Responsibilities:



\* Inspect the relevant implementation.

\* Confirm the intended behaviour.

\* Implement the requested feature.

\* Add or update appropriate tests.

\* Run relevant checks.

\* Summarise all changed files.



The Developer is allowed to modify code.



\### 2. QA Tester



Responsibilities:



\* Test the completed feature as a real restaurant user.

\* Test normal workflows, invalid inputs, empty states, loading states, error states, repeated actions, and boundary cases.

\* Test relevant desktop, tablet, and mobile layouts.

\* Verify related existing features have not regressed.

\* Report reproducible issues.



The QA Tester must not modify implementation code unless the parent task explicitly requests automatic fixes.



Each issue must include:



\* Severity

\* Preconditions

\* Reproduction steps

\* Expected result

\* Actual result

\* Relevant logs or screenshots when available



\### 3. Security Reviewer



Responsibilities:



\* Review authentication and authorisation.

\* Check tenant isolation.

\* Check Owner, Manager, Staff, Kitchen, Cashier, and Customer permissions where applicable.

\* Review Supabase RLS policies.

\* Check API and server-action authorisation.

\* Check whether client-supplied restaurant IDs, user IDs, prices, totals, payment statuses, or permission values can be trusted.

\* Check sensitive operations for auditability.

\* Look for exposed secrets or sensitive data.

\* Attempt unauthorised access using safe test data only.



The Security Reviewer must not weaken security controls to make a test pass.



\### 4. Performance Reviewer



Responsibilities:



\* Review database queries and RPC calls.

\* Identify N+1 queries, unnecessary network requests, duplicate fetching, excessive re-rendering, missing pagination, and unbounded result sets.

\* Review indexes when database query patterns change.

\* Consider realistic restaurant usage and multi-tenant scaling.

\* Flag performance risks before proposing premature optimisation.



\### 5. UX Reviewer



Responsibilities:



\* Review the feature from the perspective of a first-time restaurant employee.

\* Check whether actions, labels, errors, confirmations, and statuses are understandable.

\* Review touch-target size and tablet usability.

\* Check whether common Front Desk and Kitchen actions require unnecessary steps.

\* Identify destructive actions that need confirmation.

\* Distinguish blocking usability problems from optional improvements.



\## Subagent Usage



Use specialist subagents when the Codex environment supports them.



Do not spawn all reviewers for every trivial change. Select reviewers according to risk:



\* Small visual or text change: Developer and QA Tester

\* Business-logic change: Developer and QA Tester

\* Authentication, roles, RLS, tenant access, deletion, refunds, or payments: Developer, QA Tester, and Security Reviewer

\* Database queries, reports, large lists, or frequently refreshed screens: Developer, QA Tester, and Performance Reviewer

\* New Front Desk, Kitchen, customer, or onboarding workflow: Developer, QA Tester, and UX Reviewer

\* Release candidate or major feature: use all applicable reviewers



Review agents should inspect the completed implementation independently and return findings to the lead agent.



The lead agent must:



1\. Separate confirmed defects from suggestions.

2\. Fix confirmed blocking defects when the task permits fixes.

3\. Re-run relevant tests after fixes.

4\. Return one combined final report.



\## Testing Requirements



Before reporting completion:



\* Identify available scripts from `package.json` and repository documentation.

\* Run the narrowest relevant tests first.

\* Run broader regression checks when the change has wide impact.

\* Run type checking and linting when configured.

\* Run build validation for changes that can affect production builds.

\* Report commands that were run and their outcomes.

\* Do not claim a test passed unless it was actually executed successfully.

\* Clearly report tests that could not be run and why.



Prefer automated tests where practical, including:



\* Unit tests for calculations and isolated business logic

\* Integration tests for APIs, server actions, RPCs, and database behaviour

\* End-to-end tests for critical restaurant workflows



\## Restaurant Business Rules



When relevant, verify that:



\* Orders cannot become Paid until the required amount has been received.

\* Payment totals cannot silently exceed or fall below the expected balance.

\* Split bills preserve the original order total.

\* Rounding is deterministic and allocated correctly.

\* Prices, GST, discounts, refunds, and totals are calculated on a trusted server-side boundary.

\* Completed orders and financial records cannot be silently removed by ordinary staff.

\* Destructive or corrective actions are authorised and auditable.

\* Kitchen and Front Desk order states remain consistent.

\* Attendance records are not silently altered by report generation.

\* Open shifts and incomplete breaks are handled explicitly.

\* Tenant data never crosses restaurant boundaries.



Do not assume these rules are already implemented. Verify the relevant existing behaviour before changing it.



\## Supabase and Database Safety



\* Treat migrations as append-only after they have been shared or applied.

\* Create a new migration instead of editing an already-applied migration, unless explicitly instructed and confirmed safe.

\* Review RLS for every new or changed table, view, function, RPC, or storage policy.

\* Use test or local environments for migrations and destructive tests.

\* Never run destructive SQL against production without explicit approval.

\* Do not use the Supabase service-role key in browser code.

\* Prefer server-side validation for sensitive calculations and state transitions.

\* Ensure multi-step financial operations are atomic where needed.

\* Preserve audit history for orders, payments, refunds, attendance, and sensitive administrative actions.



\## Destructive Operations



Before implementing deletion, cancellation, voiding, refunding, or record correction:



\* Confirm who is authorised.

\* Prefer soft deletion, voiding, or status transitions where financial or operational history must be retained.

\* Record actor, timestamp, reason, and affected record where appropriate.

\* Require confirmation for destructive user actions.

\* Ensure the operation is tenant-scoped.

\* Add tests for unauthorised and repeated requests.



\## Completion Report



Return a concise report containing:



\### Implementation



\* What changed

\* Changed files

\* Database migrations

\* Important design decisions



\### Validation



\* Commands and tests run

\* Passed checks

\* Checks not run and reasons



\### Review Findings



\* QA

\* Security

\* Performance

\* UX



Only include review sections that were relevant to the task.



\### Remaining Risks



\* Confirmed unresolved defects

\* Manual verification required

\* Deployment or migration considerations



Do not describe the work as production-ready when relevant tests, migrations, permissions, or user workflows remain unverified.



