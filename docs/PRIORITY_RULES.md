# CivicFix Priority and Disaster Reassessment Rules

This document specifies the deterministic algorithm for evaluating and reassessing issue priorities during normal operations and active disaster events, in compliance with Section 8 of the CivicFix specifications.

## 1. Principles
1. **Separation of Concerns**: The backend owns priority calculation. AI outputs (such as hazard signals or category classifications) serve exclusively as unverified contextual signals and cannot unilaterally assign or authorize a `CRITICAL` priority.
2. **Preservation of History**: The original base severity and original priority are never overwritten. All modifications write an immutable `PriorityHistory` row with an `idempotency_key`.
3. **No Demotion of Overdue Work**: An existing overdue complaint must never have its priority downgraded merely because a disaster event started or because of its age.
4. **No Automatic Reopening**: Closed and resolved complaints are not automatically reopened by disaster reassessment.
5. **Idempotence**: Running the reassessment multiple times for the same event and state must yield the exact same priorities without creating duplicate history rows.
6. **No Declaration Claim**: The system facilitates community coordination during emergency conditions, but never claims to have declared an official disaster.

## 2. Priority Levels
- `CRITICAL`: Immediate threat to life, public safety, or critical infrastructure (e.g., live electrical wires in water, structural collapse risk).
- `HIGH`: Significant disruptions affecting multiple households or key accessways (e.g., blocked arterial drainage, main water line rupture).
- `MEDIUM`: Standard operational issues causing inconvenience (e.g., streetlight out, localized garbage collection).
- `LOW`: Aesthetic or minor maintenance matters (e.g., cosmetic pavement marks, minor garden trimming).

## 3. Evaluation Factors and Weighting
During normal operations, priority defaults to the complaint's `base_severity`.

When one or more `DisasterEvent` records are active within the complaint's organization and geographic scope, priority is reassessed using the following factors:

1. **Disaster Relevance**:
   - For `FLOOD`: issues in categories such as *Drainage*, *Electricity*, or containing terms like `water`, `drain`, `electric`, `wire`, `overflow` receive a priority boost of +1 to +2 levels.
   - For `CYCLONE`: issues in categories such as *Trees*, *Roofing*, *Streetlights*, or terms like `fall`, `pole`, `wire` receive a priority boost.
   - For `FIRE`: issues involving *Electrical*, *Gas*, or *Blockages* are prioritized.
2. **Immediate Safety Risk**:
   - Reports indicating immediate hazards (e.g., exposed high-voltage wiring near water) are raised to `CRITICAL` or `HIGH`.
3. **Existing Overdue Status**:
   - If a complaint was already flagged `is_overdue`, its priority is preserved or elevated; it can never be lowered.
4. **Waiting Time**:
   - Complaints waiting longer than twice their response deadline are elevated by at least +1 level unless already `CRITICAL`.
5. **Overlapping Events**:
   - When multiple disaster events overlap in scope, each event evaluates the candidate priority independently, and the **highest (most severe)** resulting priority is selected.

## 4. Disaster Deadlines and Target Changes
- When Disaster Mode is activated, the organization's `DeadlineRule` with `mode = 'DISASTER'` takes effect (typically tighter response hours, e.g. 4 hours vs 24 hours).
- When a deadline target changes, a `DeadlineChange` record is logged with:
  - `complaint_id`
  - `target_type` ("RESPONSE" or "RESOLUTION")
  - `original_target`
  - `new_target`
  - `effective_time`
  - `reason` ("Disaster mode activated: <Event Name>")
- The original target remains stored and displayed.

## 5. Deactivation Reassessment
When a disaster event ends (`state = 'ENDED'`), the reassessment runs again under the normal policy.
- Complaints elevated strictly due to disaster relevance return to normal priority.
- Complaints that are overdue or have had manual staff overrides retain their elevated priority.
- A new `PriorityHistory` entry is written with `method = 'AUTOMATED_DISASTER_REASSESSMENT'` and a new unique `idempotency_key`.
