# Garo2 Backend

Express backend for the Garo2 site with SQLite storage.

## Local setup

1. Copy `.env.example` to `.env`.
2. Run `npm install`.
3. Start the server with `npm run dev`.

## Dictionary CSV tools

- Import a CSV into `dictionary_entries`: `npm run dictionary:import -- C:\\path\\to\\dictionary.csv`
- Export the current `dictionary_entries` table: `npm run dictionary:export`
- Export to a custom file: `npm run dictionary:export -- .\\data\\my-dictionary.csv`

The import command expects at least `english_word` and `garo_word` columns. If a `notes` column is present, it will be imported too. Existing `(english_word, garo_word)` pairs are skipped automatically.

## Production env

- `PORT=8000`
- `FRONTEND_ORIGINS=https://frontend.your-domain.com`
- `DB_PATH=./data/garo2.sqlite`
- `COOKIE_SECURE=true`
- `COOKIE_SAME_SITE=lax`
- `TRUST_PROXY=true`

Use `COOKIE_SAME_SITE=none` only if your frontend and backend are hosted on different sites and you need cross-site cookies over HTTPS.

## Hostinger deployment

1. Upload the `backend` folder as its own Node.js app.
2. Set the startup command to `npm start`.
3. Add the production environment variables from above in Hostinger.
4. Make sure the backend domain or subdomain is reachable over HTTPS.
5. Keep the `data` directory writable so SQLite can persist the database.

## Default seeded admin account

- Username: `admin`
- Password: `admin123`
