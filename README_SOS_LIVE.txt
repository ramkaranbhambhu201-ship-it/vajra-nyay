VAJRA NYAY - SOS LIVE VIDEO BUILD

Changes in this build:
1. Home screen camera action replaced by SOS LIVE VIDEO.
2. SOS requests camera + location permission and starts live video recording.
3. Video is cut into ~1 second chunks. Each chunk is sent to /api/sos/chunk.
4. Server stores each chunk and SHA-256 hash in sos_live/<session>/manifest.jsonl.
5. If an authorized Police live endpoint is configured later with POLICE_LIVE_ENDPOINT, the same chunks are forwarded as they arrive. The app does NOT pretend that police are connected when no endpoint is configured.
6. The final SOS video is also added to the existing Vajra Nyay evidence/vault list for the current browser session.
7. Theme changed from black to a light judicial-style cream + navy + gold design, with a subtle scales-of-justice watermark.
8. A settings button is added at the top-right.

IMPORTANT:
- A real police live connection requires an authorized police/agency endpoint and its authentication/protocol. This build is API-ready; it does not invent or simulate a police connection.
- Digital evidence handling and admissibility depend on how evidence is collected, preserved and documented. The app records hashes/timestamps but does not by itself guarantee court admissibility.

Local start:
  npm start
  Open http://localhost:3000

Optional future police endpoint:
  PowerShell:
  $env:POLICE_LIVE_ENDPOINT="https://YOUR-AUTHORIZED-ENDPOINT"
  npm start

Do not put secret API keys in index.html.
