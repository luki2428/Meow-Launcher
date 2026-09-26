# Spis plików implementacji

## Dodane

- `src/main/auth/AccountStore.ts`, `AuthService.ts`, `MicrosoftAuthService.ts` — konta, szyfrowany cache, Microsoft/Xbox/Minecraft i refresh.
- `src/main/java/JavaService.ts`, `JavaRuntimeInstaller.ts` — runtime Temurin w instancji, SHA-256 i weryfikacja JVM.
- `src/main/minecraft/InstanceService.ts`, `MinecraftInstallerService.ts`, `MinecraftLauncherAdapter.ts`, `MinecraftService.ts`, `GameProcessService.ts`, `XmclTaskRunner.ts` — instancja, instalacja, loadery, start, proces i kontrolowane pobieranie.
- `src/main/shared/LauncherError.ts`, `validation.ts`, `network.ts` — błędy, Zod, ścieżki i HTTPS.
- `src/main/services/createLauncher.ts` — składanie usług.
- `src/main/ipc/serviceHandlers.ts` — nowe handlery.
- `src/main/env.d.ts` — typ Client ID w Main.
- `src/shared/game.ts` — publiczne typy i API.
- `src/renderer/src/hooks/useMinecraftState.ts` — subskrypcja stanu.
- `tests/runtime.test.ts`, `microsoft.test.ts`, `xmcl.test.ts` — testy automatyczne.
- `tests/smoke-install.ts`, `smoke-launch.ts`, `electron-smoke.ts` — testy integracyjne.
- `.env.example`, `tsconfig.tests.json`, `IMPLEMENTATION.md`.

## Zmodyfikowane

- `src/main/index.ts` — inicjalizacja, logi i cykl życia aplikacji/gry.
- `src/main/ipc/registerHandlers.ts` — nowe IPC, logout przez AuthService.
- `src/main/services/LauncherService.ts`, `SettingsService.ts`, `OfflineAccount.ts` — integracja usług i zgodność profili.
- `src/shared/types.ts`, `src/shared/ipc.ts` — model kont i kanały.
- `src/preload/index.ts` — ograniczone API auth/minecraft.
- `src/renderer/src/components/Accounts.tsx`, `src/renderer/src/pages/Home.tsx` — logowanie Microsoft, GRAJ, progress i błędy.
- `electron.vite.config.ts` — Client ID z `.env` wyłącznie w Main.
- `package.json`, `package-lock.json` — przypięcie istniejących wersji XMCL, jawny unzip, testy.
- `.gitignore`, `README.md` — ignorowanie testowych danych i dokumentacja konfiguracji.

Nie aktualizowano wersji `@xmcl/core` ani `@xmcl/installer`. `@xmcl/unzip@2.1.2` był już zależnością przechodnią; teraz jest jawnie zadeklarowany. Dotychczasowy test kont pozostaje zachowany.
