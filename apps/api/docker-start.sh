#!/bin/sh
# Applies pending database migrations, then starts the API. For hosts without a pre-deploy step,
# such as Render's free plan. `prisma migrate deploy` takes a lock, so concurrent starts are safe.
set -e
node_modules/.bin/prisma migrate deploy
exec node dist/server.js
