# Contributing - Advanced

## **Table of Contents**

- [Contributing - Advanced](#contributing---advanced)
  - [**Table of Contents**](#table-of-contents)
  - [Prerequisites](#prerequisites)
    - [Git](#git)
    - [NodeJS and PNPM](#nodejs-and-pnpm)
    - [Clerk (optional)](#clerk-optional)
    - [Database (optional if running frontend only)](#database-optional-if-running-frontend-only)
  - [Building and Running Monkeytype](#building-and-running-monkeytype)
    - [Dependencies](#dependencies)
    - [Both Frontend and Backend](#both-frontend-and-backend)
    - [Backend only](#backend-only)
    - [Frontend only](#frontend-only)
  - [Standards and Guidelines](#standards-and-guidelines)
  - [Questions](#questions)

## Prerequisites

This fork runs on Vercel with Neon Postgres for storage and Clerk for
authentication. You will need a computer with a stable internet connection, a
text editor, Git, and NodeJS 24.11.0. Accounts and the backend additionally
need Clerk and Neon, described below.

### Git

> [!WARNING]
> **If you are on Windows, run `git config --global core.autocrlf false` before cloning this repo to prevent CRLF errors.**

### NodeJS and PNPM

Currently, the project is using version `24.11.0 LTS`.

If you use `fnm` or `nvm` you can run `fnm install && fnm use` (or the `nvm`
equivalent) to pick up the version in the `.nvmrc` file.

For package management, we use `pnpm`. Install it with `npm i -g pnpm@11.21.0`.

### Clerk (optional)

Sign up and login need a [Clerk](https://clerk.com/) application. You can skip
this if you only want to work on the typing test itself.

1. Create a Clerk application with **Email** and **Google** sign in enabled.
2. Turn on bot protection under `Configure > Protect`. It replaces the old
   captcha.
3. Copy the development keys into your env files:
   - `frontend/.env`: `CLERK_PUBLISHABLE_KEY=pk_test_...`
   - `backend/.env`: `CLERK_PUBLISHABLE_KEY=pk_test_...` and
     `CLERK_SECRET_KEY=sk_test_...`

If you want to reach the frontend from another machine on your network, also set
`BACKEND_URL="http://<Your IP>:5005"` in `frontend/.env`.

### Database (optional if running frontend only)

Follow these steps if you want to work on anything involving the database or the
account system. Otherwise you can skip this section.

1. Create a [Neon](https://neon.com/) project and a database for development.
2. Copy `backend/example.env` to `backend/.env` and set `DATABASE_URL` to the
   connection string of that database.
3. Apply the schema:

   ```
   cd backend && npm run migrate
   ```

Migrations are plain SQL files in `backend/db/migrations`. The runner records
applied files in `schema_migrations`, so each one runs at most once. Add a new
file with the next number prefix to change the schema.

Integration tests do not use this database. They run against an in-process
Postgres ([PGlite](https://pglite.dev/)) and apply the same migration files, so
they need neither Docker nor network access.

## Building and Running Monkeytype

### Dependencies

Run `pnpm i` in the project root to install all dependencies.

### Both Frontend and Backend

```
npm run dev
```

### Backend only

```
npm run dev-be
```

### Frontend only

```
npm run dev-fe
```

By default, these commands will start a local development website on [port 3000](http://localhost:3000) and a local development server on [port 5005](http://localhost:5005). They will automatically rebuild the website/server when you make changes in the `src/` directory. Use <kbd>Ctrl+C</kbd> to stop them.

> [!NOTE]
> Rebuilding doesn't happen instantaneously and depends on your machine, so be patient for changes to appear.

If you are on a UNIX system and you get a spawn error, run npm with `sudo`.

## Standards and Guidelines

Code formatting and linting is enforced by [Oxc (Oxfmt and Oxlint)](https://github.com/oxc-project/oxc), which automatically runs every time you make a commit.

For guidelines on commit messages, adding themes, languages, or quotes, please refer to [CONTRIBUTING.md](./CONTRIBUTING.md).

## Questions

If you have any questions, comments, concerns, or problems, open an issue or a
discussion on this repository.
