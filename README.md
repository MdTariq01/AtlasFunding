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
- bcryptjs, jsonwebtoken, express-validator
- node-cron, morgan, cors

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
   PORT=5000
   MONGO_URI=<your-mongodb-connection-string>
   JWT_SECRET=<your-secret>
   NODE_ENV=development
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
- `npm run scrape` - run the scholarship scraper
- `npm run cleanup` - clean up scraped or seeded data

## Notes

- Ensure MongoDB is running before starting the app.
- The frontend uses the API exposed by the backend server.
- Update `MONGO_URI` and `JWT_SECRET` in `.env` before use.
