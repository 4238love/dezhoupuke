import { Card, createDeck, evaluateBestHand, settlePots, shuffleDeck } from "./poker.js";

export type AiDifficulty = "easy" | "standard" | "hard";
export type PlayerKind = "human" | "ai";
export type HandPhase = "preflop" | "flop" | "turn" | "river" | "settled";
export type PlayerActionType = "fold" | "check" | "call" | "bet" | "raise" | "all-in" | "rebuy";

export interface CreateRoomInput {
  hostNickname: string;
  seatCount: number;
  requiredHumanCount?: number;
  aiCount: number;
  aiDifficulty: AiDifficulty;
  initialChips: number;
  smallBlind: number;
  bigBlind: number;
}

export interface JoinRoomInput {
  roomCode: string;
  nickname: string;
  sessionId?: string;
}

export interface PlayerActionInput {
  roomCode: string;
  playerId: string;
  action: PlayerActionType;
  amount?: number;
}

export interface AiActionDecision {
  type: PlayerActionType;
  amount?: number;
}

export interface AiDecisionContext {
  roomCode: string;
  aiDifficulty: AiDifficulty;
  phase: HandPhase;
  pot: number;
  currentBet: number;
  minRaise: number;
  toCall: number;
  seatIndex: number;
  nickname: string;
  chips: number;
  roundBet: number;
  contribution: number;
  holeCards: Card[];
  communityCards: Card[];
  legalActions: { type: PlayerActionType; minAmount?: number; callAmount?: number }[];
}

export interface GameServiceOptions {
  roomCodeGenerator?: () => string;
  idGenerator?: () => string;
  random?: () => number;
}

export interface Occupant {
  id: string;
  kind: PlayerKind;
  nickname: string;
  chips: number;
  connected: boolean;
  sessionId?: string;
  disconnectedAt?: number;
  waitingForRebuy?: boolean;
  takeoverForSessionId?: string;
}

export interface Seat {
  index: number;
  occupant?: Occupant;
}

interface HandParticipant {
  seatIndex: number;
  playerId: string;
  holeCards: Card[];
  contribution: number;
  roundBet: number;
  folded: boolean;
  allIn: boolean;
  acted: boolean;
}

interface HandState {
  id: string;
  phase: HandPhase;
  deck: Card[];
  communityCards: Card[];
  dealerSeatIndex: number;
  smallBlindSeatIndex: number;
  bigBlindSeatIndex: number;
  currentTurnSeatIndex?: number;
  currentBet: number;
  minRaise: number;
  participants: HandParticipant[];
  awards?: { playerId: string; amount: number }[];
}

interface PendingReplacement {
  playerId: string;
  nickname: string;
  sessionId: string;
}

interface Room {
  code: string;
  hostPlayerId: string;
  seats: Seat[];
  requiredHumanCount: number;
  aiDifficulty: AiDifficulty;
  initialChips: number;
  smallBlind: number;
  bigBlind: number;
  handNumber: number;
  hand?: HandState;
  tableLog: string[];
  pendingReplacements: PendingReplacement[];
  lastHumanAbsentAt?: number;
  createdAt: number;
}

export interface PublicSeat {
  index: number;
  occupant?: {
    id: string;
    kind: PlayerKind;
    nickname: string;
    chips: number;
    connected: boolean;
    waitingForRebuy?: boolean;
    takeover: boolean;
  };
  holeCards?: Card[];
  folded?: boolean;
  allIn?: boolean;
  contribution?: number;
  roundBet?: number;
}

export interface RoomSnapshot {
  roomCode: string;
  hostPlayerId: string;
  yourPlayerId?: string;
  settings: {
    requiredHumanCount: number;
    aiDifficulty: AiDifficulty;
    initialChips: number;
    smallBlind: number;
    bigBlind: number;
  };
  seats: PublicSeat[];
  hand?: {
    id: string;
    phase: HandPhase;
    communityCards: Card[];
    dealerSeatIndex: number;
    smallBlindSeatIndex: number;
    bigBlindSeatIndex: number;
    currentTurnSeatIndex?: number;
    currentBet: number;
    minRaise: number;
    pot: number;
    awards?: { playerId: string; amount: number }[];
  };
  legalActions: { type: PlayerActionType; minAmount?: number; callAmount?: number }[];
  tableLog: string[];
  pendingReplacement?: boolean;
}

export class GameService {
  private rooms = new Map<string, Room>();
  private readonly roomCodeGenerator: () => string;
  private readonly idGenerator: () => string;
  private readonly random: () => number;

  constructor(options: GameServiceOptions = {}) {
    this.roomCodeGenerator = options.roomCodeGenerator ?? generateRoomCode;
    this.idGenerator = options.idGenerator ?? generateId;
    this.random = options.random ?? Math.random;
  }

