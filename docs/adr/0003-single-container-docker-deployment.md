# Single-container Docker deployment

The first version deploys as one application container that serves the React client, HTTP API, and WebSocket endpoint from the Node.js backend. This keeps deployment simple for a 2-core 2GB server; HTTPS and domain termination stay outside the app container behind an optional reverse proxy.
