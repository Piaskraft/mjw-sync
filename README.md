
Perfekcyjnie ✅
Skoro cron (harmonogram co godzinę) będzie już po stronie **developera na serwerze**, to Ty masz gotowy, przetestowany kod lokalnie — teraz wystarczy przygotować **pełne, profesjonalne README.md** z instrukcją instalacji, konfiguracji, działania i obsługi.

Poniżej masz **gotowy plik README.md**, który możesz od razu wkleić do repo (`mjw-sync/README.md`) albo wysłać devowi.
Napisałem go tak, jak robią to doświadczeni programiści — krok po kroku, jasno i bez skrótów.

---

# 🧰 MJW → PrestaShop Sync

Automatyczny skrypt synchronizujący produkty między feedem dostawcy MJW a sklepem PrestaShop poprzez API.
System walutuje ceny netto PLN → EUR, dodaje marżę, aktualizuje stany magazynowe i utrzymuje pamięć podręczną (SQLite cache).

---

## ⚙️ Funkcjonalność

✅ Pobiera dane z pliku feed (CSV lub XML) od dostawcy MJW
✅ Walutuje ceny z PLN na EUR wg kursu ECB
✅ Dodaje konfigurowalną marżę (domyślnie 34%)
✅ Aktualizuje **ceny netto** produktów w PrestaShop przez API
✅ Aktualizuje **stany magazynowe** (`stock_availables`)
✅ Używa **SQLite cache** (`cache.sqlite`) do wykrywania zmian
✅ Loguje każde wykonanie (`logs/`)
✅ Tryby:

* **DRY RUN (test)** – bez zmian w PrestaShop
* **REAL (produkcyjny)** – rzeczywista aktualizacja przez API
  ✅ Zabezpieczenia:
* limit zmiany ceny (`MAX_DELTA`)
* retry przy błędach API
* cache z timestampem `updated_at`
* fallback minimalnego PUT (id + price)

---

## 📂 Struktura projektu

```
mjw-sync/
│
├── src/
│   ├── index.js              # główny skrypt z logiką synca
│   ├── prestashop.js         # komunikacja z API PrestaShop
│   ├── feed.js               # pobieranie feedu MJW
│   ├── db.js                 # obsługa cache SQLite
│   ├── rate.js               # kurs EUR z ECB
│   ├── check.js              # walidacja danych wejściowych
│   ├── put-price.js          # testowy PUT ceny produktu
│   ├── test-put.js           # testowy PUT stanu magazynowego
│   └── logs_to_csv.js        # eksport logów do CSV
│
├── cache.sqlite              # lokalna baza cache (tworzy się automatycznie)
├── .env                      # konfiguracja środowiska
├── package.json              # skrypty npm + zależności
├── logs/                     # logi .jsonl (działa automatycznie)
└── README.md                 # (ten plik)
```

---

## 🔧 Wymagania

* **Node.js** ≥ 18.0.0 (zalecane LTS 22.x)
* Zainstalowane zależności:

  ```bash
  npm install
  ```

---

## ⚙️ Konfiguracja środowiska (`.env`)

Przykład:

```ini
# API PrestaShop
PS_API_URL=https://www+++++++++com/api
PS_API_KEY=+++++++++++++++++
# Parametry przeliczeń
MARGIN=0.34          # marża 34%
ENDING=0.99          # końcówka ceny (np. 12.99)
MAX_DELTA=0.10       # max 10% różnicy między starą a nową ceną
REQS_PER_SEC=5       # limity zapytań (RPS)

# Tryb testowy/realny
REAL=0               # 0 = test (DRY), 1 = realny sync

# Opcjonalnie do testów
FORCE_ID=1359        # wymuszony produkt do testów
```

---

## 🚀 Uruchomienie lokalne (testy)

1. **Tryb testowy (bez zmian w sklepie):**

   ```bash
   npm run dry:once
   ```

   ✅ Pobiera feed
   ✅ Oblicza nowe ceny
   ✅ Wypisuje różnice (bez zmian w Preście)

2. **Tryb REAL (produkcja):**

   ```bash
   set REAL=1 && node src/index.js --once
   ```

   lub (na Linuxie):

   ```bash
   REAL=1 node src/index.js --once
   ```

   ✅ Aktualizuje ceny + stany przez API

---

## ⏰ Automatyczny CRON (serwer)

Skrypt ma wbudowany `node-cron`, ale zalecane jest uruchamianie zewnętrznego crona co godzinę.

### 🔹 Linux (VPS / serwer produkcyjny)

Zainstaluj `cron`:

```bash
sudo apt update
sudo apt install cron
sudo systemctl enable --now cron
```

Edytuj harmonogram:

```bash
crontab -e
```

Dodaj wpis:

```
0 * * * * REAL=1 /usr/bin/node /opt/mjw-sync/src/index.js --once >> /opt/mjw-sync/logs/cron.log 2>&1
```

