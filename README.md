# AtlasFunding

AtlasFunding is a scholarship matching platform built for Indian students. It provides search, eligibility checking, and scholarship recommendation features through a full-stack web app with a Node.js/Express backend and a Vite-powered frontend.

## Key Features

- Scholarship search and detail browsing
- User authentication and dashboard access
- Eligibility engine for personalized matches
- Scholarship roadmap and timeline management
- Data seeding and scraping utilities for scholarship data

## Tech Stack

- Node.js
- Express
- MongoDB / Mongoose
- Vite
- HTML / CSS / JavaScript
- bcryptjs, jsonwebtoken, morgan, cors

## Project Structure

- `server.js` - application entry point
- `client/` - frontend app built with Vite
- `src/` - backend source modules
  - `db/` - database connection
  - `engine/` - search and eligibility engines
  - `middleware/` - authentication middleware
  - `models/` - Mongoose models
  - `routes/` - API routes
  - `seeds/` - seed data scripts
- `scripts/` - utility scripts for scraping, seeding, and cleanup

## Setup

1. Install backend dependencies:

   ```bash
   npm install
   ```

2. Install frontend dependencies:

   ```bash
   cd client
   npm install
   cd ..
   ```

3. Create a `.env` file in the project root and add required environment variables:

   ```env
   PORT=3001
   MONGODB_URI=<your-mongodb-connection-string>
   JWT_SECRET=<your-secret>
   NODE_ENV=development
   CLIENT_URL=http://localhost:5173
   GROQ_API_KEY=<optional, enables AI parsing/search>
   FIRECRAWL_API_KEY=<required for the scraper>
   CRON_SECRET=<optional locally, required in production>
   ```

## Running Locally

### Development mode

```bash
npm run dev
```

This starts both the backend server and the Vite frontend concurrently.

### Production mode

```bash
npm run build
npm start
```

## Useful Scripts

- `npm run server` - run Express backend only
- `npm run client` - run Vite frontend only
- `npm run seed` - seed the database with scholarship data
- `npm run scrape` - run the scholarship scraper (discovery target: 100 pages, capped at 200)
- `npm run scrape -- --limit 150` - run discovery with a custom target
- `npm run cleanup` - clean up scraped or seeded data

## Scheduled Jobs (Scraping & Cleanup)

The scraper and cleanup jobs no longer run inside the web process. They are triggered
by GitHub Actions workflows (`.github/workflows/cron-scraper.yml`,
`cron-cleanup.yml`) that POST to the server's `/api/cron/trigger` endpoint:

- **Scraper** — every 2 days at 00:00 IST (`job=scraper`)
- **Cleanup** — every 2 days at 01:00 IST (`job=cleanup`), 1 hour after the scraper

To enable them you must set the **same** `CRON_SECRET` value in **two** places:

1. **Render (server env):** add `CRON_SECRET=<a long random string>` to the service's
   environment variables. In production the trigger refuses to run without it.
2. **GitHub (repository secret):** add `CRON_SECRET` as a repository secret with the
   same value. The workflows send it in the `x-cron-secret` header.

Optional: if the API lives somewhere other than `https://atlasfunding.onrender.com`,
set the `API_BASE_URL` repository variable; the workflows default to that URL.

You can also run either job on demand from the **Actions** tab
(`workflow_dispatch`), or locally via `npm run scrape` / `npm run cleanup`.

## Notes

- Ensure MongoDB is running before starting the app.
- The frontend uses the API exposed by the backend server.
- Update `MONGODB_URI` and `JWT_SECRET` in `.env` before use.
