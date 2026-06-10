import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";
type Suit = "S" | "H" | "D" | "C";
type AiDifficulty = "easy" | "standard" | "hard";
type PlayerActionType = "fold" | "check" | "call" | "bet" | "raise" | "all-in" | "rebuy";

interface Card {
  rank: Rank;
  suit: Suit;
}

interface PublicSeat {
  index: number;
  occupant?: {
    id: string;
    kind: "human" | "ai";
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

interface RoomSnapshot {
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
    phase: "preflop" | "flop" | "turn" | "river" | "settled";
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

interface Session {
  roomCode: string;
  playerId: string;
  sessionId: string;
}

type DraftNumber = number | "";

interface CreateFormState {
  hostNickname: string;
  seatCount: DraftNumber;
  requiredHumanCount: DraftNumber;
  aiCount: DraftNumber;
  aiDifficulty: AiDifficulty;
  initialChips: DraftNumber;
  smallBlind: DraftNumber;
  bigBlind: DraftNumber;
}

interface CreateRoomPayload {
  hostNickname: string;
  seatCount: number;
  requiredHumanCount: number;
  aiCount: number;
  aiDifficulty: AiDifficulty;
  initialChips: number;
  smallBlind: number;
  bigBlind: number;
}

type NumericCreateField = keyof Pick<CreateFormState, "seatCount" | "requiredHumanCount" | "aiCount" | "initialChips" | "smallBlind" | "bigBlind">;

const sessionKey = "texas-holdem-session";

function App() {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | undefined>();
  const [session, setSession] = useState<Session | undefined>(() => readSession());
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [createForm, setCreateForm] = useState<CreateFormState>({
    hostNickname: "玩家",
    seatCount: 6,
    requiredHumanCount: 2,
    aiCount: 2,
    aiDifficulty: "standard" as AiDifficulty,
    initialChips: 1000,
    smallBlind: 5,
    bigBlind: 10,
  });
  const normalizedCreateForm = normalizeCreateForm(createForm);
  const [joinForm, setJoinForm] = useState({
    roomCode: new URLSearchParams(location.search).get("room") ?? "",
    nickname: "朋友",
  });
  const [amount, setAmount] = useState(20);
  const [actionOpen, setActionOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [countdown, setCountdown] = useState(120);
  const wsRef = useRef<WebSocket | undefined>(undefined);

  useEffect(() => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const host = location.port === "5173" ? `${location.hostname}:8080` : location.host;
    const ws = new WebSocket(`${protocol}//${host}/ws`);
    wsRef.current = ws;
    ws.addEventListener("open", () => {
      setConnected(true);
      if (session) {
        ws.send(JSON.stringify({ type: "reconnect", payload: session }));
      }
    });
    ws.addEventListener("close", () => setConnected(false));
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "session") {
        const nextSession = {
          roomCode: message.roomCode,
          playerId: message.playerId,
          sessionId: message.sessionId,
        };
        setSession(nextSession);
        localStorage.setItem(sessionKey, JSON.stringify(nextSession));
      }
      if (message.type === "snapshot") {
        setSnapshot(message.snapshot);
        setError("");
      }
      if (message.type === "error") {
        setError(message.message);
      }
      if (message.type === "roomExpired") {
        localStorage.removeItem(sessionKey);
        setSession(undefined);
        setSnapshot(undefined);
        setError("房间已销毁");
      }
      if (message.type === "leftRoom") {
        localStorage.removeItem(sessionKey);
        setSession(undefined);
        setSnapshot(undefined);
        setError("已退出房间，原席位由 AI 接管");
      }
    });
    return () => ws.close();
  }, []);

  const inviteLink = useMemo(() => {
    if (!snapshot) return "";
    const url = new URL(location.href);
    url.search = `?room=${snapshot.roomCode}`;
    return url.toString();
  }, [snapshot]);

