// Migration runner over Neon's WebSocket transport (port 443), used because
// direct TCP :5432 is blocked on some networks.
//
// Tracks applied migrations in public.schema_migrations so each file in
// db/migrations runs at most once, in filename order. Each migration and its
// bookkeeping row are applied in a single transaction, so a failure rolls back
// cleanly and the file is NOT recorded as applied.
//
// Usage:
//   node scripts/migrate.cjs            apply pending migrations
//   node scripts/migrate.cjs --dry-run  list pending migrations, apply nothing

const fs = require("node:fs");
const path = require("node:path");

const MIGRATIONS_DIR = path.join(__dirname, "..", "db", "migrations");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}

function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");

  const dryRun = process.argv.includes("--dry-run");

  const { neonConfig, Pool } = require("@neondatabase/serverless");
  // node's global WebSocket does not work with neon's protocol, always use ws
  neonConfig.webSocketConstructor = require("ws");

  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(`
      create table if not exists public.schema_migrations (
        filename   text primary key,
        applied_at timestamptz not null default timezone('utc', now())
      )
    `);

    const appliedRes = await pool.query(
      "select filename from public.schema_migrations",
    );
    const applied = new Set(appliedRes.rows.map((r) => r.filename));
    const pending = listMigrationFiles().filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log("No pending migrations.");
      return;
    }

    if (dryRun) {
      console.log("Pending migrations:");
      for (const f of pending) console.log(`  - ${f}`);
      return;
    }

    for (const filename of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query(
          "insert into public.schema_migrations (filename) values ($1)",
          [filename],
        );
        await client.query("commit");
        console.log(`Applied: ${filename}`);
      } catch (err) {
        await client.query("rollback");
        throw new Error(
          `Migration failed: ${filename}\n${err && err.message ? err.message : err}`,
        );
      } finally {
        client.release();
      }
    }

    console.log(`Done. Applied ${pending.length} migration(s).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
