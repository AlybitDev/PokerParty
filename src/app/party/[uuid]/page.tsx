"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { io, Socket } from "socket.io-client";

interface ChatMessage {
  playerName: string;
  message: string;
  timestamp: number;
}

interface Card {
  suit: "h" | "d" | "c" | "s";
  rank: number;
}

interface PlayerState {
  id: number;
  name: string;
  money: number;
  cards: Card[];
  betThisRound: number;
  folded: boolean;
  isAllIn: boolean;
  order: number;
}

interface GameState {
  phase: string;
  players: PlayerState[];
  communityCards: Card[];
  pot: number;
  currentPlayerIndex: number;
  dealerIndex: number;
  currentBet: number;
  minRaise: number;
  winners: { playerId: number; playerName: string; hand: string; handRank: number }[] | null;
}

interface PartyData {
  id: number;
  uuid: string;
  name: string;
  startingMoney: number;
  smallBlind: number;
  bigBlind: number;
  minPlayers: number;
  maxPlayers: number;
  turnTimeout: number;
  status: string;
  players: { id: number; name: string; money: number; isHost: boolean; order: number }[];
}

function cardSymbol(suit: string): string {
  switch (suit) {
    case "h": return "♥";
    case "d": return "♦";
    case "c": return "♣";
    case "s": return "♠";
    default: return suit;
  }
}

function cardColor(suit: string): string {
  return suit === "h" || suit === "d" ? "text-red-500" : "text-gray-900";
}

function rankDisplay(rank: number): string {
  const names: Record<number, string> = {
    14: "A", 13: "K", 12: "Q", 11: "J", 10: "10",
    9: "9", 8: "8", 7: "7", 6: "6",
    5: "5", 4: "4", 3: "3", 2: "2",
  };
  return names[rank] ?? `${rank}`;
}

function CardView({ card, hidden, index = 0 }: { card: Card; hidden?: boolean; index?: number }) {
  if (hidden) {
    return (
      <div
        className="w-12 h-16 sm:w-14 sm:h-20 bg-gradient-to-br from-blue-400 to-blue-500 rounded-lg border-2 border-blue-300 flex items-center justify-center shadow-md animate-card-deal"
        style={{ animationDelay: `${index * 0.1}s` }}
      >
        <span className="text-blue-200 text-lg font-bold">?</span>
      </div>
    );
  }
  return (
    <div
      className="w-12 h-16 sm:w-14 sm:h-20 bg-white rounded-lg border-2 border-gray-300 flex flex-col items-center justify-center shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-200 animate-card-deal"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <span className={`text-sm sm:text-base font-bold leading-none ${cardColor(card.suit)}`}>
        {rankDisplay(card.rank)}
      </span>
      <span className={`text-xs sm:text-sm leading-none ${cardColor(card.suit)}`}>
        {cardSymbol(card.suit)}
      </span>
    </div>
  );
}

const ADJECTIVES = [
  "Brave", "Clever", "Swift", "Mighty", "Sneaky", "Jolly", "Gentle", "Fierce", "Wise", "Bold",
  "Calm", "Eager", "Fancy", "Grand", "Humble", "Lucky", "Merry", "Neat", "Proud", "Quiet",
  "Rapid", "Sharp", "Tough", "Vivid", "Zesty", "Chill", "Dapper", "Elite", "Frosty", "Gleaming",
  "Hyper", "Icy", "Jazzy", "Keen", "Lively", "Mellow", "Nimble", "Peppy", "Quirky", "Rustic",
  "Snappy", "Trippy", "Ultra", "Velvet", "Wacky", "Zippy", "Amber", "Blissful", "Cosmic", "Dandy",
  "Epic", "Fluffy", "Glowing", "Happy", "Infinite", "Jumpy", "Kind", "Lazy", "Magic", "Noble",
  "Odd", "Platinum", "Royal", "Silky", "Tiny", "Unique", "Vast", "Wild", "Young", "Zealous",
  "Angelic", "Breezy", "Crystal", "Dreamy", "Electric", "Funky", "Golden", "Hearty", "Iron",
  "Jade", "Lunar", "Mystic", "Neon", "Opal", "Pearl", "Quaint", "Radiant", "Silver", "Stormy",
  "Thunder", "Violet", "Whisper", "Crimson", "Sapphire", "Emerald", "Ruby", "Topaz", "Ivory", "Coral",
];

