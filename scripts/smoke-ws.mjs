import WebSocket from "ws";

const url = process.env.SMOKE_WS_URL ?? "ws://127.0.0.1:18080/ws";

const ws = new WebSocket(url);
const messages = [];

const done = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Smoke test timed out")), 8000);

  ws.on("open", () => {
    ws.send(
      JSON.stringify({
        type: "createRoom",
        payload: {
          hostNickname: "SmokeHost",
          seatCount: 2,
          aiCount: 1,
          aiDifficulty: "standard",
          initialChips: 1000,
          smallBlind: 5,
          bigBlind: 10,
        },
      }),
    );
  });

  ws.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    messages.push(message);
    if (message.type !== "snapshot") {
      return;
    }

    const snapshot = message.snapshot;
    const hostSeat = snapshot.seats.find((seat) => seat.occupant?.nickname === "SmokeHost");
    const aiSeat = snapshot.seats.find((seat) => seat.occupant?.kind === "ai");
    const hasHiddenAiCards = aiSeat && !aiSeat.holeCards;
    if (snapshot.roomCode && hostSeat?.holeCards?.length === 2 && hasHiddenAiCards && snapshot.hand?.phase === "preflop") {
      clearTimeout(timer);
      ws.close();
      resolve({
        roomCode: snapshot.roomCode,
        phase: snapshot.hand.phase,
        seats: snapshot.seats.length,
        pot: snapshot.hand.pot,
      });
    }
  });

  ws.on("error", reject);
});

const result = await done;
console.log(JSON.stringify(result));