  createRoom(input: CreateRoomInput): { roomCode: string; playerId: string; sessionId: string; snapshot: RoomSnapshot } {
    validateCreateRoom(input);
    if (this.rooms.size >= 10) {
      throw new Error("服务器繁忙，请稍后再创建房间");
    }

    const requiredHumanCount = normalizeRequiredHumanCount(input);
    const code = this.uniqueRoomCode();
    const hostId = this.idGenerator();
    const sessionId = this.idGenerator();
    const seats: Seat[] = Array.from({ length: input.seatCount }, (_, index) => ({ index }));
    seats[0].occupant = {
      id: hostId,
      kind: "human",
      nickname: input.hostNickname.trim(),
      chips: input.initialChips,
      connected: true,
      sessionId,
    };

    for (let index = 0; index < input.aiCount; index += 1) {
      seats[index + 1].occupant = this.createAi(index + 1, input.initialChips);
    }

    const room: Room = {
      code,
      hostPlayerId: hostId,
      seats,
      requiredHumanCount,
      aiDifficulty: input.aiDifficulty,
      initialChips: input.initialChips,
      smallBlind: input.smallBlind,
      bigBlind: input.bigBlind,
      handNumber: 0,
      tableLog: [
        `${input.hostNickname.trim()} 创建了私人房间`,
        `等待真实玩家：1/${requiredHumanCount}`,
        `房间 AI 难度：${input.aiDifficulty}`,
      ],
      pendingReplacements: [],
      createdAt: Date.now(),
    };
    this.rooms.set(code, room);
    this.startHandIfReady(room);

    return { roomCode: code, playerId: hostId, sessionId, snapshot: this.snapshot(code, hostId) };
  }

  joinRoom(input: JoinRoomInput): { roomCode: string; playerId: string; sessionId: string; snapshot: RoomSnapshot } {
    const room = this.requireRoom(input.roomCode);
    const nickname = input.nickname.trim();
    if (!nickname) {
      throw new Error("昵称不能为空");
    }
    if (room.seats.some((seat) => seat.occupant?.kind === "human" && seat.occupant.nickname === nickname)) {
      throw new Error("房间内昵称不能重复");
    }

    const playerId = this.idGenerator();
    const sessionId = input.sessionId ?? this.idGenerator();
    const emptySeat = room.seats.find((seat) => !seat.occupant);
    if (emptySeat) {
      emptySeat.occupant = {
        id: playerId,
        kind: "human",
        nickname,
        chips: room.initialChips,
        connected: true,
        sessionId,
      };
      room.tableLog.push(`${nickname} 加入了房间`);
      this.startHandIfReady(room);
      return { roomCode: room.code, playerId, sessionId, snapshot: this.snapshot(room.code, playerId) };
    }

    const aiSeat = room.seats.find((seat) => seat.occupant?.kind === "ai");
    if (!aiSeat) {
      throw new Error("房间已满");
    }

    if (!room.hand || room.hand.phase === "settled") {
      aiSeat.occupant = {
        id: playerId,
        kind: "human",
        nickname,
        chips: room.initialChips,
        connected: true,
        sessionId,
      };
      room.tableLog.push(`${nickname} 替换了 AI，对下一手生效`);
      this.startHandIfReady(room);
      return { roomCode: room.code, playerId, sessionId, snapshot: this.snapshot(room.code, playerId) };
    }

    room.pendingReplacements.push({ playerId, nickname, sessionId });
    room.tableLog.push(`${nickname} 将在本手结束后替换 AI`);
    return { roomCode: room.code, playerId, sessionId, snapshot: { ...this.snapshot(room.code, playerId), pendingReplacement: true } };
  }

  snapshot(roomCode: string, viewerPlayerId?: string): RoomSnapshot {
    const room = this.requireRoom(roomCode);
    const hand = room.hand;
    const viewerParticipant = hand?.participants.find((participant) => participant.playerId === viewerPlayerId);
    const publicSeats = room.seats.map((seat): PublicSeat => {
      const participant = hand?.participants.find((item) => item.seatIndex === seat.index);
      const canSeeHoleCards =
        Boolean(participant) &&
        (participant?.playerId === viewerPlayerId || (hand?.phase === "settled" && participant && !participant.folded));
      return {
        index: seat.index,
        occupant: seat.occupant
          ? {
              id: seat.occupant.id,
              kind: seat.occupant.kind,
              nickname: seat.occupant.nickname,
              chips: seat.occupant.chips,
              connected: seat.occupant.connected,
              waitingForRebuy: seat.occupant.waitingForRebuy,
              takeover: Boolean(seat.occupant.takeoverForSessionId),
            }
          : undefined,
        holeCards: canSeeHoleCards ? participant?.holeCards : undefined,
        folded: participant?.folded,
        allIn: participant?.allIn,
        contribution: participant?.contribution,
        roundBet: participant?.roundBet,
      };
    });

    return {
      roomCode,
      hostPlayerId: room.hostPlayerId,
      yourPlayerId: viewerPlayerId,
      settings: {
        requiredHumanCount: room.requiredHumanCount,
        aiDifficulty: room.aiDifficulty,
        initialChips: room.initialChips,
        smallBlind: room.smallBlind,
        bigBlind: room.bigBlind,
      },
      seats: publicSeats,
      hand: hand
        ? {
            id: hand.id,
            phase: hand.phase,
            communityCards: hand.communityCards,
            dealerSeatIndex: hand.dealerSeatIndex,
            smallBlindSeatIndex: hand.smallBlindSeatIndex,
            bigBlindSeatIndex: hand.bigBlindSeatIndex,
            currentTurnSeatIndex: hand.currentTurnSeatIndex,
            currentBet: hand.currentBet,
            minRaise: hand.minRaise,
            pot: hand.participants.reduce((sum, participant) => sum + participant.contribution, 0),
            awards: hand.awards,
          }
        : undefined,
      legalActions: viewerParticipant ? this.legalActions(room, viewerParticipant) : [],
      tableLog: room.tableLog.slice(-80),
    };
  }

