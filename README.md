# TypingMind Extensions

This repository hosts small JavaScript extensions for TypingMind.

The main extension at the moment is:

`tm-soft-token-modal-reader.js`

It adds a read-only soft token warning widget to TypingMind.

## Latest Extension URL

Base URL:

```text
https://emotioncoaching.github.io/typingmind-extensions/tm-soft-token-modal-reader.js
```

Recommended cache busting pattern:

```text
https://emotioncoaching.github.io/typingmind-extensions/tm-soft-token-modal-reader.js?v=YOUR_MARKER
```

The query string is only for cache busting. GitHub Pages serves the same file path either way.

This repo changes over time; use the deployed script URL plus the latest commit on `main` as the authoritative source-of-truth for what is live.

## Privacy posture for this README

This document intentionally avoids machine-specific filesystem paths, local-only URLs, transcripts, instrumentation endpoints, screenshots, identities, workspace names, and personal chat excerpts. It stays at the level of publicly hosted script URLs and generalized implementation notes.

## What The Widget Does

The extension displays a small token status indicator in TypingMind.

Its purpose is to give early visual feedback while prompting, especially when a chat is approaching a large context size. The widget is intentionally a "soft limit" indicator. It does not alter TypingMind behavior or model settings.

Color states:

- Green: below `80,000` tokens.
- Orange: `80,000` to below `100,000` tokens.
- Red: `100,000` tokens or more.
- Purple: no TypingMind token/context count could be found.

Desktop behavior:

- Starts minimized.
- Collapsed state shows only the colored status dot and a triangle button.
- The text label "Soft token limit" is hidden.
- The compact widget is positioned near the first line of the prompt input.
- Expanding the widget shows the details card with source, count, progress bar, and hint text.

Mobile behavior:

- On screens `<= 700px`, the widget becomes only a tiny colored dot.
- No text, no progress bar, no triangle, and no card body are shown.
- The dot is placed on the right screen margin near the message input area.
- It is non-interactive on mobile so it does not block the chat interface.

## Read-Only Guarantees

The extension is designed to be read-only.

It does not:

- Change model settings.
- Change TypingMind context length.
- Write TypingMind chat data.
- Intercept or modify network requests.
- Send chat content anywhere.
- Persist its own data.

It reads:

- Visible TypingMind UI text when available.
- Local TypingMind metadata from IndexedDB for the active chat.
- `localStorage.TM_useLastOpenedChatID` to identify the active chat.

## Token Source Priority

The widget picks a token count in this order:

1. TypingMind visible UI count.
2. Active chat usage from TypingMind IndexedDB data.
3. Bounded fallback estimate from visible chat text.
4. Purple "not found" state.

### 1. Visible TypingMind UI Count

The first preference is TypingMind's own visible token/context display.

The extension looks for the "Current context length" text that appears in TypingMind's About Chat modal, and then parses the nearby token count.

This is handled by:

```text
findTypingMindVisibleTokenCount()
findCurrentContextLengthFromText(text)
```

This source is preferred because it is TypingMind's own displayed value.

### 2. Active Chat IndexedDB Usage

When the modal is closed, TypingMind's visible "Current context length" text is not in the DOM. To keep the token count visible without opening the modal, the extension reads TypingMind's local IndexedDB store.

Current logic:

- Read `TM_useLastOpenedChatID` from `localStorage`.
- Open IndexedDB database `keyval-store`.
- Read object store `keyval`.
- Cursor through records until a chat record is found where `value.id` or `value.chatID` matches `TM_useLastOpenedChatID`.
- Inspect `value.messages`.
- Walk backward through messages and use the latest `message.usage.total_tokens`.

Relevant functions:

```text
refreshActiveChatContextFromIndexedDb()
readActiveChatContextFromIndexedDb()
getLastUsageTotalTokens(messages)
parseStoredString(value)
numberOrNull(value)
```

Important range guard:

```text
tokens >= 1000 && tokens <= 2000000
```

This avoids tiny UI numbers and obviously invalid values.

### 3. Fallback Estimate

If no TypingMind UI count and no IndexedDB count are available, the extension can estimate from visible chat text.

This fallback is intentionally bounded because earlier versions could freeze TypingMind by scanning too much DOM.

Config:

```text
ENABLE_FALLBACK_ESTIMATE: true
FALLBACK_TOKEN_MULTIPLIER: 1.1
MAX_FALLBACK_TEXT_CHARS: 200000
MAX_FALLBACK_TEXT_NODES: 1500
```

Relevant functions:

```text
estimateVisibleChatTokens()
extractVisibleText(root)
collectTextLines(root, maxNodes, maxChars)
parseTokenishNumbers(text)
```

Fallback estimate is a rough heuristic:

- Normalized character count divided by 4.
- Word count multiplied by 1.3.
- Uses the larger value.
- Applies `FALLBACK_TOKEN_MULTIPLIER`.

