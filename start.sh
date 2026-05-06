#!/bin/sh
cd "$(dirname "$0")"
PORT=3000 NODE_ENV=production npx tsx server.ts
