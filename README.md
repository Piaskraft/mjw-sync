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
