import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GameService } from "../src/game.js";

describe("Private Room lifecycle", () => {
  it("creates a Private Room with AI Opponents and starts a Hand", () => {
    const game = new GameService({ roomCodeGenerator: () => "ROOM01", idGenerator: sequentialIds() });

    const result = game.createRoom({
      hostNickname: "房主",
      seatCount: 6,
      aiCount: 2,
      aiDifficulty: "standard",
      initialChips: 1000,
      smallBlind: 5,
      bigBlind: 10,
    });

    assert.equal(result.roomCode, "ROOM01");
    assert.equal(result.snapshot.seats.length, 6);
    assert.equal(result.snapshot.seats.filter((seat) => seat.occupant?.kind === "ai").length, 2);
    assert.equal(result.snapshot.hand?.phase, "preflop");
    assert.equal(result.snapshot.yourPlayerId, result.playerId);
  });

  it("waits for the configured real player count before starting a Hand", () => {
    const game = new GameService({ roomCodeGenerator: () => "WAIT01", idGenerator: sequentialIds() });

    const created = game.createRoom({
      hostNickname: "房主",
      seatCount: 4,
      requiredHumanCount: 2,
      aiCount: 1,
      aiDifficulty: "standard",
      initialChips: 1000,
      smallBlind: 5,
      bigBlind: 10,
    });

    assert.equal(created.snapshot.settings.requiredHumanCount, 2);
    assert.equal(created.snapshot.hand, undefined);
    assert.equal(created.snapshot.seats.filter((seat) => seat.occupant?.kind === "human").length, 1);

    const joined = game.joinRoom({ roomCode: created.roomCode, nickname: "朋友" });

    assert.equal(joined.snapshot.hand?.phase, "preflop");
    assert.equal(joined.snapshot.seats.filter((seat) => seat.occupant?.kind === "human").length, 2);
  });

  it("lets a friend replace an AI without inheriting AI Table Chips", () => {
    const game = new GameService({ roomCodeGenerator: () => "ROOM02", idGenerator: sequentialIds() });
    const created = game.createRoom({
      hostNickname: "房主",
      seatCount: 2,
      aiCount: 1,
      aiDifficulty: "easy",
      initialChips: 1000,
      smallBlind: 5,
      bigBlind: 10,
    });

    const aiSeat = created.snapshot.seats.find((seat) => seat.occupant?.kind === "ai");
    assert.ok(aiSeat?.occupant);
    game.adjustChipsForTest(created.roomCode, aiSeat.occupant.id, 2400);

    const joined = game.joinRoom({
      roomCode: created.roomCode,
      nickname: "朋友",
    });
    assert.equal(joined.snapshot.pendingReplacement, true);

    game.finishCurrentHandForTest(created.roomCode);
    const afterHand = game.snapshot(created.roomCode, joined.playerId);
    const friendSeat = afterHand.seats.find((seat) => seat.occupant?.id === joined.playerId);
    assert.equal(friendSeat?.occupant?.chips, 1000);
  });

  it("hides other players' Hole Cards before Showdown", () => {
    const game = new GameService({ roomCodeGenerator: () => "ROOM03", idGenerator: sequentialIds() });
    const created = game.createRoom({
      hostNickname: "房主",
      seatCount: 2,
      aiCount: 1,
      aiDifficulty: "standard",
      initialChips: 1000,
      smallBlind: 5,
      bigBlind: 10,
    });

    const hostSnapshot = game.snapshot(created.roomCode, created.playerId);
    const hostSeat = hostSnapshot.seats.find((seat) => seat.occupant?.id === created.playerId);
    const aiSeat = hostSnapshot.seats.find((seat) => seat.occupant?.kind === "ai");

    assert.equal(hostSeat?.holeCards?.length, 2);
    assert.equal(aiSeat?.holeCards, undefined);
  });

  it("reveals community cards in Texas Hold'em street order", () => {
    const game = new GameService({ roomCodeGenerator: () => "STREET", idGenerator: sequentialIds() });
    const created = game.createRoom({
      hostNickname: "房主",
      seatCount: 2,
      requiredHumanCount: 2,
      aiCount: 0,
      aiDifficulty: "standard",
      initialChips: 1000,
      smallBlind: 5,
      bigBlind: 10,
    });
    const joined = game.joinRoom({ roomCode: created.roomCode, nickname: "朋友" });

    assert.equal(joined.snapshot.hand?.phase, "preflop");
    assert.equal(joined.snapshot.hand?.communityCards.length, 0);

    const afterSmallBlindCalls = game.applyAction({ roomCode: created.roomCode, playerId: created.playerId, action: "call" });
    assert.equal(afterSmallBlindCalls.hand?.phase, "preflop");
    assert.equal(afterSmallBlindCalls.hand?.communityCards.length, 0);

    const flop = game.applyAction({ roomCode: created.roomCode, playerId: joined.playerId, action: "check" });
    assert.equal(flop.hand?.phase, "flop");
    assert.equal(flop.hand?.communityCards.length, 3);

    game.applyAction({ roomCode: created.roomCode, playerId: joined.playerId, action: "check" });
    const turn = game.applyAction({ roomCode: created.roomCode, playerId: created.playerId, action: "check" });
    assert.equal(turn.hand?.phase, "turn");
    assert.equal(turn.hand?.communityCards.length, 4);

    game.applyAction({ roomCode: created.roomCode, playerId: joined.playerId, action: "check" });
    const river = game.applyAction({ roomCode: created.roomCode, playerId: created.playerId, action: "check" });
    assert.equal(river.hand?.phase, "river");
    assert.equal(river.hand?.communityCards.length, 5);

    game.applyAction({ roomCode: created.roomCode, playerId: joined.playerId, action: "check" });
    const settled = game.applyAction({ roomCode: created.roomCode, playerId: created.playerId, action: "check" });
    assert.equal(settled.hand?.phase, "settled");
    assert.equal(settled.hand?.communityCards.length, 5);
  });

  it("runs out the board after an all-in call leaves no further betting possible", () => {
    const game = new GameService({ roomCodeGenerator: () => "ALLIN1", idGenerator: sequentialIds() });
    const created = game.createRoom({
      hostNickname: "短码",
      seatCount: 2,
      requiredHumanCount: 2,
      aiCount: 0,
      aiDifficulty: "standard",
      initialChips: 1000,
      smallBlind: 5,
      bigBlind: 10,
    });
    const joined = game.joinRoom({ roomCode: created.roomCode, nickname: "深码" });
    game.adjustChipsForTest(created.roomCode, created.playerId, 15);

    const allIn = game.applyAction({ roomCode: created.roomCode, playerId: created.playerId, action: "all-in" });
    assert.equal(allIn.hand?.phase, "preflop");
    assert.equal(allIn.hand?.communityCards.length, 0);

    const settled = game.applyAction({ roomCode: created.roomCode, playerId: joined.playerId, action: "call" });
    assert.equal(settled.hand?.phase, "settled");
    assert.equal(settled.hand?.communityCards.length, 5);
    assert.equal(settled.legalActions.length, 0);
  });

  it("does not offer or accept a raise when the player cannot put in enough chips", () => {
    const game = new GameService({ roomCodeGenerator: () => "SHORT1", idGenerator: sequentialIds() });
    const created = game.createRoom({
      hostNickname: "短码",
      seatCount: 2,
      requiredHumanCount: 2,
      aiCount: 0,
      aiDifficulty: "standard",
      initialChips: 1000,
      smallBlind: 5,
      bigBlind: 10,
    });
    game.joinRoom({ roomCode: created.roomCode, nickname: "深码" });
    game.adjustChipsForTest(created.roomCode, created.playerId, 3);

    const shortStackView = game.snapshot(created.roomCode, created.playerId);
    assert.equal(shortStackView.legalActions.some((action) => action.type === "raise"), false);

    assert.throws(
      () => game.applyAction({ roomCode: created.roomCode, playerId: created.playerId, action: "raise", amount: 20 }),
      /筹码不足/,
    );

    const afterRejectedRaise = game.snapshot(created.roomCode, created.playerId);
    assert.equal(afterRejectedRaise.hand?.currentBet, 10);
    assert.equal(afterRejectedRaise.seats.find((seat) => seat.occupant?.id === created.playerId)?.roundBet, 5);
  });

  it("converts Host Removal into an AI Takeover Seat that inherits chips", () => {
    const game = new GameService({ roomCodeGenerator: () => "ROOM04", idGenerator: sequentialIds() });
    const created = game.createRoom({
      hostNickname: "房主",
      seatCount: 3,
      aiCount: 1,
      aiDifficulty: "standard",
      initialChips: 1000,
      smallBlind: 5,
      bigBlind: 10,
    });
    const joined = game.joinRoom({ roomCode: created.roomCode, nickname: "朋友" });
    game.adjustChipsForTest(created.roomCode, joined.playerId, 1777);

    const snapshot = game.removePlayer(created.roomCode, created.playerId, joined.playerId);
    const takeoverSeat = snapshot.seats.find((seat) => seat.occupant?.nickname.includes("朋友"));

    assert.equal(takeoverSeat?.occupant?.kind, "ai");
    assert.equal(takeoverSeat?.occupant?.chips, 1777);
    assert.equal(takeoverSeat?.occupant?.takeover, true);
  });

  it("allows the same Temporary Player Identity to reclaim an AI Takeover Seat", () => {
    const game = new GameService({ roomCodeGenerator: () => "ROOM05", idGenerator: sequentialIds() });
    const created = game.createRoom({
      hostNickname: "房主",
      seatCount: 2,
      aiCount: 1,
      aiDifficulty: "standard",
      initialChips: 1000,
      smallBlind: 5,
      bigBlind: 10,
    });
    game.adjustChipsForTest(created.roomCode, created.playerId, 2222);
    game.leaveSeat(created.roomCode, created.playerId);

    const reclaimed = game.reclaimSeat(created.roomCode, created.sessionId);
    const seat = reclaimed.snapshot.seats.find((item) => item.occupant?.id === reclaimed.playerId);

    assert.equal(seat?.occupant?.kind, "human");
    assert.equal(seat?.occupant?.chips, 2222);
  });

  it("continues to the next Hand after a human leaves and becomes an AI Takeover Seat", () => {
    const game = new GameService({ roomCodeGenerator: () => "ROOM08", idGenerator: sequentialIds() });
    const created = game.createRoom({
      hostNickname: "房主",
      seatCount: 3,
      requiredHumanCount: 2,
      aiCount: 1,
      aiDifficulty: "standard",
      initialChips: 1000,
      smallBlind: 5,
      bigBlind: 10,
    });
    const joined = game.joinRoom({ roomCode: created.roomCode, nickname: "朋友" });
    const firstHandId = joined.snapshot.hand?.id;

    game.leaveSeat(created.roomCode, joined.playerId);
    game.finishCurrentHandForTest(created.roomCode);
    const next = game.startNextHand(created.roomCode);

    assert.equal(next.hand?.phase, "preflop");
    assert.notEqual(next.hand?.id, firstHandId);
    assert.equal(next.seats.filter((seat) => seat.occupant && seat.occupant.chips > 0).length, 3);
  });

  it("transfers Host controls to a remaining human when the Host leaves", () => {
    const game = new GameService({ roomCodeGenerator: () => "HOST01", idGenerator: sequentialIds() });
    const created = game.createRoom({
      hostNickname: "房主",
      seatCount: 3,
      requiredHumanCount: 2,
      aiCount: 1,
      aiDifficulty: "standard",
      initialChips: 1000,
      smallBlind: 5,
      bigBlind: 10,
    });
    const joined = game.joinRoom({ roomCode: created.roomCode, nickname: "朋友" });

    game.leaveSeat(created.roomCode, created.playerId);
    const friendView = game.snapshot(created.roomCode, joined.playerId);

    assert.equal(friendView.hostPlayerId, joined.playerId);
    assert.equal(friendView.tableLog.some((line) => line.includes("朋友 成为新房主")), true);
  });

  it("auto-folds on Action Timeout when checking is not possible", () => {
    const game = new GameService({ roomCodeGenerator: () => "ROOM06", idGenerator: sequentialIds() });
    const created = game.createRoom({
      hostNickname: "房主",
      seatCount: 2,
      aiCount: 1,
      aiDifficulty: "standard",
      initialChips: 1000,
      smallBlind: 5,
      bigBlind: 10,
    });

    const afterTimeout = game.timeoutCurrentAction(created.roomCode);
    const hostSeat = afterTimeout.seats.find((seat) => seat.occupant?.id === created.playerId);

    assert.equal(hostSeat?.folded, true);
    assert.equal(afterTimeout.hand?.phase, "settled");
  });

  it("lets the Host end a Private Room", () => {
    const game = new GameService({ roomCodeGenerator: () => "ROOM07", idGenerator: sequentialIds() });
    const created = game.createRoom({
      hostNickname: "房主",
      seatCount: 2,
      aiCount: 1,
      aiDifficulty: "standard",
      initialChips: 1000,
      smallBlind: 5,
      bigBlind: 10,
    });

    game.endRoom(created.roomCode, created.playerId);

    assert.equal(game.listRoomCodes().includes(created.roomCode), false);
  });
});

function sequentialIds() {
  let counter = 0;
  return () => {
    counter += 1;
    return `id-${counter}`;
  };
}
