# Sake Street hardware acceptance

All rows: **PENDING — PHYSICAL HARDWARE REQUIRED**. Tablet unavailable; USB debugging not authorized. IVIDA S300H is at the restaurant, inaccessible from development; IP unknown. No restaurant LAN access or scanning was attempted. Emulator/simulator success is not physical printing success.

Separate approval is required before a restaurant test session or release. Use synthetic orders and an explicitly authorized isolated test backend. Record operator, date, tablet model/Android/WebView, APK SHA256, printer firmware/configuration, manually supplied IP/port, active subnet and captures/photos. Keep production disconnected.

| Acceptance | Required evidence |
| --- | --- |
| Real Android tablet against simulator | Authorized USB debugging/install; login, role/tenant pairing, permission denial/regrant, repeated start/stop, logout/account switch, network change and stable foreground polling |
| S300H connectivity | Manually verified printer address/port/protocol; active Wi-Fi/Ethernet subnet; correct assigned endpoint; no VPN/cellular route |
| Physical tickets | Provisional80mm/48-column/576-dot profile, full order/table, modifiers, notes, Unicode glyph readability, wrapping, large order and copies1/2/3 with markers; no missing lines |
| Automatic cutting | Cut disabled produces no cut; enabled cuts each completed copy reliably with supported command |
| Failure visibility | Unplug/offline, paper-out, cover-open, power loss, Wi-Fi loss, invalid/stale configuration: Kitchen visibly reports failure/unknown/attention; no unsupported paper-success claim |
| Restart safety | Process/app restart, tablet reboot, sleep/wake, crash before/after begin/write/finish; uncertain delivery never automatically reprints; original order still in Kitchen with unchanged payment/order state |
| Human recovery | Old agent physically stopped, paper inspected, reason/confirmation audited; quarantine retained until deliberate resolution; manual child reprint clearly marked |
| Real-world reliability | Agreed sustained/burst workload, latency, worst-case degraded network/maximum assignments, thermal/battery/sleep behavior; record actual counts and failures |
| Rollback | Pause, stop/revoke, reconcile all states; immutable history retained, legacy auto consumer remains fenced; Kitchen continues |

The current agent is foreground-only. Do not promise printing during sleep, background suspension or app closure. Paper-out is unknown unless the actual printer provides a verified reliable signal. Hardware sign-off and separate release approval remain required before any Production Ready claim.
