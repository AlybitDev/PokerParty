import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { prisma } from "./src/lib/prisma";
import {
  createInitialGameState,
  startNewHand,
  processAction,
  canCheck,
  canCall,
  canRaise,
  GameState,
} from "./src/lib/poker-engine";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const gameStates = new Map<number, GameState>();

app.prepare().then(async () => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(server, {
    cors: {
      origin: dev ? "http://localhost:3000" : undefined,
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    let currentPartyId: number | null = null;
    let currentPlayerId: number | null = null;

    socket.on("join-party", async ({ partyUuid, playerName }) => {
      try {
        let party = await prisma.party.findUnique({ where: { uuid: partyUuid } });
        if (!party) {
          party = await prisma.party.create({
            data: {
              uuid: partyUuid,
              name: "Poker Night",
              startingMoney: 1000,
              smallBlind: 10,
              bigBlind: 20,
              minPlayers: 2,
              maxPlayers: 9,
              turnTimeout: 30,
            },
          });
        }

        const existingPlayer = await prisma.player.findFirst({
          where: { partyId: party.id, name: playerName, isActive: true },
        });

        let player;
        if (existingPlayer) {
          player = existingPlayer;
        } else {
          const activeCount = await prisma.player.count({
            where: { partyId: party.id, isActive: true },
          });
          if (activeCount >= party.maxPlayers) {
            socket.emit("error", "Party is full");
            return;
          }
          player = await prisma.player.create({
            data: {
              partyId: party.id,
              name: playerName,
              money: party.startingMoney,
              isHost: activeCount === 0,
              order: activeCount,
            },
          });
        }

        currentPartyId = party.id;
        currentPlayerId = player.id;
        socket.join(`party-${party.id}`);

        if (!gameStates.has(party.id)) {
          const players = await prisma.player.findMany({
            where: { partyId: party.id, isActive: true },
          });
          const gs = createInitialGameState(
            players.map((p) => ({
              id: p.id,
              name: p.name,
              money: p.money,
              order: p.order,
            })),
            party.smallBlind,
            party.bigBlind
          );
          gs.players = players.map((p) => ({
            id: p.id,
            name: p.name,
            money: p.money,
            cards: [],
            betThisRound: 0,
            folded: false,
            isAllIn: false,
            order: p.order,
          }));
          gameStates.set(party.id, gs);
        } else {
          const gs = gameStates.get(party.id)!;
          const alreadyInGame = gs.players.find((p) => p.id === player.id);
          if (!alreadyInGame) {
            const maxOrder = gs.players.reduce((max, p) => Math.max(max, p.order), -1);
            const isPlaying = gs.phase !== "idle" && gs.phase !== "showdown";
            gs.players.push({
              id: player.id,
              name: player.name,
              money: player.money,
              cards: [],
              betThisRound: 0,
              folded: isPlaying,
              isAllIn: false,
              order: maxOrder + 1,
            });
          } else {
            alreadyInGame.folded = false;
          }
        }

        emitPartyState(party.id);
      } catch (err) {
        console.error(err);
        socket.emit("error", "Failed to join party");
      }
    });

    socket.on("start-game", async ({ partyUuid }) => {
      try {
        const party = await prisma.party.findUnique({ where: { uuid: partyUuid } });
        if (!party) return;

        let gs = gameStates.get(party.id);
        if (!gs) {
          const players = await prisma.player.findMany({
            where: { partyId: party.id, isActive: true },
          });
          if (players.length < 2) return;
          gs = createInitialGameState(
            players.map((p) => ({
              id: p.id,
              name: p.name,
              money: p.money,
              order: p.order,
            })),
            party.smallBlind,
            party.bigBlind
          );
          gs.players = players.map((p) => ({
            id: p.id,
            name: p.name,
            money: p.money,
            cards: [],
            betThisRound: 0,
            folded: false,
            isAllIn: false,
            order: p.order,
          }));
          gameStates.set(party.id, gs);
        }

        let rebought = false;
        gs.players = gs.players.map((p) => {
          if (p.money <= 0) {
            rebought = true;
            return { ...p, money: party.startingMoney, folded: false, isAllIn: false };
          }
          return { ...p, folded: false };
        });
        if (rebought) {
          await prisma.player.updateMany({
            where: { partyId: party.id, money: { lte: 0 } },
            data: { money: party.startingMoney },
          });
        }

        const activePlayers = gs.players.filter((p) => p.money > 0);
        if (activePlayers.length < 2) {
          gs.phase = "idle";
          gs.winners = null;
          gameStates.set(party.id, gs);
          emitPartyState(party.id);
          return;
        }

        await prisma.party.update({ where: { id: party.id }, data: { status: "playing" } });

        const newGs = startNewHand(gs, party.smallBlind, party.bigBlind);
        gameStates.set(party.id, newGs);
        emitPartyState(party.id);
      } catch (err) {
        console.error(err);
        socket.emit("error", "Failed to start game");
      }
    });

    socket.on("player-action", async ({ partyUuid, action, amount }) => {
      try {
        const party = await prisma.party.findUnique({ where: { uuid: partyUuid } });
        if (!party || currentPlayerId === null) return;

        const gs = gameStates.get(party.id);
        if (!gs) return;

        const playerIndex = gs.players.findIndex((p) => p.id === currentPlayerId);
        if (playerIndex === -1) return;
        if (playerIndex !== gs.currentPlayerIndex) return;

        let processedAction = action;
        if (action === "check" && !canCheck(gs, currentPlayerId)) {
          processedAction = "call";
        }
        if (action === "call" && !canCall(gs, currentPlayerId) && !canRaise(gs, currentPlayerId)) {
          processedAction = "check";
        }

        const newGs = processAction(gs, currentPlayerId, processedAction, amount, party.bigBlind);
        gameStates.set(party.id, newGs);

        if (newGs.phase === "showdown") {
          await prisma.party.update({
            where: { id: party.id },
            data: { status: "waiting" },
          });
          for (const p of newGs.players) {
            await prisma.player.update({
              where: { id: p.id },
              data: { money: p.money },
            });
          }
        }

        emitPartyState(party.id);
      } catch (err) {
        console.error(err);
        socket.emit("error", "Action failed");
      }
    });

    socket.on("restart-party", async ({ partyUuid, config }) => {
      try {
        const party = await prisma.party.findUnique({ where: { uuid: partyUuid } });
        if (!party) return;

        const updatedParty = await prisma.party.update({
          where: { id: party.id },
          data: {
            name: config.name ?? party.name,
            startingMoney: config.startingMoney ?? party.startingMoney,
            smallBlind: config.smallBlind ?? party.smallBlind,
            bigBlind: config.bigBlind ?? party.bigBlind,
            minPlayers: config.minPlayers ?? party.minPlayers,
            maxPlayers: config.maxPlayers ?? party.maxPlayers,
            turnTimeout: config.turnTimeout ?? party.turnTimeout,
            status: "waiting",
          },
          include: { players: true },
        });

        await prisma.player.deleteMany({
          where: { partyId: party.id },
        });

        gameStates.delete(party.id);

        io.to(`party-${party.id}`).emit("party-reset", { party: updatedParty });
      } catch (err) {
        console.error(err);
        socket.emit("error", "Failed to restart party");
      }
    });

    async function handlePlayerDisconnect() {
      if (!currentPartyId || !currentPlayerId) return;

      await prisma.player.delete({ where: { id: currentPlayerId } }).catch(() => {});

      let gs = gameStates.get(currentPartyId);
      if (gs) {
        const playerIndex = gs.players.findIndex((p) => p.id === currentPlayerId);
        if (playerIndex !== -1) {
          const isPlaying = gs.phase !== "idle" && gs.phase !== "showdown";
          if (isPlaying && playerIndex === gs.currentPlayerIndex) {
            gs = processAction(gs, currentPlayerId, "fold");
            if (gs.phase === "showdown") {
              try {
                const party = await prisma.party.findUnique({ where: { id: currentPartyId } });
                if (party) {
                  await prisma.party.update({
                    where: { id: currentPartyId },
                    data: { status: "waiting" },
                  });
                  for (const p of gs.players) {
                    if (p.id !== currentPlayerId) {
                      await prisma.player.update({
                        where: { id: p.id },
                        data: { money: p.money },
                      });
                    }
                  }
                }
              } catch (err) {
                console.error(err);
              }
            }
          }
          gs.players = gs.players.filter((p) => p.id !== currentPlayerId);
          if (playerIndex < gs.currentPlayerIndex) {
            gs.currentPlayerIndex--;
          }
          if (playerIndex < gs.dealerIndex) {
            gs.dealerIndex--;
          }

          const isActive = gs.phase !== "idle" && gs.phase !== "showdown";
          if (gs.players.length === 1 && isActive) {
            gs.players[0].money += gs.pot;
            gs.pot = 0;
            gs.phase = "showdown";
            gs.winners = [{
              playerId: gs.players[0].id,
              playerName: gs.players[0].name,
              hand: "Last player standing",
              handRank: 1,
            }];
            try {
              const party = await prisma.party.findUnique({ where: { id: currentPartyId } });
              if (party) {
                await prisma.party.update({
                  where: { id: currentPartyId },
                  data: { status: "waiting" },
                });
                await prisma.player.update({
                  where: { id: gs.players[0].id },
                  data: { money: gs.players[0].money },
                });
              }
            } catch (err) {
              console.error(err);
            }
          }

          gameStates.set(currentPartyId, gs);
        }

        if (gs.players.length <= 1) {
          gameStates.delete(currentPartyId);
        }
      }

      emitPartyState(currentPartyId);
      currentPartyId = null;
      currentPlayerId = null;
    }

    socket.on("send-chat-message", async ({ partyUuid, message }) => {
      try {
        if (!currentPartyId || !currentPlayerId) return;
        const party = await prisma.party.findUnique({ where: { uuid: partyUuid } });
        if (!party) return;

        const player = await prisma.player.findUnique({ where: { id: currentPlayerId } });
        if (!player) return;

        const sanitized = message.trim().slice(0, 500);
        if (!sanitized) return;

        io.to(`party-${party.id}`).emit("chat-message", {
          playerName: player.name,
          message: sanitized,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error(err);
      }
    });

    socket.on("leave-party", handlePlayerDisconnect);

    socket.on("disconnect", handlePlayerDisconnect);

    async function emitPartyState(partyId: number) {
      const party = await prisma.party.findUnique({
        where: { id: partyId },
        include: { players: { where: { isActive: true } } },
      });
      if (!party) return;

      const gs = gameStates.get(partyId);
      const safeState = gs
        ? {
            ...gs,
            deck: [],
            players: gs.players.map((p) => ({
              ...p,
              cards: p.cards.length > 0 ? p.cards : [],
            })),
          }
        : null;

      io.to(`party-${partyId}`).emit("party-state", {
        party,
        gameState: safeState,
      });
    }
  });

  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
