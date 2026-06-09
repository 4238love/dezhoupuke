# MVP Requirements

This document records the confirmed first-version scope for the Texas Hold'em game.

## Product Goal

Build a deployable web-based Texas Hold'em cash-table game where a human player can play against configurable AI opponents and invite friends into a private room.

## Game Mode

- The first version uses Cash Table mode only.
- Tournament mode is out of scope.
- Each hand is settled independently.
- Blinds are fixed per room.
- Players can continue into the next hand after settlement.

## Room Model

- The first version uses Private Rooms.
- A Host creates a room.
- A room has 2 to 9 seats.
- The Host configures:
  - seat count;
  - AI count;
  - AI Difficulty: easy, standard, or hard;
  - initial Table Chips, default 1000;
  - small blind and big blind, default 5/10;
  - Host nickname.
- Room settings cannot be changed after the room starts.
- The room starts automatically when it has at least one human player and at least two total participants, including AI Opponents.
- There is no ready button.
- A room can be joined by Room Code or Invite Link.
- Public lobby, matchmaking, friend system, QR invite, and spectator mode are out of scope.

## Player Identity

- The first version has no account system.
- Players join with a Nickname.
- Nicknames only need to be unique within the same Private Room.
- Each player receives a Temporary Player Identity backed by local session state.
- Registration, login, password, phone login, social login, global profiles, and cross-room history are out of scope.

## Chips and Value

- Table Chips are virtual entertainment chips only.
- Table Chips have no real-money value.
- There is no recharge, withdrawal, purchase, redemption, prize, global ranking reward, or exchangeable value.
- Players with zero Table Chips can Rebuy after the current Hand ends.
- Rebuy amount equals the room's initial Table Chips.
- Human players may choose to Rebuy.
- AI Opponents Rebuy automatically.

## AI

- The Host can configure AI count.
- The Host can configure a room-wide AI Difficulty: easy, standard, or hard.
- All AI Opponents in the room use the same AI Difficulty.
- Per-AI difficulty, AI personality, AI avatars, AI names, and AI learning are out of scope.
- AI actions should not be instant.
- AI action delay should be 0.5 to 1.5 seconds.
- The UI should show that AI is thinking during the delay.
- AI thinking time is not configurable in the first version.

## Joining and Seat Replacement

- Human players take available seats before AI replacement.
- If the room is full and has an AI Opponent, a new human player can replace an AI Opponent after the current Hand ends.
- A replacing human player enters with the room's initial Table Chips.
- A replacing human player does not inherit the AI Opponent's Table Chips.
- If the room is full and all seats are occupied by human players, joining is rejected as room full.

## Exit, Removal, and AI Takeover

- When a human player exits a seat, the seat becomes an AI Takeover Seat.
- The AI Takeover Seat inherits the seat's current Table Chips.
- If the exit happens during a Hand, the AI Takeover Seat also inherits that seat's Hole Cards and Pot eligibility.
- Host Removal also converts the human player's seat into an AI Takeover Seat.
- If Host Removal targets a player participating in the current Hand, the conversion happens immediately and the AI Takeover Seat continues that Hand.
- A returning player with the same Temporary Player Identity can reclaim their AI Takeover Seat before Room Expiration.
- Seat Reclaim inherits the seat's current Table Chips.
- A new friend cannot reclaim another player's AI Takeover Seat as that player.
- A new friend replacing any AI uses initial Table Chips instead of inheriting that AI's chips.

## Reconnect and Room Expiration

- Short Reconnect is supported through local session state.
- Disconnected players have a 10-minute reconnect window.
- During the reconnect window, the player can return to the same Private Room and Seat.
- If the player does not return within 10 minutes, the seat becomes an AI Takeover Seat.
- If all human players are absent, the room does not continue starting new hands with only AI.
- A room with no human players waits for 10 minutes.
- If no human player returns within 10 minutes, the room expires and is destroyed.
- Room Codes become invalid after Room Expiration.
- Room history is not persisted after expiration.

## Hand Flow

- The first version must support a complete Texas Hold'em hand:
  - post blinds;
  - deal two Hole Cards to each player;
  - preflop betting;
  - flop;
  - flop betting;
  - turn;
  - turn betting;
  - river;
  - river betting;
  - Showdown or all-but-one fold;
  - Pot settlement;
  - advance to the next Hand.
- Supported player actions:
  - fold;
  - check;
  - call;
  - bet;
  - raise;
  - All-In.
- No-Limit Betting is used.
- Fixed-limit, pot-limit, ante, straddle, run-it-twice, and insurance are out of scope.

## Betting and Pots

- A player may wager up to all remaining Table Chips.
- All-In is supported.
- Side Pots are required.
- Minimum raise should follow standard no-limit rules: at least the size of the previous raise in the same Betting Round.
- Pots and Side Pots must be settled independently by eligibility.

