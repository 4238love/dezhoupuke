# Realtime table UI tracer

Status: ready-for-agent

## What to build

Build the end-to-end realtime Cash Table UI that connects to the server, renders room state, and lets human players submit legal actions.

## Acceptance criteria

- [ ] The UI shows Seats, Nicknames or AI names, Table Chips, Blinds, dealer button, community cards, own Hole Cards, Pot, Side Pots, current actor, legal actions, countdown, and Table Log.
- [ ] Human actions are sent to the server as intentions.
- [ ] Client state updates from server broadcasts.
- [ ] Hidden Hole Cards are never rendered for unauthorized players.
- [ ] AI thinking state is visible during AI action delay.

## Blocked by

- `02-single-hand-engine.md`
