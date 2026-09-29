# Treści GitHub i status serwera

Launcher pobiera `config.json`, `news.json` i `changelog.json` z katalogu `launcher-config` w gałęzi `main` repozytorium `luki2428/Meow-Launcher`. Opublikuj te pliki razem ze zmianami. Do czasu ich publikacji UI pokazuje komunikat o niedostępności treści.

Inne repozytorium lub gałąź: ustaw `MAIN_VITE_COMMUNITY_URL` przed budowaniem, np. `https://raw.githubusercontent.com/OWNER/REPO/main/launcher-config`. Podczas lokalnego uruchamiania można użyć `LAUNCHER_COMMUNITY_URL`. Źródło musi być publicznym adresem HTTPS na `raw.githubusercontent.com`; nie wymaga tokenu.

## Serwer

W `launcher-config/config.json` zamień `null` na adres:

```json
{
  "server": {
    "host": "play.example.com",
    "port": 25565
  }
}
```

`host` to IP (IPv4 lub IPv6 bez nawiasów) albo nazwa DNS, bez protokołu i portu. Port jest opcjonalny, domyślnie 25565. Dla domen korzystających z SRV podaj rzeczywisty host i port docelowy. Obsługiwany jest Minecraft Java Server List Ping przez TCP, bez zewnętrznego API. Serwer musi mieć włączone `enable-status`. Status i liczba graczy odświeżają się co 30 sekund; ping, wersja i MOTD są w podpowiedzi statusu. Brak adresu oznacza status nieznany, błąd połączenia — offline.

## Aktualności i changelog

Każdy plik zawiera tablicę wpisów (maksymalnie 100), np.:

```json
[
  {
    "id": "edition-start",
    "date": "2026-09-30",
    "title": "Start edycji",
    "body": "Zapraszamy na serwer!\nDruga linia wiadomości."
  }
]
```

Używaj unikalnych `id`. Wpisy są sortowane od najnowszych. Treść to zwykły tekst, bez wykonywania HTML. Pusta tablica oznacza brak wpisów. Konfiguracja i treści są odświeżane co 5 minut, z limitem czasu i walidacją. W razie błędu zachowywana jest ostatnia poprawna treść w pamięci bieżącej sesji; po ponownym uruchomieniu bez internetu listy będą puste. Status serwera nie blokuje uruchamiania gry.

## Anulowanie

Przycisk **Anuluj** obejmuje przygotowanie gry, modpack, Javę, Minecrafta i loader. Pobieranie jest przerywane, a uruchomienie gry zatrzymane. Krótkie operacje zatwierdzania plików oraz operacje biblioteki, których nie można przerwać, kończą się przed odblokowaniem kolejnej instalacji. Poprawne pobrane pliki Minecrafta pozostają do ponownego wykorzystania; instalator weryfikuje je przy kolejnej próbie. Anulowanie nie usuwa danych gracza i nie zatrzymuje już uruchomionej gry.
