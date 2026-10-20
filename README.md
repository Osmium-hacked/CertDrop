# CertDrop

Upload a CSV and a certificate template. Every participant gets a personalized PDF certificate in their
inbox, with a public verification link and QR code.

> Work in progress. The full README (architecture diagram, deployment, design decisions) lands with
> milestone 8.

## Local development

Requirements: Node 22.12+ (24 recommended), pnpm 10, Docker.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm bootstrap   # starts Postgres + RustFS, applies migrations, creates the storage bucket
pnpm dev     # web (http://localhost:5173), API (:3000) and worker, together
```

| Command          | What it does                                  |
| ---------------- | --------------------------------------------- |
| `pnpm lint`      | ESLint (type-aware) across the workspace      |
| `pnpm typecheck` | Strict TypeScript for every package           |
| `pnpm test`      | Vitest unit and route tests                   |
| `pnpm build`     | Bundles the API/worker and builds the web app |

Local object storage is [RustFS](https://github.com/rustfs/rustfs), an S3-compatible server. MinIO no
longer publishes community Docker images. The app only speaks the S3 API, so production uses
Cloudflare R2 with no code changes.

## Layout

```
apps/web         React + Vite wizard and the public /verify page
apps/api         Fastify API (src/server.ts) and pg-boss worker (src/worker.ts), one Docker image
packages/shared  Zod schemas and pure logic used by both
```