  listRoomCodes(): string[] {
    return [...this.rooms.keys()];
  }

  applyAction(input: PlayerActionInput): RoomSnapshot {
    const room = this.requireRoom(input.roomCode);
    if (input.action === "rebuy") {
      const occupant = this.findOccupant(room, input.playerId);
      if (!occupant || !occupant.waitingForRebuy) {
        throw new Error("当前不能重新买入");
      }
      occupant.chips = room.initialChips;
      occupant.waitingForRebuy = false;
      room.tableLog.push(`${occupant.nickname} 重新买入 ${room.initialChips}`);
      this.startHandIfReady(room);
      return this.snapshot(room.code, input.playerId);
    }

    const hand = this.requireActiveHand(room);
    const participant = hand.participants.find((item) => item.playerId === input.playerId);
    if (!participant || participant.seatIndex !== hand.currentTurnSeatIndex) {
      throw new Error("还没轮到该玩家行动");
    }

    this.applyParticipantAction(room, hand, participant, input.action, input.amount);
    this.advanceAfterAction(room, hand);
    return this.snapshot(room.code, input.playerId);
  }

  timeoutCurrentAction(roomCode: string): RoomSnapshot {
    const room = this.requireRoom(roomCode);
    const hand = this.requireActiveHand(room);
    const participant = hand.participants.find((item) => item.seatIndex === hand.currentTurnSeatIndex);
    if (!participant) {
      return this.snapshot(roomCode);
    }
    const occupant = this.findOccupant(room, participant.playerId);
    const toCall = Math.max(0, hand.currentBet - participant.roundBet);
    this.applyParticipantAction(room, hand, participant, toCall === 0 ? "check" : "fold");
    room.tableLog.push(`${occupant?.nickname ?? "玩家"} 行动超时，自动${toCall === 0 ? "过牌" : "弃牌"}`);
    this.advanceAfterAction(room, hand);
    return this.snapshot(roomCode);
  }

  startNextHand(roomCode: string): RoomSnapshot {
    const room = this.requireRoom(roomCode);
    this.startHandIfReady(room);
    return this.snapshot(roomCode);
  }

  currentAiDecisionContext(roomCode: string): AiDecisionContext | undefined {
    const room = this.requireRoom(roomCode);
    const hand = room.hand;
    if (!hand || hand.phase === "settled" || hand.currentTurnSeatIndex === undefined) {
      return undefined;
    }
    const seat = room.seats[hand.currentTurnSeatIndex];
    if (seat.occupant?.kind !== "ai") {
      return undefined;
    }
    const participant = hand.participants.find((item) => item.seatIndex === seat.index);
    if (!participant || !seat.occupant) {
      return undefined;
    }
    return {
      roomCode,
      aiDifficulty: room.aiDifficulty,
      phase: hand.phase,
      pot: hand.participants.reduce((sum, item) => sum + item.contribution, 0),
      currentBet: hand.currentBet,
      minRaise: hand.minRaise,
      toCall: Math.max(0, hand.currentBet - participant.roundBet),
      seatIndex: seat.index,
      nickname: seat.occupant.nickname,
      chips: seat.occupant.chips,
      roundBet: participant.roundBet,
      contribution: participant.contribution,
      holeCards: participant.holeCards,
      communityCards: hand.communityCards,
      legalActions: this.legalActions(room, participant),
    };
  }

  performAiAction(roomCode: string, decision?: AiActionDecision): boolean {
    const room = this.requireRoom(roomCode);
    const hand = room.hand;
    if (!hand || hand.phase === "settled" || hand.currentTurnSeatIndex === undefined) {
      return false;
    }
    const seat = room.seats[hand.currentTurnSeatIndex];
    if (seat.occupant?.kind !== "ai") {
      return false;
    }
    const participant = hand.participants.find((item) => item.seatIndex === seat.index);
    if (!participant) {
      return false;
    }
    const action = this.normalizeAiDecision(room, hand, participant, decision) ?? chooseAiAction(room, hand, participant, this.random);
    this.applyParticipantAction(room, hand, participant, action.type, action.amount);
    this.advanceAfterAction(room, hand);
    return true;
  }

