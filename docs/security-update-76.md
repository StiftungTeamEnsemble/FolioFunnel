# Security update #76

The selected versions are Next.js 16.4.6, React/react-dom 19.3.1 and
Node.js 24.22.3 (LTS), checked on 20 November 2026. Both production services
use the same Dockerfile; development uses the same Node major and `npm ci`.

Package declarations use `^16.4.6` and `^19.3.1` to allow later releases within
the same major. The lockfile retains the tested exact versions; `npm ci` does
not advance them. Run `npm update next react react-dom`, test and commit the
updated lockfile to adopt newer compatible releases. Both Dockerfiles use
`node:24-alpine`; build with `--pull` to fetch the latest Node 24 base image and
verify its installed version and digest on each rollout. The image identifiers
below describe the final verification build: `node:24-alpine` resolved to the
same digest as `node:24.22.3-alpine`.

Sources checked:

- https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr
- https://github.com/vercel/next.js/security/advisories (November advisories require 16.4.5)
- https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3
- https://nodejs.org/en/blog/vulnerability/november-2026-security-releases/

`npm audit` after this update reports no Next.js/React findings, but still reports
14 findings in other dependencies (2 critical, 9 high, 2 moderate, 1 low).
The critical findings concern NextAuth and Handlebars. These require separate
remediation; this update does not establish that the entire dependency tree is
free of known vulnerabilities.

## Local verification (20 November 2026)

- Clean `npm ci`, Prisma client generation, production build and TypeScript check passed.
- Initial production image built with `--pull --no-cache` on Linux arm64;
  the final caret declarations and `node:24-alpine` configuration were rebuilt
  with `--pull` and passed the same HTTP/worker smoke tests again.
- Development image built with `--pull`; installed runtime/package versions
  matched the production image.
- Base image RepoDigest:
  `node@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5`.
- Application image ID:
  `sha256:d4c87dc54fbe1f0582961eb9f51dfb270518182e387dcdd8ee0b2a6aa4624705`.
  This is a local build, with no registry RepoDigest or production deployment yet.
- Separate web and worker containers both reported Node v24.22.3,
  Next 16.4.6 and React/react-dom 19.3.1.
- An isolated PostgreSQL/pgvector database and the existing converter image
  passed health checks. All 10 migrations applied and startup completed.
- HTTP smoke tests passed: credentials sign-in, authenticated session, protected
  project access, sign-out, PDF upload/source retrieval, and rejection of an upload
  with no file. The worker completed thumbnail and document-to-Markdown jobs;
  the thumbnail endpoint and stored Markdown output were verified.
- A custom-format database dump restored successfully into another isolated
  database with `pg_restore --exit-on-error`: all 10 migration records, the test
  document and both successful processor runs were present. Migration status
  was up to date before backup. No production backup was accessed or tested.

These checks used disposable test data. Production backups, migration status,
deployment digest and post-deployment smoke tests must be verified on the target.

## Before rollout

Use the deployment's actual Compose configuration/environment for all commands
below. Coolify deployments must use their configured persistent mounts and
environment, rather than creating a second stack from the local defaults.

1. Record the current web/worker image IDs and retain those images for rollback.
2. Pause ingestion and workers while taking a consistent database and document
   storage backup. Store backups outside the application containers. For example:

   ```sh
   mkdir -p backups
   docker compose exec -T postgres pg_dump -U foliofunnel -d foliofunnel -Fc > backups/pre-76.dump
   test -s backups/pre-76.dump
   docker compose exec -T postgres pg_restore --list < backups/pre-76.dump
   ```

   Restore into an isolated database and verify it before proceeding. Back up the
   deployment's document volume at the same recovery point. Do not reset or remove
   production volumes.
3. This update adds no schema migrations. Check migration status against the
   existing database before startup: web and worker startup both run
   `prisma migrate deploy`. Review any pre-existing pending migrations first.

## Build and verify before switching traffic

```sh
docker compose build --pull --no-cache next-app worker
docker compose run --rm --no-deps --entrypoint node next-app -e 'console.log(JSON.stringify({node:process.version,next:require("next/package.json").version,react:require("react/package.json").version,reactDom:require("react-dom/package.json").version}))'
docker compose run --rm --no-deps --entrypoint node worker -e 'console.log(JSON.stringify({node:process.version,next:require("next/package.json").version,react:require("react/package.json").version,reactDom:require("react-dom/package.json").version}))'
docker compose run --rm --no-deps --entrypoint npx next-app prisma migrate status
```

Expected installed versions: Node v24.22.3, Next 16.4.6, React/react-dom 19.3.1.
Updating React alone does not update Next's bundled React server transport.

On staging with isolated database/storage, test sign-in, sign-out, protected
project access, PDF upload, preview/thumbnail and document-to-Markdown conversion.
Run a processor job and verify that the worker completes it and stores the result;
also verify error handling for an invalid upload. Use test documents and confirm
converter health. The Docker production build must complete successfully.

## Rollout and evidence

After backup/restore and staging verification, redeploy both services in Coolify
with a fresh image build, or on a Compose-managed deployment:

```sh
docker compose up -d --no-deps --force-recreate next-app worker
docker compose ps next-app worker
docker compose logs --tail=100 next-app worker
for service in next-app worker; do
  docker compose exec -T "$service" node -e 'console.log(JSON.stringify({node:process.version,next:require("next/package.json").version,react:require("react/package.json").version,reactDom:require("react-dom/package.json").version}))'
  docker inspect --format '{{.Image}}' "$(docker compose ps -q "$service")"
  docker image inspect --format '{{.Id}} {{json .RepoDigests}}' "$(docker inspect --format '{{.Image}}' "$(docker compose ps -q "$service")")"
done
```

Record the commit, build output, runtime version output, image IDs, registry
RepoDigests (when pushed), backup/restore evidence, migration status and smoke-test
results in the deployment record. Locally built images may have no RepoDigest;
record the image ID and obtain the registry digest after pushing. Check the
deployed `/api/health` and repeat authentication/upload/worker smoke tests.
If rollback is needed, use the retained images; assess any applied migrations
before reverting. Restore database and documents together if recovery is needed.

For development, rebuild with `--pull` and refresh dependencies with `npm ci` in
each service that has a persistent node_modules volume; rebuilding an image alone
does not refresh an existing volume. Never remove database/document volumes to
refresh dependencies.