const ANIMALS = [
  "Wolf", "Fox", "Eagle", "Bear", "Owl", "Hawk", "Lynx", "Deer", "Falcon", "Raven",
  "Tiger", "Lion", "Panther", "Jaguar", "Leopard", "Cheetah", "Viper", "Cobra", "Elk", "Moose",
  "Otter", "Beaver", "Raccoon", "Badger", "Weasel", "Marten", "Sable", "Ferret", "Mink", "Skunk",
  "Salmon", "Trout", "Bass", "Perch", "Pike", "Koi", "Tuna", "Marlin", "Swordfish", "Seahorse",
  "Robin", "Wren", "Finch", "Sparrow", "Swift", "Jay", "Crow", "Magpie", "Heron", "Crane",
  "Horse", "Pony", "Zebra", "Bison", "Yak", "Camel", "Llama", "Alpaca", "Donkey", "Mule",
  "Shark", "Whale", "Dolphin", "Seal", "Walrus", "Penguin", "Puffin", "Albatross", "Pelican", "Stork",
  "Hamster", "Gerbil", "Mouse", "Rat", "Squirrel", "Chipmunk", "Hedgehog", "Mole", "Vole", "Shrew",
  "Gecko", "Iguana", "Chameleon", "Turtle", "Tortoise", "Crocodile", "Alligator", "Lizard", "Salamander", "Newt",
  "Gorilla", "Orangutan", "Chimp", "Baboon", "Macaque", "Lemur", "Sloth", "Armadillo", "Anteater", "Platypus",
];

