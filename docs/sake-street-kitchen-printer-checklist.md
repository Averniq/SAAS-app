# Sake Street hardware validation — PENDING

No real tablet or physical printer was used in development. The printer remains on the restaurant LAN; its IP is unknown. No production connection is authorized.

- [ ] Record tablet model, Android version/API, WebView version, screen size, battery/network policy and APK hash. Confirm minimum API24 support and retest on the actual version; API36 emulator results do not prove API24 runtime behavior.
- [ ] Approve a dedicated local/test backend configuration reachable from the tablet over trusted networking; do not silently substitute production.
- [ ] Obtain the IVIDA S300H IP from an authorized router/printer configuration page or self-test ticket. Reserve its DHCP address.
- [ ] Verify Ethernet link, same approved subnet as the tablet, client isolation/VLAN policy and port9100. P0 does not scan arbitrary LAN hosts or support routed printer VLANs.
- [ ] Verify ESC/POS compatibility, 80mm width and provisional576-dot/48-column profile. Confirm cut command and paper feed.
- [ ] Check large order/table text, tenant name, Sydney timezone/DST, quantities, modifiers, item notes, order instructions and Kitchen/Bar/Dessert separation.
- [ ] Check copies1/2/3, no cut when disabled, one cut per configured copy and clear REPRINT markings.
- [ ] Check Japanese/other Unicode raster output for font coverage, readability, speed and ticket length. Unsupported glyph coverage must not be assumed from emulator rendering.
- [ ] Test printer powered off, paper out, cover open, paper jam, cable/Wi-Fi loss and recovery; compare actual paper with transmitted/uncertain status.
- [ ] Test app restart, force-stop, tablet reboot, authentication expiry, device revocation, network changes, sleep and background/suspension. Keep foreground requirement visible; do not claim unattended background output.
- [ ] Test two authorized tablets, repeated order submission, lost acknowledgement, duplicate prevention and explicitly confirmed manual reprint after checking paper.
- [ ] Rehearse rollback with staff; preserve audit and financial records.
- [ ] Record observed results, operator, date, screenshots/photos where permitted and unresolved failures.

Installation or production release requires a separate authorization after these checks and broader application-baseline validation.
