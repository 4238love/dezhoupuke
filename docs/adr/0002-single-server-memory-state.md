# Single-server memory state for MVP

The first version stores active Private Room state in server memory on one Alibaba Cloud 2-core 2GB server. This deliberately avoids a database, Redis, and multi-instance room coordination while the target capacity is only about 10 active Private Rooms and 50 concurrent human players.