function generateName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adj}${animal}`;
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case "preflop": return "Pre-Flop";
    case "flop": return "Flop";
    case "turn": return "Turn";
    case "river": return "River";
    case "showdown": return "Showdown";
    default: return phase;
  }
}

export default function PartyPage() {
  const params = useParams();
  const uuid = params.uuid as string;
  const [playerName, setPlayerName] = useState("");

  useEffect(() => {
    setPlayerName(generateName());
  }, []);

  const [socket, setSocket] = useState<Socket | null>(null);
  const [party, setParty] = useState<PartyData | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myId, setMyId] = useState<number | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [configForm, setConfigForm] = useState({
    name: "Poker Night",
    startingMoney: 1000,
    smallBlind: 10,
    bigBlind: 20,
    maxPlayers: 9,
    turnTimeout: 30,
  });
  const [raiseAmount, setRaiseAmount] = useState(40);
  const [hideCards, setHideCards] = useState(false);
  const [connected, setConnected] = useState(false);
  const [turnTimeLeft, setTurnTimeLeft] = useState(20);
  const turnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gameStateRef = useRef(gameState);
  const myIdRef = useRef(myId);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { myIdRef.current = myId; }, [myId]);
  const linkRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatBadge, setChatBadge] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const partyLink = typeof window !== "undefined" ? `${window.location.origin}/party/${uuid}` : "";

  const currentPlayer = gameState?.players.find((p) => p.id === myId);
  const isMyTurn = gameState?.currentPlayerIndex !== undefined &&
    gameState.phase !== "idle" &&
    gameState.phase !== "showdown" &&
    gameState.players[gameState.currentPlayerIndex]?.id === myId &&
    currentPlayer && !currentPlayer.folded && !currentPlayer.isAllIn;

  useEffect(() => {
    const s = io();
    setSocket(s);

    s.on("connect", () => {
      setConnected(true);
      s.emit("join-party", { partyUuid: uuid, playerName });
    });

    s.on("party-state", (data: { party: PartyData; gameState: GameState | null }) => {
      setParty(data.party);
      if (data.gameState) {
        setGameState(data.gameState);
        const me = data.gameState.players.find((p) => p.name === playerName);
        if (me && !myId) setMyId(me.id);
      } else {
        setGameState(null);
      }
    });

    s.on("party-reset", (data) => {
      setParty(data.party);
      setGameState(null);
      setShowConfig(false);
      setMyId(null);
      s.emit("join-party", { partyUuid: uuid, playerName });
    });

    s.on("party-closed", () => {
      setGameState(null);
      setParty(null);
    });

    s.on("party-closed", () => {
      setGameState(null);
      setParty(null);
    });

    s.on("error", (msg: string) => {
      alert(msg);
    });

    s.on("chat-message", (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
      setChatBadge((prev) => prev + 1);
    });

    return () => {
      s.emit("leave-party");
      s.disconnect();
    };
  }, [uuid, playerName]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (party && showConfig) {
      setConfigForm({
        name: party.name,
        startingMoney: party.startingMoney,
        smallBlind: party.smallBlind,
        bigBlind: party.bigBlind,
        maxPlayers: party.maxPlayers,
        turnTimeout: party.turnTimeout,
      });
    }
  }, [party, showConfig]);

  const myPlayer = party?.players.find((p) => p.id === myId);

  const turnTimeout = party?.turnTimeout ?? 30;

  const handleAction = useCallback(
    (action: "fold" | "check" | "call" | "raise" | "all-in") => {
      if (!socket || !uuid) return;
      const amount = action === "raise" ? raiseAmount : undefined;
      socket.emit("player-action", { partyUuid: uuid, action, amount });
    },
    [socket, uuid, raiseAmount]
  );

  const handleStartGame = useCallback(() => {
    if (!socket || !uuid) return;
    socket.emit("start-game", { partyUuid: uuid });
  }, [socket, uuid]);

  const handleRestartParty = useCallback(() => {
    if (!socket || !uuid) return;
    socket.emit("restart-party", { partyUuid: uuid, config: configForm });
    setShowConfig(false);
  }, [socket, uuid, configForm]);

  const handleSendChat = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!socket || !chatInput.trim()) return;
      socket.emit("send-chat-message", { partyUuid: uuid, message: chatInput.trim() });
      setChatInput("");
    },
    [socket, uuid, chatInput]
  );

  useEffect(() => {
    const isGameActive = gameState && gameState.phase !== "idle" && gameState.phase !== "showdown";
    if (isGameActive) {
      setTurnTimeLeft(turnTimeout);
      turnTimerRef.current = setInterval(() => {
        setTurnTimeLeft((prev) => {
          if (prev <= 1) {
            if (turnTimerRef.current) clearInterval(turnTimerRef.current);
            const gs = gameStateRef.current;
            const id = myIdRef.current;
            if (gs && id !== null) {
              const activePlayer = gs.players[gs.currentPlayerIndex];
              if (activePlayer && activePlayer.id === id && !activePlayer.folded && !activePlayer.isAllIn) {
                handleAction("fold");
              }
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    }
    return () => {
      if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    };
  }, [gameState?.currentPlayerIndex, gameState?.phase, turnTimeout, myId]);

  const copyLink = () => {
    if (linkRef.current) {
      linkRef.current.select();
      navigator.clipboard.writeText(partyLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!party) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center animate-scale-in">
          <div className="w-10 h-10 border-[3px] border-yellow-500 border-t-transparent rounded-full animate-spin-slow mx-auto mb-4" />
          {playerName ? (
            <p className="text-green-300 animate-pulse">Connecting as <span className="text-yellow-400 font-bold">{playerName}</span>...</p>
          ) : (
            <p className="text-green-300 animate-pulse">Generating player name...</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2 animate-fade-in-down">
        <div>
          <h1 className="text-2xl font-bold">{party.name}</h1>
          <div className="flex items-center gap-2 text-sm text-green-300">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              {party.players.length}/{party.maxPlayers} players
            </span>
            <span>|</span>
            <span>${party.smallBlind}/${party.bigBlind} blinds</span>
            <span>|</span>
            <span>${party.turnTimeout}s turn timeout</span>
            <span>|</span>
            <span>Start: ${party.startingMoney}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={linkRef}
            type="text"
            value={partyLink}
            readOnly
            className="bg-green-900 border border-green-600 rounded px-2 py-1 text-xs w-48 focus:outline-none focus:ring-1 focus:ring-yellow-400/50 transition-all"
          />
          <button
            onClick={copyLink}
            className="bg-green-700 hover:bg-green-600 active:scale-95 px-3 py-1 rounded text-sm transition-all duration-150"
          >
            {copied ? "Copied!" : "Copy Link"}
          </button>
          {gameState && gameState.phase !== "idle" && (
            <button
              onClick={() => setHideCards((v) => !v)}
              className={`active:scale-95 px-3 py-1 rounded text-sm font-medium transition-all duration-150 ${
                hideCards
                  ? "bg-red-700 hover:bg-red-600"
                  : "bg-green-600 hover:bg-green-500"
              }`}
              title={hideCards ? "Show your cards" : "Hide your cards"}
            >
              {hideCards ? "Show Cards" : "Hide Cards"}
            </button>
          )}
        </div>
      </div>

      {/* Poker Table */}
      <div className="flex-1 bg-gradient-to-b from-green-700 to-green-800 rounded-2xl border-4 border-green-600 p-4 sm:p-8 relative min-h-[400px] shadow-inner shadow-green-900/50">
        {/* Pot and Phase */}
        {gameState && gameState.phase !== "idle" && (
          <div className="text-center mb-4 animate-fade-in-down">
            <span className="bg-green-900 px-4 py-1 rounded-full text-sm font-medium border border-green-500/30">
              {phaseLabel(gameState.phase)}
            </span>
            <span className="ml-3 bg-gradient-to-r from-yellow-700 to-yellow-600 px-4 py-1 rounded-full text-sm font-bold shadow-lg animate-scale-in-sm">
              Pot: ${gameState.pot}
            </span>
            {gameState.currentBet > 0 && (
              <span className="ml-3 bg-blue-800 px-4 py-1 rounded-full text-sm border border-blue-600/30 animate-scale-in-sm">
                Current Bet: ${gameState.currentBet}
              </span>
            )}
          </div>
        )}

        {/* Community Cards */}
        {gameState && gameState.communityCards.length > 0 && (
          <div className="flex justify-center gap-2 mb-6">
            {gameState.communityCards.map((card, i) => (
              <CardView key={i} card={card} index={i} />
            ))}
          </div>
        )}

        {/* Winners */}
        {gameState?.winners && (
          <div className="bg-gradient-to-r from-yellow-600 via-yellow-500 to-yellow-600 text-yellow-100 px-6 py-3 rounded-lg text-center mb-4 font-bold text-lg shadow-xl animate-bounce-in border border-yellow-400/50">
            {gameState.winners.length === 1
              ? `${gameState.winners[0].playerName} wins with ${gameState.winners[0].hand}!`
              : `Split pot: ${gameState.winners.map((w) => w.playerName).join(", ")}`}
          </div>
        )}

        {/* Players */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {gameState
            ? gameState.players.map((p, i) => (
                <PlayerSeat
                  key={p.id}
                  player={p}
                  isActive={gameState.currentPlayerIndex === i}
                  isDealer={gameState.dealerIndex === i && gameState.phase !== "idle"}
                  isMe={p.id === myId}
                  gamePhase={gameState.phase}
                  index={i}
                  turnTimeLeft={turnTimeLeft}
                  turnTimeout={turnTimeout}
                  hideCards={hideCards}
                />
              ))
            : party.players.map((p, i) => (
                <div
                  key={p.id}
                  className="bg-green-900 rounded-xl p-3 border border-green-700 text-center animate-scale-in-sm hover:border-green-500 transition-all duration-200"
                  style={{ animationDelay: `${i * 0.08}s` }}
                >
                  <div className="font-medium">{p.name}</div>
                  <div className={`text-sm ${p.money > 0 ? "text-green-300" : "text-red-400"}`}>
                    {p.money > 0 ? `$${p.money}` : "Bust"}
                  </div>
                  {p.isHost && (
                    <div className="text-yellow-400 text-xs mt-1">✦ Host</div>
                  )}
                </div>
              ))}
        </div>

        {/* Start Button */}
        {(!gameState || gameState.phase === "idle" || gameState.winners) && (
          <div className="mt-6 text-center animate-fade-in-up">
            {gameState?.winners ? (
              <div className="space-x-3">
                <button
                  onClick={handleStartGame}
                  className="bg-yellow-500 hover:bg-yellow-400 active:scale-[0.97] text-green-900 font-bold px-6 py-2 rounded-lg transition-all duration-150 shadow-lg shadow-yellow-500/30"
                >
                  Next Hand
                </button>
                <button
                  onClick={() => setShowConfig(true)}
                  className="bg-green-700 hover:bg-green-600 active:scale-[0.97] px-4 py-2 rounded-lg transition-all duration-150"
                >
                  Reconfigure Party
                </button>
              </div>
            ) : (
              <div className="space-x-3">
                <button
                  onClick={handleStartGame}
                  disabled={party.players.length < 2}
                  className="bg-yellow-500 hover:bg-yellow-400 active:scale-[0.97] text-green-900 font-bold px-6 py-2 rounded-lg transition-all duration-150 disabled:opacity-50 disabled:active:scale-100 shadow-lg shadow-yellow-500/30 disabled:shadow-none"
                >
                  {party.players.length < 2 ? "Waiting for players..." : "Start Game"}
                </button>
                <button
                  onClick={() => setShowConfig(true)}
                  className="bg-green-700 hover:bg-green-600 active:scale-[0.97] px-4 py-2 rounded-lg transition-all duration-150"
                >
                  Reconfigure
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Bar (your turn) */}
      {gameState && isMyTurn && currentPlayer && !gameState.winners && (
        <div className="mt-4 bg-green-800 rounded-xl p-4 border border-green-600 animate-slide-up shadow-lg">
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-center">
            <button
              onClick={() => handleAction("fold")}
              className="bg-red-700 hover:bg-red-600 active:scale-95 px-4 py-2 rounded-lg font-bold transition-all duration-150 shadow-md"
            >
              Fold
            </button>
            {currentPlayer.betThisRound >= gameState.currentBet ? (
              <button
                onClick={() => handleAction("check")}
                className="bg-blue-700 hover:bg-blue-600 active:scale-95 px-4 py-2 rounded-lg font-bold transition-all duration-150 shadow-md"
              >
                Check
              </button>
            ) : (
              <button
                onClick={() => handleAction("call")}
                className="bg-blue-700 hover:bg-blue-600 active:scale-95 px-4 py-2 rounded-lg font-bold transition-all duration-150 shadow-md"
              >
                Call ${gameState.currentBet - currentPlayer.betThisRound}
              </button>
            )}
            {currentPlayer.money > gameState.currentBet - currentPlayer.betThisRound && (
              <>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={raiseAmount}
                    onChange={(e) => setRaiseAmount(Number(e.target.value))}
                    className="w-20 px-2 py-2 bg-green-900 border border-green-600 rounded-lg text-white text-center focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition-all duration-200"
                    min={gameState.currentBet + 1}
                    max={currentPlayer.money}
                  />
                  <button
                    onClick={() => handleAction("raise")}
                    disabled={raiseAmount <= gameState.currentBet}
                    className={`px-4 py-2 rounded-lg font-bold transition-all duration-150 shadow-md ${
                      raiseAmount <= gameState.currentBet
                        ? "bg-yellow-800 text-yellow-400 cursor-not-allowed"
                        : "bg-yellow-600 hover:bg-yellow-500 active:scale-95"
                    }`}
                  >
                    Raise
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Reconfigure Modal */}
      {showConfig && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-green-800 rounded-2xl p-6 w-full max-w-md border border-green-600 shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">Reconfigure Party</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-green-300 mb-1 font-medium">Party Name</label>
                <input
                  type="text"
                  value={configForm.name}
                  onChange={(e) => setConfigForm({ ...configForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-green-900 border border-green-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition-all duration-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-green-300 mb-1 font-medium">Starting $</label>
                  <input
                    type="number"
                    value={configForm.startingMoney}
                    onChange={(e) => setConfigForm({ ...configForm, startingMoney: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-green-900 border border-green-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm text-green-300 mb-1 font-medium">Max Players</label>
                  <input
                    type="number"
                    value={configForm.maxPlayers}
                    onChange={(e) => setConfigForm({ ...configForm, maxPlayers: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-green-900 border border-green-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm text-green-300 mb-1 font-medium">Turn Timeout (s)</label>
                  <input
                    type="number"
                    value={configForm.turnTimeout}
                    onChange={(e) => setConfigForm({ ...configForm, turnTimeout: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-green-900 border border-green-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm text-green-300 mb-1 font-medium">Small Blind</label>
                  <input
                    type="number"
                    value={configForm.smallBlind}
                    onChange={(e) => setConfigForm({ ...configForm, smallBlind: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-green-900 border border-green-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm text-green-300 mb-1 font-medium">Big Blind</label>
                  <input
                    type="number"
                    value={configForm.bigBlind}
                    onChange={(e) => setConfigForm({ ...configForm, bigBlind: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-green-900 border border-green-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition-all duration-200"
                  />
                </div>
              </div>
              <p className="text-yellow-300 text-sm">
                This will reset the party. All current players will be removed. Share the link again.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleRestartParty}
                  className="flex-1 bg-yellow-500 hover:bg-yellow-400 active:scale-[0.97] text-green-900 font-bold py-2 rounded-lg transition-all duration-150 shadow-lg"
                >
                  Reset & Save
                </button>
                <button
                  onClick={() => setShowConfig(false)}
                  className="flex-1 bg-green-700 hover:bg-green-600 active:scale-[0.97] py-2 rounded-lg transition-all duration-150"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Player list (sidebar-like) */}
      {party.players.length > 0 && (
        <div className="mt-4 bg-green-800 rounded-xl p-4 border border-green-600 animate-fade-in-up">
          <h3 className="text-sm font-medium text-green-300 mb-2">Players</h3>
          <div className="flex flex-wrap gap-2">
            {party.players.map((p, i) => (
              <span
                key={p.id}
                className={`px-3 py-1 rounded-full text-sm transition-all duration-200 hover:scale-105 animate-scale-in-sm ${
                  p.isHost ? "bg-yellow-700 text-yellow-200" : "bg-green-700 hover:bg-green-600"
                }`}
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                {p.name} {p.money > 0 ? `($${p.money})` : "(Bust)"}
                {p.isHost && " ✦"}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Chat toggle button */}
      <button
        onClick={() => {
          setChatOpen((v) => !v);
          setChatBadge(0);
        }}
        className="fixed right-4 top-4 z-50 w-10 h-10 bg-green-700 hover:bg-green-600 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110 active:scale-95"
      >
        {chatOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zm-4 0H9v2h2V9z" clipRule="evenodd" />
            </svg>
            {chatBadge > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center animate-scale-in">
                {chatBadge}
              </span>
            )}
          </>
        )}
      </button>

      {/* Chat panel */}
      <div
        className={`fixed right-0 top-0 h-full w-80 z-40 bg-green-800 border-l border-green-600 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
          chatOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-green-600">
          <h3 className="font-bold">Chat</h3>
          <button
            onClick={() => setChatOpen(false)}
            className="text-green-300 hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {chatMessages.length === 0 && (
            <p className="text-green-400 text-sm text-center mt-8">No messages yet</p>
          )}
          {chatMessages.map((msg, i) => (
            <div
              key={i}
              className="animate-fade-in"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-yellow-400 text-sm font-bold truncate max-w-[180px]">
                  {msg.playerName}
                </span>
                <span className="text-green-500 text-[10px] shrink-0">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="text-sm text-green-100 break-words">{msg.message}</p>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSendChat} className="p-3 border-t border-green-600 flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Type a message..."
            maxLength={500}
            className="flex-1 px-3 py-2 bg-green-900 border border-green-600 rounded-lg text-sm text-white placeholder-green-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition-all duration-200"
          />
          <button
            type="submit"
            disabled={!chatInput.trim()}
            className="bg-yellow-600 hover:bg-yellow-500 disabled:bg-green-700 disabled:text-green-500 disabled:cursor-not-allowed px-3 py-2 rounded-lg transition-all duration-200 active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

function PlayerSeat({
  player,
  isActive,
  isDealer,
  isMe,
  gamePhase,
  index = 0,
  turnTimeLeft,
  turnTimeout,
  hideCards,
}: {
  player: PlayerState;
  isActive: boolean;
  isDealer: boolean;
  isMe: boolean;
  gamePhase: string;
  index?: number;
  turnTimeLeft: number;
  turnTimeout: number;
  hideCards: boolean;
}) {
  const borderColor = player.folded
    ? "border-gray-600 opacity-50"
    : isActive
      ? "border-yellow-400 animate-pulse-glow"
      : "border-green-600";

  return (
    <div
      className={`bg-green-900 rounded-xl p-3 border-2 ${borderColor} relative transition-all duration-300 hover:border-opacity-80 animate-scale-in-sm ${
        isActive ? "scale-105" : ""
      }`}
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      {isDealer && (
        <div className="absolute -top-2 -right-2 bg-yellow-500 text-yellow-900 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md animate-scale-in">
          D
        </div>
      )}
      {isMe && (
        <div className="absolute -top-2 -left-2 bg-blue-500 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md animate-scale-in">
          You
        </div>
      )}
      <div className="font-medium text-sm truncate">{player.name}</div>
      <div className={`text-xs ${player.money > 0 ? "text-green-300" : "text-red-400"}`}>
        {player.money > 0 ? `$${player.money}` : "Bust"}
      </div>
      {player.betThisRound > 0 && (
        <div className="text-yellow-400 text-xs font-bold animate-fade-in">Bet: ${player.betThisRound}</div>
      )}
      {player.folded && <div className="text-red-400 text-xs animate-fade-in">Folded</div>}
      {player.isAllIn && <div className="text-purple-400 text-xs animate-fade-in">All In</div>}
      {gamePhase !== "idle" && player.cards.length === 2 && !player.folded && (
        <div className="flex gap-1 mt-1 justify-center">
          <CardView card={player.cards[0]} hidden={!isMe || hideCards} index={0} />
          <CardView card={player.cards[1]} hidden={!isMe || hideCards} index={1} />
        </div>
      )}
      {isActive && gamePhase !== "idle" && gamePhase !== "showdown" && (
        <div className="flex items-center gap-1 mt-2">
          <span className="text-xs font-medium text-green-300 w-5">{turnTimeLeft}s</span>
          <div className="flex-1 bg-green-950 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                turnTimeLeft <= 5 ? "bg-red-500" : "bg-yellow-400"
              }`}
              style={{ width: `${(turnTimeLeft / turnTimeout) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
