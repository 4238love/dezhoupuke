# Server-authoritative game state

The first version keeps Texas Hold'em game authority on the server: shuffling, dealing, action validation, turn order, Pot settlement, Showdown, AI decisions, and Card Visibility are all decided server-side. Clients submit player intentions only, because a multiplayer poker game cannot trust browser state for hidden cards, chip movement, or settlement.
