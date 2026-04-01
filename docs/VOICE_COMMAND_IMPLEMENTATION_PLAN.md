# Voice Command Implementation Plan

This file maps the agreed voice-command contract to the current app structure without replacing the working flows.

## Current ownership

- Parser and normalization:
  - `C:\Users\hwawei\Desktop\psnti-routecalc-live-sync-2\utils\voice.ts`
- Fare flow UI and handoff:
  - `C:\Users\hwawei\Desktop\psnti-routecalc-live-sync-2\components\CalcScreen.tsx`
- Alerts flow UI and queue behavior:
  - `C:\Users\hwawei\Desktop\psnti-routecalc-live-sync-2\components\AlertsScreen.tsx`
- Calculator voice overlays:
  - `C:\Users\hwawei\Desktop\psnti-routecalc-live-sync-2\components\NormalCalcOverlay.tsx`
  - `C:\Users\hwawei\Desktop\psnti-routecalc-live-sync-2\components\ConductorCalcOverlay.tsx`
  - `C:\Users\hwawei\Desktop\psnti-routecalc-live-sync-2\components\TallyCalcOverlay.tsx`
- Smart cleanup / structured fallback:
  - `C:\Users\hwawei\Desktop\psnti-routecalc-live-sync-2\supabase\functions\smart-voice-assist\index.ts`

## Phase 1: tightening on top of the current system

Goal: keep the current behavior working while removing the most common failure points.

### Voice parser layer

Add and maintain in:
- `C:\Users\hwawei\Desktop\psnti-routecalc-live-sync-2\utils\voice.ts`

Key responsibilities:
- global voice controls:
  - `parseVoiceFlowControlCommand`
- fare correction commands:
  - `parseFareVoiceCorrectionCommand`
- calculator control commands:
  - `parseCalculatorVoiceControlCommand`
- shared reprompt policy:
  - `getVoiceRepromptLimit`
- deterministic number parsing:
  - `parseNumberPhrase`
  - `parsePassengerCountVoiceTranscript`
  - `parseCashVoiceTranscript`

### Fare flow UI

Tighten in:
- `C:\Users\hwawei\Desktop\psnti-routecalc-live-sync-2\components\CalcScreen.tsx`

Key responsibilities:
- apply global commands before slot handling
- apply explicit correction commands like:
  - change origin
  - change destination
  - change fare type
  - change passenger count
  - change amount
- isolate voice transaction cleanup:
  - `resetFareVoiceTransactionState`
- support stop-only correction while preserving the active fare context:
  - `resolvePendingVoiceStopEdit`
- keep route-only clarification safe:
  - `beginRouteClarification`
  - `buildRouteClarificationFromTranscript`
- make no-speech reprompt instead of dropping the conversation
- separate transaction completion wording from voice-close wording

### Alerts flow UI

Tighten in:
- `C:\Users\hwawei\Desktop\psnti-routecalc-live-sync-2\components\AlertsScreen.tsx`

Key responsibilities:
- accept global controls in alerts voice
- reprompt instead of closing immediately on silence
- preserve queue state while correcting or backing up
- keep manual-pick fallback as the safe escape hatch

### Calculator overlays

Tighten in:
- `C:\Users\hwawei\Desktop\psnti-routecalc-live-sync-2\components\NormalCalcOverlay.tsx`
- `C:\Users\hwawei\Desktop\psnti-routecalc-live-sync-2\components\ConductorCalcOverlay.tsx`
- `C:\Users\hwawei\Desktop\psnti-routecalc-live-sync-2\components\TallyCalcOverlay.tsx`

Key responsibilities:
- global controls:
  - repeat
  - help
  - back
  - start over
  - manual / exit
- basic edit commands:
  - clear
  - delete last
- no-speech reprompt instead of silent failure

## Phase 2: formal shared voice state

Goal: make the current `useState + useRef` flow easier to reason about without rewriting all screens at once.

Add first in:
- `C:\Users\hwawei\Desktop\psnti-routecalc-live-sync-2\utils\voice.ts`
- `C:\Users\hwawei\Desktop\psnti-routecalc-live-sync-2\components\CalcScreen.tsx`
- `C:\Users\hwawei\Desktop\psnti-routecalc-live-sync-2\components\AlertsScreen.tsx`

Recommended shared model:
- active flow
- current prompt
- pending confirmation
- pending clarification
- reprompt count
- transcript state
- last confidence

Do not move all business logic at once.

Start by centralizing:
- flow control commands
- timeout policy
- cleanup rules

## Phase 3: reducer transition pass

Goal: migrate the most fragile screens into deterministic transitions.

Recommended order:

1. Fare reducer in:
   - `C:\Users\hwawei\Desktop\psnti-routecalc-live-sync-2\components\CalcScreen.tsx`
2. Alerts reducer in:
   - `C:\Users\hwawei\Desktop\psnti-routecalc-live-sync-2\components\AlertsScreen.tsx`
3. Calculator reducers in:
   - normal
   - change
   - tally overlays

Reducer transition targets:
- `idle`
- `listening`
- `parsing`
- `need_*`
- `confirm`
- `completed`
- `cancelled`

## Phase 4: smart voice engine upgrade

Goal: keep the current slot-filling logic, but improve what hears the user.

Build on:
- `C:\Users\hwawei\Desktop\psnti-routecalc-live-sync-2\supabase\functions\smart-voice-assist\index.ts`
- current route-stop / landmark alias data

Recommended order:

1. stronger domain phrase bank
2. backend speech-to-text biased toward route words
3. Gemini cleanup for messy language and clarification
4. native Android-grade audio path later if needed

## Rules that must stay true

- never invent a stop outside the active route
- ask only the next missing slot
- clear transient voice state on cancel, exit, manual, completion, and screen change
- keep manual fallback available on every important step
- keep voice improvements incremental so working flows do not regress
