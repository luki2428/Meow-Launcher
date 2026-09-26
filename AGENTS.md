# AGENTS.md

## Cel projektu

Budujemy **własny launcher Minecraft** przeznaczony przede wszystkim do uruchamiania **naszego modpacka / serwera Minecraft**.

Launcher ma być aplikacją desktopową napisaną w:

- **Electron**
- **React**
- **TypeScript**
- **Vite / electron-vite**

Projekt nie ma być uniwersalnym launcherem pokroju Prism Launchera. Priorytetem jest prosty, stabilny i estetyczny launcher obsługujący jeden główny modpack oraz nasz serwer.

---

## Główne założenia

Launcher powinien docelowo:

1. wyświetlać interfejs użytkownika w React,
2. pokazywać status serwera Minecraft,
3. pokazywać liczbę graczy online,
4. pokazywać aktualny status edycji, np.:
   - aktywna,
   - przerwa techniczna,
   - wkrótce,
   - zakończona,
5. pobierać konfigurację launchera z internetu,
6. sprawdzać wersję modpacka,
7. pobierać / aktualizować modpack,
8. weryfikować pobierane pliki,
9. zarządzać wymaganym środowiskiem Java,
10. uruchamiać odpowiednią wersję Minecrafta,
11. obsługiwać Fabric / Forge / NeoForge zależnie od konfiguracji paczki,
12. obsługiwać logowanie Microsoft dla graczy posiadających Minecraft Java Edition,
13. opcjonalnie obsługiwać profil offline oparty tylko o nick,
14. przechowywać lokalne ustawienia użytkownika,
15. pokazywać postęp instalacji / aktualizacji,
16. obsługiwać błędy i tworzyć logi,
17. docelowo aktualizować również sam launcher.

---

# Architektura

Projekt powinien zachować klasyczny podział Electron:

```text
src/
├── main/
├── preload/
└── renderer/
```

## `main`

Proces Electron Main odpowiada za logikę mającą dostęp do systemu.

Tutaj powinny znajdować się m.in.:

- operacje na plikach,
- pobieranie plików,
- uruchamianie procesów,
- Java,
- Minecraft,
- modpack,
- autoryzacja Microsoft,
- status serwera,
- konfiguracja,
- logi,
- IPC handlers.

Przykładowa struktura:

```text
src/main/
├── index.ts
├── ipc/
│   └── registerHandlers.ts
├── services/
│   ├── ConfigService.ts
│   ├── ServerStatusService.ts
│   ├── DownloadService.ts
│   ├── ModpackService.ts
│   ├── JavaService.ts
│   ├── MinecraftService.ts
│   ├── AuthService.ts
│   └── SettingsService.ts
└── types/
```

---

## `preload`

`preload` jest bezpiecznym mostem między Reactem a procesem głównym.

React NIE powinien otrzymywać bezpośredniego dostępu do:

- `fs`,
- `child_process`,
- `ipcRenderer`,
- tokenów Microsoft,
- dowolnego wykonywania komend systemowych.

Wystawiamy jedynie konkretne API przez `contextBridge`.

Przykład:

```ts
window.launcher.getServerStatus()
window.launcher.play()
window.launcher.loginMicrosoft()
window.launcher.setRam(8192)
```

Nie należy wystawiać API typu:

```ts
window.api.exec(command)
window.api.readAnyFile(path)
```

---

## `renderer`

Renderer to React.

Powinien odpowiadać wyłącznie za UI i stan interfejsu.

Przykładowa struktura:

```text
src/renderer/src/
├── App.tsx
├── pages/
│   ├── Home.tsx
│   ├── Login.tsx
│   └── Settings.tsx
├── components/
│   ├── PlayButton.tsx
│   ├── ServerStatus.tsx
│   ├── ProgressBar.tsx
│   └── Sidebar.tsx
├── hooks/
├── types/
└── styles/
```

---

# Bezpieczeństwo Electron

Projekt powinien domyślnie korzystać z:

```ts
contextIsolation: true
nodeIntegration: false
```

Nie wolno:

- używać `eval`,
- udostępniać `ipcRenderer` bezpośrednio rendererowi,
- wykonywać arbitralnych komend przekazanych przez UI,
- zapisywać tokenów logowania jako jawny tekst,
- ufać URL-om pobieranym bez walidacji,
- ufać danym z Internetu bez walidacji.

Tokeny Microsoft powinny być przechowywane z wykorzystaniem bezpiecznych mechanizmów systemowych, np. `safeStorage` w Electron.

---

# Modpack