  const turnKey = `${snapshot?.hand?.id ?? "none"}:${snapshot?.hand?.currentTurnSeatIndex ?? "none"}:${snapshot?.hand?.currentBet ?? 0}`;
  useEffect(() => {
    setCountdown(120);
    if (!snapshot?.hand || snapshot.hand.phase === "settled" || snapshot.hand.currentTurnSeatIndex === undefined) {
      return;
    }
    const timer = window.setInterval(() => {
      setCountdown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [turnKey, snapshot?.hand?.phase]);

  useEffect(() => {
    if (!snapshot?.hand || snapshot.hand.phase === "settled") {
      setActionOpen(false);
    }
  }, [snapshot?.hand?.id, snapshot?.hand?.phase]);

  function send(type: string, payload?: unknown) {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      setError("WebSocket 未连接");
      return;
    }
    wsRef.current.send(JSON.stringify({ type, payload }));
  }

  function createRoom() {
    const payload = normalizeCreateForm(createForm);
    setCreateForm(payload);
    send("createRoom", payload);
  }

  function joinRoom() {
    send("joinRoom", joinForm);
  }

  function act(type: PlayerActionType, actionAmount = amount) {
    send("action", { action: type, amount: isWagerAction(type) ? actionAmount : undefined });
  }

  function leaveRoom() {
    send("leave");
  }

  function continueNextHand() {
    setActionOpen(false);
    send("startNextHand");
  }

  function updateCreateNumber(field: NumericCreateField, raw: string) {
    const draftValue = parseDraftNumber(raw);
    setCreateForm((form) => normalizeCreateDraft({ ...form, [field]: draftValue }, field));
  }

  function settleCreateNumbers() {
    setCreateForm((form) => normalizeCreateForm(form));
  }

  function setWagerAmount(nextAmount: number) {
    const normalized = Number.isFinite(nextAmount) ? nextAmount : wagerMinimum ?? amount;
    if (wagerMinimum === undefined) {
      setAmount(normalized);
      return;
    }
    setAmount(clampInteger(normalized, wagerMinimum, wagerMaximum));
  }

  function submitAction(action: RoomSnapshot["legalActions"][number]) {
    const nextAmount = action.minAmount !== undefined ? Math.max(amount, action.minAmount) : amount;
    if (isWagerAction(action.type)) {
      const boundedAmount = clampInteger(nextAmount, action.minAmount ?? wagerMinimum ?? 0, wagerMaximum);
      setAmount(boundedAmount);
      setActionOpen(false);
      act(action.type, boundedAmount);
      return;
    }
    setActionOpen(false);
    act(action.type);
  }

  if (!snapshot) {
    return (
      <main className="landing">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">No-limit cash table</p>
            <h1>德州扑克私人现金桌</h1>
            <p>
              创建房间、配置真实玩家数、AI 数量和难度。所有真实玩家加入后自动开局，筹码仅用于娱乐。
            </p>
            <div className="connection">{connected ? "已连接服务器" : "正在连接服务器..."}</div>
            {error && <div className="error">{error}</div>}
          </div>
          <div className="forms">
            <section className="panel">
              <h2>创建房间</h2>
              <label>
                昵称
                <input value={createForm.hostNickname} onChange={(event) => setCreateForm({ ...createForm, hostNickname: event.target.value })} />
              </label>
              <div className="grid-3">
                <label>
                  座位数
                  <input
                    type="number"
                    inputMode="numeric"
                    min={2}
                    max={9}
                    value={createForm.seatCount}
                    onChange={(event) => updateCreateNumber("seatCount", event.target.value)}
                    onBlur={settleCreateNumbers}
                  />
                </label>
                <label>
                  真实玩家数
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={normalizedCreateForm.seatCount}
                    value={createForm.requiredHumanCount}
                    onChange={(event) => updateCreateNumber("requiredHumanCount", event.target.value)}
                    onBlur={settleCreateNumbers}
                  />
                  <small className="field-hint">含房主，满员后自动开局</small>
                </label>
                <label>
                  AI 数量
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={normalizedCreateForm.seatCount - normalizedCreateForm.requiredHumanCount}
                    value={createForm.aiCount}
                    onChange={(event) => updateCreateNumber("aiCount", event.target.value)}
                    onBlur={settleCreateNumbers}
                  />
                </label>
              </div>
              <label>
                AI 难度
                <select
                  value={createForm.aiDifficulty}
                  onChange={(event) => setCreateForm({ ...createForm, aiDifficulty: event.target.value as AiDifficulty })}
                >
                  <option value="easy">简单</option>
                  <option value="standard">标准</option>
                  <option value="hard">困难</option>
                </select>
              </label>
              <div className="grid-3">
                <label>
                  初始筹码
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={createForm.initialChips}
                    onChange={(event) => updateCreateNumber("initialChips", event.target.value)}
                    onBlur={settleCreateNumbers}
                  />
                </label>
                <label>
                  小盲
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={createForm.smallBlind}
                    onChange={(event) => updateCreateNumber("smallBlind", event.target.value)}
                    onBlur={settleCreateNumbers}
                  />
                </label>
                <label>
                  大盲
                  <input
                    type="number"
                    inputMode="numeric"
                    min={2}
                    value={createForm.bigBlind}
                    onChange={(event) => updateCreateNumber("bigBlind", event.target.value)}
                    onBlur={settleCreateNumbers}
                  />
                </label>
              </div>
              <button className="primary" onClick={createRoom} disabled={!connected}>
                开现金桌
              </button>
            </section>
            <section className="panel ghost-panel">
              <h2>加入房间</h2>
              <label>
                房间码
                <input value={joinForm.roomCode} onChange={(event) => setJoinForm({ ...joinForm, roomCode: event.target.value.toUpperCase() })} />
              </label>
              <label>
                昵称
                <input value={joinForm.nickname} onChange={(event) => setJoinForm({ ...joinForm, nickname: event.target.value })} />
              </label>
              <button onClick={joinRoom} disabled={!connected}>
                加入私人房间
              </button>
            </section>
          </div>
        </section>
      </main>
    );
  }

  const me = snapshot.seats.find((seat) => seat.occupant?.id === snapshot.yourPlayerId)?.occupant;
  const currentSeat = snapshot.hand?.currentTurnSeatIndex === undefined ? undefined : snapshot.seats[snapshot.hand.currentTurnSeatIndex];
  const isMyTurn = currentSeat?.occupant?.id === snapshot.yourPlayerId;
  const isHost = snapshot.yourPlayerId === snapshot.hostPlayerId;
  const mySeat = snapshot.seats.find((seat) => seat.occupant?.id === snapshot.yourPlayerId);
  const requiredHumanCount = snapshot.settings.requiredHumanCount ?? 1;
  const connectedHumanCount = snapshot.seats.filter((seat) => seat.occupant?.kind === "human" && seat.occupant.connected).length;
  const playableSeatCount = snapshot.seats.filter((seat) => seat.occupant && seat.occupant.chips > 0 && !seat.occupant.waitingForRebuy).length;
  const waitingForStart = !snapshot.hand;
  const waitingMessage =
    connectedHumanCount < requiredHumanCount
      ? `等待真实玩家 ${connectedHumanCount}/${requiredHumanCount}`
      : playableSeatCount < 2
        ? "等待至少 2 名玩家或 AI 入座"
        : "玩家已到齐，正在开局";
  const winnerSummaries =
    snapshot.hand?.awards?.map((award) => {
      const winner = snapshot.seats.find((seat) => seat.occupant?.id === award.playerId)?.occupant;
      return {
        playerId: award.playerId,
        nickname: winner?.nickname ?? "玩家",
        amount: award.amount,
      };
    }) ?? [];
  const winnerPlayerIds = new Set(winnerSummaries.map((winner) => winner.playerId));
  const showWinnerReveal = snapshot.hand?.phase === "settled" && winnerSummaries.length > 0;
  const occupiedSeatCount = snapshot.seats.filter((seat) => seat.occupant).length;
  const wagerActions = snapshot.legalActions.filter((action) => isWagerAction(action.type));
  const quickActions = snapshot.legalActions.filter((action) => !isWagerAction(action.type));
  const wagerMinimum = wagerActions.reduce<number | undefined>((minimum, action) => {
    if (action.minAmount === undefined) return minimum;
    return minimum === undefined ? action.minAmount : Math.min(minimum, action.minAmount);
  }, undefined);
  const wagerMaximum = Math.max(wagerMinimum ?? 0, (mySeat?.roundBet ?? 0) + (me?.chips ?? 0));
  const wagerPresets = makeWagerPresets(wagerMinimum, wagerMaximum, snapshot.settings.bigBlind);
  const wagerOrbLabel = wagerActions.some((action) => action.type === "raise") ? "加注" : "下注";

  function toggleWagerPanel() {
    if (!actionOpen && wagerMinimum !== undefined && amount < wagerMinimum) {
      setWagerAmount(wagerMinimum);
    }
    setActionOpen((open) => !open);
  }

  return (
    <main className="table-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Private Room</p>
          <h1>房间 {snapshot.roomCode}</h1>
        </div>
        <div className="top-actions">
          <button className="leave-top-button danger" onClick={leaveRoom}>退出房间</button>
          <button onClick={() => void navigator.clipboard?.writeText(snapshot.roomCode)}>复制房间码</button>
          <button onClick={() => void navigator.clipboard?.writeText(inviteLink)}>复制邀请链接</button>
          {isHost && <button onClick={() => send("endRoom")}>结束房间</button>}
        </div>
      </header>

      {error && <div className="error floating">{error}</div>}
      {snapshot.pendingReplacement && <div className="notice">你将在本手结束后替换一个 AI 入座。</div>}
      {waitingForStart && <div className="notice waiting-banner">{waitingMessage}，满员后自动开始第一手。</div>}

      <section className="mobile-summary" aria-label="手机端牌局摘要">
        <div>
          <span>阶段</span>
          <strong>{phaseText(snapshot.hand?.phase)}</strong>
        </div>
        <div>
          <span>底池</span>
          <strong>{snapshot.hand?.pot ?? 0}</strong>
        </div>
        <div>
          <span>{snapshot.hand ? "行动" : "真人"}</span>
          <strong>{snapshot.hand ? currentSeat?.occupant?.nickname ?? "无" : `${connectedHumanCount}/${requiredHumanCount}`}</strong>
        </div>
        <div>
          <span>{snapshot.hand ? "倒计时" : "状态"}</span>
          <strong>{snapshot.hand ? `${countdown}s` : "等待"}</strong>
        </div>
      </section>

      <section className="table-grid">
        <div className="felt">
          <div className="community">
            <div className="phase">{phaseText(snapshot.hand?.phase)}</div>
            <div className="cards">
              {Array.from({ length: 5 }, (_, index) => (
                <CardView key={index} card={snapshot.hand?.communityCards[index]} />
              ))}
            </div>
            <div className="pot">底池 {snapshot.hand?.pot ?? 0}</div>
            {waitingForStart && <div className="waiting-copy">{waitingMessage}</div>}
            {snapshot.hand?.awards && (
              <div className="awards">
                {snapshot.hand.awards.map((award) => (
                  <span key={`${award.playerId}-${award.amount}`}>+{award.amount}</span>
                ))}
              </div>
            )}
          </div>

          <div className="seats-track" aria-label="牌桌座位">
            {snapshot.seats.map((seat) => (
              <SeatView
                key={seat.index}
                seat={seat}
                total={snapshot.seats.length}
                isDealer={seat.index === snapshot.hand?.dealerSeatIndex}
                isSmallBlind={seat.index === snapshot.hand?.smallBlindSeatIndex}
                isBigBlind={seat.index === snapshot.hand?.bigBlindSeatIndex}
                isCurrent={seat.index === snapshot.hand?.currentTurnSeatIndex}
                isMe={seat.occupant?.id === snapshot.yourPlayerId}
                isWinner={Boolean(seat.occupant?.id && winnerPlayerIds.has(seat.occupant.id))}
                isHost={isHost}
                canRemove={isHost && seat.occupant?.kind === "human" && seat.occupant.id !== snapshot.yourPlayerId}
                onRemove={() => send("removePlayer", { targetPlayerId: seat.occupant?.id })}
              />
            ))}
          </div>

          {showWinnerReveal && (
            <div className="winner-reveal" aria-live="polite">
              <div className="winner-sparks" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <p className="eyebrow">Showdown</p>
              <h2>{winnerSummaries.length > 1 ? "多人分池" : "胜者揭晓"}</h2>
              <div className="winner-list">
                {winnerSummaries.map((winner) => (
                  <strong key={`${winner.playerId}-${winner.amount}`}>
                    {winner.nickname}
                    <span>+{winner.amount}</span>
                  </strong>
                ))}
              </div>
              <button className="primary winner-continue" onClick={continueNextHand}>继续下一手</button>
            </div>
          )}
        </div>

        <aside className="side">
          <section className="panel status-panel">
            <p className="eyebrow">Your seat</p>
            <h2>{me?.nickname ?? "等待入座"}</h2>
            <p>筹码：{formatChips(me?.chips ?? 0)}</p>
            <p>盲注：{snapshot.settings.smallBlind}/{snapshot.settings.bigBlind}</p>
            <p>真实玩家：{connectedHumanCount}/{requiredHumanCount}</p>
            <p>AI 难度：{difficultyText(snapshot.settings.aiDifficulty)}</p>
            <p>当前行动：{currentSeat?.occupant?.nickname ?? "无"}</p>
            {waitingForStart && <p className="thinking">{waitingMessage}</p>}
            {currentSeat?.occupant?.kind === "ai" && <p className="thinking">AI 思考中...</p>}
            {mySeat?.occupant?.waitingForRebuy && <button className="primary" onClick={() => act("rebuy")}>重新买入</button>}
          </section>

          <section className="panel action-panel">
            <p className="eyebrow">Action</p>
            <h2>{isMyTurn ? "轮到你行动" : "等待其他玩家"}</h2>
            <div className="amount-row inline-wager-control">
              <label>
                下注/加注到
                <input
                  type="number"
                  min={wagerMinimum ?? 0}
                  max={wagerMaximum}
                  value={amount}
                  onChange={(event) => setWagerAmount(Number(event.target.value))}
                />
              </label>
            </div>
            <div className="action-buttons desktop-actions">
              {snapshot.legalActions.length > 0 ? (
                snapshot.legalActions.map((action) => (
                  <button
                    key={action.type}
                    className={action.type === "all-in" ? "danger" : ""}
                    onClick={() => {
                      submitAction(action);
                    }}
                    disabled={!isMyTurn}
                  >
                    {actionText(action.type, action.callAmount, action.minAmount, me?.chips)}
                  </button>
                ))
              ) : wagerActions.length === 0 ? (
                <span className="no-actions">{waitingForStart ? waitingMessage : "等待当前玩家行动"}</span>
              ) : null}
            </div>
            <div className="action-buttons mobile-quick-actions">
              {quickActions.length > 0 ? (
                quickActions.map((action) => (
                  <button
                    key={action.type}
                    className={action.type === "all-in" ? "danger" : ""}
                    onClick={() => submitAction(action)}
                    disabled={!isMyTurn}
                  >
                    {actionText(action.type, action.callAmount, action.minAmount, me?.chips)}
                  </button>
                ))
              ) : wagerActions.length > 0 ? (
                <span className="no-actions">点右侧筹码球打开{wagerOrbLabel}浮窗</span>
              ) : (
                <span className="no-actions">{waitingForStart ? waitingMessage : "等待当前玩家行动"}</span>
              )}
            </div>
            {wagerActions.length > 0 && <div className="mobile-wager-hint">右侧筹码球可调整{wagerOrbLabel}金额。</div>}
            <div className={`timer ${countdown <= 15 ? "urgent" : ""}`}>行动倒计时：{countdown} 秒</div>
          </section>

          <section className="panel log-panel">
            <p className="eyebrow">Table Log</p>
            <div className="log">
              {snapshot.tableLog
                .slice()
                .reverse()
                .map((line, index) => (
                  <p key={`${line}-${index}`}>{line}</p>
                ))}
            </div>
          </section>
        </aside>
      </section>

      <button className="mobile-leave-fab danger" onClick={leaveRoom}>退出房间</button>

      <div className={`wager-fab ${actionOpen ? "open" : ""}`}>
        {actionOpen && (
          <section className="wager-popover" role="dialog" aria-label="行动浮窗">
            <div className="wager-popover-head">
              <div>
                <p className="eyebrow">Action</p>
                <h2>{isMyTurn ? "轮到你行动" : "等待其他玩家"}</h2>
              </div>
              <button className="wager-close" onClick={() => setActionOpen(false)} aria-label="关闭行动浮窗">
                关闭
              </button>
            </div>

            <div className="floating-action-status">
              <span>{waitingForStart ? waitingMessage : `当前行动：${currentSeat?.occupant?.nickname ?? "无"}`}</span>
              <span className={countdown <= 15 && !waitingForStart ? "urgent" : ""}>
                {waitingForStart ? "满员自动开局" : `倒计时：${countdown} 秒`}
              </span>
            </div>

            <div className="action-buttons mobile-floating-actions">
              {quickActions.length > 0 ? (
                quickActions.map((action) => (
                  <button
                    key={action.type}
                    className={action.type === "all-in" ? "danger" : ""}
                    onClick={() => submitAction(action)}
                    disabled={!isMyTurn}
                  >
                    {actionText(action.type, action.callAmount, action.minAmount, me?.chips)}
                  </button>
                ))
              ) : (
                <span className="no-actions">{waitingForStart ? waitingMessage : "等待当前玩家行动"}</span>
              )}
            </div>

            {wagerActions.length > 0 && (
              <div className="wager-section">
                <div className="wager-popover-head">
                  <div>
                    <p className="eyebrow">Wager</p>
                    <h2>{wagerOrbLabel}金额</h2>
                  </div>
              </div>
                <label>
                  下注/加注到
                  <input
                    type="number"
                    min={wagerMinimum ?? 0}
                    max={wagerMaximum}
                    value={amount}
                    onChange={(event) => setWagerAmount(Number(event.target.value))}
                    disabled={!isMyTurn}
                  />
                </label>
                {wagerMinimum !== undefined && (
                  <div className="wager-range">
                    <span>最低 {formatChips(wagerMinimum)}</span>
                    <span>最多 {formatChips(wagerMaximum)}</span>
                  </div>
                )}
                <div className="wager-presets" aria-label="下注快捷金额">
                  {wagerPresets.map((preset) => (
                    <button key={`${preset.label}-${preset.value}`} type="button" onClick={() => setWagerAmount(preset.value)} disabled={!isMyTurn}>
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="wager-popover-actions">
                  {wagerActions.map((action) => (
                    <button className="primary" key={action.type} onClick={() => submitAction(action)} disabled={!isMyTurn}>
                      {actionText(action.type, action.callAmount, action.minAmount, me?.chips)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
        <button className={`wager-orb ${isMyTurn ? "active" : "idle"}`} onClick={toggleWagerPanel} aria-expanded={actionOpen}>
          <span>{isMyTurn ? "行动" : waitingForStart ? "等待" : "状态"}</span>
          <small>{waitingForStart ? `${connectedHumanCount}/${requiredHumanCount}` : `${countdown}s`}</small>
        </button>
      </div>

      <div className={`roster-fab ${rosterOpen ? "open" : ""}`}>
        {rosterOpen && (
          <section className="roster-popover" role="dialog" aria-label="座位列表">
            <div className="roster-head">
              <div>
                <p className="eyebrow">Seats</p>
                <h2>座位总览</h2>
              </div>
              <button className="roster-close" onClick={() => setRosterOpen(false)} aria-label="关闭座位列表">
                关闭
              </button>
            </div>
            <div className="roster-list">
              {snapshot.seats.map((seat) => {
                const tags = [
                  seat.index === snapshot.hand?.dealerSeatIndex ? "D" : undefined,
                  seat.index === snapshot.hand?.smallBlindSeatIndex ? "SB" : undefined,
                  seat.index === snapshot.hand?.bigBlindSeatIndex ? "BB" : undefined,
                  seat.index === snapshot.hand?.currentTurnSeatIndex ? "行动" : undefined,
                  seat.folded ? "弃牌" : undefined,
                  seat.allIn ? "全下" : undefined,
                  seat.occupant?.id && winnerPlayerIds.has(seat.occupant.id) ? "赢家" : undefined,
                ].filter((tag): tag is string => Boolean(tag));
                return (
                  <div
                    className={`roster-row ${seat.index === snapshot.hand?.currentTurnSeatIndex ? "current" : ""} ${
                      seat.occupant?.id === snapshot.yourPlayerId ? "me" : ""
                    }`}
                    key={seat.index}
                  >
                    <span className="roster-index">{seat.index + 1}</span>
                    <strong>{seat.occupant?.nickname ?? "空位"}</strong>
                    <small>{seat.occupant ? `筹码 ${formatChips(seat.occupant.chips)}` : "未入座"}</small>
                    <em>{tags.join(" / ")}</em>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        <button className="roster-orb" onClick={() => setRosterOpen((open) => !open)} aria-expanded={rosterOpen}>
          <span>座位</span>
          <small>
            {occupiedSeatCount}/{snapshot.seats.length}
          </small>
        </button>
      </div>
    </main>
  );
}

function SeatView({
  seat,
  total,
  isDealer,
  isSmallBlind,
  isBigBlind,
  isCurrent,
  isMe,
  isWinner,
  canRemove,
  onRemove,
}: {
  seat: PublicSeat;
  total: number;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isCurrent: boolean;
  isMe: boolean;
  isWinner: boolean;
  isHost: boolean;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const angle = (Math.PI * 2 * seat.index) / total - Math.PI / 2;
  const x = 50 + Math.cos(angle) * 40;
  const y = 50 + Math.sin(angle) * 38;
  const tags = [isDealer ? "D" : undefined, isSmallBlind ? "SB" : undefined, isBigBlind ? "BB" : undefined].filter(
    (tag): tag is string => Boolean(tag),
  );
  return (
    <div className={`seat ${isCurrent ? "current" : ""} ${isMe ? "me" : ""} ${isWinner ? "winner" : ""}`} style={{ left: `${x}%`, top: `${y}%` }}>
      {isCurrent && <div className="turn-badge">行动中</div>}
      {isWinner && <div className="winner-badge">赢家</div>}
      <div className="seat-cards">
        {seat.occupant ? (
          <>
            <CardView card={seat.holeCards?.[0]} hidden={!seat.holeCards?.[0]} />
            <CardView card={seat.holeCards?.[1]} hidden={!seat.holeCards?.[1]} />
          </>
        ) : (
          <span className="empty">空位</span>
        )}
      </div>
      <div className="seat-name">
        {seat.occupant?.nickname ?? `Seat ${seat.index + 1}`}
        {seat.occupant?.takeover && <span className="takeover">接管</span>}
      </div>
      <div className="seat-meta">
        <span className="chip-count">{seat.occupant ? `筹码 ${formatChips(seat.occupant.chips)}` : "未入座"}</span>
        {tags.map((tag) => (
          <b key={tag}>{tag}</b>
        ))}
      </div>
      <div className="seat-state">
        {seat.folded && "已弃牌"}
        {seat.allIn && "全下"}
        {seat.contribution ? ` 投入 ${seat.contribution}` : ""}
      </div>
      {canRemove && <button className="remove" onClick={onRemove}>移除</button>}
    </div>
  );
}

function CardView({ card, hidden }: { card?: Card; hidden?: boolean }) {
  if (!card || hidden) {
    return <span className="card back">◆</span>;
  }
  const red = card.suit === "H" || card.suit === "D";
  return (
    <span className={`card ${red ? "red" : "black"}`}>
      <span className="card-rank">{rankLabel(card.rank)}</span>
      <small>{suitSymbol(card.suit)}</small>
    </span>
  );
}

function rankLabel(rank: string): string {
  const labels: Record<string, string> = {
    "1": "A",
    T: "10",
    "10": "10",
    "11": "J",
    "12": "Q",
    "13": "K",
    "14": "A",
  };
  return labels[rank] ?? rank;
}

function parseDraftNumber(raw: string): DraftNumber {
  if (raw.trim() === "") {
    return "";
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : "";
}

function numberOrDefault(value: DraftNumber, fallback: number): number {
  return value === "" || !Number.isFinite(value) ? fallback : value;
}

function normalizeCreateDraft(form: CreateFormState, changedField: NumericCreateField): CreateFormState {
  if (changedField === "seatCount" && form.seatCount !== "") {
    const seatCount = clampInteger(form.seatCount, 2, 9);
    const requiredHumanCount =
      form.requiredHumanCount === "" ? "" : clampInteger(form.requiredHumanCount, 1, seatCount);
    const aiMax = Math.max(0, seatCount - numberOrDefault(requiredHumanCount, 1));
    const aiCount = form.aiCount === "" ? "" : clampInteger(form.aiCount, 0, aiMax);
    return { ...form, seatCount, requiredHumanCount, aiCount };
  }

  if (changedField === "requiredHumanCount" && form.requiredHumanCount !== "") {
    const seatCount = clampInteger(numberOrDefault(form.seatCount, 6), 2, 9);
    const requiredHumanCount = clampInteger(form.requiredHumanCount, 1, seatCount);
    const aiCount = form.aiCount === "" ? "" : clampInteger(form.aiCount, 0, seatCount - requiredHumanCount);
    return { ...form, requiredHumanCount, aiCount };
  }

  if (changedField === "aiCount" && form.aiCount !== "") {
    const seatCount = clampInteger(numberOrDefault(form.seatCount, 6), 2, 9);
    const requiredHumanCount = clampInteger(numberOrDefault(form.requiredHumanCount, 1), 1, seatCount);
    return { ...form, aiCount: clampInteger(form.aiCount, 0, seatCount - requiredHumanCount) };
  }

  if (changedField === "initialChips" && form.initialChips !== "") {
    return { ...form, initialChips: clampInteger(form.initialChips, 1, 1_000_000_000) };
  }

  if (changedField === "smallBlind" && form.smallBlind !== "") {
    const smallBlind = clampInteger(form.smallBlind, 1, 1_000_000_000);
    const bigBlind = form.bigBlind === "" ? "" : Math.max(smallBlind + 1, form.bigBlind);
    return { ...form, smallBlind, bigBlind };
  }

  if (changedField === "bigBlind" && form.bigBlind !== "") {
    const smallBlind = clampInteger(numberOrDefault(form.smallBlind, 5), 1, 1_000_000_000);
    return { ...form, bigBlind: clampInteger(form.bigBlind, smallBlind + 1, 1_000_000_000) };
  }

  return form;
}

function normalizeCreateForm(form: CreateFormState): CreateRoomPayload {
  const seatCount = clampInteger(numberOrDefault(form.seatCount, 6), 2, 9);
  const requiredHumanCount = clampInteger(numberOrDefault(form.requiredHumanCount, 1), 1, seatCount);
  const aiCount = clampInteger(numberOrDefault(form.aiCount, 0), 0, seatCount - requiredHumanCount);
  const initialChips = clampInteger(numberOrDefault(form.initialChips, 1000), 1, 1_000_000_000);
  const smallBlind = clampInteger(numberOrDefault(form.smallBlind, 5), 1, 1_000_000_000);
  const bigBlind = clampInteger(numberOrDefault(form.bigBlind, Math.max(10, smallBlind + 1)), smallBlind + 1, 1_000_000_000);

  return {
    hostNickname: form.hostNickname,
    seatCount,
    requiredHumanCount,
    aiCount,
    aiDifficulty: form.aiDifficulty,
    initialChips,
    smallBlind,
    bigBlind,
  };
}

function makeWagerPresets(minimum: number | undefined, maximum: number, bigBlind: number): { label: string; value: number }[] {
  if (minimum === undefined || maximum <= 0) {
    return [];
  }
  const candidates = [
    { label: "最低", value: minimum },
    { label: "+1BB", value: minimum + bigBlind },
    { label: "全下", value: maximum },
  ];
  const seen = new Set<number>();
  return candidates
    .map((candidate) => ({ ...candidate, value: clampInteger(candidate.value, minimum, maximum) }))
    .filter((candidate) => {
      if (seen.has(candidate.value)) {
        return false;
      }
      seen.add(candidate.value);
      return true;
    });
}

function clampInteger(value: number, min: number, max: number): number {
  const safeMax = Math.max(min, max);
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(Math.floor(value), min), safeMax);
}

function formatChips(value: number): string {
  return Math.max(0, value).toLocaleString("zh-CN");
}

function readSession(): Session | undefined {
  try {
    const raw = localStorage.getItem(sessionKey);
    return raw ? (JSON.parse(raw) as Session) : undefined;
  } catch {
    return undefined;
  }
}

function actionText(type: PlayerActionType, callAmount?: number, minAmount?: number, availableChips?: number): string {
  if (type === "fold") return "弃牌";
  if (type === "check") return "过牌";
  if (type === "call") return `跟注 ${callAmount ?? ""}${availableChips !== undefined && callAmount !== undefined && callAmount >= availableChips ? "（全下）" : ""}`;
  if (type === "bet") return `下注 ≥ ${minAmount ?? ""}`;
  if (type === "raise") return `加注到 ≥ ${minAmount ?? ""}`;
  if (type === "all-in") return availableChips !== undefined ? `全下 ${formatChips(availableChips)}` : "全下";
  return "重新买入";
}

function isWagerAction(type: PlayerActionType): boolean {
  return type === "bet" || type === "raise";
}

function phaseText(phase?: NonNullable<RoomSnapshot["hand"]>["phase"]): string {
  if (!phase) return "等待开局";
  if (phase === "preflop") return "翻牌前";
  if (phase === "flop") return "翻牌";
  if (phase === "turn") return "转牌";
  if (phase === "river") return "河牌";
  return "结算";
}

function difficultyText(value: AiDifficulty): string {
  if (value === "easy") return "简单";
  if (value === "hard") return "困难";
  return "标准";
}

function suitSymbol(suit: Suit): string {
  return suit === "S" ? "♠" : suit === "H" ? "♥" : suit === "D" ? "♦" : "♣";
}

createRoot(document.getElementById("root")!).render(<App />);