  leaveSeat(roomCode: string, playerId: string): RoomSnapshot {
    const room = this.requireRoom(roomCode);
    this.convertHumanToAiTakeover(room, playerId, "离开");
    this.updateHumanAbsence(room);
    return this.snapshot(roomCode, playerId);
  }

  markDisconnected(roomCode: string, playerId: string): void {
    const room = this.requireRoom(roomCode);
    const occupant = this.findOccupant(room, playerId);
    if (!occupant || occupant.kind !== "human") {
      return;
    }
    occupant.connected = false;
    occupant.disconnectedAt = Date.now();
    room.tableLog.push(`${occupant.nickname} 断线，保留 10 分钟重连窗口`);
    this.updateHumanAbsence(room);
  }

  reconnect(roomCode: string, playerId: string | undefined, sessionId: string): { playerId: string; snapshot: RoomSnapshot } {
    const room = this.requireRoom(roomCode);
    const seat = room.seats.find(
      (item) =>
        (playerId && item.occupant?.id === playerId && item.occupant.sessionId === sessionId) ||
        item.occupant?.sessionId === sessionId,
    );
    if (seat?.occupant && seat.occupant.kind === "human") {
      seat.occupant.connected = true;
      seat.occupant.disconnectedAt = undefined;
      room.tableLog.push(`${seat.occupant.nickname} 已重连`);
      this.updateHumanAbsence(room);
      return { playerId: seat.occupant.id, snapshot: this.snapshot(roomCode, seat.occupant.id) };
    }
    return this.reclaimSeat(roomCode, sessionId);
  }

  expireStale(now = Date.now()): string[] {
    const expiredRooms: string[] = [];
    for (const room of this.rooms.values()) {
      const disconnectedHumans = room.seats.filter(
        (seat) =>
          seat.occupant?.kind === "human" &&
          !seat.occupant.connected &&
          seat.occupant.disconnectedAt &&
          now - seat.occupant.disconnectedAt >= 10 * 60 * 1000,
      );
      for (const seat of disconnectedHumans) {
        if (seat.occupant) {
          this.convertHumanToAiTakeover(room, seat.occupant.id, "断线超时");
        }
      }
      this.updateHumanAbsence(room);
      if (room.lastHumanAbsentAt && now - room.lastHumanAbsentAt >= 10 * 60 * 1000) {
        this.rooms.delete(room.code);
        expiredRooms.push(room.code);
      }
    }
    return expiredRooms;
  }

  removePlayer(roomCode: string, hostPlayerId: string, targetPlayerId: string): RoomSnapshot {
    const room = this.requireRoom(roomCode);
    if (room.hostPlayerId !== hostPlayerId) {
      throw new Error("只有房主可以移除玩家");
    }
    this.convertHumanToAiTakeover(room, targetPlayerId, "被房主移除");
    this.updateHumanAbsence(room);
    return this.snapshot(roomCode, hostPlayerId);
  }

  endRoom(roomCode: string, hostPlayerId: string): void {
    const room = this.requireRoom(roomCode);
    if (room.hostPlayerId !== hostPlayerId) {
      throw new Error("只有房主可以结束房间");
    }
    this.rooms.delete(room.code);
  }

  reclaimSeat(roomCode: string, sessionId: string): { playerId: string; snapshot: RoomSnapshot } {
    const room = this.requireRoom(roomCode);
    const seat = room.seats.find((item) => item.occupant?.takeoverForSessionId === sessionId);
    if (!seat?.occupant) {
      throw new Error("没有可恢复的席位");
    }
    seat.occupant = {
      id: this.idGenerator(),
      kind: "human",
      nickname: seat.occupant.nickname.replace("AI接管-", ""),
      chips: seat.occupant.chips,
      connected: true,
      sessionId,
    };
    room.tableLog.push(`${seat.occupant.nickname} 重新接管了席位`);
    return { playerId: seat.occupant.id, snapshot: this.snapshot(roomCode, seat.occupant.id) };
  }

  finishCurrentHandForTest(roomCode: string): void {
    const room = this.requireRoom(roomCode);
    if (!room.hand) {
      return;
    }
    this.settleHand(room, room.hand);
  }

  adjustChipsForTest(roomCode: string, playerId: string, chips: number): void {
    const room = this.requireRoom(roomCode);
    const occupant = this.findOccupant(room, playerId);
    if (!occupant) {
      throw new Error("Player not found");
    }
    occupant.chips = chips;
  }

