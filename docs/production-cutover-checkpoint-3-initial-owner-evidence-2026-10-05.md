# Checkpoint 3 — initial-owner evidence before additional invitation

Target: Aveniq-Production-New, wxdihentihrijtfkmwgq; restaurant sake-street.
Approved SHA: 47dbe4dc68ced5856fe3a337dc6c1289c7748429.

Before any additional-owner action, read-only catalog verification on 2026-10-05 confirmed:

- Initial owner email: gary.zhang6@gmail.com.
- Exactly one initial_owner_bootstrap_claims record for Sake Street.
- Exactly one owner membership, belonging to the initial claim's Auth identity.
- restaurants.owner_user_id matches that initial claim's user_id.
- Initial owner has no platform_admins membership.

The operator independently verified repeat bootstrap fails with INITIAL_OWNER_ALREADY_BOUND and reported removing the service credential from the operator PowerShell environment. Repeat bootstrap was not re-executed during this continuation; this is operator-supplied evidence.

The additional owner Sushist67@gmail.com is authorized only through authenticated Restaurant Team invitation/acceptance. No bootstrap RPC, service credential, or manual membership insertion is authorized for that additional owner.
