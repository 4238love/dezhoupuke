import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { card, compareEvaluatedHands, evaluateBestHand, settlePots } from "../src/poker.js";

describe("Texas Hold'em hand evaluation", () => {
  it("chooses a straight flush over four of a kind", () => {
    const straightFlush = [
      card("9", "H"),
      card("T", "H"),
      card("J", "H"),
      card("Q", "H"),
      card("K", "H"),
      card("2", "C"),
      card("2", "D"),
    ];
    const quads = [
      card("A", "S"),
      card("A", "H"),
      card("A", "D"),
      card("A", "C"),
      card("K", "S"),
      card("3", "D"),
      card("4", "C"),
    ];

    assert.equal(compareEvaluatedHands(evaluateBestHand(straightFlush), evaluateBestHand(quads)) > 0, true);
  });

  it("recognizes ace-low straights", () => {
    const result = evaluateBestHand([
      card("A", "S"),
      card("2", "H"),
      card("3", "D"),
      card("4", "C"),
      card("5", "S"),
      card("9", "D"),
      card("K", "C"),
    ]);

    assert.equal(result.category, "straight");
    assert.deepEqual(result.rankValues, [5]);
  });

  it("settles side pots by contribution and hand eligibility", () => {
    const awards = settlePots(
      [
        {
          playerId: "short",
          seatIndex: 0,
          contribution: 50,
          folded: false,
          cards: [card("A", "S"), card("A", "H")],
        },
        {
          playerId: "middle",
          seatIndex: 1,
          contribution: 100,
          folded: false,
          cards: [card("K", "S"), card("K", "H")],
        },
        {
          playerId: "deep",
          seatIndex: 2,
          contribution: 200,
          folded: false,
          cards: [card("Q", "S"), card("Q", "H")],
        },
      ],
      [card("2", "C"), card("7", "D"), card("9", "S"), card("J", "C"), card("3", "H")],
      0,
    );

    assert.deepEqual(awards, [
      { playerId: "short", amount: 150 },
      { playerId: "middle", amount: 100 },
      { playerId: "deep", amount: 100 },
    ]);
  });

  it("awards an odd split-pot chip clockwise from the Dealer", () => {
    const awards = settlePots(
      [
        {
          playerId: "left-of-dealer",
          seatIndex: 0,
          contribution: 2,
          folded: false,
          cards: [card("A", "S"), card("K", "H")],
        },
        {
          playerId: "right-of-dealer",
          seatIndex: 3,
          contribution: 2,
          folded: false,
          cards: [card("Q", "S"), card("J", "H")],
        },
        {
          playerId: "folded",
          seatIndex: 2,
          contribution: 1,
          folded: true,
          cards: [card("2", "S"), card("3", "H")],
        },
      ],
      [card("2", "C"), card("3", "D"), card("4", "H"), card("5", "S"), card("6", "C")],
      1,
    );

    assert.deepEqual(awards, [
      { playerId: "right-of-dealer", amount: 3 },
      { playerId: "left-of-dealer", amount: 2 },
    ]);
  });
});
