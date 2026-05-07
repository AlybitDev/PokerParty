export interface Card {
  suit: "h" | "d" | "c" | "s";
  rank: number;
}

export interface PlayerAction {
  playerId: number;
  playerName: string;
  action: "fold" | "check" | "call" | "raise" | "all-in";
  amount?: number;
}

export interface PlayerState {
  id: number;
  name: string;
  money: number;
  cards: Card[];
  betThisRound: number;
  folded: boolean;
  isAllIn: boolean;
  order: number;
}

export interface GameState {
  phase: "idle" | "preflop" | "flop" | "turn" | "river" | "showdown";
  players: PlayerState[];
  communityCards: Card[];
  pot: number;
  currentPlayerIndex: number;
  dealerIndex: number;
  currentBet: number;
  minRaise: number;
  deck: Card[];
  lastRaisePlayerIndex: number;
  actions: PlayerAction[];
  winners: { playerId: number; playerName: string; hand: string; handRank: number }[] | null;
}

const SUITS: ("h" | "d" | "c" | "s")[] = ["h", "d", "c", "s"];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function rankName(rank: number): string {
  const names: Record<number, string> = {
    14: "A", 13: "K", 12: "Q", 11: "J", 10: "10",
    9: "9", 8: "8", 7: "7", 6: "6", 5: "5",
    4: "4", 3: "3", 2: "2",
  };
  return names[rank] ?? `${rank}`;
}

export function cardToString(card: Card): string {
  return `${rankName(card.rank)}${card.suit}`;
}

interface HandResult {
  rank: number;
  name: string;
  kickers: number[];
}

function evaluateHand(cards: Card[]): HandResult {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);

  const isFlush = suits.every((s) => s === suits[0]);

  const rankCounts = new Map<number, number>();
  for (const r of ranks) {
    rankCounts.set(r, (rankCounts.get(r) || 0) + 1);
  }

  const groups = [...rankCounts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);

  const isStraight = (() => {
    if (uniqueRanks.length < 5) return false;
    for (let i = 0; i <= uniqueRanks.length - 5; i++) {
      const slice = uniqueRanks.slice(i, i + 5);
      if (slice[0] - slice[4] === 4) return { high: slice[0], cards: slice };
      if (slice[0] === 14 && slice[1] === 5 && slice[2] === 4 && slice[3] === 3 && slice[4] === 2) {
        return { high: 5, cards: [5, 4, 3, 2, 1] };
      }
    }
    return null;
  })();

  if (isFlush && isStraight) {
    const high = isStraight.high;
    if (high === 14) return { rank: 10, name: "Royal Flush", kickers: [14] };
    return { rank: 9, name: "Straight Flush", kickers: [high] };
  }

  if (groups[0][1] === 4) {
    const quad = groups[0][0];
    const kicker = groups[1]?.[0] || 0;
    return { rank: 8, name: "Four of a Kind", kickers: [quad, kicker] };
  }

  if (groups[0][1] === 3 && groups[1]?.[1] === 2) {
    return { rank: 7, name: "Full House", kickers: [groups[0][0], groups[1][0]] };
  }

  if (isFlush) {
    return { rank: 6, name: "Flush", kickers: uniqueRanks.slice(0, 5) };
  }

  if (isStraight) {
    return { rank: 5, name: "Straight", kickers: [isStraight.high] };
  }

  if (groups[0][1] === 3) {
    const trips = groups[0][0];
    const kickers = groups.slice(1).map((g) => g[0]);
    return { rank: 4, name: "Three of a Kind", kickers: [trips, ...kickers] };
  }

  if (groups[0][1] === 2 && groups[1]?.[1] === 2) {
    const pair1 = groups[0][0];
    const pair2 = groups[1][0];
    const kicker = groups[2]?.[0] || 0;
    return { rank: 3, name: "Two Pair", kickers: [pair1, pair2, kicker] };
  }

  if (groups[0][1] === 2) {
    const pair = groups[0][0];
    const kickers = groups.slice(1).map((g) => g[0]);
    return { rank: 2, name: "One Pair", kickers: [pair, ...kickers] };
  }

  return { rank: 1, name: "High Card", kickers: uniqueRanks.slice(0, 5) };
}

function compareHands(a: HandResult, b: HandResult): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.min(a.kickers.length, b.kickers.length); i++) {
    if (a.kickers[i] !== b.kickers[i]) return a.kickers[i] - b.kickers[i];
  }
  return 0;
}