Modpack jest jednym z najważniejszych elementów projektu.

Launcher powinien korzystać z manifestu opisującego paczkę.

Przykładowy manifest:

```json
{
  "version": "1.4.2",
  "minecraft": "1.21.1",
  "loader": {
    "type": "neoforge",
    "version": "21.1.0"
  },
  "files": [
    {
      "path": "mods/example.jar",
      "url": "https://example.com/example.jar",
      "sha256": "..."
    }
  ]
}
```

Każdy zarządzany plik powinien mieć co najmniej:

```ts
interface ModpackFile {
  path: string
  url: string
  sha256: string
  size?: number
}
```

Launcher powinien:

1. pobrać manifest,
2. porównać lokalną wersję z najnowszą,
3. sprawdzić istniejące pliki,
4. porównać SHA-256,
5. pobrać tylko brakujące / zmienione pliki,
6. zweryfikować pobrane pliki,
7. usunąć stare pliki zarządzane przez launcher,
8. zapisać wersję zainstalowanego modpacka.

---

# Dane użytkownika

Nie wolno bez potrzeby nadpisywać danych użytkownika.

Foldery takie jak:

```text
saves/
screenshots/
resourcepacks/
shaderpacks/
```

powinny być traktowane jako dane użytkownika.

Także pliki takie jak:

```text
options.txt
servers.dat
```

nie powinny być automatycznie nadpisywane, chyba że istnieje bardzo konkretny powód.

Folder `mods/` może być w pełni zarządzany przez launcher, jeśli tak zdecydujemy.

Folder `config/` wymaga ostrożności, ponieważ część modów zapisuje tam preferencje użytkownika.

---

# Pobieranie plików

Download manager powinien obsługiwać:

- HTTPS,
- progress,
- retry,
- timeout,
- anulowanie,
- pliki tymczasowe,
- sprawdzanie SHA-256,
- zgłaszanie prędkości pobierania,
- zgłaszanie aktualnego pliku.

Nie zapisujemy pobieranego pliku od razu pod końcową nazwą.

Preferowany schemat:

```text
example.jar.tmp
↓
download
↓
SHA-256
↓
OK
↓
example.jar
```

---

# Minecraft

Nie chcemy implementować całego protokołu launchera Minecraft od zera, jeśli nie jest to konieczne.

Preferujemy użycie istniejącego, sensownego core / biblioteki do:

- instalowania Minecrafta,
- pobierania libraries,
- pobierania assets,
- natives,
- generowania classpath,
- argumentów JVM,
- argumentów gry,
- instalacji loadera,
- uruchamiania klienta.

Jednocześnie biblioteka powinna być schowana za własną abstrakcją.

Przykład:

```ts
interface GameLauncher {
  launch(options: LaunchOptions): Promise<void>
}
```

Nie rozsiewamy importów zewnętrznego launcher-core po całym projekcie.

Tworzymy adapter, np.:

```text
MinecraftJavaCoreAdapter.ts
```

Dzięki temu można później wymienić bibliotekę bez przepisywania całej aplikacji.

---

# Java

Launcher powinien:

- wykrywać odpowiednią Javę,
- sprawdzać jej wersję,
- pozwalać wskazać własną Javę,
- docelowo móc automatycznie pobrać własny runtime.

Preferowany model docelowy:

```text
launcher-data/
└── runtime/
    └── java-21/
```

Dzięki temu użytkownik nie musi ręcznie instalować odpowiedniej wersji Javy.

---

# Logowanie Microsoft

Docelowo launcher ma pozwalać zalogować się kontem Microsoft i korzystać z legalnie zakupionej wersji Minecraft Java Edition.

Flow może obejmować:

```text
Microsoft OAuth
↓
Xbox Live
↓
XSTS
↓
Minecraft Services
↓
Minecraft profile
```

Nie implementujemy ręcznie całego flow, jeśli dostępna jest sprawdzona biblioteka.

Wymagania:

- brak przechowywania hasła użytkownika,
- poprawne przechowywanie tokenów,
- obsługa refresh token,
- obsługa wygaśniętej sesji,
- możliwość wylogowania,
- pobranie nicku i UUID,
- sprawdzenie profilu Minecraft.

---

# Profil offline

Opcjonalnie launcher może pozwalać uruchomić grę po podaniu samego nicku.

W takim przypadku należy:

- walidować nick,
- generować poprawne offline UUID,
- zapisać lokalny profil,
- rozróżnić konto offline od Microsoft.

Przykładowy wspólny model:

