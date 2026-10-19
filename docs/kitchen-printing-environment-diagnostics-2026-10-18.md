# Kitchen printing environment diagnostics

Date: 2026-10-18. Read-only investigation; no service restart, installation, container mutation, database connection or production access.

## Docker: cause identified

Within the restricted execution session, `docker version` reports a named-pipe permission error for `dockerDesktopLinuxEngine`; `wsl --status` reports `WSL/E_ACCESSDENIED`. The session token has Low Mandatory Level. The user already has enabled `docker-users` membership, so missing membership is not supported by the evidence.

The same read-only diagnostics outside the sandbox succeeded: Docker Desktop 4.86.0, client/server Engine 29.7.2, Linux amd64 server, active `desktop-linux` context, WSL default distribution Ubuntu/version 2. `docker ps` shows several running local Aveniq test/rehearsal stacks. Some existing vector containers are unhealthy/restarting; this observation does not establish that any database is unusable.

Conclusion: the observed connection failure is an execution-sandbox access restriction, not evidence that Docker is stopped or broken. `com.docker.service` is Stopped/Manual, but the working Linux engine demonstrates that starting that service is not the remedy for this failure. Do not change group membership, pipe ACLs, Docker context or WSL configuration.

For future approved local integration work, use narrowly scoped elevated execution for the explicitly named isolated test stack. First inspect occupied ports, container labels and workspace ownership. Do not reuse, stop, prune or reset another running stack. CLI/port availability and a clean canonical replay remain unverified; no SQL was executed in this investigation.

## Android: build environment missing from checked locations

Both restricted and elevated read-only checks found no `java`, `adb`, `sdkmanager`, standalone `gradle` or `supabase` on PATH. No `JAVA_HOME`, `ANDROID_HOME` or `ANDROID_SDK_ROOT` was set in the checked process environment.

Absent standard paths: `%LOCALAPPDATA%\Android\Sdk`, `C:\Program Files\Android\Android Studio`, `%LOCALAPPDATA%\Programs\Android Studio`, `C:\Program Files\Java`, `C:\Program Files\Eclipse Adoptium`, and `%USERPROFILE%\.gradle`. Installed-program records checked in HKLM/HKCU contained no matching Android Studio/SDK/JDK entry. This is a bounded inventory, not proof that no portable installation exists anywhere on disk.

Node v24.18.0 and pnpm 9.15.9 are available. Installed Capacitor CLI/core/android packages are 8.4.1. The installed Android library uses Java 21 source/target compatibility, API 36 compile/target defaults, API 24 minimum and Android Gradle Plugin 8.13.0.

Before native implementation validation, provision Android Studio 2025.2.1 or newer, its compatible JDK supporting Java 21, Android SDK Platform 36, platform tools, build tools selected by the generated project, SDK command-line tools and optionally an emulator/system image. Use the generated Gradle wrapper; a global Gradle installation is unnecessary. Set per-session SDK/JDK paths and inspect `java -version`, `adb version`, `sdkmanager --list_installed`, and `android\gradlew.bat --version` after provisioning. Confirm the Sake Street tablet's Android version and WebView before assuming Capacitor compatibility.

Tool provisioning was not performed because this turn authorizes planning and investigation only. No APK was built, emulator was run, tablet was connected or printer contacted.

References checked: [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup), [Capacitor 8 migration/toolchain requirements](https://capacitorjs.com/docs/updating/8-0), and the installed `node_modules/@capacitor/android/capacitor/build.gradle`. Recheck version-specific requirements before provisioning rather than upgrading Capacitor implicitly.
