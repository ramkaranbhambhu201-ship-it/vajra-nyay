VAJRA NYAY — AUTO LAW & CONSTITUTION UPDATE

This build adds an automatic official-source update checker.

How it works:
1. On server start, Vajra Nyay checks the official India Code catalog (when network access is available).
2. It checks again every 24 hours.
3. It stores the latest discovered Act catalog in law_updates.json.
4. Pocket Rights can use matching official-law catalog entries as context for AI answers.
5. The UI has a “🔄 कानून अपडेट” button for a manual check.
6. Sources are official India Code and the Legislative Department.

Important safety behavior:
- The app does NOT silently rewrite legal rules from arbitrary websites.
- A newly discovered law is catalogued first; the actual authoritative text should be verified from the official source.
- If the official source is unavailable, the app keeps the last successful catalog and reports the update failure.
- This is a legal-information feature, not a guarantee that every legal change is automatically interpreted correctly.

For a truly production-grade live legal database, use an authorized official API/feed or a reviewed scheduled ingestion pipeline that downloads and validates official Acts, amendments, rules, notifications and commencement dates.
