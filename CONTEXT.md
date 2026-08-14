# Texas Hold'em Game

A multiplayer Texas Hold'em game where human players can play against configurable AI opponents and invite friends into the same table.

## Language

**Cash Table**:
A table mode where each hand is settled independently with table chips, fixed blinds, and optional rebuy after a player runs out of chips.
_Avoid_: Tournament, match, ranked event

**Seat**:
A position at a Cash Table occupied by either a human player or an AI opponent for complete hands.
_Avoid_: Chair, slot

**AI Opponent**:
A computer-controlled player that occupies a Seat and follows the same hand flow and table rules as human players.
_Avoid_: Bot, NPC

**AI Difficulty**:
A room setting that controls how strongly all AI Opponents in a Private Room make poker decisions, using a shared easy, standard, or hard level.
_Avoid_: AI personality, bot type

**AI Replacement**:
A join behavior where a human player takes an unreserved AI Opponent's Seat after the current Hand ends and inherits that Seat's current Table Chips. An AI Takeover Seat remains reserved for its original Temporary Player Identity.
_Avoid_: Bot takeover, new-chip issuance

**AI Takeover Seat**:
A Seat taken over by an AI Opponent after a human player exits a Seat, inheriting that Seat's current Table Chips and, when the exit happens during a Hand, that Seat's current Hole Cards and Pot eligibility.
_Avoid_: New AI, temporary autopilot

**Seat Reclaim**:
A behavior where the same Temporary Player Identity returns before Room Expiration and takes back its AI Takeover Seat with that Seat's current Table Chips.
_Avoid_: Login recovery, new join

**Private Room**:
A Cash Table that can be joined only by players who know its Room Code.
_Avoid_: Public lobby, matchmaking queue

**Solo Play**:
A Private Room started by one human player against one or more AI Opponents.
_Avoid_: Single-player hand, empty table

**Room Code**:
A short invite code used by human players to join the same Private Room.
_Avoid_: Friend invite, lobby ID

**Invite Link**:
A shareable link that opens a Private Room join flow using its Room Code.
_Avoid_: Friend request, QR invite

**Room Expiration**:
A cleanup behavior where a Private Room is destroyed after all human players have been absent for 10 minutes.
_Avoid_: Match ending, game over

**Host**:
The human player who creates a Private Room and chooses its table settings before play begins.
_Avoid_: Owner, admin

**Host Removal**:
A Host action that converts a human player's positive-chip Seat into an AI Takeover Seat after the current Hand has settled. A zero-chip Seat is released instead.
_Avoid_: Ban, chip removal

**Nickname**:
A display name chosen by a human player when creating or joining a Private Room; it only needs to be unique within that Private Room.
_Avoid_: Username, account name

**Temporary Player Identity**:
A room-scoped human player identity created from a Nickname and local session state, without registration or account login.
_Avoid_: Account, user profile

**Short Reconnect**:
A player recovery behavior where a temporarily disconnected human player returns to the same Private Room and Seat through local session state within 10 minutes before the Seat becomes an AI Takeover Seat.
_Avoid_: Login recovery, account restore

**Action Timeout**:
A 120-second table rule that resolves a disconnected or inactive player's pending decision by checking when possible and folding when checking is not possible.
_Avoid_: Auto-play, skip turn

**Table Chips**:
Virtual chips used only inside a Cash Table to place bets and settle hands; they have no real-money value and cannot be purchased, redeemed, or exchanged.
_Avoid_: Money, currency, points

**Rebuy**:
A once-per-Seat behavior where a player with zero Table Chips receives the Private Room's initial Table Chips after the current Hand ends. The Seat retains its Rebuy count when its occupant leaves or is replaced, and a previously used Seat cannot issue additional starting Table Chips to a replacement.
_Avoid_: Recharge, top-up

**Blind**:
A mandatory bet posted before cards are dealt, with a small blind and big blind rotating around the Seats each hand.
_Avoid_: Entry fee, ante

**Hand**:
One complete deal of Texas Hold'em, from posting blinds through card dealing, betting rounds, showdown or folds, pot settlement, and advancing to the next deal.
_Avoid_: Round, game

**Betting Round**:
One phase of player actions within a Hand: preflop, flop, turn, or river.
_Avoid_: Turn, stage

**Pot**:
The Table Chips contested during a Hand and awarded after all but one player folds or after hand comparison at showdown.
_Avoid_: Prize pool, bank

**No-Limit Betting**:
A betting rule where a player may wager up to all of their remaining Table Chips during a Betting Round.
_Avoid_: Fixed-limit, pot-limit

**All-In**:
A player action where the player commits all remaining Table Chips to the current Hand.
_Avoid_: Max bet

**Side Pot**:
A separate Pot created when one or more players are All-In for fewer Table Chips than other active players can wager.
_Avoid_: Split pot

**Showdown**:
The end-of-hand comparison where remaining players reveal cards and the best standard Texas Hold'em five-card hands win eligible Pots.
_Avoid_: Reveal, scoring

**Hole Cards**:
The two private cards dealt to each player at the start of a Hand.
_Avoid_: Private cards, personal cards

**Card Visibility**:
A table rule where players see only their own Hole Cards before Showdown, Showdown reveals only eligible remaining players' Hole Cards, and folded players' Hole Cards stay hidden.
_Avoid_: Card hiding, front-end masking

**Split Pot**:
A Pot settlement where eligible players with equal best hands divide the Pot evenly.
_Avoid_: Side pot

**Table Log**:
A room-visible feed of game actions and system events, without free-form player chat.
_Avoid_: Chat, message board
