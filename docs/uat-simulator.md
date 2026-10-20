# UAT restaurant simulator

Run the simulator only against the approved local or test Supabase project configured in `.env.local`:

```powershell
& 'C:\Users\WindVeil\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/seed-uat-restaurant-simulator.mjs
```

It creates a new `uat-simulator-*` restaurant with role accounts, ten tables, 25 menu items, order/payment history, and attendance history. Credentials are generated into ignored `.env.uat.local`; the script never prints a password or service key.

To reset, archive prior simulator restaurants and create a fresh one:

```powershell
& 'C:\Users\WindVeil\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/seed-uat-restaurant-simulator.mjs --reset
```

Reset intentionally archives rather than deletes prior simulator records, preserving financial and audit history.
