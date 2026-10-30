# OCURE_DAILY_PLAN.md — 3-5 two-minute breaks per day, each different

All numeric values below are UNVALIDATED product defaults. Put them in one config file with a comment saying so. They are not clinical doses and not a replacement for the removed 20-20-20 rule.

## 1. Rules
- Each break is one 120-second routine (see OCURE_EXERCISES.md). 3-5 breaks per day = 6-10 minutes total.
- Daily quota N: user preference, integer 3 to 5, default 4. A small 3 / 4 / 5 segmented control in the OCURE header, saved with the existing preference mechanism. N is a CAP on offers, not a guarantee: offers only occur when the app has real active screen time.
- The day resets at local midnight. Store dates in the app's timestamp convention and derive the local date explicitly.
- Within one local day a routine is offered at most once. Manual starts also count as "used today", so a routine the user already did by hand is not offered again that day.
- Effective cap = min(N, number of eligible routines left today). Never repeat a routine to fill the quota.

## 2. When an offer occurs (no fixed 20-minute rule)
- Track active screen time from the app's existing monitoring data. Offer when active minutes since the last break event (a completed session, or an offer the user declined or let expire) reach MIN_ACTIVE_MINUTES_BETWEEN_OFFERS (default 60, config).
- If monitoring is paused, the camera is unavailable, or active time is unknown, produce NO offer. Never infer or fabricate screen time.
- Do not offer during a running coach session or while another offer is pending.
- Delivery: the existing floating widget alert card. Text: "Time for a short break? Today: <routine name>, 2 minutes." Actions: Start, Later. Reuse the existing expand/collapse behavior and quiet styling. Start opens the single coach session. No new entry point.
- Later: snooze once for SNOOZE_MINUTES (default 10, config). A second Later, or the card expiring, records the offer as declined or expired. It still counts as offered.

## 3. Routine selection (deterministic, pure function, unit-tested)
Inputs: today's offered/used routine ids, latest reliable band for TODAY (or null), local date ordinal, yesterday's first-offered routine id.
1. Pool = [R2, R3, R4, R5, R6].
2. If latest reliable band is below 10, add R1 and place it first.
3. If latest reliable band is 30 or above (including 40+), remove R1 and R2 (they contain deliberate blinking).
4. Remove routines already offered or started today.
5. If R1 is in the pool and band < 10, select R1.
6. Otherwise rotate: fixed order [R2, R3, R4, R5, R6, R1], starting at index (dayOrdinal mod 6), take the first pool member in cyclic order.
7. For the day's first offer, if the result equals yesterday's first offer and another candidate exists, take the next candidate.
8. If the pool is empty, make no offer.
Band use is limited to steps 2-5. Band is never shown as a diagnosis. The latest reliable band comes from the existing session statistics and the reliability gate in OCURE_FUNCTION.md; if reliability fails, band is null.

## 4. Records (extend the existing local DB schema and migration approach; no second storage)
plan_offer: id, localDate, slotIndex, routineId, offeredAt, outcome (accepted | snoozed_then_accepted | declined | expired), sessionId (nullable).
Keep these distinct and never merge their counts: recommended/offered, accepted, started, completed, declined, expired.
Follow the existing retention policy.

## 5. UI
- OCURE library header shows a real line: "Today: <offered> of <N> breaks offered, <completed> completed". Zero state: "No breaks offered yet today." No streaks, scores, points or invented history.
- The OCURE page shows the single routine the selection function returns for the current data, recomputed when data changes. It is the current recommendation, not a schedule of future breaks. If an offer is pending, show that offer's routine. If no routine is eligible, show one calm text row; manual start stays available through 'Choose another routine'.
- The quota control changes only future offers and never edits today's records.