```ts
type Account =
  | {
      type: "microsoft"
      username: string
      uuid: string
      accessToken: string
    }
  | {
      type: "offline"
      username: string
      uuid: string
    }
```

Konto offline nie jest pełnym uwierzytelnieniem użytkownika i nie działa jak standardowe konto premium na serwerze z `online-mode=true`.

---

# Status serwera

Launcher powinien potrafić bezpośrednio wykonać Minecraft Server List Ping.

Powinien pobierać:

- online / offline,
- liczbę graczy,
- maksymalną liczbę graczy,
- MOTD,
- ping,
- wersję serwera.

Przykładowy model:

```ts
interface ServerStatus {
  online: boolean
  players: number
  maxPlayers: number
  ping?: number
  motd?: string
}
```

---

# Status edycji

Konfiguracja online powinna pozwalać kontrolować aktualny stan serwera / edycji.

Przykład:

```json
{
  "edition": {
    "name": "Edycja IV",
    "status": "active",
    "playEnabled": true,
    "message": ""
  }
}
```

Obsługiwane stany mogą obejmować:

```ts
type EditionStatus =
  | "active"
  | "maintenance"
  | "coming-soon"
  | "ended"
```

Jeśli `playEnabled` jest `false`, launcher może zablokować przycisk `GRAJ` i pokazać odpowiedni komunikat.

---

# GitHub

Na początku projekt nie wymaga własnego backendu.

GitHub może służyć do przechowywania:

- konfiguracji launchera,
- manifestu modpacka,
- changelogu,
- statusu edycji,
- informacji o najnowszej wersji,
- release'ów launchera.

Przykład:

```text
launcher-config/
├── config.json
├── manifest.json
├── latest.json
└── changelog.json
```

Nie należy zakładać, że wszystkie cudze mody można legalnie redystrybuować z GitHub Releases. Przy pobieraniu modów trzeba respektować źródła i licencje poszczególnych projektów.

---

# Konfiguracja lokalna

Ustawienia lokalne przechowujemy w katalogu danych aplikacji Electron.

Preferowane:

```ts
app.getPath("userData")
```

Przykładowe dane:

```json
{
  "selectedAccount": "account-id",
  "ram": 8192,
  "gameDirectory": "...",
  "installedModpackVersion": "1.4.2"
}
```

---

# RAM

Launcher powinien pozwalać ustawić maksymalną ilość RAM dla Minecrafta.

Przykład:

```text
-Xms2G
-Xmx8G
```

UI nie powinno pozwalać na oczywiście niepoprawne wartości względem ilości pamięci dostępnej na komputerze.

---

# Progress / stan launchera

Main process powinien raportować stan do Reacta.

Przykładowy event:

```ts
{
  stage: "downloading",
  progress: 72,
  message: "Pobieranie Create..."
}
```

Przykładowe etapy:

```text
idle
checking
downloading
verifying
installing
launching
running
error
```

React powinien jedynie prezentować ten stan.

---

# Obsługa błędów

Błędy mają być zrozumiałe dla użytkownika.

Nie pokazujemy wyłącznie:

```text
Error
```

Przykładowe błędy:

```text
Nie udało się pobrać aktualizacji.
Nie znaleziono odpowiedniej wersji Java.
Brakuje miejsca na dysku.
Nie można połączyć się z serwerem.
Sesja Microsoft wygasła.
Pobrany plik ma niepoprawną sumę SHA-256.
Minecraft zakończył działanie z kodem 1.
```

W kodzie warto używać własnych kodów błędów.

Przykład:

```ts
throw new LauncherError(
  "MODPACK_DOWNLOAD_FAILED",
  "Nie udało się pobrać aktualizacji."
)
```

---

# Logi

Launcher powinien zapisywać logi techniczne.

Przykład:

```text
logs/
├── launcher.log
└── minecraft.log
```

Logujemy m.in.:

- start aplikacji,
- wersję launchera,
- sprawdzanie aktualizacji,
- pobieranie plików,
- instalację,
- uruchamianie Minecrafta,
- błędy.

Nigdy nie logujemy:

- access token,
- refresh token,
- haseł,
- sekretów,
- pełnych danych uwierzytelniających.

---

# UI / UX

Interfejs powinien być:

- nowoczesny,
- prosty,
- szybki,
- czytelny,
- dopasowany do launchera Minecraft,
- bez zbędnego przeładowania funkcjami.

Na głównym ekranie powinny być widoczne przede wszystkim:

- status serwera,
- liczba graczy,
- status edycji,
- aktualna wersja modpacka,
- wybrane konto,
- przycisk `GRAJ`,
- progress aktualizacji,
- ewentualny komunikat / news.