function bestHand(holeCards: Card[], communityCards: Card[]): HandResult {
  const allCards = [...holeCards, ...communityCards];
  if (allCards.length < 5) {
    return { rank: 0, name: "Incomplete", kickers: [] };
  }

  let best: HandResult | null = null;
  const combos = getCombinations(allCards, 5);
  for (const combo of combos) {
    const result = evaluateHand(combo);
    if (!best || compareHands(result, best) > 0) {
      best = result;
    }
  }
  return best!;
}

function getCombinations(arr: Card[], k: number): Card[][] {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];
  const [first, ...rest] = arr;
  const withFirst = getCombinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = getCombinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

export function createInitialGameState(
  players: { id: number; name: string; money: number; order: number }[],
  smallBlind: number,
  bigBlind: number
): GameState {
  return {
    phase: "idle",
    players: [],
    communityCards: [],
    pot: 0,
    currentPlayerIndex: 0,
    dealerIndex: 0,
    currentBet: 0,
    minRaise: bigBlind,
    deck: [],
    lastRaisePlayerIndex: -1,
    actions: [],
    winners: null,
  };
}

export function startNewHand(state: GameState, smallBlind: number, bigBlind: number): GameState {
  const deck = shuffleDeck(createDeck());

  const activePlayers = state.players.filter(
    (p) => !p.folded && p.money > 0
  );

  if (activePlayers.length < 2) return { ...state, phase: "idle" };

  const n = state.players.length;
  const dealerIndex = (state.dealerIndex + 1) % n;

  const sbIndex = (dealerIndex + 1) % n;
  const bbIndex = (dealerIndex + 2) % n;

  const players: PlayerState[] = state.players.map((p) => ({
    ...p,
    cards: [] as Card[],
    betThisRound: 0,
    folded: p.money <= 0,
    isAllIn: false,
  }));

  players.forEach((p) => {
    p.cards.push(deck.pop()!);
    p.cards.push(deck.pop()!);
  });

  const sb = Math.min(smallBlind, players[sbIndex].money);
  players[sbIndex].money -= sb;
  players[sbIndex].betThisRound = sb;

  const bb = Math.min(bigBlind, players[bbIndex].money);
  players[bbIndex].money -= bb;
  players[bbIndex].betThisRound = bb;

  const pot = sb + bb;
  const currentBet = bb;
  const minRaise = bigBlind;
  const lastRaisePlayerIndex = -1;

  let currentPlayerIndex = (bbIndex + 1) % n;
  while (players[currentPlayerIndex].folded || players[currentPlayerIndex].money === 0) {
    currentPlayerIndex = (currentPlayerIndex + 1) % n;
  }

  return {
    ...state,
    phase: "preflop",
    players,
    communityCards: [],
    pot,
    currentPlayerIndex,
    dealerIndex,
    currentBet,
    minRaise,
    deck,
    lastRaisePlayerIndex,
    actions: [],
    winners: null,
  };
}

export function dealCommunityCards(state: GameState, count: number): GameState {
  const deck = shuffleDeck(createDeck());
  const newCards: Card[] = [];
  for (let i = 0; i < count; i++) {
    newCards.push(deck.pop()!);
  }
  return {
    ...state,
    deck,
    communityCards: [...state.communityCards, ...newCards],
    phase:
      state.communityCards.length === 0
        ? "flop"
        : state.communityCards.length === 3
          ? "turn"
          : "river",
  };
}

export function getNextActivePlayer(
  players: PlayerState[],
  currentIndex: number,
  dealerIndex: number,
  lastRaisePlayerIndex: number
): number | null {
  const n = players.length;

  let idx = (currentIndex + 1) % n;
  let checked = 0;
  while (checked < n) {
    if (!players[idx].folded && !players[idx].isAllIn) {
      if (idx === lastRaisePlayerIndex) return null;
      if (idx === (dealerIndex + 3) % n || players.every(p => p.folded || p.isAllIn || p.betThisRound === players[idx].betThisRound)) {
        const firstActive = players.findIndex(p => !p.folded && !p.isAllIn);
        if (firstActive === -1) return null;
        const allMatching = players.every(
          (p) => p.folded || p.isAllIn || p.betThisRound === players[firstActive].betThisRound
        );
        if (allMatching && idx === lastRaisePlayerIndex) return null;
        if (allMatching && idx === firstActive) return null;
      }
      return idx;
    }
    idx = (idx + 1) % n;
    checked++;
  }
  return null;
}

