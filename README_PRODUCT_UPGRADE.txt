VAJRA NYAY — PRODUCT UPGRADE

Added in this build:
1. Home: Government / Police Service Connection panel
   - Rajasthan Police Citizen Services
   - National Cyber Crime Reporting Portal
   - National Consumer Helpline
   - RTI Online
2. जन-न्याय केंद्र
   - जन-आवाज anonymous post UI + donation-ready placeholder (no real payment gateway)
   - Pocket Rights with simple Hindi audio playback
   - Smart FIR / RTI draft helper + print/PDF
   - Digital Whistleblower local anonymous queue (not a guarantee of network anonymity)
   - Auto-Witness backup preparation / relay hook (browser mesh is not universally supported)
3. SOS Live Video remains on Home with 1-second MediaRecorder chunks and backend hook.
4. Evidence SHA-256 stamping endpoint remains available.
5. Judicial visual theme retained.

IMPORTANT:
- Government portals are linked as redirects; they are not embedded/officially connected by Vajra Nyay.
- Police live streaming requires an authorized endpoint. Set POLICE_LIVE_ENDPOINT on the backend only when such an endpoint is officially provided.
- Do not claim evidence is automatically court-admissible merely because a hash exists.
- The whistleblower UI does not guarantee anonymity. A production anonymous system requires privacy-reviewed infrastructure, logging minimization, secure storage and an authorized deployment model.
- Donation/crowdfunding is UI-only in this version; no money is collected.
- FIR/RTI drafts are drafting aids, not legal advice. Verify facts, authority, current law and applicable procedure before filing.

Run:
  npm start
Open:
  http://localhost:3000
