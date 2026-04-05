(() => {
  if (
    !window.HSRCharacterCatalog ||
    !window.HSRConfigModel ||
    !window.HSRSelectors ||
    !window.HSRSplitter ||
    !window.HSRStickers
  ) {
    return;
  }

  document.documentElement.classList.add("hsr-booting");

  const catalog = window.HSRCharacterCatalog;
  const configModel = window.HSRConfigModel;
  const CONFIG_KEY = configModel.CONFIG_KEY;
  const RENDER_VERSION = "hsr-render-v11-gemini-live-preview";
  const STREAM_STABLE_MS = 1400;
  const STREAM_FALLBACK_FINALIZE_MS = 12000;
  const GEMINI_FORCE_FINALIZE_MS = 2200;
  const FIXED_HEADER_ID = "hsr-fixed-header";
  const state = {
    siteKey: configModel.detectSiteFromLocation(window.location),
    config: configModel.getRuntimeSiteProfile(
      null,
      configModel.detectSiteFromLocation(window.location)
    ),
    observer: null,
    processTimer: null,
    assistantTurnCounter: 0,
    liveAssistantFinalizedCount: 0,
    turnMeta: new WeakMap(),
    revealTimers: new WeakMap(),
    streamHiddenRoots: new WeakMap(),
    streamMeta: new WeakMap(),
    interactionBound: false
  };

  function getConfigFromStorage() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(CONFIG_KEY, (result) => {
        resolve(result[CONFIG_KEY] || null);
      });
    });
  }

  function setConfigToStorage(config) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [CONFIG_KEY]: config }, resolve);
    });
  }

  function hashString(input) {
    let hash = 5381;
    for (let i = 0; i < input.length; i += 1) {
      hash = (hash * 33) ^ input.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
  }

  function computeContentHash(contentRoot) {
    const parts = [];
    const walker = document.createTreeWalker(contentRoot, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.parentElement) {
          return NodeFilter.FILTER_REJECT;
        }
        if (
          node.parentElement.closest(
            ".hsr-role-meta, .hsr-random-sticker, .hsr-split-shell"
          )
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        const value = String(node.nodeValue || "").trim();
        if (!value) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode()) {
      parts.push(String(walker.currentNode.nodeValue || "").trim());
    }

    const text = parts.join(" ").replace(/\s+/g, " ").trim();
    const mediaCount = contentRoot.querySelectorAll("img,pre,table").length;
    return hashString(`${RENDER_VERSION}|${text}|${mediaCount}`);
  }

  function resolveActors() {
    const character = catalog.getCharacter(state.config.assistantCharacterId);
    const userName = String(state.config.userName || "").trim().slice(0, 24) || "오공이";
    return {
      assistantName: character.displayName,
      assistantIcon: chrome.runtime.getURL(`assets/icons/${character.iconFile}`),
      userName,
      userIcon: chrome.runtime.getURL(catalog.DEFAULT_USER_ICON)
    };
  }

  function ensureFixedHeader() {
    let header = document.getElementById(FIXED_HEADER_ID);
    if (!header) {
      header = document.createElement("section");
      header.id = FIXED_HEADER_ID;
      header.className = "hsr-fixed-header";
      header.setAttribute("aria-hidden", "true");

      const title = document.createElement("h1");
      title.className = "hsr-fixed-header-title";

      const subtitle = document.createElement("p");
      subtitle.className = "hsr-fixed-header-subtitle";

      header.appendChild(title);
      header.appendChild(subtitle);
      document.body.appendChild(header);
    }

    if (header.parentElement !== document.body) {
      document.body.appendChild(header);
    }

    const titleEl = header.querySelector(".hsr-fixed-header-title");
    const subtitleEl = header.querySelector(".hsr-fixed-header-subtitle");
    if (titleEl) {
      titleEl.textContent = state.config.headerTitle;
    }
    if (subtitleEl) {
      subtitleEl.textContent = state.config.headerSubtitle;
    }
  }

  function removeFixedHeader() {
    const header = document.getElementById(FIXED_HEADER_ID);
    if (header) {
      header.remove();
    }
  }

  function ensureRoleMeta(turnNode, role, contentRoot) {
    let meta = turnNode.querySelector(":scope > .hsr-role-meta");

    if (!meta) {
      meta = document.createElement("div");
      meta.className = "hsr-role-meta";

      const avatar = document.createElement("img");
      avatar.className = "hsr-role-avatar";
      avatar.alt = "";

      const name = document.createElement("span");
      name.className = "hsr-role-name";

      meta.appendChild(avatar);
      meta.appendChild(name);
      turnNode.prepend(meta);
    }

    const actors = resolveActors();
    const avatarEl = meta.querySelector(".hsr-role-avatar");
    const nameEl = meta.querySelector(".hsr-role-name");

    if (role === "assistant") {
      avatarEl.src = actors.assistantIcon;
      nameEl.textContent = actors.assistantName;
    } else {
      avatarEl.src = actors.userIcon;
      nameEl.textContent = actors.userName;
    }

    meta.dataset.role = role;
  }

  function ensureBlockWrap(block, kind) {
    if (!block || !block.parentElement) {
      return null;
    }

    let wrapper = block.parentElement;

    if (!wrapper.classList.contains("hsr-block-wrap")) {
      wrapper = document.createElement("div");
      wrapper.className = "hsr-block-wrap";
      block.before(wrapper);
      wrapper.appendChild(block);
    }

    wrapper.classList.add(`hsr-block-${kind}`);
    return wrapper;
  }

  function hasVisibleText(value) {
    return Boolean(String(value || "").replace(/[\s\u200b\u200c\u200d\u2060\ufeff]/g, ""));
  }

  function canSoftSplitFormattedParagraph(block) {
    if (
      state.siteKey !== "gemini" ||
      !block ||
      !(block instanceof HTMLElement) ||
      !window.HSRSelectors.isParagraphCandidate(block)
    ) {
      return false;
    }

    const text = String(block.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) {
      return false;
    }

    const minSplitChars = Math.max(96, Math.floor(state.config.splitMaxChars * 0.78));
    if (text.length < minSplitChars) {
      return false;
    }

    const banned = block.querySelector(
      "a,code,pre,table,ul,ol,blockquote,img,video,svg,button,details,summary,kbd,mark,sup,sub,math,mjx-container"
    );

    return !banned;
  }

  function isSkippableEmptyBlock(block, kind) {
    if (!block || !(block instanceof HTMLElement)) {
      return true;
    }

    // Divider blocks tend to collapse into tiny empty bubbles in the HSR shell.
    if (kind === "hr") {
      return true;
    }

    const text = block.innerText || block.textContent || "";
    if (hasVisibleText(text)) {
      return false;
    }

    const hasRichContent = Boolean(
      block.querySelector(
        "img,video,picture,svg,pre,table,ul,ol,blockquote,math,mjx-container,iframe,button,a[href],input,textarea"
      )
    );

    return !hasRichContent;
  }

  function hasDecoratedAssistantContent(contentRoot) {
    if (!contentRoot || !(contentRoot instanceof HTMLElement)) {
      return false;
    }

    return Boolean(
      contentRoot.querySelector(
        ":scope > .hsr-block-wrap, :scope > .hsr-split-shell, :scope > .hsr-image-group, :scope > .hsr-random-sticker"
      )
    );
  }

  function isGeminiStaleStreamingTurn(turnNode) {
    if (state.siteKey !== "gemini" || !turnNode || !(turnNode instanceof HTMLElement)) {
      return false;
    }

    const processedHash = String(turnNode.dataset.hsrProcessedHash || "");
    if (!processedHash) {
      return false;
    }

    const rawContentRoot = window.HSRSelectors.getPrimaryContentRoot(turnNode, "assistant");
    if (!rawContentRoot || !(rawContentRoot instanceof HTMLElement)) {
      return false;
    }

    const contentRoot =
      rawContentRoot.matches("p,span,code,strong,em")
        ? rawContentRoot.parentElement || rawContentRoot
        : rawContentRoot;

    const currentHash = computeContentHash(contentRoot);
    if (currentHash !== processedHash) {
      return false;
    }

    return hasVisibleText(extractStreamingText(contentRoot));
  }

  function isLikelyImageSourceLink(linkNode) {
    if (!linkNode || !(linkNode instanceof HTMLAnchorElement)) {
      return false;
    }

    const text = String(linkNode.textContent || "").replace(/\s+/g, " ").trim();
    const href = String(linkNode.getAttribute("href") || "").trim();
    if (!href) {
      return false;
    }

    const lower = `${text} ${href}`.toLowerCase();
    if (
      /(unsplash|pexels|pixabay|wikimedia|wikipedia|fandom|tvtropes|stockphoto|imagecarousel|source)/.test(
        lower
      )
    ) {
      return true;
    }

    const compact = text.replace(/\s+/g, "");
    if (compact && compact.length <= 24 && !compact.includes("/") && !compact.includes("@")) {
      return true;
    }

    return false;
  }

  function pruneEmptyBubbles(contentRoot) {
    if (!contentRoot || !(contentRoot instanceof HTMLElement)) {
      return;
    }

    const wrappers = Array.from(contentRoot.querySelectorAll(":scope > .hsr-block-wrap"));
    for (const wrapper of wrappers) {
      if (!(wrapper instanceof HTMLElement)) {
        continue;
      }

      const block = wrapper.firstElementChild;
      if (!(block instanceof HTMLElement)) {
        wrapper.remove();
        continue;
      }

      const kindClass = Array.from(wrapper.classList).find((cls) => cls.startsWith("hsr-block-")) || "";
      const kind = kindClass.replace("hsr-block-", "");

      if (isSkippableEmptyBlock(block, kind)) {
        wrapper.remove();
      }
    }

    const shells = Array.from(contentRoot.querySelectorAll(":scope > .hsr-split-shell"));
    for (const shell of shells) {
      if (!(shell instanceof HTMLElement)) {
        continue;
      }

      const bubbles = Array.from(shell.querySelectorAll(":scope > .hsr-sentence-bubble"));
      for (const bubble of bubbles) {
        if (!hasVisibleText(bubble.textContent || "")) {
          bubble.remove();
        }
      }

      if (!shell.querySelector(":scope > .hsr-sentence-bubble")) {
        shell.remove();
      }
    }
  }

  function upsertSplitShell(block) {
    const text = String(block.textContent || "").replace(/\s+/g, " ").trim();
    const chunks = window.HSRSplitter.splitText(text, {
      maxChars: state.config.splitMaxChars,
      maxSentences: state.config.splitMaxSentences
    });

    const hasShell =
      block.nextElementSibling &&
      block.nextElementSibling.classList &&
      block.nextElementSibling.classList.contains("hsr-split-shell");

    let shell = hasShell ? block.nextElementSibling : null;

    if (chunks.length <= 1) {
      if (shell) {
        shell.remove();
      }
      block.classList.remove("hsr-original-paragraph");
      return;
    }

    if (!shell) {
      shell = document.createElement("div");
      shell.className = "hsr-split-shell";
      block.after(shell);
    }

    shell.textContent = "";

    for (const chunk of chunks) {
      const p = document.createElement("p");
      p.className = "hsr-sentence-bubble";
      p.textContent = chunk;
      shell.appendChild(p);
    }

    block.classList.add("hsr-original-paragraph");
  }

  function setAssistantStreamingState(turnNode, contentRoot, streaming) {
    if (!turnNode || !contentRoot) {
      return;
    }

    turnNode.classList.toggle("hsr-streaming", Boolean(streaming));

    let overlay = turnNode.querySelector(":scope > .hsr-stream-overlay");

    if (streaming) {
      for (const child of Array.from(turnNode.children)) {
        if (!(child instanceof HTMLElement)) {
          continue;
        }
        if (
          child.classList.contains("hsr-role-meta") ||
          child.classList.contains("hsr-stream-overlay")
        ) {
          continue;
        }
        if (!child.hasAttribute("data-hsr-stream-original-display")) {
          child.setAttribute("data-hsr-stream-original-display", child.style.display || "");
        }
        child.setAttribute("data-hsr-stream-hidden", "1");
        child.style.display = "none";
      }

      if (!contentRoot.hasAttribute("data-hsr-original-display")) {
        contentRoot.setAttribute("data-hsr-original-display", contentRoot.style.display || "");
      }
      contentRoot.style.display = "none";

      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "hsr-stream-overlay";
        const metaNode = turnNode.querySelector(":scope > .hsr-role-meta");
        if (metaNode && metaNode.nextSibling) {
          turnNode.insertBefore(overlay, metaNode.nextSibling);
        } else {
          turnNode.appendChild(overlay);
        }
      }

      if (!overlay.querySelector(":scope > .hsr-typing-shell")) {
        overlay.appendChild(createDotLoader("hsr-typing-shell", "hsr-typing-dot"));
      }

      state.streamHiddenRoots.set(turnNode, contentRoot);
      return;
    }

    for (const child of Array.from(turnNode.children)) {
      if (!(child instanceof HTMLElement)) {
        continue;
      }
      if (child.getAttribute("data-hsr-stream-hidden") !== "1") {
        continue;
      }
      const original = child.getAttribute("data-hsr-stream-original-display");
      child.style.display = original || "";
      child.removeAttribute("data-hsr-stream-hidden");
      child.removeAttribute("data-hsr-stream-original-display");
    }

    const originalDisplay = contentRoot.getAttribute("data-hsr-original-display");
    contentRoot.style.display = originalDisplay || "";
    contentRoot.removeAttribute("data-hsr-original-display");

    if (overlay) {
      overlay.remove();
    }
    contentRoot.querySelectorAll(".hsr-typing-shell").forEach((node) => node.remove());
    contentRoot.querySelectorAll(".hsr-seq-loader").forEach((node) => node.remove());
    state.streamHiddenRoots.delete(turnNode);
  }

  function hasAssistantFinalActions(turnNode) {
    return window.HSRSelectors.hasFinalActions(turnNode);
  }

  function isGeminiGenerationActive() {
    if (state.siteKey !== "gemini") {
      return false;
    }

    const candidates = Array.from(
      document.querySelectorAll(
        'button[aria-label*="대답 생성 중지"], button[aria-label*="생성 중지"], button[aria-label*="Stop"], .send-button.stop'
      )
    );

    return candidates.some((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }
      if (node.getAttribute("aria-disabled") === "true" || node.hasAttribute("disabled")) {
        return false;
      }
      return node.offsetParent !== null;
    });
  }

  function createDotLoader(shellClass, dotClass) {
    const shell = document.createElement("div");
    shell.className = shellClass;
    shell.setAttribute("aria-hidden", "true");

    for (let i = 0; i < 3; i += 1) {
      const dot = document.createElement("span");
      dot.className = dotClass;
      shell.appendChild(dot);
    }

    return shell;
  }

  function collectVisibleAssistantBubbleNodes(contentRoot) {
    if (!contentRoot || !(contentRoot instanceof HTMLElement)) {
      return [];
    }

    const nodes = [];
    const children = Array.from(contentRoot.children);

    for (const child of children) {
      if (!(child instanceof HTMLElement)) {
        continue;
      }
      if (
        child.classList.contains("hsr-role-meta") ||
        child.classList.contains("hsr-random-sticker") ||
        child.classList.contains("hsr-stream-overlay")
      ) {
        continue;
      }

      if (child.classList.contains("hsr-split-shell")) {
        const bubbles = Array.from(child.querySelectorAll(":scope > .hsr-sentence-bubble"));
        for (const bubble of bubbles) {
          if (bubble instanceof HTMLElement && hasVisibleText(bubble.textContent || "")) {
            nodes.push(bubble);
          }
        }
        continue;
      }

      if (child.classList.contains("hsr-block-wrap")) {
        if (child.classList.contains("hsr-block-hr")) {
          continue;
        }

        const inner = child.firstElementChild;
        if (inner instanceof HTMLElement && inner.classList.contains("hsr-original-paragraph")) {
          continue;
        }

        nodes.push(child);
        continue;
      }

      if (hasVisibleText(child.textContent || "") || child.querySelector("img,pre,table,ul,ol,blockquote")) {
        nodes.push(child);
      }
    }

    return nodes;
  }

  function startFinalCascadeAnimation(contentRoot, processedHash) {
    if (!contentRoot || !(contentRoot instanceof HTMLElement)) {
      return 0;
    }
    if (!processedHash) {
      return 0;
    }
    if (contentRoot.dataset.hsrFinalAnimHash === processedHash) {
      return 0;
    }

    const targets = collectVisibleAssistantBubbleNodes(contentRoot);
    if (!targets.length) {
      contentRoot.dataset.hsrFinalAnimHash = processedHash;
      return 0;
    }

    const step = 30;
    const duration = 20;

    clearShellTimers(contentRoot);

    for (const node of targets) {
      node.classList.remove("hsr-final-enter");
      node.classList.add("hsr-final-seq-hidden");
    }

    let lastDelay = 0;
    for (let i = 0; i < targets.length; i += 1) {
      const node = targets[i];
      const showDelay = i * step;
      lastDelay = showDelay;
      queueShellTimer(
        contentRoot,
        () => {
          node.classList.remove("hsr-final-seq-hidden");
          node.classList.remove("hsr-final-enter");
          // Force class re-apply.
          void node.offsetWidth;
          node.classList.add("hsr-final-enter");
        },
        showDelay
      );
    }

    contentRoot.dataset.hsrFinalAnimHash = processedHash;
    return lastDelay + duration;
  }

  function extractStreamingText(contentRoot) {
    if (!contentRoot || !(contentRoot instanceof HTMLElement)) {
      return "";
    }

    const parts = [];
    const walker = document.createTreeWalker(contentRoot, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.parentElement) {
          return NodeFilter.FILTER_REJECT;
        }

        if (
          node.parentElement.closest(
            ".hsr-role-meta, .hsr-random-sticker, .hsr-split-shell, pre, code, table"
          )
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        const value = String(node.nodeValue || "").trim();
        if (!value) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode()) {
      parts.push(String(walker.currentNode.nodeValue || "").trim());
    }

    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function isSentenceTerminalText(text) {
    return /[.!?…。！？]["')\]}'"`]*\s*$/.test(String(text || ""));
  }

  function getStreamingVisibleChunks(text) {
    const source = String(text || "").replace(/\s+/g, " ").trim();
    if (!source) {
      return [];
    }

    const chunks = window.HSRSplitter.splitText(source, {
      maxChars: state.config.splitMaxChars,
      maxSentences: state.config.splitMaxSentences
    });

    if (!chunks.length) {
      return [];
    }

    if (isSentenceTerminalText(source)) {
      return chunks;
    }

    if (chunks.length === 1) {
      return [];
    }

    const minChunkChars = Math.max(90, Math.floor(state.config.splitMaxChars * 0.72));
    const visible = chunks.slice(0, -1);

    while (visible.length > 0 && visible[visible.length - 1].length < minChunkChars) {
      visible.pop();
    }

    return visible;
  }

  function updateStreamingOverlayPreview(turnNode, contentRoot) {
    if (!turnNode || !contentRoot) {
      return;
    }

    const overlay = turnNode.querySelector(":scope > .hsr-stream-overlay");
    if (!overlay) {
      return;
    }

    let loader = overlay.querySelector(":scope > .hsr-typing-shell");
    if (!loader) {
      loader = createDotLoader("hsr-typing-shell", "hsr-typing-dot");
      overlay.appendChild(loader);
    }

    let preview = overlay.querySelector(":scope > .hsr-stream-preview");
    if (!preview) {
      preview = document.createElement("div");
      preview.className = "hsr-stream-preview";
      overlay.insertBefore(preview, loader);
    }

    const text = extractStreamingText(contentRoot);
    const chunks = getStreamingVisibleChunks(text).filter((chunk) => hasVisibleText(chunk));

    const rendered = Array.from(preview.querySelectorAll(":scope > .hsr-sentence-bubble"));

    const common = Math.min(rendered.length, chunks.length);
    for (let i = 0; i < common; i += 1) {
      if (rendered[i].textContent !== chunks[i]) {
        rendered[i].textContent = chunks[i];
      }
    }

    if (rendered.length > chunks.length) {
      for (let i = rendered.length - 1; i >= chunks.length; i -= 1) {
        rendered[i].remove();
      }
    } else if (chunks.length > rendered.length) {
      for (let i = rendered.length; i < chunks.length; i += 1) {
        const bubble = document.createElement("p");
        bubble.className = "hsr-sentence-bubble hsr-stream-bubble hsr-seq-visible";
        bubble.textContent = chunks[i];
        preview.appendChild(bubble);
      }
    }

    if (chunks.length > 0) {
      turnNode.dataset.hsrStreamPreviewUsed = "1";
    }
  }

  function getShellTimerList(shell) {
    const list = state.revealTimers.get(shell) || [];
    state.revealTimers.set(shell, list);
    return list;
  }

  function queueShellTimer(shell, callback, delay) {
    const timer = window.setTimeout(callback, delay);
    const list = getShellTimerList(shell);
    list.push(timer);
    return timer;
  }

  function clearShellTimers(shell) {
    const list = state.revealTimers.get(shell);
    if (!list || !list.length) {
      return;
    }
    for (const timer of list) {
      clearTimeout(timer);
    }
    state.revealTimers.set(shell, []);
  }

  function revealSplitShellSequential(shell, processedHash, startDelay = 0) {
    if (!shell || !(shell instanceof HTMLElement)) {
      return 0;
    }

    if (shell.dataset.hsrRevealHash === processedHash) {
      return 0;
    }

    const bubbles = Array.from(
      shell.querySelectorAll(":scope > .hsr-sentence-bubble")
    ).filter((node) => node instanceof HTMLElement);

    if (!bubbles.length) {
      shell.dataset.hsrRevealHash = processedHash;
      return 0;
    }

    clearShellTimers(shell);
    shell.querySelectorAll(":scope > .hsr-seq-loader").forEach((node) => node.remove());

    const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    shell.dataset.hsrRevealRun = runId;

    for (const bubble of bubbles) {
      bubble.classList.remove("hsr-seq-visible");
      bubble.classList.add("hsr-seq-hidden");
    }

    const loader = createDotLoader("hsr-seq-loader", "hsr-seq-dot");
    shell.appendChild(loader);

    let index = 0;

    const revealNext = () => {
      if (shell.dataset.hsrRevealRun !== runId) {
        return;
      }

      if (index >= bubbles.length) {
        loader.remove();
        shell.dataset.hsrRevealHash = processedHash;
        clearShellTimers(shell);
        return;
      }

      queueShellTimer(
        shell,
        () => {
          if (shell.dataset.hsrRevealRun !== runId) {
            return;
          }

          const bubble = bubbles[index];
          bubble.classList.remove("hsr-seq-hidden");
          bubble.classList.add("hsr-seq-visible");
          index += 1;

          if (index >= bubbles.length) {
            queueShellTimer(
              shell,
              () => {
                if (shell.dataset.hsrRevealRun !== runId) {
                  return;
                }
                loader.remove();
                shell.dataset.hsrRevealHash = processedHash;
                clearShellTimers(shell);
              },
              90
            );
            return;
          }

          queueShellTimer(shell, revealNext, 140);
        },
        320
      );
    };

    if (startDelay > 0) {
      queueShellTimer(shell, revealNext, startDelay);
    } else {
      revealNext();
    }

    return bubbles.length * 320 + (bubbles.length - 1) * 140 + 90;
  }

  function startAssistantSequentialReveal(contentRoot, processedHash) {
    if (!contentRoot || !(contentRoot instanceof HTMLElement)) {
      return 0;
    }

    const shells = Array.from(contentRoot.querySelectorAll(".hsr-split-shell")).filter(
      (node) => node instanceof HTMLElement
    );

    if (!shells.length) {
      return 0;
    }

    let queueOffset = 0;
    for (const shell of shells) {
      const duration = revealSplitShellSequential(shell, processedHash, queueOffset);
      if (duration > 0) {
        queueOffset += duration + 120;
      }
    }

    return queueOffset > 0 ? queueOffset - 120 : 0;
  }

  function decorateBlocks(contentRoot, role, streaming) {
    const blocks = window.HSRSelectors.getRenderableBlocks(contentRoot);

    for (const block of blocks) {
      if (!(block instanceof HTMLElement)) {
        continue;
      }
      if (
        block.classList.contains("hsr-image-group") ||
        block.classList.contains("hsr-role-meta") ||
        block.classList.contains("hsr-random-sticker") ||
        block.classList.contains("hsr-typing-shell") ||
        block.classList.contains("hsr-seq-loader")
      ) {
        continue;
      }

      const kind = window.HSRSelectors.detectBlockKind(block);
      if (isSkippableEmptyBlock(block, kind)) {
        const existingWrapper =
          block.parentElement &&
          block.parentElement.classList &&
          block.parentElement.classList.contains("hsr-block-wrap")
            ? block.parentElement
            : null;

        if (existingWrapper) {
          existingWrapper.remove();
        } else {
          block.remove();
        }
        continue;
      }

      block.classList.add("hsr-kind", `hsr-kind-${kind}`);
      ensureBlockWrap(block, kind);

      const canSplit =
        role === "assistant" &&
        !streaming &&
        kind === "paragraph" &&
        ((
          window.HSRSelectors.isParagraphCandidate(block) &&
          window.HSRSplitter.isPlainParagraph(block) &&
          !window.HSRSelectors.hasInlineFormatting(block)
        ) ||
          canSoftSplitFormattedParagraph(block));

      if (canSplit) {
        upsertSplitShell(block);
      } else {
        block.classList.remove("hsr-original-paragraph");
        const next = block.nextElementSibling;
        if (next && next.classList && next.classList.contains("hsr-split-shell")) {
          next.remove();
        }
      }
    }

    const hasImageContent = Boolean(
      contentRoot.querySelector(".hsr-block-image, .hsr-image-group, img")
    );

    contentRoot.querySelectorAll("a").forEach((node) => {
      node.classList.add("hsr-link");
      const preserveGeminiSource =
        state.siteKey === "gemini" &&
        (node.closest(".hsr-gemini-image-results") || node.closest(".hsr-gemini-image-card"));
      if (
        role === "assistant" &&
        hasImageContent &&
        !preserveGeminiSource &&
        isLikelyImageSourceLink(node)
      ) {
        node.classList.add("hsr-hide-source-link");
      } else {
        node.classList.remove("hsr-hide-source-link");
      }
    });
    contentRoot.querySelectorAll("pre").forEach((node) => node.classList.add("hsr-code-pre"));
    contentRoot.querySelectorAll("table").forEach((node) => node.classList.add("hsr-table"));
    contentRoot.querySelectorAll("blockquote").forEach((node) => node.classList.add("hsr-quote"));

    contentRoot.querySelectorAll("code").forEach((node) => {
      if (node.closest("pre")) {
        node.classList.add("hsr-code-block");
      } else {
        node.classList.add("hsr-inline-code");
      }
    });

    decorateGeminiRichContent(contentRoot);
    pruneEmptyBubbles(contentRoot);
    contentRoot.querySelectorAll("img").forEach((node) => node.classList.add("hsr-image"));
    normalizeImageGroups(contentRoot);
  }

  function decorateGeminiRichContent(contentRoot) {
    if (state.siteKey !== "gemini" || !contentRoot || !(contentRoot instanceof HTMLElement)) {
      return;
    }

    contentRoot.querySelectorAll(".attachment-container.search-images").forEach((node) => {
      node.classList.add("hsr-image-group", "hsr-gemini-image-results");
    });

    contentRoot.querySelectorAll("single-image").forEach((node) => {
      node.classList.add("hsr-gemini-image-card");
    });

    contentRoot.querySelectorAll(".image-container").forEach((node) => {
      node.classList.add("hsr-gemini-image-card");
    });

    contentRoot.querySelectorAll("single-image img, .image-container img").forEach((node) => {
      node.classList.add("hsr-image", "hsr-gemini-result-image");
    });

    contentRoot.querySelectorAll(".image-source-link").forEach((node) => {
      node.classList.add("hsr-gemini-image-link");
    });

    contentRoot.querySelectorAll(".source, .source .label").forEach((node) => {
      node.classList.add("hsr-gemini-image-source");
    });

    contentRoot.querySelectorAll("response-element").forEach((node) => {
      node.classList.add("hsr-native-widget");
    });
  }

  function normalizeImageGroups(contentRoot) {
    if (!contentRoot || !(contentRoot instanceof HTMLElement)) {
      return;
    }

    // Clean up legacy wrapper shape: .hsr-block-wrap > .hsr-image-group
    const legacyWrappedGroups = Array.from(contentRoot.children).filter((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }
      if (!node.classList.contains("hsr-block-wrap")) {
        return false;
      }
      const first = node.firstElementChild;
      return first instanceof HTMLElement && first.classList.contains("hsr-image-group");
    });

    for (const wrapper of legacyWrappedGroups) {
      const group = wrapper.firstElementChild;
      if (group) {
        wrapper.before(group);
      }
      wrapper.remove();
    }

    // Unwrap previous groups first so reprocessing stays idempotent.
    const existingGroups = Array.from(contentRoot.children).filter(
      (node) => node instanceof HTMLElement && node.classList.contains("hsr-image-group")
    );
    for (const group of existingGroups) {
      while (group.firstChild) {
        group.before(group.firstChild);
      }
      group.remove();
    }

    const children = Array.from(contentRoot.children).filter(
      (node) =>
        node instanceof HTMLElement &&
        !node.classList.contains("hsr-role-meta") &&
        !node.classList.contains("hsr-random-sticker")
    );

    let run = [];

    const flushRun = () => {
      if (run.length < 2) {
        run = [];
        return;
      }

      const group = document.createElement("div");
      group.className = "hsr-image-group";

      const first = run[0];
      first.before(group);
      for (const node of run) {
        group.appendChild(node);
      }
      run = [];
    };

    for (const node of children) {
      const isImageWrap =
        node.classList.contains("hsr-block-wrap") &&
        node.classList.contains("hsr-block-image");

      if (isImageWrap) {
        run.push(node);
        continue;
      }

      flushRun();
    }

    flushRun();
  }

  function getOrCreateAssistantMeta(turnNode, initialPass) {
    let meta = state.turnMeta.get(turnNode);
    if (!meta) {
      meta = {
        responseIndex: state.assistantTurnCounter + 1,
        finalized: Boolean(initialPass)
      };
      state.assistantTurnCounter += 1;
      state.turnMeta.set(turnNode, meta);
    }
    return meta;
  }

  function maybeInjectSticker(turnNode, contentRoot) {
    if (turnNode.dataset.hsrStickerInjected === "1") {
      return;
    }

    state.liveAssistantFinalizedCount += 1;
    const shouldInject = state.liveAssistantFinalizedCount % 2 === 1;

    if (!shouldInject) {
      return;
    }

    const stickerFile = window.HSRStickers.pickSticker(state.config.stickerPack);
    const stickerUrl = window.HSRStickers.stickerRuntimeUrl(stickerFile);

    const shell = document.createElement("div");
    shell.className = "hsr-random-sticker";

    const image = document.createElement("img");
    image.className = "hsr-sticker-img";
    image.src = stickerUrl;
    image.alt = "HSR sticker";
    image.loading = "lazy";
    image.addEventListener("error", () => {
      shell.remove();
      turnNode.dataset.hsrStickerInjected = "0";
      turnNode.dataset.hsrStickerFile = "";
    });

    const host =
      contentRoot.matches("p,span,code,strong,em")
        ? contentRoot.parentElement || contentRoot
        : contentRoot;

    shell.appendChild(image);
    host.appendChild(shell);

    turnNode.dataset.hsrStickerInjected = "1";
    turnNode.dataset.hsrStickerFile = stickerFile;
  }

  function processTurn(turnNode, initialPass, activeAssistantTurn = null) {
    const role = window.HSRSelectors.getRole(turnNode);
    if (role !== "assistant" && role !== "user") {
      return;
    }

    turnNode.classList.add("hsr-turn");
    turnNode.classList.toggle("hsr-assistant", role === "assistant");
    turnNode.classList.toggle("hsr-user", role === "user");

    const pinnedHiddenRoot = state.streamHiddenRoots.get(turnNode);
    const rawContentRoot =
      pinnedHiddenRoot && pinnedHiddenRoot.isConnected
        ? pinnedHiddenRoot
        : window.HSRSelectors.getPrimaryContentRoot(turnNode, role);
    if (!rawContentRoot || !(rawContentRoot instanceof HTMLElement)) {
      return;
    }

    const contentRoot =
      rawContentRoot.matches("p,span,code,strong,em")
        ? rawContentRoot.parentElement || rawContentRoot
        : rawContentRoot;

    contentRoot.classList.add("hsr-message-container");
    ensureRoleMeta(turnNode, role, contentRoot);

    if (role !== "assistant") {
      const hash = computeContentHash(contentRoot);
      if (turnNode.dataset.hsrProcessedHash !== hash) {
        decorateBlocks(contentRoot, role, false);
        turnNode.dataset.hsrProcessedHash = hash;
      }
      turnNode.classList.remove("hsr-pending");
      turnNode.dataset.hsrPainted = "1";
      return;
    }

    const now = Date.now();
    const currentHash = computeContentHash(contentRoot);

    let streamMeta = state.streamMeta.get(turnNode);
    if (!streamMeta) {
      streamMeta = {
        lastHash: currentHash,
        stableSince: now
      };
      state.streamMeta.set(turnNode, streamMeta);
    } else if (streamMeta.lastHash !== currentHash) {
      streamMeta.lastHash = currentHash;
      streamMeta.stableSince = now;
    }

    const stableFor = now - streamMeta.stableSince;
    const wasStreaming = turnNode.dataset.hsrWasStreaming === "1";
    const turnIsActiveAssistant = activeAssistantTurn ? activeAssistantTurn === turnNode : false;
    const detectedStreaming =
      turnIsActiveAssistant && window.HSRSelectors.isStreaming(turnNode);
    const hasFinalActions = hasAssistantFinalActions(turnNode);
    const hasProcessedHash = Boolean(turnNode.dataset.hsrProcessedHash);
    const streamStartTs = Number(turnNode.dataset.hsrStreamStartTs || 0);
    const streamAgeMs = streamStartTs > 0 ? now - streamStartTs : 0;
    const assistantMeta = getOrCreateAssistantMeta(turnNode, initialPass);
    const hasDecoratedContent = hasDecoratedAssistantContent(contentRoot);

    if (
      !initialPass &&
      assistantMeta.finalized &&
      !wasStreaming &&
      !turnIsActiveAssistant &&
      turnNode.dataset.hsrProcessedHash === currentHash &&
      hasDecoratedContent
    ) {
      setAssistantStreamingState(turnNode, contentRoot, false);
      turnNode.classList.remove("hsr-pending");
      turnNode.classList.remove("hsr-stream-live");
      turnNode.removeAttribute("data-hsr-stream-live");
      turnNode.removeAttribute("data-hsr-stream-preview-used");
      turnNode.dataset.hsrWasStreaming = "0";
      turnNode.dataset.hsrPainted = "1";
      return;
    }

    // Hard lock while streaming: do not reveal partial token output.
    let streaming = detectedStreaming;

    if (!streaming) {
      const fallbackFinalize =
        wasStreaming &&
        streamAgeMs >= STREAM_FALLBACK_FINALIZE_MS &&
        stableFor >= STREAM_STABLE_MS * 2;

      if (turnIsActiveAssistant && (wasStreaming || (!initialPass && !hasProcessedHash))) {
        // Keep loader until explicit completion signal + stable quiet period,
        // or a long safety timeout to avoid infinite loading on DOM changes.
        if (!fallbackFinalize) {
          if (!hasFinalActions || stableFor < STREAM_STABLE_MS) {
            streaming = true;
          }
        }
      }
    }

    const geminiStreamingText =
      state.siteKey === "gemini" ? extractStreamingText(contentRoot) : "";
    const hasGeminiStreamingText =
      state.siteKey === "gemini" && hasVisibleText(geminiStreamingText);
    const staleGeminiStreaming =
      state.siteKey === "gemini" &&
      Boolean(turnNode.dataset.hsrProcessedHash) &&
      turnNode.dataset.hsrProcessedHash === currentHash &&
      hasGeminiStreamingText &&
      assistantMeta.finalized;

    if (streaming && state.siteKey === "gemini" && hasGeminiStreamingText) {
      const geminiShouldForceFinalize =
        (!isGeminiGenerationActive() && stableFor >= 420) ||
        (hasFinalActions && stableFor >= 620) ||
        (streamAgeMs >= 900 && stableFor >= GEMINI_FORCE_FINALIZE_MS);

      if (geminiShouldForceFinalize) {
        streaming = false;
      }
    }

    if (staleGeminiStreaming) {
      streaming = false;
    }

    if (streaming && !streamStartTs) {
      turnNode.dataset.hsrStreamStartTs = String(now);
    }

    setAssistantStreamingState(turnNode, contentRoot, streaming);
    turnNode.classList.remove("hsr-stream-live");
    turnNode.classList.remove("hsr-pending");
    turnNode.dataset.hsrPainted = "1";

    if (streaming) {
      turnNode.dataset.hsrWasStreaming = "1";
      assistantMeta.finalized = false;

      turnNode.removeAttribute("data-hsr-stream-live");
      turnNode.removeAttribute("data-hsr-stream-preview-used");

      if (state.siteKey === "gemini") {
        const pollDelay = detectedStreaming
          ? (hasGeminiStreamingText ? 260 : 380)
          : Math.max(160, Math.min(500, STREAM_STABLE_MS - stableFor + 120));
        scheduleProcess(pollDelay);
      } else if (!detectedStreaming) {
        // Gemini can stop mutating the DOM before the quiet-period check passes.
        // Poll once more so we can finalize instead of getting stuck in the loader state.
        scheduleProcess(Math.max(160, Math.min(500, STREAM_STABLE_MS - stableFor + 120)));
      }
      return;
    }

    const streamEnded = wasStreaming;
    const streamPreviewUsed = turnNode.dataset.hsrStreamPreviewUsed === "1";
    turnNode.dataset.hsrWasStreaming = "0";
    turnNode.removeAttribute("data-hsr-stream-live");
    turnNode.removeAttribute("data-hsr-stream-start-ts");

    const hash = currentHash;
    if (turnNode.dataset.hsrProcessedHash !== hash || streamEnded || !hasDecoratedContent) {
      decorateBlocks(contentRoot, role, false);
      turnNode.dataset.hsrProcessedHash = hash;
    }

    if (initialPass) {
      assistantMeta.finalized = true;
      turnNode.removeAttribute("data-hsr-stream-preview-used");
      return;
    }

    if (!assistantMeta.finalized) {
      assistantMeta.finalized = true;

      // Animate only when this assistant turn just finished live streaming.
      if (streamEnded) {
        if (state.siteKey === "gemini") {
          clearShellTimers(contentRoot);
          contentRoot.querySelectorAll(".hsr-final-enter,.hsr-final-seq-hidden").forEach((node) => {
            if (!(node instanceof HTMLElement)) {
              return;
            }
            node.classList.remove("hsr-final-enter");
            node.classList.remove("hsr-final-seq-hidden");
          });
          maybeInjectSticker(turnNode, contentRoot);
          turnNode.removeAttribute("data-hsr-final-anim-hash");
          return;
        }

        const animDelay = startFinalCascadeAnimation(contentRoot, hash);
        if (animDelay > 0) {
          window.setTimeout(() => {
            maybeInjectSticker(turnNode, contentRoot);
          }, animDelay + 40);
        } else {
          maybeInjectSticker(turnNode, contentRoot);
        }
      } else {
        maybeInjectSticker(turnNode, contentRoot);
      }
    }

    if (streamEnded || streamPreviewUsed) {
      turnNode.removeAttribute("data-hsr-stream-preview-used");
    }
  }

  function resetGeminiHelperClasses() {
    document
      .querySelectorAll(
        ".hsr-gemini-image-results,.hsr-gemini-image-card,.hsr-gemini-image-link,.hsr-gemini-image-source,.hsr-gemini-result-image,.hsr-native-widget"
      )
      .forEach((node) => {
        node.classList.remove(
          "hsr-image-group",
          "hsr-gemini-image-results",
          "hsr-gemini-image-card",
          "hsr-gemini-image-link",
          "hsr-gemini-image-source",
          "hsr-gemini-result-image",
          "hsr-native-widget"
        );
      });
  }

  function applySiteClasses() {
    for (const key of configModel.SITE_KEYS) {
      document.documentElement.classList.toggle(`hsr-site-${key}`, key === state.siteKey);
    }
  }

  function applyEnabledState() {
    applySiteClasses();
    document.documentElement.classList.toggle("hsr-enabled", state.config.enabled);

    document.querySelectorAll(".hsr-conversation-root").forEach((node) => {
      node.classList.remove("hsr-conversation-root");
    });

    const conversationRoot = window.HSRSelectors.findConversationRoot(document);
    if (conversationRoot && state.config.enabled) {
      conversationRoot.classList.add("hsr-conversation-root");
    }

    if (state.config.enabled) {
      ensureFixedHeader();
    } else {
      removeFixedHeader();
    }

    if (!state.config.enabled) {
      document.documentElement.classList.remove("hsr-booting", "hsr-zero-state");
      document.querySelectorAll("[data-hsr-original-display]").forEach((node) => {
        if (!(node instanceof HTMLElement)) {
          return;
        }
        const originalDisplay = node.getAttribute("data-hsr-original-display");
        node.style.display = originalDisplay || "";
        node.removeAttribute("data-hsr-original-display");
      });
      document
        .querySelectorAll("[data-hsr-stream-hidden=\"1\"]")
        .forEach((node) => {
          if (!(node instanceof HTMLElement)) {
            return;
          }
          const originalDisplay = node.getAttribute("data-hsr-stream-original-display");
          node.style.display = originalDisplay || "";
          node.removeAttribute("data-hsr-stream-hidden");
          node.removeAttribute("data-hsr-stream-original-display");
        });
      document.querySelectorAll(".hsr-stream-overlay,.hsr-typing-shell,.hsr-seq-loader").forEach((node) => {
        node.remove();
      });
      document.querySelectorAll(".hsr-stream-live").forEach((node) => {
        node.classList.remove("hsr-stream-live");
      });
      document.querySelectorAll(".hsr-final-enter,.hsr-final-seq-hidden").forEach((node) => {
        if (!(node instanceof HTMLElement)) {
          return;
        }
        node.classList.remove("hsr-final-enter");
        node.classList.remove("hsr-final-seq-hidden");
      });
      document.querySelectorAll("[data-hsr-stream-preview-used]").forEach((node) => {
        node.removeAttribute("data-hsr-stream-preview-used");
      });
      document.querySelectorAll("[data-hsr-stream-live]").forEach((node) => {
        node.removeAttribute("data-hsr-stream-live");
      });
      document.querySelectorAll("[data-hsr-final-anim-hash]").forEach((node) => {
        node.removeAttribute("data-hsr-final-anim-hash");
      });
      document.querySelectorAll(".hsr-pending").forEach((node) => {
        node.classList.remove("hsr-pending");
      });
      document.querySelectorAll("[data-hsr-painted]").forEach((node) => {
        node.removeAttribute("data-hsr-painted");
      });
      resetGeminiHelperClasses();
      state.streamHiddenRoots = new WeakMap();
      state.streamMeta = new WeakMap();
      state.revealTimers = new WeakMap();
    }
  }

  function markAssistantTurnPending(turnNode) {
    if (!turnNode || !(turnNode instanceof HTMLElement)) {
      return;
    }
    if (turnNode.dataset.hsrPainted === "1") {
      return;
    }
    if (window.HSRSelectors.getRole(turnNode) !== "assistant") {
      return;
    }

    turnNode.classList.add("hsr-turn", "hsr-assistant", "hsr-pending");
  }

  function markPendingFromMutationNode(node) {
    if (!(node instanceof Element)) {
      return;
    }

    const turns = window.HSRSelectors.findPendingAssistantTurnsFromMutation(node);
    for (const turn of turns) {
      markAssistantTurnPending(turn);
    }
  }

  function resolveActiveAssistantTurn(turns) {
    if (!Array.isArray(turns) || !turns.length) {
      return null;
    }

    const assistants = turns.filter((turn) => window.HSRSelectors.getRole(turn) === "assistant");
    if (!assistants.length) {
      return null;
    }

    for (let i = assistants.length - 1; i >= 0; i -= 1) {
      const turn = assistants[i];
      if (!turn || !(turn instanceof HTMLElement)) {
        continue;
      }

      if (isGeminiStaleStreamingTurn(turn)) {
        continue;
      }

      if (turn.dataset.hsrWasStreaming === "1") {
        return turn;
      }

      if (!turn.dataset.hsrProcessedHash) {
        return turn;
      }

      if (window.HSRSelectors.isStreaming(turn)) {
        return turn;
      }
    }

    return null;
  }

  function processAllTurns(initialPass = false) {
    applyEnabledState();

    if (!state.config.enabled) {
      return;
    }

    const turns = window.HSRSelectors.findTurnNodes(document);
    document.documentElement.classList.toggle("hsr-zero-state", turns.length === 0);
    const activeAssistantTurn = resolveActiveAssistantTurn(turns);

    for (const turn of turns) {
      try {
        processTurn(turn, initialPass, activeAssistantTurn);
      } catch (error) {
        // Keep processing other turns even if one node shape is unexpected.
      }
    }
  }

  function scheduleProcess(delay = 30) {
    if (state.processTimer) {
      clearTimeout(state.processTimer);
    }

    state.processTimer = window.setTimeout(() => {
      processAllTurns(false);
    }, delay);
  }

  function scheduleProcessBurst(delays = [0, 60, 180, 420, 900]) {
    for (const delay of delays) {
      window.setTimeout(() => {
        processAllTurns(false);
      }, delay);
    }
  }

  function bindImmediateInteractionListeners() {
    if (state.interactionBound || state.siteKey !== "gemini") {
      return;
    }

    const isGeminiComposerTarget = (target) => {
      return Boolean(
        target instanceof Element &&
          (target.closest("rich-textarea") ||
            target.closest(".ql-editor[role=\"textbox\"]") ||
            target.closest("input-container"))
      );
    };

    document.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key !== "Enter" ||
          event.shiftKey ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.isComposing ||
          !isGeminiComposerTarget(event.target)
        ) {
          return;
        }

        scheduleProcessBurst([0, 50, 140, 320, 700, 1200]);
      },
      true
    );

    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (
          !(target instanceof Element) ||
          !target.closest('button[aria-label="메시지 보내기"], .send-button.submit, .send-button-container')
        ) {
          return;
        }

        scheduleProcessBurst([0, 50, 140, 320, 700, 1200]);
      },
      true
    );

    state.interactionBound = true;
  }

  function startObserver() {
    if (state.observer) {
      state.observer.disconnect();
    }

    state.observer = new MutationObserver((mutations) => {
      if (!state.config.enabled) {
        return;
      }

      let hasAssistantAdded = false;

      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes && mutation.addedNodes.length) {
          for (const node of mutation.addedNodes) {
            markPendingFromMutationNode(node);
            if (
              node instanceof Element &&
              window.HSRSelectors.findPendingAssistantTurnsFromMutation(node).length
            ) {
              hasAssistantAdded = true;
            }
          }
        }

        if (
          mutation.type === "childList" ||
          mutation.type === "characterData" ||
          mutation.type === "attributes"
        ) {
          scheduleProcess();
        }
      }

      if (hasAssistantAdded) {
        processAllTurns(false);
      }
    });

    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-busy", "class", "style", "disabled", "aria-disabled"]
    });
  }

  async function initializeConfig() {
    const stored = await getConfigFromStorage();
    const merged = configModel.mergeConfig(stored);
    state.config = configModel.getRuntimeSiteProfile(merged, state.siteKey);

    if (configModel.needsPersist(stored, merged)) {
      await setConfigToStorage(merged);
    }
  }

  function bindStorageEvents() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync" || !changes[CONFIG_KEY]) {
        return;
      }

      const merged = configModel.mergeConfig(changes[CONFIG_KEY].newValue);
      state.config = configModel.getRuntimeSiteProfile(merged, state.siteKey);
      applyEnabledState();

      if (state.config.enabled) {
        scheduleProcess();
      }
    });
  }

  async function initialize() {
    await initializeConfig();
    processAllTurns(true);
    document.documentElement.classList.remove("hsr-booting");
    bindImmediateInteractionListeners();
    startObserver();
    bindStorageEvents();
  }

  initialize();
})();
