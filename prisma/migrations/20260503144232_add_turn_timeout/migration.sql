-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Party" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startingMoney" INTEGER NOT NULL DEFAULT 1000,
    "smallBlind" INTEGER NOT NULL DEFAULT 10,
    "bigBlind" INTEGER NOT NULL DEFAULT 20,
    "minPlayers" INTEGER NOT NULL DEFAULT 2,
    "maxPlayers" INTEGER NOT NULL DEFAULT 9,
    "turnTimeout" INTEGER NOT NULL DEFAULT 20,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Party" ("bigBlind", "createdAt", "id", "maxPlayers", "minPlayers", "name", "smallBlind", "startingMoney", "status", "updatedAt", "uuid") SELECT "bigBlind", "createdAt", "id", "maxPlayers", "minPlayers", "name", "smallBlind", "startingMoney", "status", "updatedAt", "uuid" FROM "Party";
DROP TABLE "Party";
ALTER TABLE "new_Party" RENAME TO "Party";
CREATE UNIQUE INDEX "Party_uuid_key" ON "Party"("uuid");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