export function processAction(
  state: GameState,
  playerId: number,
  action: "fold" | "check" | "call" | "raise" | "all-in",
  raiseAmount?: number,
  bigBlind?: number
): GameState {
  const playerIndex = state.players.findIndex((p) => p.id === playerId);
  if (playerIndex === -1) return state;

  const player = { ...state.players[playerIndex] };
  const newPlayers = [...state.players];
  let newPot = state.pot;
  let newCurrentBet = state.currentBet;
  let newMinRaise = state.minRaise;
  let newLastRaisePlayerIndex = state.lastRaisePlayerIndex;
  const newActions = [...state.actions];

  switch (action) {
    case "fold":
      player.folded = true;
      newActions.push({
        playerId,
        playerName: player.name,
        action: "fold",
      });
      break;

    case "check":
      newActions.push({
        playerId,
        playerName: player.name,
        action: "check",
      });
      break;

    case "call":
      const callAmount = Math.min(newCurrentBet - player.betThisRound, player.money);
      player.money -= callAmount;
      player.betThisRound += callAmount;
      newPot += callAmount;
      if (player.money === 0) player.isAllIn = true;
      newActions.push({
        playerId,
        playerName: player.name,
        action: "call",
        amount: callAmount,
      });
      break;

    case "raise":
      const totalBet = raiseAmount ?? (newCurrentBet + bigBlind!);
      if (totalBet <= newCurrentBet) {
        const callAmount = Math.min(newCurrentBet - player.betThisRound, player.money);
        player.money -= callAmount;
        player.betThisRound += callAmount;
        newPot += callAmount;
        if (player.money === 0) player.isAllIn = true;
        newActions.push({
          playerId,
          playerName: player.name,
          action: "call",
          amount: callAmount,
        });
        break;
      }
      const raiseDiff = totalBet - player.betThisRound;
      const actualRaise = Math.min(raiseDiff, player.money);
      player.money -= actualRaise;
      player.betThisRound += actualRaise;
      newPot += actualRaise;
      if (player.money === 0) player.isAllIn = true;
      newCurrentBet = player.betThisRound;
      newMinRaise = Math.min(raiseAmount ?? bigBlind!, player.betThisRound);
      newLastRaisePlayerIndex = playerIndex;
      newActions.push({
        playerId,
        playerName: player.name,
        action: "raise",
        amount: actualRaise,
      });
      break;

    case "all-in":
      const allInAmount = player.money;
      player.betThisRound += allInAmount;
      player.money = 0;
      player.isAllIn = true;
      newPot += allInAmount;
      if (player.betThisRound > newCurrentBet) {
        newCurrentBet = player.betThisRound;
        newLastRaisePlayerIndex = playerIndex;
      }
      newActions.push({
        playerId,
        playerName: player.name,
        action: "all-in",
        amount: allInAmount,
      });
      break;
  }

  newPlayers[playerIndex] = player;
  const newState = {
    ...state,
    players: newPlayers,
    pot: newPot,
    currentBet: newCurrentBet,
    minRaise: newMinRaise,
    lastRaisePlayerIndex: newLastRaisePlayerIndex,
    actions: newActions,
  };

  const activeNotAllIn = newPlayers.filter(p => !p.folded && !p.isAllIn);
  if (activeNotAllIn.length <= 1) {
    return advanceToShowdown(newState);
  }

  const nextIdx = getNextActivePlayer(
    newPlayers,
    playerIndex,
    state.dealerIndex,
    newLastRaisePlayerIndex
  );

  if (nextIdx === null) {
    return advancePhase(newState);
  }

  return { ...newState, currentPlayerIndex: nextIdx };
}

