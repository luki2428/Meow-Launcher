# Aktualizacje launchera

Zainstalowany launcher przy każdym uruchomieniu sprawdza stabilne wydania
`luki2428/Meow-Launcher` w GitHub Releases. Pobiera nowszą wersję w tle,
weryfikuje ją przez electron-updater i uruchamia instalator z ponownym startem
aplikacji. Instalacja lub działająca gra odracza restart do zakończenia tych operacji.
Stopka pokazuje stan aktualizacji. Błąd sieci, brak wydania lub wadliwy plik
nie blokuje używania obecnej wersji; kolejna próba następuje przy następnym starcie.
Tryb `npm run dev` nie pobiera ani nie instaluje aktualizacji.

## Publikowanie wersji Windows

1. Zwiększ `version` w `package.json`, np. z `1.0.0` na `1.0.1`.
2. Uruchom `npm run build:win -- --publish never` lub
   `npm run build` i `npx electron-builder --win --publish never`.
3. W repozytorium utwórz publiczne, stabilne wydanie z tagiem zgodnym z wersją,
   np. `v1.0.1` (nie draft ani prerelease).
4. Dodaj komplet plików z `dist`: instalator `meowlauncher-1.0.1-setup.exe`,
   odpowiadający mu `.exe.blockmap` oraz `latest.yml`. Publikuj wydanie dopiero
   po dodaniu wszystkich plików. Nie zmieniaj ręcznie nazw ani sum w metadanych.

Można też opublikować komplet przez `npx electron-builder --win --publish always`
po wykonaniu `npm run build`, z `GH_TOKEN` ustawionym wyłącznie w środowisku
publikującym. Nigdy nie dołączaj tokenu do aplikacji. Repozytorium i pliki wydań
muszą być publicznie dostępne dla użytkowników.

Mechanizm używa NSIS dla Windows i sum SHA-512 generowanych przez Electron Builder
(odrębnie od SHA-256 plików modpacka). Nie wyłącza weryfikacji podpisu instalatora.
macOS wymaga podpisanych wydań oraz plików ZIP i `latest-mac.yml`;
Linux wymaga odpowiednich artefaktów i `latest-linux.yml`.

Starsze wersje bez tego mechanizmu trzeba jednorazowo zastąpić nowym instalatorem.
Test całości wymaga zainstalowania starszego wydania z updaterem i opublikowania
nowszego: sprawdź pobieranie, restart, nowy numer wersji, zachowanie ustawień,
pracę bez internetu i odroczenie instalacji podczas uruchomionej gry.

Dokumentacja: https://www.electron.build/v26/docs/features/auto-update/
