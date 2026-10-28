# Deploying

This fork is hosted on [Vercel](https://vercel.com/): the frontend is served as
static files and the backend runs as a single serverless function under `/api`.

## Services

| Service | What it is used for |
| --- | --- |
| Vercel | hosting, both the static frontend and the api function |
| [Neon](https://neon.com/) | Postgres database |
| [Clerk](https://clerk.com/) | accounts, shared across the solsticebase apps |

## First deploy

1. **Database.** Create a Neon database for production and apply the schema:

   ```
   cd backend && DATABASE_URL="<production url>" npm run migrate
   ```

2. **Clerk.** Use the production instance of the shared Clerk application. Its
   DNS records must be verified for the domain, and the app's origin has to be
   allowed in the Clerk dashboard. Bot protection should be on, since it
   replaces the old captcha.

3. **Vercel project.** Import the repository. `vercel.json` already sets the
   build command, the output directory and the `/api` rewrite, so the defaults
   can be left alone.

4. **Environment variables.** Set these in the Vercel project:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the production Neon connection string |
   | `CLERK_SECRET_KEY` | `sk_live_...` |
   | `CLERK_PUBLISHABLE_KEY` | `pk_live_...` |
   | `BACKEND_URL` | `https://<your domain>/api` |
   | `FRONTEND_URL` | `https://<your domain>` |
   | `MODE` | `prod` |
   | `BYPASS_ANTICHEAT` | `true` |

   `CLERK_PUBLISHABLE_KEY` and `BACKEND_URL` are read at build time and baked
   into the frontend, so changing them needs a redeploy.

   The anticheat module is closed source and not part of this repository.
   Without `BYPASS_ANTICHEAT=true` the api exits on startup outside of dev mode
   and every `/api` request fails with `FUNCTION_INVOCATION_FAILED`. Do not set
   `MODE=dev` instead, it enables the dev endpoints and uid authentication.

5. **Domain.** Add the domain in Vercel and point its DNS at Vercel.

6. **Server configuration.** The `configuration` table is seeded from
   `BASE_CONFIGURATION` on the first api request, which has sign up and result
   saving turned off. After the first request, enable them in the Neon console:

   ```sql
   update configuration
   set value = jsonb_set(jsonb_set(value, '{users,signUp}', 'true'),
                         '{results,savingEnabled}', 'true')
   where id = true;
   ```

   Other features (profiles, xp, favorite quotes, filter presets) can be turned
   on the same way. Warm instances refresh the configuration every 10 minutes,
   a redeploy picks it up immediately.

## Notes

- The backend has no boot phase. The server configuration is read from the
  `configuration` table on the first request of each cold start, seeded from
  `BASE_CONFIGURATION` when the table is empty.
- Rate limiting is in-memory, so it resets with every cold start. That is fine
  for a personal instance but would not hold up for a public one.
- There are no background jobs. Everything happens during a request.