function advancePhase(state: GameState): GameState {
  if (state.phase === "preflop") {
    const deck = [...state.deck];
    deck.pop();
    const flop = [deck.pop()!, deck.pop()!, deck.pop()!];
    const firstActive = state.players.findIndex((p) => !p.folded && !p.isAllIn);
    const resetPlayers = state.players.map((p) => ({ ...p, betThisRound: 0 }));
    return {
      ...state,
      players: resetPlayers,
      communityCards: flop,
      phase: "flop",
      currentBet: 0,
      minRaise: 0,
      lastRaisePlayerIndex: -1,
      currentPlayerIndex: firstActive !== -1 ? firstActive : 0,
      deck,
    };
  }

  if (state.phase === "flop") {
    const deck = [...state.deck];
    deck.pop();
    const turn = deck.pop()!;
    const firstActive = state.players.findIndex((p) => !p.folded && !p.isAllIn);
    const resetPlayers = state.players.map((p) => ({ ...p, betThisRound: 0 }));
    return {
      ...state,
      players: resetPlayers,
      communityCards: [...state.communityCards, turn],
      phase: "turn",
      currentBet: 0,
      minRaise: 0,
      lastRaisePlayerIndex: -1,
      currentPlayerIndex: firstActive !== -1 ? firstActive : 0,
      deck,
    };
  }

  if (state.phase === "turn") {
    const deck = [...state.deck];
    deck.pop();
    const river = deck.pop()!;
    const firstActive = state.players.findIndex((p) => !p.folded && !p.isAllIn);
    const resetPlayers = state.players.map((p) => ({ ...p, betThisRound: 0 }));
    return {
      ...state,
      players: resetPlayers,
      communityCards: [...state.communityCards, river],
      phase: "river",
      currentBet: 0,
      minRaise: 0,
      lastRaisePlayerIndex: -1,
      currentPlayerIndex: firstActive !== -1 ? firstActive : 0,
      deck,
    };
  }

  if (state.phase === "river") {
    return advanceToShowdown(state);
  }

  return state;
}

function advanceToShowdown(state: GameState): GameState {
  const activePlayers = state.players.filter((p) => !p.folded && p.cards.length === 2);

  if (activePlayers.length === 0) {
    const allInPlayers = state.players.filter((p) => p.cards.length === 2);
    if (allInPlayers.length > 0) {
      const results = allInPlayers.map((p) => ({
        playerId: p.id,
        playerName: p.name,
        handResult: bestHand(p.cards, state.communityCards),
      }));
      results.sort((a, b) => compareHands(b.handResult, a.handResult));
      const bestResult = results[0].handResult;
      const winners = results
        .filter((r) => compareHands(r.handResult, bestResult) === 0)
        .map((r) => ({
          playerId: r.playerId,
          playerName: r.playerName,
          hand: r.handResult.name,
          handRank: r.handResult.rank,
        }));
      const splitAmount = Math.floor(state.pot / winners.length);
      const newPlayers = state.players.map((p) => {
        const isWinner = winners.find((w) => w.playerId === p.id);
        return isWinner ? { ...p, money: p.money + splitAmount } : p;
      });
      return { ...state, phase: "showdown", players: newPlayers, winners };
    }
    return { ...state, phase: "showdown", winners: [] };
  }

  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    const newPlayers = state.players.map((p) =>
      p.id === winner.id ? { ...p, money: p.money + state.pot } : p
    );
    return {
      ...state,
      phase: "showdown",
      players: newPlayers,
      winners: [
        {
          playerId: winner.id,
          playerName: winner.name,
          hand: "Last player standing",
          handRank: 1,
        },
      ],
    };
  }

  const results = activePlayers.map((p) => ({
    playerId: p.id,
    playerName: p.name,
    handResult: bestHand(p.cards, state.communityCards),
  }));

  results.sort((a, b) => compareHands(b.handResult, a.handResult));
  const bestResult = results[0].handResult;

  const winners = results
    .filter((r) => compareHands(r.handResult, bestResult) === 0)
    .map((r) => ({
      playerId: r.playerId,
      playerName: r.playerName,
      hand: r.handResult.name,
      handRank: r.handResult.rank,
    }));

  const splitAmount = Math.floor(state.pot / winners.length);
  const newPlayers = state.players.map((p) => {
    const isWinner = winners.find((w) => w.playerId === p.id);
    if (isWinner) {
      return { ...p, money: p.money + splitAmount };
    }
    return p;
  });

  return {
    ...state,
    phase: "showdown",
    players: newPlayers,
    winners,
  };
}

export function canCheck(state: GameState, playerId: number): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return false;
  return state.currentBet === player.betThisRound && !player.folded;
}

export function canCall(state: GameState, playerId: number): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return false;
  return state.currentBet > player.betThisRound && !player.folded;
}

export function canRaise(state: GameState, playerId: number): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return false;
  return player.money > state.currentBet - player.betThisRound && !player.folded;
}
