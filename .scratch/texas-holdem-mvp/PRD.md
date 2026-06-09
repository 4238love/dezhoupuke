# Texas Hold'em MVP PRD

Status: ready-for-agent

## Problem Statement

Players need a lightweight Texas Hold'em game where they can start a Cash Table quickly, configure AI Opponents, and invite friends into a Private Room without account setup or real-money complexity.

## Solution

Build a deployable web game with Private Rooms, Room Code and Invite Link joining, configurable AI count and AI Difficulty, server-authoritative No-Limit Betting, complete Hand settlement, Short Reconnect, AI Takeover Seat behavior, and Docker single-container deployment.

## User Stories

1. As a Host, I want to create a Private Room, so that I can start a Cash Table.
2. As a Host, I want to choose 2 to 9 Seats, so that the table size fits my group.
3. As a Host, I want to configure AI count, so that I can play Solo Play or fill empty Seats.
4. As a Host, I want to choose AI Difficulty, so that AI Opponents match the desired challenge level.
5. As a human player, I want to join with a Nickname, so that I can play without creating an account.
6. As a human player, I want to join by Room Code, so that I can enter a friend's Private Room.
7. As a human player, I want to join by Invite Link, so that joining is easier.
8. As a human player, I want to see only my own Hole Cards before Showdown, so that Card Visibility is fair.
9. As a player, I want standard No-Limit Betting actions, so that the game feels like normal Texas Hold'em.
10. As a player, I want All-In and Side Pot settlement to work, so that chip-limited hands resolve correctly.
11. As a player, I want standard hand evaluation and Split Pot handling, so that winners are correct.
12. As a disconnected player, I want Short Reconnect, so that refreshes and brief network loss do not remove me immediately.
13. As a player who exits, I want an AI Takeover Seat to preserve my Seat's Table Chips, so that the room can continue.
14. As a returning player, I want Seat Reclaim, so that I can take back my AI Takeover Seat before Room Expiration.
15. As a Host, I want Host Removal, so that I can remove disruptive players by converting them to AI Takeover Seats.
16. As a player, I want 120 seconds for actions, so that I have time to decide.
17. As a player, I want an action timeout fallback, so that inactive players do not block the Cash Table.
18. As a player, I want a Table Log, so that I can follow Hand and room events.
19. As a player, I want visible Pot, Side Pots, Blinds, current actor, Hole Cards, community cards, and action controls, so that I can play without guessing state.
20. As an operator, I want Docker deployment, so that the game can run on a small Alibaba Cloud server.

## Implementation Decisions

- Use React and TypeScript for the client.
- Use Node.js and TypeScript for the server.
- Use WebSocket for realtime Private Room synchronization.
- Use server memory for active room state.
- Use server-authoritative game state.
- Use a single application container for Docker deployment.
- Serve the built client from the backend in production.
- Do not add accounts, payment, database persistence, public lobby, matchmaking, or long-term history in the first version.

## Testing Decisions

- Test public behavior through the game engine and WebSocket/API seams.
- Prioritize hand evaluation, Side Pot settlement, action validation, Room Code joining, AI Takeover Seat, and reconnect behavior.
- Use integration-style tests where possible and avoid tests coupled to private implementation details.

## Out of Scope

- Tournament mode.
- Real-money value.
- Account login.
- Public lobby or matchmaking.
- Friend system.
- Spectator mode.
- Free-form chat.
- Database-backed history.
- Horizontal scaling.
- Native mobile or desktop apps.

## Further Notes

The detailed requirements live in `docs/specs/mvp-requirements.md`. Domain terminology lives in `CONTEXT.md`. Architecture decisions live in `docs/adr/`.
