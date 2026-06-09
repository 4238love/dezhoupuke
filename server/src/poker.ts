export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";
export type Suit = "S" | "H" | "D" | "C";

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type HandCategory =
  | "high-card"
  | "one-pair"
  | "two-pair"
  | "three-of-a-kind"
  | "straight"
  | "flush"
  | "full-house"
  | "four-of-a-kind"
  | "straight-flush"
  | "royal-flush";

export interface EvaluatedHand {
  category: HandCategory;
  rankValues: number[];
  cards: Card[];
}

export interface PotContestant {
  playerId: string;
  contribution: number;
  folded: boolean;
  cards: Card[];
}

export interface PotAward {
  playerId: string;
  amount: number;
}

const rankValues: Record<Rank, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

const categoryValues: Record<HandCategory, number> = {
  "high-card": 0,
  "one-pair": 1,
  "two-pair": 2,
  "three-of-a-kind": 3,
  straight: 4,
  flush: 5,
  "full-house": 6,
  "four-of-a-kind": 7,
  "straight-flush": 8,
  "royal-flush": 9,
};

export function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

export function createDeck(): Card[] {
  const ranks = Object.keys(rankValues) as Rank[];
  const suits: Suit[] = ["S", "H", "D", "C"];
  return ranks.flatMap((rank) => suits.map((suit) => card(rank, suit)));
}

export function shuffleDeck(deck: Card[], random = Math.random): Card[] {
  const copy = [...deck];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function evaluateBestHand(cards: Card[]): EvaluatedHand {
  if (cards.length < 5) {
    throw new Error("At least five cards are required");
  }

  return combinations(cards, 5)
    .map(evaluateFiveCards)
    .sort((a, b) => compareEvaluatedHands(b, a))[0];
}

export function compareEvaluatedHands(left: EvaluatedHand, right: EvaluatedHand): number {
  const categoryDelta = categoryValues[left.category] - categoryValues[right.category];
  if (categoryDelta !== 0) {
    return categoryDelta;
  }

  const max = Math.max(left.rankValues.length, right.rankValues.length);
  for (let index = 0; index < max; index += 1) {
    const delta = (left.rankValues[index] ?? 0) - (right.rankValues[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

export function settlePots(players: PotContestant[], communityCards: Card[]): PotAward[] {
  const levels = [...new Set(players.map((player) => player.contribution).filter((amount) => amount > 0))].sort(
    (a, b) => a - b,
  );
  const awards = new Map<string, number>();
  let previousLevel = 0;

  for (const level of levels) {
    const contributors = players.filter((player) => player.contribution >= level);
    const potAmount = (level - previousLevel) * contributors.length;
    previousLevel = level;
    if (potAmount <= 0) {
      continue;
    }

    const eligible = contributors.filter((player) => !player.folded);
    if (eligible.length === 0) {
      continue;
    }

    const ranked = eligible.map((player) => ({
      playerId: player.playerId,
      hand: evaluateBestHand([...player.cards, ...communityCards]),
    }));
    ranked.sort((a, b) => compareEvaluatedHands(b.hand, a.hand));

    const best = ranked[0].hand;
    const winners = ranked.filter((candidate) => compareEvaluatedHands(candidate.hand, best) === 0);
    const share = Math.floor(potAmount / winners.length);
    let remainder = potAmount % winners.length;

    for (const winner of winners) {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      awards.set(winner.playerId, (awards.get(winner.playerId) ?? 0) + share + extra);
    }
  }

  return [...awards.entries()].map(([playerId, amount]) => ({ playerId, amount }));
}

function evaluateFiveCards(cards: Card[]): EvaluatedHand {
  const values = cards.map((item) => rankValues[item.rank]).sort((a, b) => b - a);
  const counts = countBy(values);
  const groups = [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || b.value - a.value);
  const flush = cards.every((item) => item.suit === cards[0].suit);
  const straightHigh = getStraightHigh(values);

  if (flush && straightHigh === 14) {
    return { category: "royal-flush", rankValues: [14], cards };
  }
  if (flush && straightHigh) {
    return { category: "straight-flush", rankValues: [straightHigh], cards };
  }
  if (groups[0].count === 4) {
    return {
      category: "four-of-a-kind",
      rankValues: [groups[0].value, groups.find((group) => group.count === 1)?.value ?? 0],
      cards,
    };
  }
  if (groups[0].count === 3 && groups[1]?.count === 2) {
    return { category: "full-house", rankValues: [groups[0].value, groups[1].value], cards };
  }
  if (flush) {
    return { category: "flush", rankValues: values, cards };
  }
  if (straightHigh) {
    return { category: "straight", rankValues: [straightHigh], cards };
  }
  if (groups[0].count === 3) {
    return {
      category: "three-of-a-kind",
      rankValues: [groups[0].value, ...groups.filter((group) => group.count === 1).map((group) => group.value)],
      cards,
    };
  }
  if (groups[0].count === 2 && groups[1]?.count === 2) {
    const pairs = groups.filter((group) => group.count === 2).map((group) => group.value);
    const kicker = groups.find((group) => group.count === 1)?.value ?? 0;
    return { category: "two-pair", rankValues: [...pairs, kicker], cards };
  }
  if (groups[0].count === 2) {
    return {
      category: "one-pair",
      rankValues: [groups[0].value, ...groups.filter((group) => group.count === 1).map((group) => group.value)],
      cards,
    };
  }
  return { category: "high-card", rankValues: values, cards };
}

function getStraightHigh(values: number[]): number | undefined {
  const unique = [...new Set(values)].sort((a, b) => b - a);
  if (unique.includes(14)) {
    unique.push(1);
  }

  for (let index = 0; index <= unique.length - 5; index += 1) {
    const window = unique.slice(index, index + 5);
    if (window[0] - window[4] === 4) {
      return window[0] === 14 && window[4] === 10 ? 14 : window[0];
    }
  }

  return undefined;
}

function countBy(values: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function combinations<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  const current: T[] = [];

  function walk(start: number): void {
    if (current.length === size) {
      result.push([...current]);
      return;
    }

    for (let index = start; index <= items.length - (size - current.length); index += 1) {
      current.push(items[index]);
      walk(index + 1);
      current.pop();
    }
  }

  walk(0);
  return result;
}