---

# Priorytet implementacji

Nie próbujemy budować wszystkiego naraz.

## Etap 0 — baza

- Electron
- React
- TypeScript
- electron-vite
- poprawny `main`
- poprawny `preload`
- poprawny `renderer`
- działające IPC

## Etap 1 — UI

- podstawowy ekran launchera,
- `GRAJ`,
- status serwera placeholder,
- wersja launchera,
- ekran ustawień.

## Etap 2 — konfiguracja online

- `config.json`,
- status edycji,
- adres serwera,
- wersja modpacka,
- obsługa braku Internetu.

## Etap 3 — status serwera

- ping serwera,
- liczba graczy,
- online / offline.

## Etap 4 — konto offline

- wpisanie nicku,
- profil lokalny,
- offline UUID.

## Etap 5 — czysty Minecraft

- integracja launcher core,
- Java,
- instalacja Minecrafta,
- uruchomienie gry.

Najważniejszy milestone:

> Kliknięcie `GRAJ` uruchamia działającego Minecrafta.

## Etap 6 — loader

- Fabric / Forge / NeoForge.

## Etap 7 — modpack

- manifest,
- pobieranie,
- SHA-256,
- aktualizacja,
- usuwanie starych plików,
- progress.

## Etap 8 — Microsoft

- logowanie,
- zapisywanie sesji,
- refresh,
- wybór konta.

## Etap 9 — polish

- auto-update launchera,
- changelog,
- newsy,
- lepsze logi,
- crash handling,
- instalator.

---

# Zasady dla agenta pracującego nad projektem

Gdy użytkownik prosi o implementację:

1. Najpierw sprawdź istniejącą strukturę projektu.
2. Nie przebudowuj całej aplikacji bez potrzeby.
3. Zachowuj istniejący styl kodu.
4. Preferuj małe, wydzielone moduły zamiast dużych plików.
5. Nie umieszczaj logiki systemowej w React.
6. Nie udostępniaj Node API bezpośrednio rendererowi.
7. Zachowuj typowanie TypeScript.
8. Unikaj `any`, jeśli można określić konkretny typ.
9. Nie implementuj własnej kryptografii.
10. Nie przechowuj sekretów i tokenów jawnie.
11. Nie loguj danych uwierzytelniających.
12. Nie wykonuj dowolnych komend pochodzących z UI.
13. Waliduj dane z sieci.
14. Weryfikuj pobierane pliki SHA-256.
15. Zachowuj kompatybilność z istniejącą architekturą.
16. Jeśli dodawana biblioteka zewnętrzna odpowiada za kluczowy element, ukryj ją za adapterem / service.
17. Nie dodawaj dużych zależności, jeśli problem można rozwiązać prosto.
18. Przy nowych zależnościach sprawdź, czy są nadal utrzymywane i sensowne dla Electron/Node.
19. Nie implementuj funkcji „na zapas”, jeśli nie jest potrzebna w aktualnym etapie.
20. Po zmianie uruchom odpowiednie:
   - typecheck,
   - lint,
   - testy,
   - build,
   jeśli są dostępne.

---

# Styl implementacji

Preferujemy:

```ts
class ModpackService {}
class MinecraftService {}
class AuthService {}
class ConfigService {}
```

lub funkcjonalne moduły, jeśli pasują do istniejącego kodu.

Nie chcemy jednego pliku:

```text
launcher.ts
```

zawierającego całą logikę aplikacji.

Kod powinien być łatwy do testowania i wymiany.

---

# Przykład przepływu aplikacji

```text
START
  ↓
załaduj ustawienia lokalne
  ↓
pobierz config online
  ↓
sprawdź status edycji
  ↓
sprawdź status serwera
  ↓
sprawdź wersję modpacka
  ↓
aktualizacja potrzebna?
 ├── TAK → pobierz / zweryfikuj / zainstaluj
 └── NIE
  ↓
użytkownik klika GRAJ
  ↓
sprawdź konto
  ↓
sprawdź Java
  ↓
sprawdź Minecraft
  ↓
sprawdź loader
  ↓
uruchom Minecraft
  ↓
monitoruj proces
  ↓
po zamknięciu wróć do launchera
```

---

# Najważniejsza zasada

Priorytetem jest:

> **stabilny launcher do naszego modpacka i serwera, a nie tworzenie uniwersalnej platformy do zarządzania wszystkimi możliwymi wersjami Minecrafta.**

Rozwiązania powinny być projektowane pod ten cel.
