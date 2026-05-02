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
    const agentDebugCounts = Object.create(null);
  
    function agentDebugLog(hypothesisId, location, message, data) {
      agentDebugCounts[message] = (agentDebugCounts[message] || 0) + 1;
      if (agentDebugCounts[message] > 8) return;
      // #region agent log
      fetch('http://127.0.0.1:7494/ingest/61348057-d424-4ab9-a9bb-6fb7fb004de4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d496fb'},body:JSON.stringify({sessionId:'d496fb',runId:'closed-modal-source-pre-fix',hypothesisId,location,message,data,timestamp:Date.now()})}).catch(()=>{});
      // #endregion
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
        agentDebugLog("H1,H5", "tm-soft-token-modal-reader.js:update", "rendered TypingMind-visible value", {
          tokens: tmValue.tokens,
          source: tmValue.source || "visible scan"
        });
        return;
      }
  
      if (CFG.ENABLE_FALLBACK_ESTIMATE) {
        const estimated = estimateVisibleChatTokens();
        if (estimated > 0) {
          render(estimated, "fallback estimate");
          agentDebugLog("H1", "tm-soft-token-modal-reader.js:update", "rendered fallback estimate", {
            tokens: estimated
          });
          return;
        }
      }
  
      renderNotFound();
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
      update();
      scheduleSourceDiscovery();
  
      // A full-document MutationObserver can be triggered by this overlay's own
      // DOM writes. Polling keeps refresh work bounded and avoids feedback loops.
      setInterval(update, CFG.REFRESH_MS);
  
      window.addEventListener("hashchange", () => {
        update();
        scheduleSourceDiscovery();
      });
      window.addEventListener("popstate", () => {
        update();
        scheduleSourceDiscovery();
      });
  
      console.info("[TM Soft Token Warning] Loaded.");
    }
  
    let sourceDiscoveryTimer = null;
    function scheduleSourceDiscovery() {
      if (sourceDiscoveryTimer) window.clearTimeout(sourceDiscoveryTimer);
      sourceDiscoveryTimer = window.setTimeout(() => {
        runSourceDiscovery().catch(() => {});
      }, 1200);
    }
  
    async function runSourceDiscovery() {
      const bodyText = document.body.textContent || "";
      agentDebugLog("H1,H5", "tm-soft-token-modal-reader.js:runSourceDiscovery", "closed-modal DOM/token surface", {
        hasCurrentContextText: /current\s+context\s+length/i.test(bodyText),
        tokenNumbers: extractTokenNumberMentions(bodyText).slice(0, 12),
        numericTextNearLimit: parseTokenishNumbers(bodyText)
          .filter((value) => value >= 80000 && value <= 2000000)
          .slice(0, 12),
        numericTextSources: inspectDomNumericTextSurface(),
        urlPathLength: location.pathname.length,
        hashLength: location.hash.length
      });
  
      const indexedDbSurface = await inspectIndexedDbSurface();
      agentDebugLog("H3", "tm-soft-token-modal-reader.js:runSourceDiscovery", "indexedDB numeric/store surface", indexedDbSurface);
    }
  
    function extractTokenNumberMentions(text) {
      return (text.match(/\d[\d,.]*\s*tokens?/gi) || [])
        .map((value) => parseTokenishNumbers(value)[0])
        .filter((value) => Number.isFinite(value));
    }
  
    function inspectDomNumericTextSurface() {
      const matches = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            const parent = node.parentElement;
            if (!parent || parent.closest("#tm-soft-token-warning, script, style, svg")) {
              return NodeFilter.FILTER_REJECT;
            }
            const numbers = parseTokenishNumbers(node.nodeValue)
              .filter((value) => value >= 80000 && value <= 2000000);
            return numbers.length
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          }
        }
      );
  
      let node;
      while ((node = walker.nextNode()) && matches.length < 20) {
        const parent = node.parentElement;
        const numbers = parseTokenishNumbers(node.nodeValue)
          .filter((value) => value >= 80000 && value <= 2000000);
        const lowerText = node.nodeValue.toLowerCase();
        matches.push({
          numbers,
          tagName: parent.tagName,
          dataElementId: parent.getAttribute("data-element-id") || "",
          role: parent.getAttribute("role") || "",
          hasTokenWord: lowerText.includes("token"),
          hasContextWord: lowerText.includes("context"),
          hasCostWord: lowerText.includes("cost") || lowerText.includes("price") || lowerText.includes("$"),
          textLength: node.nodeValue.length,
          parentTextLength: parent.textContent ? parent.textContent.length : 0,
          nearestDialog: Boolean(parent.closest('[role="dialog"], [aria-modal="true"]'))
        });
      }
  
      return matches;
    }
  
    async function inspectIndexedDbSurface() {
      if (!indexedDB.databases) {
        return { supported: false };
      }
  
      const databases = await indexedDB.databases();
      const summaries = [];
      for (const dbInfo of databases.slice(0, 8)) {
        if (!dbInfo.name) continue;
        const summary = await inspectDatabase(dbInfo.name).catch((error) => ({
          name: dbInfo.name,
          errorName: error && error.name ? error.name : "unknown"
        }));
        summaries.push(summary);
      }
      return { supported: true, databases: summaries };
    }
  
    function inspectDatabase(name) {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const storeNames = Array.from(db.objectStoreNames);
          const interestingStoreNames = storeNames.slice(0, 8);
  
          if (!interestingStoreNames.length) {
            db.close();
            resolve({ name, storeNames: storeNames.slice(0, 20), stores: [] });
            return;
          }
  
          const transaction = db.transaction(interestingStoreNames, "readonly");
          const stores = [];
          transaction.oncomplete = () => {
            db.close();
            resolve({ name, storeNames: storeNames.slice(0, 20), stores });
          };
          transaction.onerror = () => {
            db.close();
            reject(transaction.error);
          };
  
          for (const storeName of interestingStoreNames) {
            const store = transaction.objectStore(storeName);
            const storeSummary = {
              name: storeName,
              keyPath: store.keyPath,
              indexNames: Array.from(store.indexNames).slice(0, 20),
              sampleRecords: [],
              numericFields: []
            };
            stores.push(storeSummary);
  
            let seen = 0;
            const cursorRequest = store.openCursor();
            cursorRequest.onsuccess = () => {
              const cursor = cursorRequest.result;
              if (!cursor || seen >= 50) return;
              seen += 1;
              if (storeSummary.sampleRecords.length < 20) {
                storeSummary.sampleRecords.push({
                  key: summarizeIndexedDbKey(cursor.key),
                  value: summarizeStoredValue(cursor.value)
                });
              }
              collectNumericFields(cursor.value, `${name}.${storeName}`, storeSummary.numericFields, 40);
              cursor.continue();
            };
          }
        };
      });
    }
  
    function summarizeIndexedDbKey(key) {
      if (typeof key === "string") {
        return {
          type: "string",
          length: key.length,
          hasChatWord: key.toLowerCase().includes("chat"),
          hasMessageWord: key.toLowerCase().includes("message"),
          hasTokenWord: key.toLowerCase().includes("token"),
          hasContextWord: key.toLowerCase().includes("context")
        };
      }
  
      return {
        type: typeof key,
        isArray: Array.isArray(key)
      };
    }
  
    function summarizeStoredValue(value) {
      if (value === null) return { type: "null" };
      if (Array.isArray(value)) {
        return {
          type: "array",
          length: value.length,
          firstItemType: value.length ? typeof value[0] : "empty"
        };
      }
      if (typeof value === "object") {
        return {
          type: "object",
          ownKeys: Object.keys(value).slice(0, 20)
        };
      }
      if (typeof value === "string") {
        return {
          type: "string",
          length: value.length,
          tokenNumbers: extractTokenNumberMentions(value).slice(0, 8),
          numericNearLimit: parseTokenishNumbers(value)
            .filter((number) => number >= 80000 && number <= 2000000)
            .slice(0, 8)
        };
      }
      return {
        type: typeof value,
        isNumber: typeof value === "number" ? Number.isFinite(value) : false
      };
    }
  
    function collectNumericFields(value, source, output, limit, path = "", depth = 0) {
      if (!value || output.length >= limit || depth > 4) return;
  
      if (Array.isArray(value)) {
        for (let index = 0; index < Math.min(value.length, 12); index += 1) {
          collectNumericFields(value[index], source, output, limit, `${path}[]`, depth + 1);
        }
        return;
      }
  
      if (typeof value !== "object") return;
  
      for (const [key, fieldValue] of Object.entries(value)) {
        if (output.length >= limit) break;
        const fieldPath = path ? `${path}.${key}` : key;
        if (typeof fieldValue === "number" && Number.isFinite(fieldValue)) {
          const lowerPath = fieldPath.toLowerCase();
          if (
            lowerPath.includes("token") ||
            lowerPath.includes("context") ||
            lowerPath.includes("size") ||
            (fieldValue >= 80000 && fieldValue <= 2000000)
          ) {
            output.push({ source, fieldPath, value: fieldValue });
          }
        } else if (typeof fieldValue === "string") {
          const lowerPath = fieldPath.toLowerCase();
          const numbers = parseTokenishNumbers(fieldValue)
            .filter((number) => number >= 80000 && number <= 2000000)
            .slice(0, 8);
          if (
            numbers.length &&
            (
              lowerPath.includes("token") ||
              lowerPath.includes("context") ||
              lowerPath.includes("size") ||
              lowerPath.includes("count") ||
              lowerPath.includes("stat")
            )
          ) {
            output.push({ source, fieldPath, numbers });
          }
        } else if (typeof fieldValue === "object" && fieldValue) {
          collectNumericFields(fieldValue, source, output, limit, fieldPath, depth + 1);
        }
      }
    }
  
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  })();
  