### 4. Purple Not Found State

If all sources fail, the widget uses the purple state.

Relevant function:

```text
renderNotFound()
```

This deliberately does not use orange anymore. Orange means "approaching soft limit"; purple means "unknown/no token source found."

## Refresh And Navigation Logic

TypingMind chat switching is not fully represented by standard browser navigation events. The extension therefore uses a small polling loop around TypingMind's active chat hints.

Config:

```text
REFRESH_MS: 2000
ACTIVE_CHAT_HINT_POLL_MS: 750
ACTIVE_CHAT_STABLE_TICKS: 2
```

Meaning:

- The regular UI update loop runs every 2 seconds.
- IndexedDB is refreshed every 6 seconds in the background (`REFRESH_MS * 3`).
- Active chat identity is checked every 750 ms.
- A chat switch is considered stable after 2 unchanged checks, about 1500 ms.

This 1500 ms delay was chosen because immediate refreshes caused confusing intermediate UI artifacts during chat load:

- Tiny fallback counts.
- "Not found" flashes.
- Two or three quick updates before the final correct value.

Current behavior during chat switching:

1. Detect active chat hint change using:

```text
TM_useLastOpenedChatID + location.hash
```

2. Set `activeChatSwitchPending = true`.
3. Suppress widget repainting while the active chat is still settling.
4. Wait until the signature is stable for 2 polling ticks.
5. Refresh IndexedDB once.
6. Re-enable widget rendering.

Important state variables:

```text
lastActiveHintSignature
activeHintStableTicks
stableRefreshSignature
activeChatSwitchPending
indexedDbContextRefreshInFlight
indexedDbContextRefreshQueued
```

This keeps the widget responsive without flickering during TypingMind's chat load transition.

## Race Condition Handling

IndexedDB refreshes are asynchronous. The active chat can change while a read is in flight.

To avoid applying stale token data:

- Capture `startSignature` before reading IndexedDB.
- Capture `endSignature` after the read.
- If they differ, do not apply the result.
- Queue another refresh.

This prevents the widget from showing tokens from a previous chat after switching.

Relevant logic is in:

```text
refreshActiveChatContextFromIndexedDb()
```

## Desktop UI Decisions

The desktop widget originally displayed a full card at the bottom right. That was too visually heavy.

Current desktop decisions:

- Start collapsed by default: `collapsed = true`.
- In collapsed mode, show only:
  - The colored dot.
  - The triangle button to expand.
- Hide the "Soft token limit" text label.
- Keep the expanded card available for details.

The collapsed widget has class:

```text
tmstw-collapsed
```

The title text is hidden by CSS:

```text
#tm-soft-token-warning .tmstw-title span:not(.tmstw-dot) {
  display: none;
}
```

The initial element class includes `tmstw-collapsed` when `collapsed` is true.

## Desktop Positioning

Fixed bottom offsets were tested and were not reliable:

- `76px`: too high.
- `60px`: still too high.
- `36px`: too low.
- `48px`: closer, but still not robust enough.

Current approach:

- Keep the CSS bottom offset as fallback.
- When collapsed on desktop, dynamically anchor the widget to the active prompt input's first text line.
- Use the actual input element's `getBoundingClientRect()`.

Relevant functions:

```text
positionCompactWidget()
findPromptInputElement()
```

The position is recalculated on:

- Render.
- Toggle collapse/expand.
- Window resize.
- Scroll.
- Focus changes.
- Input events.

Anchor calculation:

```text
centerY = inputRect.top + paddingTop + (lineHeight / 2) + 6
top = centerY - (widgetRect.height / 2)
```

The final `+ 6` px nudge was added because the first line anchor was visually a little too high in TypingMind.

If no prompt input can be found, the widget falls back to its CSS position.

## Mobile UI Decisions

Mobile needed a much smaller footprint because the full widget blocks too much of the interface.

Current mobile CSS applies at:

```text
@media (max-width: 700px)
```

Mobile behavior:

- Fixed to right margin.
- Tiny `18px` wrapper.
- `12px` colored dot.
- Transparent background.
- No border.
- No card shadow.
- No body.
- No title text.
- No toggle button.
- `pointer-events: none`.

This makes the mobile widget a passive status signal only.

## Color Semantics

Colors are intentionally semantic:

- Green: safe.
- Orange: approaching soft limit.
- Red: soft limit reached.
- Purple: token source unavailable.

CSS state classes:

```text
tmstw-green
tmstw-orange
tmstw-red
tmstw-purple
```

Both the dot and progress bar have matching color rules.

Purple color:

```text
#a855f7
```

## Performance Decisions

The original extension froze TypingMind because it used a full-page `MutationObserver` and unbounded text scanning.

Current performance decisions:

- No full-document `MutationObserver`.
- Use polling with bounded work.
- DOM text scanning is capped by node count and character count.
- Fallback estimate excludes obvious non-chat UI areas:
  - `nav`
  - `aside`
  - `header`
  - `footer`
  - `script`
  - `style`
  - `svg`
  - the widget itself
- Prefer `textContent` and bounded `TreeWalker` traversal over large `innerText` reads.

Important caps:

```text
MAX_FALLBACK_TEXT_CHARS: 200000
MAX_FALLBACK_TEXT_NODES: 1500
MAX_TOKEN_SCAN_TEXT_CHARS: 100000
MAX_TOKEN_SCAN_TEXT_NODES: 1000
```

## Debugging History And Evidence

The implementation went through several debugging rounds.

### Freeze Bug

Problem:

- TypingMind froze when the extension was installed.

Cause:

- A full-document `MutationObserver` reacted to the extension's own DOM updates.
- The update function changed the widget DOM.
- That caused a self-triggering loop.
- Full-page text scans were also too expensive on large chats.

Fix:

- Removed the `MutationObserver`.
- Replaced it with bounded polling.
- Bounded fallback text extraction.

### Modal Open Token Count

Problem:

- The widget displayed an incorrect token count unless the "About chat" modal was open.

Cause:

- TypingMind's accurate "Current context length" text was available in `document.body.textContent`, but the line-based scanner did not reliably pick it up.

Fix:

- Added direct parser for "Current context length".

Relevant function:

```text
findCurrentContextLengthFromText(text)
```

### Modal Closed Token Count

Problem:

- When the About Chat modal was closed, the widget could not show the correct 100k+ context count.

Evidence:

- The modal-specific text disappeared from `document.body` when the modal was closed.
- The same values were observable in IndexedDB-backed chat metadata.

Fix:

- Read the active chat from IndexedDB using `TM_useLastOpenedChatID`.
- Extract the latest `usage.total_tokens` from the chat messages.

### Chat Switching Delay

Problem:

- The widget updated after switching chats, but sometimes took 4 to 6 seconds.

Observed symptom:

- The UI could stall on the periodic refresh cadence unless extra refresh coordination was added.

Design evolution:

Immediate refresh experiments caused confusing transient UI states:

  - Fallback estimate flashing small numbers.
  - Brief "unknown" flashes.
  - Multiple quick repaint cycles during chat load.

Stabilization approach adopted:

- Wait for the active chat hint to stay stable for about 1500 ms.
- Suppress repainting during the switch.
- Refresh once after the chat has settled.

### Positioning Iteration

Problem:

- The compact desktop widget overlapped or misaligned with the prompt input/send button.

Tried fixed offsets:

- 76px: too high.
- 60px: too high.
- 36px: too low.
- 48px: closer but not robust.

Current fix:

- Dynamically anchor to the prompt input's first text line.
- Add a 6px visual nudge downward.

## Current Known Limitations

- The extension relies on TypingMind internal storage names:
  - `keyval-store`
  - `keyval`
  - `TM_useLastOpenedChatID`
- If TypingMind changes its storage schema, IndexedDB reading may stop working.
- The visible DOM parsing depends on TypingMind's current "Current context length" wording.
- The prompt input anchoring is heuristic. It looks for visible `textarea`, `[contenteditable='true']`, or `[role='textbox']` elements near the lower part of the viewport.
- If TypingMind changes the composer DOM substantially, positioning may need adjustment.

## Safe Future Change Guidelines

When changing the extension:

- Keep it read-only.
- Do not reintroduce a full-document mutation observer.
- Keep text scanning bounded.
- Do not log or transmit chat content.
- Preserve the source priority order unless there is runtime evidence to change it.
- When debugging runtime TypingMind behavior, use temporary instrumentation and remove it after verification.
- Use cache-busted URLs when testing GitHub Pages deployments.

## Useful Commands

These assume you are standing in your local checkout of this repository root.

Syntax check (`node` is optional sanity checking only):

```sh
node --check ./tm-soft-token-modal-reader.js
```

Basic git workflow:

```sh
git status
git diff
git add tm-soft-token-modal-reader.js README.md
git commit -m "Describe your change"
git push
```

## File Map

```text
tm-soft-token-modal-reader.js
```

Single self-contained TypingMind extension. It creates its own DOM, CSS, polling, token reading, IndexedDB lookup, and UI rendering.

```text
README.md
```

This handoff document.

## Handoff Summary For A New Chat

The latest version is a read-only TypingMind soft token widget.

It starts minimized on desktop and appears as a tiny dot on mobile. It uses TypingMind's visible token count when possible, IndexedDB active chat usage when the modal is closed, and a bounded fallback estimate only when needed. It waits about 1500 ms after chat switches before refreshing, to avoid flicker and transient wrong counts. It uses purple when no token source is found.

The canonical user-facing installation URL shape is shown at the top of this document. Update the optional `v=` suffix whenever you redeploy so browsers do not silently cache an older build.