  private startHandIfReady(room: Room): void {
    if (room.hand && room.hand.phase !== "settled") {
      return;
    }

    this.applyPendingReplacements(room);
    const seated = room.seats.filter((seat) => seat.occupant && seat.occupant.chips > 0 && !seat.occupant.waitingForRebuy);
    const onlineHumans = seated.filter((seat) => seat.occupant?.kind === "human" && seat.occupant.connected);
    const waitingForFirstHand = room.handNumber === 0;
    const requiredOnlineHumans = waitingForFirstHand ? room.requiredHumanCount : 1;
    if (seated.length < 2 || onlineHumans.length < requiredOnlineHumans) {
      return;
    }

    const activeSeats = seated.map((seat) => seat.index);
    const dealerSeatIndex = activeSeats[room.handNumber % activeSeats.length];
    const smallBlindSeatIndex =
      activeSeats.length === 2 ? dealerSeatIndex : nextSeatIndex(activeSeats, dealerSeatIndex, 1);
    const bigBlindSeatIndex = nextSeatIndex(activeSeats, smallBlindSeatIndex, 1);
    const deck = shuffleDeck(createDeck(), this.random);
    const participants: HandParticipant[] = [];
    for (const seatIndex of activeSeats) {
      const seat = room.seats[seatIndex];
      if (!seat.occupant) {
        continue;
      }
      participants.push({
        seatIndex,
        playerId: seat.occupant.id,
        holeCards: [draw(deck), draw(deck)],
        contribution: 0,
        roundBet: 0,
        folded: false,
        allIn: false,
        acted: false,
      });
    }

    const hand: HandState = {
      id: this.idGenerator(),
      phase: "preflop",
      deck,
      communityCards: [],
      dealerSeatIndex,
      smallBlindSeatIndex,
      bigBlindSeatIndex,
      currentBet: 0,
      minRaise: room.bigBlind,
      participants,
    };
    room.hand = hand;
    room.handNumber += 1;
    postBlind(room, hand, smallBlindSeatIndex, room.smallBlind);
    postBlind(room, hand, bigBlindSeatIndex, room.bigBlind);
    hand.currentBet = Math.max(...hand.participants.map((participant) => participant.roundBet));
    hand.currentTurnSeatIndex = nextActionSeat(hand, bigBlindSeatIndex, activeSeats);
    room.tableLog.push(`第 ${room.handNumber} 手开始`);
  }

  private legalActions(room: Room, participant: HandParticipant): RoomSnapshot["legalActions"] {
    const hand = room.hand;
    if (!hand || hand.phase === "settled" || hand.currentTurnSeatIndex !== participant.seatIndex) {
      return [];
    }
    const occupant = this.findOccupant(room, participant.playerId);
    if (!occupant || occupant.chips <= 0 || participant.folded || participant.allIn) {
      return [];
    }
    const toCall = Math.max(0, hand.currentBet - participant.roundBet);
    if (toCall === 0) {
      return [
        { type: "check" },
        { type: "bet", minAmount: Math.min(room.bigBlind, occupant.chips) },
        { type: "all-in" },
      ];
    }
    const minRaiseTo = hand.currentBet + hand.minRaise;
    return [
      { type: "fold" },
      { type: "call", callAmount: Math.min(toCall, occupant.chips) },
      { type: "raise", minAmount: minRaiseTo },
      { type: "all-in" },
    ];
  }

  private applyParticipantAction(
    room: Room,
    hand: HandState,
    participant: HandParticipant,
    action: PlayerActionType,
    amount?: number,
  ): void {
    const occupant = this.findOccupant(room, participant.playerId);
    if (!occupant) {
      throw new Error("玩家不存在");
    }
    const toCall = Math.max(0, hand.currentBet - participant.roundBet);

    if (action === "fold") {
      participant.folded = true;
      participant.acted = true;
      room.tableLog.push(`${occupant.nickname} 弃牌`);
      return;
    }

    if (action === "check") {
      if (toCall > 0) {
        throw new Error("当前不能过牌");
      }
      participant.acted = true;
      room.tableLog.push(`${occupant.nickname} 过牌`);
      return;
    }

    if (action === "call") {
      if (toCall <= 0) {
        throw new Error("当前无需跟注");
      }
      const paid = payChips(occupant, participant, toCall);
      participant.acted = true;
      room.tableLog.push(`${occupant.nickname} 跟注 ${paid}`);
      return;
    }

    if (action === "bet") {
      if (toCall > 0) {
        throw new Error("当前不能下注，只能加注或跟注");
      }
      const betAmount = requireAmount(amount, "下注金额不能为空");
      if (betAmount < Math.min(room.bigBlind, occupant.chips) && betAmount < occupant.chips) {
        throw new Error("下注金额小于最小下注");
      }
      const paid = payChips(occupant, participant, betAmount);
      hand.currentBet = participant.roundBet;
      hand.minRaise = paid;
      markOthersUnacted(hand, participant);
      participant.acted = true;
      room.tableLog.push(`${occupant.nickname} 下注 ${paid}`);
      return;
    }

    if (action === "raise") {
      const raiseTo = requireAmount(amount, "加注金额不能为空");
      if (raiseTo <= hand.currentBet) {
        throw new Error("加注后金额必须高于当前下注");
      }
      const raiseSize = raiseTo - hand.currentBet;
      const payAmount = raiseTo - participant.roundBet;
      if (raiseSize < hand.minRaise && payAmount < occupant.chips) {
        throw new Error("加注金额小于最小加注");
      }
      payChips(occupant, participant, payAmount);
      if (raiseSize >= hand.minRaise) {
        hand.minRaise = raiseSize;
      }
      hand.currentBet = participant.roundBet;
      markOthersUnacted(hand, participant);
      participant.acted = true;
      room.tableLog.push(`${occupant.nickname} 加注到 ${participant.roundBet}`);
      return;
    }

    if (action === "all-in") {
      const before = participant.roundBet;
      const paid = payChips(occupant, participant, occupant.chips);
      if (participant.roundBet > hand.currentBet) {
        const raiseSize = participant.roundBet - hand.currentBet;
        if (raiseSize >= hand.minRaise) {
          hand.minRaise = raiseSize;
          markOthersUnacted(hand, participant);
        }
        hand.currentBet = participant.roundBet;
      }
      participant.acted = true;
      room.tableLog.push(`${occupant.nickname} 全下 ${paid}，本轮从 ${before} 到 ${participant.roundBet}`);
      return;
    }
  }

