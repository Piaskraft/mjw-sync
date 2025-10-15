# MJW Sync – PrestaShop price & stock sync

**Cel:** Pobieranie cen netto (PLN) z feedu → przeliczenie na EUR → dodanie marży 34% → ustawienie końcówki `.99` → update w PrestaShop (NETTO) + aktualizacja stanów.  
VAT nalicza Presta.

## Wymagania
- Node.js 18+
- Klucz API do PrestaShop (webservice)
- Dostęp do feedu (CSV/URL)

## Instalacja
```bash
npm i
cp .env.example .env   # uzupełnij .env (URL, API KEY, itp.)
npm run dry        # jednorazowy DRY – bez zmian w Preście
npm run real       # jednorazowy REAL – zapis do Presty
npm run cron:dry   # CRON co godzinę (DRY)
npm run cron:real  # CRON co godzinę (REAL)
npm run report     # generuje CSV z ostatniego logu JSONL


Perfekcyjnie 🔥 — projekt gotowy, zrobimy więc **instrukcję obsługi (manual)** tak, jakbyś przekazywał go developerowi lub sam wdrażał na serwer.

Poniżej masz gotowy, profesjonalny **plik `INSTRUKCJA_OBSLUGI.md`**
( możesz też nazwać go `README_PL.md` i wrzucić obok głównego `README.md` )

---

# 🇵🇱 Instrukcja obsługi – MJW Sync

**Autor:** Piaskraft
**Cel:** Automatyczna synchronizacja cen i stanów produktów w PrestaShop na podstawie feedu netto (PLN).
System pobiera dane z feedu → przelicza na EUR → dodaje marżę 34% → ustawia końcówkę `.99` → wysyła do API Presty.

---

## 🔧 Wymagania

* Node.js 18 lub nowszy
* Klucz API do PrestaShop z pełnymi uprawnieniami (`GET`/`PUT` produktów i stanów)
* Dostęp do feedu (plik CSV lub URL)
* Zainstalowane paczki (pierwszy raz):

  ```bash
  npm install
  ```

---

## ⚙️ Konfiguracja

1. **Utwórz plik `.env`**
   Na podstawie `env.example` (już w repozytorium):

   ```bash
   cp .env.example .env
   ```

2. **Uzupełnij dane w `.env`:**

   ```bash
   PS_API_URL=https://twojsklep.pl/api
   PS_API_KEY=TWÓJ_KLUCZ_API
   FEED_URL=file://./test.csv     # lub https://adres.pl/feed.csv
   FX_PLN_EUR=4.35                # używane przy RATE_MODE=FIXED
   RATE_MODE=FIXED                # FIXED lub ECB
   MARGIN=0.34
   ENDING=0.99
   MAX_DELTA=0.10
   REQS_PER_SEC=5
   PRICE_TARGET=NETTO
   ```

3. **Pierwsze uruchomienie (testowe):**

   ```bash
   npm run dry
   ```

---

## 🚀 Tryby działania

### 1️⃣ DRY (symulacja)

* Pobiera feed, liczy ceny, tworzy logi – **nie wysyła zmian do Presty**.
* Służy do testów i walidacji.

```bash
npm run dry
```

### 2️⃣ REAL (aktualizacja Presty)

* Wysyła realne zmiany cen i ilości przez API.

```bash
npm run real
```

### 3️⃣ CRON (automatyczne uruchomienie co godzinę)

**Tryb testowy (bez zmian):**

```bash
npm run cron:dry
```

**Tryb produkcyjny (zapis do Presty):**

```bash
npm run cron:real
```

> CRON uruchamia się o pełnej godzinie (strefa Europe/Berlin).
> Skrypt ma blokadę, żeby nie uruchamiać drugiej instancji w trakcie trwania poprzedniej.

---

## 📊 Logi i raporty

* Wszystko zapisuje się automatycznie w folderze `logs/`

  * `dry_YYYYMMDD_HHMM.jsonl` – testowy log
  * `real_YYYYMMDD_HHMM.jsonl` – realny log
  * `errors_YYYYMMDD_HHMM.jsonl` – błędy/walidacja
* Aby wygenerować raport CSV z ostatniego logu:

  ```bash
  npm run report
  ```

  Plik CSV pojawi się w tym samym folderze.

---

## 💾 Baza danych – `cache.sqlite`

* Lokalna baza (SQLite) w folderze projektu.
* Przechowuje:

  * `key` (EAN lub reference)
  * `id_product` i `id_product_attribute`
  * `last_price_net_eur`
  * `last_qty`
* Dzięki niej:

  * skrypt nie wysyła ponownie tych samych danych,
  * kontroluje `MAX_DELTA`,
  * wie, które produkty faktycznie się zmieniły.

Nie usuwaj pliku `cache.sqlite`, chyba że chcesz całkowicie wyczyścić historię i wymusić pełny update.

---

## 🛡️ Walidacja danych

System automatycznie pomija błędne rekordy:

* brak EAN/reference,
* `net_pln ≤ 0`,
* kurs PLN/EUR poza zakresem (`MIN_RATE–MAX_RATE`),
* ilości ujemne,
* cena spoza widełek (`MIN_NET_PLN–MAX_NET_PLN`).

Odrzucone rekordy zapisywane są w `logs/errors_*.jsonl`.

---

## 🔁 Retry i zabezpieczenia

* Każde połączenie z Prestą (`GET`, `PUT`) ma 3 próby z **exponential backoff** (1s → 2s → 4s).
* Jeśli Presta chwilowo nie odpowiada (np. błąd 429, 504), skrypt sam ponawia zapytanie.
* Jeśli problem trwa, wpis trafia do logu błędów i skrypt idzie dalej.

---

## 🧩 CRON na serwerze (stała praca)

Jeżeli chcesz, żeby synchronizacja działała 24/7:

### Opcja 1 – **PM2 (zalecane)**

```bash
npm install -g pm2
pm2 start "npm run cron:real" --name mjw-sync
pm2 save
pm2 startup
```

Sprawdź logi:

```bash
pm2 logs mjw-sync
```

### Opcja 2 – **Systemd / crontab**

Dodaj wpis:

```
0 * * * * /usr/bin/node /ścieżka/do/projektu/src/index.js
```

---

## 🧾 Rollback (cofnięcie zmian)

Jeśli musisz przywrócić stare ceny:

1. Otwórz `logs/real_YYYYMMDD_HHMM.jsonl` lub `.csv`
2. Znajdź `old_price` dla danego `key` (EAN)
3. Ustaw ją ręcznie w Preście (BO) lub napisz rollback z logu (mogę przygotować gotowy skrypt).

---

## ✅ Typowe problemy

| Problem                           | Przyczyna                               | Rozwiązanie                           |
| --------------------------------- | --------------------------------------- | ------------------------------------- |
| `Brak produktu w Preście dla EAN` | EAN z feedu nie istnieje w Preście      | Dodać produkt lub dopisać EAN         |
| `Nieprawidłowy kurs`              | Brak połączenia z ECB lub zły RATE_MODE | Ustawić `RATE_MODE=FIXED`             |
| Brak logów                        | Uruchomiono bez `--once`                | Użyj `npm run dry` lub `npm run real` |
| Zbyt duże różnice cen             | `MAX_DELTA` zbyt mały                   | Zwiększ w `.env`                      |

---

## 💬 Dodatkowe wskazówki

* **Feed** najlepiej aktualizować w nocy, żeby API Presty było wolne.
* **ECB** (kurs z Europejskiego Banku Centralnego) działa tylko, jeśli serwer ma dostęp do Internetu.
* **DRY** tryb można uruchamiać dowolnie często – nie wpływa na Prestę.
* Wszystkie błędy są w konsoli + `logs/errors_*.jsonl`.

---

## 🔚 Podsumowanie

✅ Gotowy, w pełni automatyczny system synchronizacji PrestaShop ↔ Feed
✅ Stabilny (retry, walidacja, cron, logi)
✅ Przetestowany w trybie DRY i REAL
✅ Zabezpieczony `.env`, `.gitignore`, SQLite cache


