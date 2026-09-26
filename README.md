# Meow Launcher

Desktopowy launcher jednej instancji Minecraft: Electron, React, TypeScript i electron-vite. Logika systemowa działa w Main; React korzysta tylko z typowanego `window.launcher`.

## Uruchomienie

Wymagany Node.js 22.12+ i npm. Java jest zarządzana przez launcher; nie trzeba instalować jej systemowo.

```sh
npm ci
npm run dev
```

Runtime obsługuje obecnie **Windows x64**. Dodaj profil offline lub skonfiguruj Microsoft, wybierz konto i kliknij GRAJ. Domyślna instancja to vanilla Minecraft 1.21.1 z Javą 21.

## Microsoft

Skopiuj `.env.example` do `.env` i wpisz własny publiczny Application (client) ID:

```dotenv
MICROSOFT_CLIENT_ID=
```

Nie wpisuj Client Secret. Rejestracja Microsoft musi obsługiwać osobiste konta i desktopowe przekierowanie `http://localhost`. Client ID musi być dopuszczony do usług Xbox/Minecraft; dowolna rejestracja nie gwarantuje takiego dostępu.
MSAL obsługuje przeglądarkę systemową, PKCE i loopback. Scopes: `XboxLive.signin`, `offline_access`.
Dokumentacja: [publiczny klient MSAL](https://learn.microsoft.com/en-us/entra/msal/javascript/node/initialize-public-client-application), [przykład Electron](https://learn.microsoft.com/en-us/entra/identity-platform/tutorial-v2-nodejs-desktop).

Client ID z `.env` jest wbudowywany wyłącznie do Main. Zmienna środowiska przy starcie ma pierwszeństwo. Po zmianie `.env` uruchom ponownie dev lub build.

Flow: MSAL OAuth → `@xmcl/user` Xbox Live/XSTS → Minecraft token → profil Java. Renderer dostaje tylko `{id,type,username,uuid}`. Brak profilu Java blokuje logowanie.
Przed przygotowaniem i bezpośrednio przed startem gry sesja jest sprawdzana ponownie: MSAL odnawia OAuth w razie potrzeby, a Xbox/Minecraft dostarczają aktualny token gry.

## Dane i sesje

```text
app.getPath('userData')/
├── settings.json                 # RAM, metadane kont, wybrane konto
├── sessions.json                 # zaszyfrowane bloby cache MSAL
└── instances/main/
    ├── instance.json
    ├── runtime/java/bin/java.exe
    └── game/                     # versions, libraries, assets, saves, config…
```

Istniejące profile offline zachowują UUID i wybór konta. Nick: 3–16 znaków `[A-Za-z0-9_]`; UUID jest deterministycznym Minecraft offline UUID. Profil offline nie uwierzytelnia gracza na serwerze `online-mode=true`.

Cache MSAL jest szyfrowany systemowym Electron `safeStorage`, następnie zapisywany przez `electron-store` jako Base64 ciphertext. Xbox/XSTS/Minecraft tokeny pozostają w pamięci Main. Niedostępne bezpieczne szyfrowanie blokuje zapis sesji i logowanie Microsoft.
Wylogowanie usuwa cache, konto i jego wybór; nie wylogowuje przeglądarki systemowej.

## Instancja i Java

Plik `instance.json` powstaje przy pierwszym uruchomieniu gry. Można go zmienić przy zamkniętej grze:

```json
{
  "id": "main",
  "minecraft": "1.21.1",
  "java": { "majorVersion": 21, "architecture": "x64" },
  "loader": { "type": "vanilla" },
  "playEnabled": true
}
```

Loadery: `vanilla`, `fabric`, `forge`, `neoforge`. Dla modowanego loadera podaj wersję, np. `{"type":"neoforge","version":"21.1.251"}`. Wersje gry, Javy i loadera muszą być zgodne. `playEnabled: false` blokuje start w Main. Zod odrzuca nieznane pola, ścieżki executable i arbitralne JVM args.

JavaService sprawdza runtime instancji, major version i architekturę przez `java -version` oraz właściwości JVM. Źródło: **Eclipse Temurin / Adoptium API v3**, według major version w konfiguracji ([dokumentacja API](https://github.com/adoptium/api.adoptium.net/blob/main/docs/cookbook.adoc)).
ZIP jest pobierany do pliku tymczasowego, weryfikowany SHA-256 i rozmiarem, rozpakowywany do katalogu przejściowego i sprawdzany przed zastąpieniem runtime. Poprawna Java jest używana ponownie. Nie ma fallbacku do PATH/JAVA_HOME.

## Instalacja i start

1. Main blokuje drugi start, sprawdza konfigurację, konto i RAM.
2. Przygotowuje Javę instancji.
3. XMCL instaluje/sprawdza klienta, biblioteki i assets.
4. Instaluje loader; Forge i NeoForge używają tej samej Javy do postprocesorów.
5. Sprawdza sesję ponownie, przygotowuje natives i argumenty przez XMCL, uruchamia własne `java.exe` bez shella.
6. Monitoruje PID, stdout/stderr, błąd startu, kod wyjścia i wysyła stan do Reacta.

Przypięto istniejące `@xmcl/core@2.15.1` i `@xmcl/installer@6.1.2`. `XmclTaskRunner` dodaje `.tmp`, sprawdzanie źródeł/ścieżek, timeout i retry; przed retry czeka na zakończenie pozostałych zapisów. W jednym miejscu używa sprawdzonego chronionego API `DownloadOptions` tych wersji — upgrade XMCL wymaga jego testów.
Mojang używa sum dostarczonych przez producenta (zwykle SHA-1); Temurin używa SHA-256. Artefakty loaderów bez sum przechodzą walidator ZIP XMCL. Nie nadpisujemy światów, screenshotów ani ustawień modów.

Po zamknięciu okna podczas gry Main pozostaje aktywny do końca procesu. Ponowne otwarcie pokazuje to samo uruchomienie. Nie ma odzyskiwania procesu po wymuszonym zabiciu Main przez system.
`electron-log` zapisuje logi launchera i filtrowany strumień gry; oryginalne logi gry są w `game/logs`. Nie logujemy obiektów auth ani argumentów startowych; filtr usuwa znany token i typowe pola uwierzytelnienia.

## API preload

Nowe metody zwracają `Result<T>`: `{ok:true,data}` lub `{ok:false,error:{code,message}}`.

```ts
window.launcher.auth.loginMicrosoft()
window.launcher.auth.loginOffline(username)
window.launcher.auth.logout(accountId)
window.launcher.auth.getAccounts()
window.launcher.auth.getSelectedAccount()
window.launcher.auth.selectAccount(accountId)
window.launcher.minecraft.launch({
  accountId,
  instanceId: 'main',
  minMemoryMb: 2048,
  maxMemoryMb: 4096
})
window.launcher.minecraft.getState()
const unsubscribe = window.launcher.minecraft.onProgress((snapshot) => {
  // snapshot.state, progress, pid, exitCode, error
})
unsubscribe()
```

Opcjonalny `serverAddress` służy do quick play. Publiczne API nie przyjmuje tokenów, ścieżek ani dowolnych argumentów JVM.
Zachowano dotychczasowe `getSnapshot`, `setRam`, `saveOfflineAccount`, `selectAccount`, `removeAccount`.
IPC sprawdza okno, główną ramkę i URL. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` pozostają włączone.

## Weryfikacja

```sh
npm run typecheck
npm run typecheck:tests
npm run lint
npm test
npm run build
```

Testy obejmują migrację kont, UUID, trwałość sesji i refresh z atrapą OAuth, brak szyfrowania, logout, Java reuse/repair, kolejność i blokadę startu, rzeczywiste procesy potomne, checksums, walidację IPC i adapter XMCL.
Opt-in testy integracyjne pobierają duże pliki do ignorowanego `.smoke/`:

```sh
npx esbuild tests/smoke-install.ts --bundle --platform=node --packages=external --outfile=out/tests/smoke-install.cjs
node out/tests/smoke-install.cjs
node out/tests/smoke-install.cjs --neoforge
node out/tests/smoke-install.cjs --forge
npx esbuild tests/smoke-launch.ts --bundle --platform=node --packages=external --outfile=out/tests/smoke-launch.cjs
node out/tests/smoke-launch.cjs
```

Test gry otwiera rzeczywisty proces i zamyka własny PID po inicjalizacji atlasów tekstur. Testy ustawiają pusty PATH i usuwają JAVA_HOME. `tests/electron-smoke.ts` sprawdza prawdziwe safeStorage i preload/IPC w ukrytym Electronie, zapisując `.smoke/electron-report.json`.

Potwierdzono instalację i reuse Minecraft 1.21.1, Fabric 0.19.5, NeoForge 21.1.251 i Forge 52.1.0. Minecraft z NeoForge faktycznie zainicjalizował grafikę bez systemowej Javy. Nie przeprowadzono długiej rozgrywki ani połączenia z serwerem.
Pełny login/refresh/logout na prawdziwym koncie Microsoft wymaga poprawnego Client ID i interakcji właściciela konta — tego testu jeszcze nie wykonano.

## Pozostały zakres

Konfiguracja online i status edycji, ping serwera, synchronizacja modpacka, auto-update i podpisany instalator pozostają kolejnymi etapami. Status serwera w UI jest placeholderem.
Nie ma jeszcze przycisku anulowania instalacji ani runtime dla innych systemów. Nie testowano spakowanego instalatora.
Spis plików: [IMPLEMENTATION.md](IMPLEMENTATION.md).

## Tryb deweloperski — lokalna paczka

W **Ustawienia → Deweloper** wybierz NeoForge (domyślnie `21.1.172`) lub Vanilla i kliknij **Wygeneruj i użyj lokalnej paczki**. Generator tworzy `developer/manifest.json` w zapisanym miejscu instalacji i włącza tryb deweloperski. Potem wybierz konto i kliknij **GRAJ**. Przełącznik w tej samej zakładce przywraca zwykłą instancję.

Obecny preset to Minecraft **1.21.1**, Java **21 x64**, zero dodatkowych modów. Można podać inną wersję NeoForge z linii `21.1.x`; dostępność wskazanej wersji zostanie sprawdzona dopiero podczas instalacji. Przykładowy manifest znajduje się w `examples/local-neoforge.manifest.json`. Wersja domyślna jest dostępna w [oficjalnym Maven NeoForge](https://maven.neoforged.net/releases/net/neoforged/neoforge/21.1.172/).

- Manifest jest generowany i odczytywany lokalnie, bez żądań sieciowych. Przy błędnym lub brakującym pliku uruchomienie kończy się komunikatem, bez zastępowania go konfiguracją online.
- Gra i Java używają osobnego folderu `instances/developer/`; zwykła instancja `instances/main/` pozostaje nienaruszona. Otwarcie folderu gry w ustawieniach uwzględnia aktywny tryb.
- Ponowne generowanie zastępuje tylko manifest. Nie usuwa światów, ustawień ani modów dodanych ręcznie do instancji testowej. `files: []` opisuje brak modów zarządzanych przez generator.
- Pierwsze uruchomienie nadal pobiera brakujące pliki Minecrafta, loadera i Javy z zaufanych źródeł. Temurin może pobierać archiwum z GitHuba. Ten tryb nie jest gwarantowanym trybem całkowicie offline i nie omija autoryzacji Microsoft ani weryfikacji plików.
- Zmiana trybu i generowanie są blokowane podczas przygotowywania lub działania gry. Ustawienie trybu utrzymuje się po restarcie.

Konfiguracja paczki z GitHuba nie jest jeszcze zaimplementowana w tym projekcie. `DeveloperPackService` stanowi lokalne źródło dla `InstanceService`; lokalny manifest jest wybierany przed instalacją i niezależnie od konfiguracji głównej instancji. Celowo obsługuje tylko pusty preset 1.21.1, a nie dowolne URL-e, pliki JAR czy polecenia JVM.