  private advanceAfterAction(room: Room, hand: HandState): void {
    const active = hand.participants.filter((participant) => !participant.folded);
    if (active.length === 1) {
      this.settleHand(room, hand);
      return;
    }

    if (this.bettingRoundComplete(hand)) {
      this.advancePhase(room, hand);
      return;
    }

    const seatOrder = hand.participants.map((participant) => participant.seatIndex);
    hand.currentTurnSeatIndex = nextActionSeat(hand, hand.currentTurnSeatIndex ?? hand.bigBlindSeatIndex, seatOrder);
  }

  private bettingRoundComplete(hand: HandState): boolean {
    return hand.participants
      .filter((participant) => !participant.folded && !participant.allIn)
      .every((participant) => participant.acted && participant.roundBet === hand.currentBet);
  }

  private advancePhase(room: Room, hand: HandState): void {
    const canAct = hand.participants.filter((participant) => !participant.folded && !participant.allIn).length;
    if (canAct === 0) {
      while (hand.communityCards.length < 5) {
        hand.communityCards.push(draw(hand.deck));
      }
      this.settleHand(room, hand);
      return;
    }

    for (const participant of hand.participants) {
      participant.roundBet = 0;
      participant.acted = false;
    }
    hand.currentBet = 0;
    hand.minRaise = room.bigBlind;

    if (hand.phase === "preflop") {
      hand.phase = "flop";
      hand.communityCards.push(draw(hand.deck), draw(hand.deck), draw(hand.deck));
      room.tableLog.push("翻牌");
    } else if (hand.phase === "flop") {
      hand.phase = "turn";
      hand.communityCards.push(draw(hand.deck));
      room.tableLog.push("转牌");
    } else if (hand.phase === "turn") {
      hand.phase = "river";
      hand.communityCards.push(draw(hand.deck));
      room.tableLog.push("河牌");
    } else {
      this.settleHand(room, hand);
      return;
    }

    const seatOrder = hand.participants.map((participant) => participant.seatIndex);
    hand.currentTurnSeatIndex = nextActionSeat(hand, hand.dealerSeatIndex, seatOrder);
  }

  private settleHand(room: Room, hand: HandState): void {
    while (hand.communityCards.length < 5 && hand.participants.filter((participant) => !participant.folded).length > 1) {
      hand.communityCards.push(draw(hand.deck));
    }

    const active = hand.participants.filter((participant) => !participant.folded);
    if (active.length === 1) {
      const winner = active[0];
      const amount = hand.participants.reduce((sum, participant) => sum + participant.contribution, 0);
      hand.awards = [{ playerId: winner.playerId, amount }];
    } else {
      hand.awards = settlePots(
        hand.participants.map((participant) => ({
          playerId: participant.playerId,
          contribution: participant.contribution,
          folded: participant.folded,
          cards: participant.holeCards,
        })),
        hand.communityCards,
      );
    }

    for (const award of hand.awards) {
      const occupant = this.findOccupant(room, award.playerId);
      if (occupant) {
        occupant.chips += award.amount;
        room.tableLog.push(`${occupant.nickname} 赢得 ${award.amount}`);
      }
    }

    for (const seat of room.seats) {
      if (!seat.occupant) {
        continue;
      }
      if (seat.occupant.kind === "ai" && seat.occupant.chips <= 0) {
        seat.occupant.chips = room.initialChips;
        room.tableLog.push(`${seat.occupant.nickname} 自动重新买入`);
      }
      if (seat.occupant.kind === "human" && seat.occupant.chips <= 0) {
        seat.occupant.waitingForRebuy = true;
        room.tableLog.push(`${seat.occupant.nickname} 筹码为 0，等待重新买入`);
      }
    }

    hand.phase = "settled";
    hand.currentTurnSeatIndex = undefined;
    this.applyPendingReplacements(room);
  }

