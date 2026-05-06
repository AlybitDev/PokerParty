#!/bin/sh
cd "$(dirname "$0")"
npm install
npx prisma generate
npm run build
echo "Build complete."
