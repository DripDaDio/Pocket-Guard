# Pocket Guard (Prototype)

A friendly, server-rendered Node.js app that acts as your personal AI finance buddy.

## Stack
- Node.js + Express
- EJS templates
- Prisma ORM (SQLite for prototype)
- SCSS (compiled to public/css)

## Getting started
1. Install dependencies
2. Generate Prisma client and push DB
3. Seed demo data
4. Start the app

### One-time setup
- macOS zsh

```
# Install deps
npm install

# Configure environment
# Either export the variable or create a .env file at project root
export DATABASE_URL="file:./prisma/dev.db"
export SESSION_SECRET="change_me"
export NODE_ENV="development"

# Generate prisma client and push schema
npm run prisma:generate
npm run db:push

# Seed demo data
npm run db:seed

# Build CSS (optional, a minimal CSS is already included)
npm run css:build

# Start dev server
npm run dev
```

Open http://localhost:3000

Demo login: demo@pocketguard.test / demo123

### Features added
- CSV export: Visit /profile and click "Export Transactions (CSV)" to download your transactions. Requires json2csv (installed).

## Scripts
- npm run dev: Start with nodemon
- npm run start: Start in production mode
- npm run css:build: Build CSS from SCSS
- npm run css:watch: Watch SCSS and rebuild
- npm run prisma:generate: Generate Prisma client
- npm run db:push: Apply Prisma schema to DB
- npm run db:seed: Seed demo data

## Notes
- AI Buddy uses Google Gemini when GEMINI_API_KEY (or GOOGLE_API_KEY) is set; otherwise it falls back to canned responses.
- Authentication uses express-session in-memory store (not for production).
- Replace SQLite with PostgreSQL by changing `schema.prisma` datasource URL.

## AI Buddy (Gemini)
- Set an API key in your environment: `GEMINI_API_KEY` (preferred) or `GOOGLE_API_KEY`.
- Optional: choose a model via `GEMINI_MODEL` (default: `gemini-1.5-flash`).
- The endpoint is `/api/buddy` and the Buddy UI is available at `/buddy` (requires login).
- The model is given a compact monthly finance context (income, spend, top category, upcoming bills, goals, safe-to-spend, and a few recent transactions) to ground its answers.

Example .env
```
SESSION_SECRET=dev_secret_change_me
PORT=3000
GEMINI_API_KEY=your_api_key_here
# GEMINI_MODEL=gemini-1.5-pro
```