  private convertHumanToAiTakeover(room: Room, playerId: string, reason: string): void {
    const seat = room.seats.find((item) => item.occupant?.id === playerId && item.occupant.kind === "human");
    if (!seat?.occupant) {
      throw new Error("玩家不在房间中");
    }
    const sessionId = seat.occupant.sessionId;
    seat.occupant = {
      id: this.idGenerator(),
      kind: "ai",
      nickname: `AI接管-${seat.occupant.nickname}`,
      chips: seat.occupant.chips,
      connected: true,
      takeoverForSessionId: sessionId,
    };
    const participant = room.hand?.participants.find((item) => item.playerId === playerId);
    if (participant) {
      participant.playerId = seat.occupant.id;
    }
    room.tableLog.push(`${reason}：席位由 AI 接管并继承筹码`);
  }

  private applyPendingReplacements(room: Room): void {
    while (room.pendingReplacements.length > 0) {
      const replacement = room.pendingReplacements.shift();
      if (!replacement) {
        break;
      }
      const aiSeat = room.seats.find((seat) => seat.occupant?.kind === "ai");
      if (!aiSeat) {
        room.tableLog.push(`${replacement.nickname} 替换失败：房间已满`);
        continue;
      }
      aiSeat.occupant = {
        id: replacement.playerId,
        kind: "human",
        nickname: replacement.nickname,
        chips: room.initialChips,
        connected: true,
        sessionId: replacement.sessionId,
      };
      room.tableLog.push(`${replacement.nickname} 替换 AI 入座`);
    }
  }

  private updateHumanAbsence(room: Room): void {
    const hasHuman = room.seats.some((seat) => seat.occupant?.kind === "human" && seat.occupant.connected);
    room.lastHumanAbsentAt = hasHuman ? undefined : Date.now();
  }

  private normalizeAiDecision(
    room: Room,
    hand: HandState,
    participant: HandParticipant,
    decision: AiActionDecision | undefined,
  ): AiActionDecision | undefined {
    if (!decision || decision.type === "rebuy") {
      return undefined;
    }
    const legalAction = this.legalActions(room, participant).find((action) => action.type === decision.type);
    if (!legalAction) {
      return undefined;
    }
    if (!isWagerAction(decision.type)) {
      return { type: decision.type };
    }
    const occupant = this.findOccupant(room, participant.playerId);
    if (!occupant) {
      return undefined;
    }
    const amount = Math.floor(decision.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return undefined;
    }
    const maximum = participant.roundBet + occupant.chips;
    return {
      type: decision.type,
      amount: Math.min(Math.max(amount, legalAction.minAmount ?? 0), maximum),
    };
  }

  private createAi(index: number, chips: number): Occupant {
    return {
      id: this.idGenerator(),
      kind: "ai",
      nickname: `AI-${index}`,
      chips,
      connected: true,
    };
  }

  private uniqueRoomCode(): string {
    let code = this.roomCodeGenerator();
    while (this.rooms.has(code)) {
      code = this.roomCodeGenerator();
    }
    return code;
  }

  private requireRoom(roomCode: string): Room {
    const room = this.rooms.get(roomCode.toUpperCase()) ?? this.rooms.get(roomCode);
    if (!room) {
      throw new Error("房间不存在");
    }
    return room;
  }

  private requireActiveHand(room: Room): HandState {
    if (!room.hand || room.hand.phase === "settled") {
      throw new Error("当前没有进行中的手牌");
    }
    return room.hand;
  }

  private findOccupant(room: Room, playerId: string): Occupant | undefined {
    return room.seats.find((seat) => seat.occupant?.id === playerId)?.occupant;
  }
}

function validateCreateRoom(input: CreateRoomInput): void {
  if (input.seatCount < 2 || input.seatCount > 9) {
    throw new Error("座位数必须在 2 到 9 之间");
  }
  const requiredHumanCount = normalizeRequiredHumanCount(input);
  if (!Number.isFinite(requiredHumanCount) || requiredHumanCount < 1 || requiredHumanCount > input.seatCount) {
    throw new Error("真实玩家数量必须在 1 到座位数之间");
  }
  if (input.aiCount < 0 || input.aiCount > input.seatCount - 1) {
    throw new Error("AI 数量不合法");
  }
  if (requiredHumanCount + input.aiCount > input.seatCount) {
    throw new Error("真实玩家数量和 AI 数量不能超过座位数");
  }
  if (!["easy", "standard", "hard"].includes(input.aiDifficulty)) {
    throw new Error("AI 难度不合法");
  }
  if (!input.hostNickname.trim()) {
    throw new Error("昵称不能为空");
  }
  if (input.initialChips <= 0 || input.smallBlind <= 0 || input.bigBlind <= input.smallBlind) {
    throw new Error("筹码或盲注设置不合法");
  }
}

