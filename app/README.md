# Dryrun — App

Next.js 16 frontend deployed to Cloudflare Workers via [OpenNext](https://opennext.js.org/cloudflare).

See the [root README](../README.md) for full project documentation.

## Scripts

```bash
npm run dev              # Local Next.js dev server (port 3000)
npm run build            # Standard Next.js build
npm run build:worker     # Build for Cloudflare Workers (OpenNext)
npm run preview          # Local Cloudflare Workers preview
npm run deploy           # Build + deploy to Cloudflare
npm run db:migrate       # Run D1 migrations locally
npm run db:migrate:remote # Run D1 migrations on production
```

## Cloudflare Bindings

Configured in `wrangler.toml`:

| Binding | Type | Purpose |
|---------|------|---------|
| `DB` | D1 Database | SQLite database (dryrun-db) |
| `SCREENSHOTS` | R2 Bucket | Screenshot storage (dryrun-screenshots) |
| `EXECUTOR` | Service Binding | Worker-to-worker RPC to dryrun-executor |
