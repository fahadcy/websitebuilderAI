# AI Website Builder

A production-minded Node.js and SQLite SaaS application that turns natural language prompts into complete, CMS-enabled website packages.

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`. The app can generate sites with a deterministic local fallback when `OPENAI_API_KEY` is empty. Add the key to `.env` to use GPT-4o for prompt analysis/content generation and GPT Image for generated website imagery.

## Builder Features

- Prompt-to-site flow with Server-Sent Events progress updates.
- AI prompt enhancement with smart follow-up questions, a page-by-page generation matrix, and an image plan before generation.
- Optional AI image generation writes brand-relevant assets into each generated site's `assets/images` folder, with curated fallback imagery if the image API is unavailable.
- Session auth, bcrypt password storage, CSRF protection, brute-force lockout, and rate limiting.
- SQLite persistence for users, settings, jobs, generated sites, and API usage.
- Generated output includes static website pages, PHP admin CMS, SQL schema, `.env.example`, README, sitemap, robots, RSS feed, SEO metadata, Schema.org JSON-LD, contact/newsletter storage, Google Maps fallback, and ZIP packaging.
- Builder admin dashboard lists generated sites and global settings.
- Feedback learning loop: operators can rate generated sites from Preview using "Teach Builder"; the app stores feedback, creates reusable learning rules by industry/global scope, shows them in `/admin/learning`, and injects matching guidance into future generations.

## Learning Loop

This app does not secretly retrain the base AI model. It uses a safer production pattern: structured feedback memory. Positive feedback becomes "repeat this" guidance, negative feedback becomes "avoid this" guidance, and requested changes become future priorities. Each new generated package includes `learning-memory.md` so the operator can audit which lessons influenced that build.

## Generated Website Deployment

Each generated package includes its own `README.md`, `database.sql`, and `.env.example`.

For cPanel: upload the extracted site folder to `public_html`, create a MySQL database, import `database.sql`, set database credentials in the generated `.env`, and visit `/admin` to change the default admin password.

For VPS: point Nginx or Apache to the generated site root, enable PHP 8.1+, configure FastCGI, import `database.sql`, and set environment variables.

## Environment Variables

See `.env.example`. Secrets must stay in environment variables and should never be committed.

## Sample Site

The app ships with a generated sample for:

> A physiotherapy clinic in Manchester called PhysioPlus with a calm blue and white colour scheme

Run `npm run seed` after installing dependencies if you want to regenerate it.