Logi znajdziesz w `/opt/mjw-sync/logs/cron.log`.

---

## 💾 Baza cache (SQLite)

Lokalna baza `cache.sqlite` zapisuje:

* `key` (EAN lub reference)
* `id_product`
* `id_product_attribute`
* `last_price_net_eur`
* `last_qty`
* `updated_at`

Tabela tworzy się automatycznie przy pierwszym uruchomieniu.
Lokalizacja: główny folder projektu (`process.cwd()`).

Backup możesz robić np. raz dziennie:

```bash
cp cache.sqlite backups/cache_$(date +%F).sqlite
```

---

## 📜 Logi

Każdy cykl (REAL i DRY) generuje log JSON Lines w folderze `logs/`:

```
logs/
 ├── dry_2025-10-16_12_00.jsonl
 ├── real_2025-10-16_13_00.jsonl
 └── errors_2025-10-16_13_05.jsonl
```

Każdy wpis zawiera:

```json
{
  "time": "2025-10-16T12:00:00Z",
  "key": "5901867202451",
  "id": 1359,
  "old_price": 1.99,
  "new_price": 12.99,
  "final_price": 12.99,
  "qty": 10,
  "rate": 4.35,
  "mode": "REAL"
}
```

Eksport do CSV:

```bash
npm run report
```

Wynik zapisze się jako `logs/report_<data>.csv`.

---

## 🧪 Testowanie API

Do testów bez feedu służą dwa skrypty:

| Skrypt             | Opis                               | Uruchomienie       |
| ------------------ | ---------------------------------- | ------------------ |
| `src/put-price.js` | test PUT ceny produktu             | `npm run test:put` |
| `src/test-put.js`  | test PUT ilości (stock_availables) | `npm run test:api` |

Parametry testowe pobierane są z `.env` (`PS_API_URL`, `PS_API_KEY`, `PROD_ID`, `NEW_NET_PRICE`, `QTY`).

---

## 🧩 Mapping produktów (opcjonalny)

Plik `mapping.csv` pozwala ręcznie przypisać `EAN` → `id_product` + `id_product_attribute`.
Format:

```csv
ean,id_product,id_product_attribute
5901867202451,1359,0
```

Jeśli istnieje `mapping.csv`, skrypt użyje tych ID zamiast wyszukiwać w API.

---

## 🧠 Zasada działania – skrót techniczny

1. Pobranie kursu EUR z ECB
2. Wczytanie feedu MJW (`fetchFeed()`)
3. Deduplikacja wg EAN/reference
4. Walidacja i normalizacja danych
5. Wyszukanie produktu w Preście (`findByEAN` / `findByRefAny`)
6. Przeliczenie nowej ceny:

   ```
   netEUR = (netPLN / rate) * (1 + MARGIN)
   applyEnding(netEUR, ENDING)
   ```
7. Ograniczenie zmiany (`capDelta(old, new, MAX_DELTA)`)
8. Aktualizacja:

   * pełny PUT (product XML)
   * lub fallback minimalny PUT (id + price)
   * stock przez `/stock_availables/<id>`
9. Aktualizacja cache i logów

---

## 🧩 Developer Notes (dla integratora)

* Wszystkie ścieżki są względne względem `process.cwd()`
* `db.js` tworzy bazę automatycznie
* Presta wymaga `Content-Type: application/xml` i pustego hasła BasicAuth
* API key podajemy jako `username`, `password` = `""`
* Odpowiedzi XML parsowane przez `fast-xml-parser`
* W razie błędów: retry 3× z exponential backoff

---

## 🛠️ Typowe problemy

| Problem                                         | Przyczyna                           | Rozwiązanie                                       |
| ----------------------------------------------- | ----------------------------------- | ------------------------------------------------- |
| `findByEAN is not a function`                   | Stary plik `prestashop.js`          | Zaktualizować z repo                              |
| `SQLITE_CONSTRAINT: NOT NULL constraint failed` | brak `id_product_attribute` w cache | Naprawione – domyślnie `0`                        |
| `ECONNRESET` lub `ETIMEDOUT`                    | API Presty wolne                    | retry automatyczny 3x                             |
| Brak produktu w logach                          | brak EAN/reference w feedzie        | popraw dane źródłowe                              |
| `Błąd: Nieprawidłowy kurs`                      | brak danych z ECB                   | skrypt przerwie i zapisze w `logs/errors_*.jsonl` |

---

## 📤 Deployment na serwer (dla developera)

1. Skopiować repo do `/opt/mjw-sync`
2. Wgrać `.env` z danymi API sklepu
3. Uruchomić ręcznie test:

   ```bash
   npm run dry:once
   ```
4. Jeśli poprawnie, dodać cron:

   ```
   0 * * * * REAL=1 /usr/bin/node /opt/mjw-sync/src/index.js --once >> /opt/mjw-sync/logs/cron.log 2>&1
   ```
5. Monitorować logi (`tail -f logs/cron.log`)

---

