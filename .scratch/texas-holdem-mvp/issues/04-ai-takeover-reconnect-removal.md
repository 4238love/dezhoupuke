# AI Takeover, reconnect, and Host Removal tracer

Status: ready-for-agent

## What to build

Build the lifecycle behavior for Short Reconnect, AI Takeover Seat, Seat Reclaim, Host Removal, Action Timeout, and Room Expiration.

## Acceptance criteria

- [ ] A disconnected player can Short Reconnect within 10 minutes.
- [ ] A player absent for more than 10 minutes becomes an AI Takeover Seat.
- [ ] Exiting or Host Removal converts the Seat into an AI Takeover Seat according to Hand boundaries.
- [ ] The same Temporary Player Identity can Seat Reclaim before Room Expiration.
- [ ] New friends replacing AI start with initial Table Chips instead of inheriting AI chips.
- [ ] A room with no human players pauses and expires after 10 minutes.

## Blocked by

- `03-realtime-table-ui.md`