## Hand Evaluation

- Standard Texas Hold'em hand ranking is required:
  - royal flush;
  - straight flush;
  - four of a kind;
  - full house;
  - flush;
  - straight;
  - three of a kind;
  - two pair;
  - one pair;
  - high card.
- Ace can be high or low in A-2-3-4-5 straights.
- The best five-card hand wins.
- Exact ties split the eligible Pot.
- Split Pot and Side Pot settlement must both be correct.

## Card Visibility

- A player can only see their own Hole Cards before Showdown.
- AI Hole Cards are not visible before Showdown.
- Other human players' Hole Cards are not visible before Showdown.
- At Showdown, only eligible remaining players' Hole Cards are revealed.
- Folded players' Hole Cards stay hidden.
- The Host has no special permission to see hidden cards.
- The client must not receive card data that the player is not allowed to see.

## Action Timing

- Human player action time is fixed at 120 seconds.
- Time bank, extra time cards, and custom action time are out of scope.
- If a disconnected or inactive player times out:
  - check automatically if checking is legal;
  - otherwise fold automatically.

## Table UI Scope

The first version must show:

- Room Code;
- copyable Invite Link;
- each Seat's Nickname or AI name;
- each Seat's remaining Table Chips;
- dealer button;
- small blind and big blind positions;
- current acting player;
- current player's legal actions;
- current bet amount;
- Pot and Side Pots;
- community cards;
- current player's Hole Cards;
- action countdown;
- Table Log.

Complex visual effects, avatar shop, theme skins, player profile pages, rankings, and long-term statistics are out of scope.

## Table Log and Social Features

- The first version has Table Log only.
- The Table Log shows game actions and system events.
- Free-form text chat is out of scope.
- Voice chat is out of scope.
- Moderation tools, mute, reporting, and profanity filtering are out of scope.
- Optional quick emotes or short phrases may be added if they do not delay core gameplay.

## Host Controls

- The Host can remove human players.
- Host Removal converts the removed player's seat into an AI Takeover Seat according to the exit/removal rules.
- The Host cannot change core room settings after the room starts.
- The Host can end the room.

## Security and Fairness

- The server is authoritative for:
  - shuffling;
  - dealing;
  - turn order;
  - legal action validation;
  - betting;
  - Pot settlement;
  - hand evaluation.
- Clients only submit player intentions.
- Clients cannot decide dealt cards, chip changes, or settlement results.
- AI decisions run server-side.
- Room Codes should be random and hard to guess.
- Heavy anti-cheat, IP limits, device fingerprinting, account risk control, collusion detection, reporting, and behavior models are out of scope.

## Persistence

- The first version stores current room state only for active play and reconnect.
- Long-term hand history is out of scope.
- Replay is out of scope.
- Player records and rankings are out of scope.
- Database persistence is out of scope for the first version.

## Platform

- The first version is a web game.
- PC browser is the primary target.
- Mobile browser should be basically usable but does not need first-pass polish.
- Native mobile apps, desktop clients, WeChat Mini Programs, and WeChat games are out of scope.

## Deployment and Capacity

- The first version must be deployable for friends to play online.
- Local development must also be runnable.
- Target server: one Alibaba Cloud 2-core 2GB server.
- Capacity target:
  - up to 10 active Private Rooms;
  - up to 50 concurrently online human players;
  - up to 9 seats per room.
- No horizontal scaling in the first version.
- If capacity is exceeded, new room creation should fail with a server-busy message.

## Technical Shape

- Frontend: React + TypeScript.
- Backend: Node.js + TypeScript.
- Realtime communication: WebSocket.
- Runtime state: server memory.
- Package manager: npm.
- Repository structure:
  - `client` for the React frontend;
  - `server` for the Node.js backend.
- The backend process serves:
  - HTTP pages or frontend static assets;
  - HTTP APIs;
  - WebSocket connections.
- Microservices are out of scope.
- A separate database, Redis, and frontend CDN deployment are out of scope.

## Docker Deployment

- The first version uses Docker deployment.
- Use one application container.
- Use a multi-stage Docker build:
  - build the React frontend;
  - build the Node.js backend;
  - serve frontend assets from the backend.
- The application container exposes HTTP and WebSocket through the same backend service.
- The application does not need to include HTTPS internally.
- HTTPS, domain binding, and certificates can be handled by an external reverse proxy such as Nginx, Caddy, Alibaba Cloud gateway, or another deployment-layer component.
- The application must not hard-code localhost so it can work behind a domain and reverse proxy.

## Explicit Non-Goals

- Tournament mode.
- Public lobby.
- Random matchmaking.
- Friend system.
- Account login.
- Real-money value or exchangeable rewards.
- Global leaderboard.
- Long-term player statistics.
- Spectator mode.
- Free-form chat.
- Voice chat.
- Database-backed history.
- Multi-server scaling.
- Native app clients.
