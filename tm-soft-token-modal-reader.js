(() => {
    "use strict";
  
    /********************************************************************
     * TypingMind Soft Token Warning Overlay
     *
     * Goal:
     * - Use TypingMind's own visible context/token count when available.
     * - Show a separate soft warning overlay:
     *   Green  = below ORANGE_AT_TOKENS
     *   Orange = ORANGE_AT_TOKENS to RED_AT_TOKENS
     *   Red    = RED_AT_TOKENS and above
     *
     * Read-only:
     * - Does not change model settings.
     * - Does not change context length.
     * - Does not write TypingMind data.
     * - Does not intercept requests.
     ********************************************************************/
  
    if (window.__TM_SOFT_TOKEN_WARNING_LOADED__) {
      console.info("[TM Soft Token Warning] Already loaded.");
      return;
    }
    window.__TM_SOFT_TOKEN_WARNING_LOADED__ = true;
  
    const CFG = {
      ORANGE_AT_TOKENS: 80000,
      RED_AT_TOKENS: 100000,
  
      // If true, use visible chat text as fallback when the TypingMind UI token
      // number cannot be found.
      ENABLE_FALLBACK_ESTIMATE: true,
  
      // Refresh rate.
      REFRESH_MS: 2000,
  
      // Optional multiplier for fallback estimate only.
      FALLBACK_TOKEN_MULTIPLIER: 1.1,
  
      // Keep fallback scanning bounded on very large chats.
      MAX_FALLBACK_TEXT_CHARS: 200000,
      MAX_FALLBACK_TEXT_NODES: 1500,
      MAX_TOKEN_SCAN_TEXT_CHARS: 100000,
      MAX_TOKEN_SCAN_TEXT_NODES: 1000
    };
  
    let collapsed = false;
    let indexedDbContextValue = null;
    let indexedDbContextRefreshInFlight = false;
    let indexedDbContextRefreshQueued = false;
    const agentDebugCounts = Object.create(null);
    let lastRenderSignature = "";
    let lastActiveHintSignature = "";
  
    function agentDebugLog(hypothesisId, location, message, data) {
      agentDebugCounts[message] = (agentDebugCounts[message] || 0) + 1;
      if (agentDebugCounts[message] > 20) return;
      // #region agent log
      fetch('http://127.0.0.1:7494/ingest/61348057-d424-4ab9-a9bb-6fb7fb004de4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d496fb'},body:JSON.stringify({sessionId:'d496fb',runId:'chat-switch-debug-1',hypothesisId,location,message,data,timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    }
  
    function hashShort(value) {
      const text = String(value || "");
      let hash = 0;
      for (let index = 0; index < text.length; index += 1) {
        hash = ((hash * 31) + text.charCodeAt(index)) >>> 0;
      }
      return text ? hash.toString(36) : "";
    }
  
    function getActiveDebugHints() {
      const lastOpened = parseStoredString(localStorage.getItem("TM_useLastOpenedChatID"));
      return {
        lastOpenedLength: lastOpened.length,
        lastOpenedHash: hashShort(lastOpened),
        locationHashLength: location.hash.length,
        locationHashHash: hashShort(location.hash)
      };
    }
  
    function getActiveHintSignature() {
      const hints = getActiveDebugHints();
      return `${hints.lastOpenedHash}:${hints.locationHashHash}`;
    }
  
    function createOverlay() {
      let el = document.getElementById("tm-soft-token-warning");
      if (el) return el;
  
      const style = document.createElement("style");
      style.id = "tm-soft-token-warning-style";
      style.textContent = `
        #tm-soft-token-warning {
          position: fixed;
          right: 16px;
          bottom: 16px;
          width: 292px;
          z-index: 2147483000;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 12px;
          color: #111827;
          background: rgba(255,255,255,0.95);
          border: 1px solid rgba(17,24,39,0.14);
          border-radius: 14px;
          box-shadow: 0 14px 36px rgba(0,0,0,0.18);
          backdrop-filter: blur(10px);
          overflow: hidden;
        }
  
        @media (prefers-color-scheme: dark) {
          #tm-soft-token-warning {
            color: #f9fafb;
            background: rgba(17,24,39,0.93);
            border-color: rgba(255,255,255,0.16);
          }
        }
  
        #tm-soft-token-warning .tmstw-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 9px 10px 6px 10px;
        }
  
        #tm-soft-token-warning .tmstw-title {
          display: flex;
          align-items: center;
          gap: 7px;
          font-weight: 700;
        }
  
        #tm-soft-token-warning .tmstw-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: #22c55e;
          box-shadow: 0 0 0 3px rgba(34,197,94,0.15);
        }
  
        #tm-soft-token-warning.tmstw-orange .tmstw-dot {
          background: #f59e0b;
          box-shadow: 0 0 0 3px rgba(245,158,11,0.18);
        }
  
        #tm-soft-token-warning.tmstw-red .tmstw-dot {
          background: #ef4444;
          box-shadow: 0 0 0 3px rgba(239,68,68,0.20);
        }
  
        #tm-soft-token-warning .tmstw-toggle {
          appearance: none;
          border: 0;
          background: transparent;
          color: inherit;
          opacity: 0.72;
          cursor: pointer;
          font-size: 14px;
          padding: 2px 5px;
          border-radius: 6px;
        }
  
        #tm-soft-token-warning .tmstw-toggle:hover {
          opacity: 1;
          background: rgba(127,127,127,0.12);
        }
  
        #tm-soft-token-warning .tmstw-body {
          padding: 0 10px 10px 10px;
        }
  
        #tm-soft-token-warning.tmstw-collapsed .tmstw-body {
          display: none;
        }
  
        #tm-soft-token-warning .tmstw-bar-wrap {
          height: 8px;
          width: 100%;
          background: rgba(127,127,127,0.20);
          border-radius: 999px;
          overflow: hidden;
          margin: 3px 0 8px 0;
        }
  
        #tm-soft-token-warning .tmstw-bar {
          height: 100%;
          width: 0%;
          border-radius: 999px;
          background: #22c55e;
          transition: width 160ms ease, background 160ms ease;
        }
  
        #tm-soft-token-warning.tmstw-orange .tmstw-bar {
          background: #f59e0b;
        }
  
        #tm-soft-token-warning.tmstw-red .tmstw-bar {
          background: #ef4444;
        }
  
        #tm-soft-token-warning .tmstw-main {
          font-weight: 700;
          margin-bottom: 3px;
        }
  
        #tm-soft-token-warning .tmstw-sub,
        #tm-soft-token-warning .tmstw-hint {
          opacity: 0.78;
          font-size: 11px;
          line-height: 1.35;
        }
  
        #tm-soft-token-warning .tmstw-hint {
          margin-top: 7px;
          padding-top: 7px;
          border-top: 1px solid rgba(127,127,127,0.17);
        }
  
        #tm-soft-token-warning.tmstw-red .tmstw-hint {
          opacity: 1;
          font-weight: 700;
        }
  
        @media (max-width: 700px) {
          #tm-soft-token-warning {
            left: 12px;
            right: 12px;
            bottom: 12px;
            width: auto;
          }
        }
      `;
  
      document.head.appendChild(style);
  
      el = document.createElement("div");
      el.id = "tm-soft-token-warning";
      el.className = "tmstw-green";
      el.innerHTML = `
        <div class="tmstw-head">
          <div class="tmstw-title">
            <span class="tmstw-dot"></span>
            <span>Soft token limit</span>
          </div>
          <button class="tmstw-toggle" title="Collapse / expand">▾</button>
        </div>
        <div class="tmstw-body">
          <div class="tmstw-bar-wrap">
            <div class="tmstw-bar"></div>
          </div>
          <div class="tmstw-main">Looking for TypingMind token count…</div>
          <div class="tmstw-sub">Green < 80k · Orange 80k–100k · Red ≥ 100k</div>
          <div class="tmstw-hint">Tip: switch TypingMind's built-in display to context length/tokens, not cost.</div>
        </div>
      `;
  
      document.body.appendChild(el);
  
      el.querySelector(".tmstw-toggle").addEventListener("click", () => {
        collapsed = !collapsed;
        el.classList.toggle("tmstw-collapsed", collapsed);
        el.querySelector(".tmstw-toggle").textContent = collapsed ? "▴" : "▾";
      });
  
      return el;
    }
  
    function render(tokenCount, source) {
      const el = createOverlay();
  
      let band = "green";
      if (tokenCount >= CFG.RED_AT_TOKENS) {
        band = "red";
      } else if (tokenCount >= CFG.ORANGE_AT_TOKENS) {
        band = "orange";
      }
  
      el.classList.remove("tmstw-green", "tmstw-orange", "tmstw-red");
      el.classList.add(`tmstw-${band}`);
      el.classList.toggle("tmstw-collapsed", collapsed);
  
      const bar = el.querySelector(".tmstw-bar");
      const main = el.querySelector(".tmstw-main");
      const sub = el.querySelector(".tmstw-sub");
      const hint = el.querySelector(".tmstw-hint");
  
      const pctToRed = Math.min(100, Math.round((tokenCount / CFG.RED_AT_TOKENS) * 100));
      bar.style.width = `${pctToRed}%`;
  
      main.textContent = `${formatTokens(tokenCount)} tokens · ${pctToRed}% of red limit`;
      sub.textContent = `Source: ${source} · Orange at ${formatTokens(CFG.ORANGE_AT_TOKENS)} · Red at ${formatTokens(CFG.RED_AT_TOKENS)}`;
  
      if (band === "green") {
        hint.textContent = "Green: no action needed yet.";
      } else if (band === "orange") {
        hint.textContent = "Orange: prepare a handoff summary or compacting point soon.";
      } else {
        hint.textContent = "Red: soft limit reached. Move, fork, or compact this chat now.";
      }
    }
  
    function renderNotFound() {
      const el = createOverlay();
      el.classList.remove("tmstw-green", "tmstw-orange", "tmstw-red");
      el.classList.add("tmstw-orange");
  
      el.querySelector(".tmstw-bar").style.width = "0%";
      el.querySelector(".tmstw-main").textContent = "Could not find TypingMind token count";
      el.querySelector(".tmstw-sub").textContent = "Switch TypingMind's own display to context length/tokens.";
      el.querySelector(".tmstw-hint").textContent =
        "No warning is possible until a token count is visible, unless fallback estimate is enabled.";
    }
  
    function formatTokens(n) {
      if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
      if (n >= 1000) return `${Math.round(n / 1000)}k`;
      return `${Math.round(n)}`;
    }
  
    /********************************************************************
     * Main strategy:
     * 1. Try reading TypingMind's visible token/context counter from the UI.
     * 2. If unavailable, optionally estimate from visible chat text.
     ********************************************************************/
  
    function update() {
      const tmValue = findTypingMindVisibleTokenCount();
  
      if (tmValue && tmValue.tokens > 0) {
        render(tmValue.tokens, "TypingMind UI");
        logRenderDecision("TypingMind UI", tmValue.tokens, tmValue.source || "visible scan");
        return;
      }
  
      if (indexedDbContextValue && indexedDbContextValue.tokens > 0) {
        render(indexedDbContextValue.tokens, "TypingMind data");
        logRenderDecision("TypingMind data", indexedDbContextValue.tokens, indexedDbContextValue.source);
        return;
      }
  
      if (CFG.ENABLE_FALLBACK_ESTIMATE) {
        const estimated = estimateVisibleChatTokens();
        if (estimated > 0) {
          render(estimated, "fallback estimate");
          logRenderDecision("fallback estimate", estimated, "visible text estimate");
          return;
        }
      }
  
      renderNotFound();
      logRenderDecision("not found", 0, "no source");
    }
  
    function logRenderDecision(label, tokens, source) {
      const hints = getActiveDebugHints();
      const signature = `${label}:${tokens}:${hints.lastOpenedHash}:${hints.locationHashHash}`;
      if (signature === lastRenderSignature) return;
      lastRenderSignature = signature;
      agentDebugLog("H3,H4", "tm-soft-token-modal-reader.js:update", "render source changed", {
        label,
        tokens,
        source,
        hasIndexedDbContext: Boolean(indexedDbContextValue && indexedDbContextValue.tokens),
        indexedDbTokens: indexedDbContextValue && indexedDbContextValue.tokens ? indexedDbContextValue.tokens : null,
        activeHints: hints
      });
    }
  
    function findTypingMindVisibleTokenCount() {
      const currentContextValue = findCurrentContextLengthFromText(document.body.textContent || "");
      if (currentContextValue) {
        return currentContextValue;
      }
  
      const lines = collectTextLines(
        document.body,
        CFG.MAX_TOKEN_SCAN_TEXT_NODES,
        CFG.MAX_TOKEN_SCAN_TEXT_CHARS
      );
  
      const candidates = [];
  
      for (const line of lines) {
        if (line.length > 180) continue;
  
        const lower = line.toLowerCase();
  
        // Prefer lines that look related to context/tokens.
        const hasTokenWord =
          lower.includes("token") ||
          lower.includes("context") ||
          lower.includes("ctx");
  
        // Avoid prices/costs.
        const looksLikeMoney =
          line.includes("$") ||
          lower.includes("usd") ||
          lower.includes("cost") ||
          lower.includes("price");
  
        if (looksLikeMoney) continue;
  
        // Example matches:
        // "82k tokens"
        // "82,123 tokens"
        // "82K / 1M"
        // "Context: 82k / 1M"
        // "82123 / 1000000 tokens"
        const parsedNumbers = parseTokenishNumbers(line);
  
        if (!parsedNumbers.length) continue;
  
        for (const parsed of parsedNumbers) {
          let score = 0;
  
          if (hasTokenWord) score += 5;
          if (line.includes("/") || lower.includes("of")) score += 2;
          if (parsed >= 1000) score += 1;
          if (parsed > 2000000) score -= 10;
  
          // Your relevant range is around 80k–100k, but allow lower/higher.
          if (parsed >= 1000 && parsed <= 2000000) {
            candidates.push({
              tokens: parsed,
              line,
              score
            });
          }
        }
      }
  
      if (!candidates.length) return null;
  
      candidates.sort((a, b) => b.score - a.score || b.tokens - a.tokens);
  
      return candidates[0];
    }
  
    function findCurrentContextLengthFromText(text) {
      const match = text.match(/current\s+context\s+length[\s\S]{0,80}?(\d[\d,.]*)\s*tokens?/i);
      if (!match) return null;
  
      const tokens = parseTokenishNumbers(match[1])[0];
      if (!tokens || tokens < 1000 || tokens > 2000000) return null;
  
      return {
        tokens,
        score: 100,
        source: "Current context length",
        scannedLineCount: null,
        hasBodyContextLengthText: true
      };
    }
  
    function collectTextLines(root, maxNodes, maxChars) {
      const lines = [];
      let nodeCount = 0;
      let totalLength = 0;
  
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
  
            if (
              parent.closest(
                "#tm-soft-token-warning, script, style, svg"
              )
            ) {
              return NodeFilter.FILTER_REJECT;
            }
  
            const value = node.nodeValue.trim();
            if (!value) return NodeFilter.FILTER_REJECT;
  
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );
  
      let node;
      while ((node = walker.nextNode())) {
        const value = node.nodeValue.trim();
        lines.push(value);
        nodeCount += 1;
        totalLength += value.length;
  
        if (nodeCount >= maxNodes || totalLength >= maxChars) {
          break;
        }
      }
  
      return lines;
    }
  
    function parseTokenishNumbers(text) {
      const results = [];
  
      // Matches:
      // 82k, 82 K, 82.5k, 1M, 1.2M, 82,123, 82123
      const regex = /(\d+(?:[.,]\d+)?)(?:\s*)(k|m|tokens?|tok)?/gi;
  
      let match;
      while ((match = regex.exec(text)) !== null) {
        const rawNumber = match[1];
        const suffix = (match[2] || "").toLowerCase();
  
        let value;
  
        // If suffix is k/m, comma/dot can be decimal separator.
        if (suffix === "k" || suffix === "m") {
          value = parseFloat(rawNumber.replace(",", "."));
          if (!Number.isFinite(value)) continue;
  
          if (suffix === "k") value *= 1000;
          if (suffix === "m") value *= 1000000;
        } else {
          // Otherwise, treat comma as thousands separator.
          value = Number(rawNumber.replace(/,/g, ""));
          if (!Number.isFinite(value)) continue;
        }
  
        value = Math.round(value);
  
        // Ignore tiny UI numbers like temperatures, dates, menu badges, etc.
        if (value >= 1000) {
          results.push(value);
        }
      }
  
      return results;
    }
  
    /********************************************************************
     * Fallback estimate only.
     * This is used only if TypingMind's own visible token count is not found.
     ********************************************************************/
  
    function estimateVisibleChatTokens() {
      const root =
        document.querySelector('[data-element-id="chat-message-list"]') ||
        document.querySelector('[data-element-id*="message"]') ||
        document.querySelector("main") ||
        document.body;
  
      const text = extractVisibleText(root);
  
      if (!text.trim()) return 0;
  
      // Rough English/code heuristic:
      // 1 token ≈ 4 chars, with word-count floor.
      const normalized = text.replace(/\s+/g, " ").trim();
      const charEstimate = normalized.length / 4;
      const words = normalized.match(/\S+/g) || [];
      const wordEstimate = words.length * 1.3;
  
      return Math.ceil(
        Math.max(charEstimate, wordEstimate) * CFG.FALLBACK_TOKEN_MULTIPLIER
      );
    }
  
    function extractVisibleText(root) {
      const pieces = [];
      let nodeCount = 0;
      let totalLength = 0;
  
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
  
            if (
              parent.closest(
                "#tm-soft-token-warning, script, style, svg, nav, aside, header, footer"
              )
            ) {
              return NodeFilter.FILTER_REJECT;
            }
  
            const style = getComputedStyle(parent);
            if (
              style.display === "none" ||
              style.visibility === "hidden" ||
              style.opacity === "0"
            ) {
              return NodeFilter.FILTER_REJECT;
            }
  
            const value = node.nodeValue.trim();
            if (!value) return NodeFilter.FILTER_REJECT;
  
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );
  
      let node;
      while ((node = walker.nextNode())) {
        const value = node.nodeValue.trim();
        pieces.push(value);
        nodeCount += 1;
        totalLength += value.length;
  
        if (
          nodeCount >= CFG.MAX_FALLBACK_TEXT_NODES ||
          totalLength >= CFG.MAX_FALLBACK_TEXT_CHARS
        ) {
          break;
        }
      }
  
      return pieces.join("\n");
    }
  
    function start() {
      createOverlay();
      refreshActiveChatContextFromIndexedDb().then(update).catch(() => {});
      update();
  
      // A full-document MutationObserver can be triggered by this overlay's own
      // DOM writes. Polling keeps refresh work bounded and avoids feedback loops.
      setInterval(update, CFG.REFRESH_MS);
      setInterval(() => {
        refreshActiveChatContextFromIndexedDb().then(update).catch(() => {});
      }, CFG.REFRESH_MS * 3);
      setInterval(() => {
        const hints = getActiveDebugHints();
        const signature = `${hints.lastOpenedHash}:${hints.locationHashHash}`;
        if (signature === lastActiveHintSignature) return;
        lastActiveHintSignature = signature;
        agentDebugLog("H1,H2", "tm-soft-token-modal-reader.js:start", "active chat hint changed", hints);
        indexedDbContextValue = null;
        refreshActiveChatContextFromIndexedDb().then(update).catch(() => {});
        update();
      }, 750);
  
      window.addEventListener("hashchange", () => {
        agentDebugLog("H2", "tm-soft-token-modal-reader.js:hashchange", "navigation event fired", getActiveDebugHints());
        indexedDbContextValue = null;
        refreshActiveChatContextFromIndexedDb().then(update).catch(() => {});
        update();
      });
      window.addEventListener("popstate", () => {
        agentDebugLog("H2", "tm-soft-token-modal-reader.js:popstate", "navigation event fired", getActiveDebugHints());
        indexedDbContextValue = null;
        refreshActiveChatContextFromIndexedDb().then(update).catch(() => {});
        update();
      });
      document.addEventListener("click", (event) => {
        const target = event.target && event.target.closest
          ? event.target.closest("nav a, nav button, aside a, aside button, [role='navigation'] a, [role='navigation'] button")
          : null;
        if (!target) return;
        agentDebugLog("H2", "tm-soft-token-modal-reader.js:start", "left navigation click observed", getActiveDebugHints());
      }, true);
  
      console.info("[TM Soft Token Warning] Loaded.");
    }
  
    function parseStoredString(value) {
      if (!value) return "";
      try {
        const parsed = JSON.parse(value);
        return typeof parsed === "string" ? parsed : value;
      } catch (_) {
        return value;
      }
    }
  
    async function refreshActiveChatContextFromIndexedDb() {
      if (indexedDbContextRefreshInFlight) {
        indexedDbContextRefreshQueued = true;
        agentDebugLog("H5", "tm-soft-token-modal-reader.js:refreshActiveChatContextFromIndexedDb", "refresh skipped while in flight", getActiveDebugHints());
        return indexedDbContextValue;
      }
      indexedDbContextRefreshInFlight = true;
      const startHints = getActiveDebugHints();
      const startSignature = getActiveHintSignature();
      agentDebugLog("H1,H5", "tm-soft-token-modal-reader.js:refreshActiveChatContextFromIndexedDb", "refresh started", startHints);
      try {
        const value = await readActiveChatContextFromIndexedDb();
        const endHints = getActiveDebugHints();
        const endSignature = getActiveHintSignature();
        const activeChatChangedDuringRead = startSignature !== endSignature;
        if (activeChatChangedDuringRead) {
          indexedDbContextRefreshQueued = true;
        } else if (value && value.tokens > 0) {
          indexedDbContextValue = value;
        }
        agentDebugLog("H1,H3", "tm-soft-token-modal-reader.js:refreshActiveChatContextFromIndexedDb", "refresh finished", {
          startHints,
          endHints,
          activeChatChangedDuringRead,
          selectedTokens: value && value.tokens ? value.tokens : null,
          selectedMessageCount: value && value.messageCount ? value.messageCount : null,
          retainedTokens: indexedDbContextValue && indexedDbContextValue.tokens ? indexedDbContextValue.tokens : null
        });
        return indexedDbContextValue;
      } finally {
        indexedDbContextRefreshInFlight = false;
        if (indexedDbContextRefreshQueued) {
          indexedDbContextRefreshQueued = false;
          refreshActiveChatContextFromIndexedDb().then(update).catch(() => {});
        }
      }
    }
  
    function readActiveChatContextFromIndexedDb() {
      const lastOpened = parseStoredString(localStorage.getItem("TM_useLastOpenedChatID"));
      if (!lastOpened) {
        agentDebugLog("H1,H3", "tm-soft-token-modal-reader.js:readActiveChatContextFromIndexedDb", "missing last opened chat id", getActiveDebugHints());
        return Promise.resolve(null);
      }
  
      return new Promise((resolve, reject) => {
        const request = indexedDB.open("keyval-store");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("keyval")) {
            db.close();
            resolve(null);
            return;
          }
  
          const transaction = db.transaction("keyval", "readonly");
          const store = transaction.objectStore("keyval");
          const cursorRequest = store.openCursor();
          let resolved = false;
  
          transaction.oncomplete = () => {
            db.close();
            if (!resolved) resolve(null);
          };
          transaction.onerror = () => {
            db.close();
            reject(transaction.error);
          };
  
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
  
            const value = cursor.value;
            if (
              value &&
              typeof value === "object" &&
              Array.isArray(value.messages) &&
              (value.id === lastOpened || value.chatID === lastOpened)
            ) {
              const tokens = getLastUsageTotalTokens(value.messages);
              if (tokens && tokens >= 1000 && tokens <= 2000000) {
                resolved = true;
                const tokenUsage = value.tokenUsage && typeof value.tokenUsage === "object"
                  ? value.tokenUsage
                  : {};
                resolve({
                  tokens,
                  source: "active chat usage",
                  messageCount: value.messages.length,
                  totalTokens: numberOrNull(tokenUsage.totalTokens),
                  totalCachedTokens: numberOrNull(tokenUsage.totalCachedTokens)
                });
                return;
              }
            }
  
            cursor.continue();
          };
        };
      });
    }
  
    function getLastUsageTotalTokens(messages) {
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const usage = messages[index] && messages[index].usage;
        const totalTokens = usage && numberOrNull(usage.total_tokens);
        if (totalTokens) return totalTokens;
      }
      return null;
    }
  
    function numberOrNull(value) {
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }
  
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  })();
  