function normalizeRequiredHumanCount(input: CreateRoomInput): number {
  return Math.floor(input.requiredHumanCount ?? 1);
}

function postBlind(room: Room, hand: HandState, seatIndex: number, amount: number): void {
  const participant = hand.participants.find((item) => item.seatIndex === seatIndex);
  const occupant = room.seats[seatIndex].occupant;
  if (!participant || !occupant) {
    return;
  }
  payChips(occupant, participant, amount);
  room.tableLog.push(`${occupant.nickname} 支付盲注 ${amount}`);
}

function payChips(occupant: Occupant, participant: HandParticipant, requested: number): number {
  const amount = Math.max(0, Math.min(requested, occupant.chips));
  occupant.chips -= amount;
  participant.contribution += amount;
  participant.roundBet += amount;
  if (occupant.chips === 0) {
    participant.allIn = true;
  }
  return amount;
}

function markOthersUnacted(hand: HandState, actor: HandParticipant): void {
  for (const participant of hand.participants) {
    if (participant !== actor && !participant.folded && !participant.allIn) {
      participant.acted = false;
    }
  }
}

function chooseAiAction(
  room: Room,
  hand: HandState,
  participant: HandParticipant,
  random: () => number,
): { type: PlayerActionType; amount?: number } {
  const seat = room.seats[participant.seatIndex];
  const occupant = seat.occupant;
  if (!occupant) {
    return { type: "check" };
  }

  const toCall = Math.max(0, hand.currentBet - participant.roundBet);
  const strength = estimateStrength(participant.holeCards, hand.communityCards);
  const aggression = room.aiDifficulty === "easy" ? 0.25 : room.aiDifficulty === "standard" ? 0.45 : 0.7;

  if (toCall === 0) {
    if (occupant.chips > room.bigBlind && strength + random() * aggression > 0.82) {
      return { type: "bet", amount: Math.min(occupant.chips, room.bigBlind * (room.aiDifficulty === "hard" ? 4 : 2)) };
    }
    return { type: "check" };
  }

  const pressure = toCall / Math.max(1, occupant.chips + participant.roundBet);
  if (strength + aggression * random() < pressure + 0.18) {
    return { type: "fold" };
  }

  if (occupant.chips > toCall + room.bigBlind && strength > 0.72 && random() < aggression) {
    return { type: "raise", amount: Math.min(participant.roundBet + occupant.chips, hand.currentBet + room.bigBlind * 2) };
  }

  return { type: "call" };
}

function estimateStrength(holeCards: Card[], communityCards: Card[]): number {
  if (communityCards.length >= 3) {
    return Math.min(1, evaluateBestHand([...holeCards, ...communityCards]).rankValues[0] / 14);
  }
  const values = holeCards.map((item) => rankValue(item.rank));
  const pairBonus = values[0] === values[1] ? 0.25 : 0;
  const suitedBonus = holeCards[0].suit === holeCards[1].suit ? 0.08 : 0;
  return Math.min(1, (values[0] + values[1]) / 28 + pairBonus + suitedBonus);
}

function rankValue(rank: Card["rank"]): number {
  return rank === "A"
    ? 14
    : rank === "K"
      ? 13
      : rank === "Q"
        ? 12
        : rank === "J"
          ? 11
          : rank === "T"
            ? 10
            : Number(rank);
}

function nextSeatIndex(activeSeats: number[], current: number, steps: number): number {
  const currentPosition = activeSeats.indexOf(current);
  return activeSeats[(currentPosition + steps + activeSeats.length) % activeSeats.length];
}

function nextActionSeat(hand: HandState, currentSeatIndex: number, seatOrder: number[]): number | undefined {
  for (let offset = 1; offset <= seatOrder.length; offset += 1) {
    const seatIndex = nextSeatIndex(seatOrder, currentSeatIndex, offset);
    const participant = hand.participants.find((item) => item.seatIndex === seatIndex);
    if (participant && !participant.folded && !participant.allIn) {
      return seatIndex;
    }
  }
  return undefined;
}

function draw(deck: Card[]): Card {
  const next = deck.pop();
  if (!next) {
    throw new Error("牌堆为空");
  }
  return next;
}

function requireAmount(amount: number | undefined, message: string): number {
  if (typeof amount !== "number" || Number.isNaN(amount) || amount <= 0) {
    throw new Error(message);
  }
  return Math.floor(amount);
}

function isWagerAction(type: PlayerActionType): boolean {
  return type === "bet" || type === "raise";
}

function generateRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function generateId(): string {
  return crypto.randomUUID();
}
