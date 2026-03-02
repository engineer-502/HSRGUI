(() => {
  const ROLE_NODE_SELECTOR = "[data-message-author-role]";
  const SEMANTIC_BLOCK_SELECTOR =
    "p,pre,table,ul,ol,blockquote,h1,h2,h3,h4,h5,h6,hr,figure";

  function uniqueNodes(nodes) {
    const set = new Set();
    const result = [];
    for (const node of nodes) {
      if (!node || set.has(node)) {
        continue;
      }
      set.add(node);
      result.push(node);
    }
    return result;
  }

  function findRoleNodes(root = document) {
    return Array.from(root.querySelectorAll(ROLE_NODE_SELECTOR));
  }

  function resolveTurnNode(roleNode) {
    return (
      roleNode.closest('article[data-testid^="conversation-turn-"]') ||
      roleNode.closest('[data-testid*="conversation-turn"]') ||
      roleNode.closest("article") ||
      roleNode.closest('[data-testid^="conversation-turn-"]') ||
      roleNode.closest(".group.w-full") ||
      roleNode
    );
  }

  function findTurnNodes(root = document) {
    const roleNodes = findRoleNodes(root);
    const turns = roleNodes.map(resolveTurnNode).filter(Boolean);
    return uniqueNodes(turns);
  }

  function getRole(turnNode) {
    if (!turnNode || !(turnNode instanceof Element)) {
      return "unknown";
    }

    const direct = turnNode.getAttribute("data-message-author-role");
    if (direct) {
      return normalizeRole(direct);
    }

    const roleNode = turnNode.querySelector(ROLE_NODE_SELECTOR);
    if (!roleNode) {
      return "unknown";
    }

    return normalizeRole(roleNode.getAttribute("data-message-author-role") || "unknown");
  }

  function normalizeRole(role) {
    const value = String(role || "").toLowerCase();
    if (value === "assistant" || value === "user") {
      return value;
    }
    return "unknown";
  }

  function isStreaming(turnNode) {
    if (!turnNode || !(turnNode instanceof Element)) {
      return false;
    }

    const checks = [
      '[data-is-streaming="true"]',
      ".result-streaming",
      '[data-testid*="stop-button"]',
      'button[aria-label*="Stop"]',
      'button[aria-label*="중지"]'
    ];

    for (const selector of checks) {
      if (turnNode.matches(selector) || turnNode.querySelector(selector)) {
        return true;
      }
    }

    // Fallback: ChatGPT stop button can be rendered outside a specific turn.
    for (const selector of checks.slice(2)) {
      if (document.querySelector(selector)) {
        return true;
      }
    }

    return false;
  }

  function scoreCandidate(node) {
    const textLen = (node.innerText || "").trim().length;
    const children = node.children ? node.children.length : 0;
    const tag = node.tagName ? node.tagName.toLowerCase() : "";
    const semanticCount = node.querySelectorAll(SEMANTIC_BLOCK_SELECTOR).length;

    let bonus = 0;
    if (tag === "div" || tag === "section" || tag === "article") {
      bonus += 100;
    }
    if (tag === "p" || tag === "span") {
      bonus -= 40;
    }
    if (textLen > 5000) {
      bonus -= 1500;
    }

    return textLen + semanticCount * 32 + Math.min(children, 20) * 6 + bonus;
  }

  function pickLargestByText(nodes) {
    if (!nodes.length) {
      return null;
    }

    nodes.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
    return nodes[0] || null;
  }

  function getPrimaryContentRoot(turnNode, role = "unknown") {
    if (!turnNode || !(turnNode instanceof Element)) {
      return null;
    }

    const roleNode = turnNode.matches(ROLE_NODE_SELECTOR)
      ? turnNode
      : turnNode.querySelector(ROLE_NODE_SELECTOR);

    const rootForSearch = roleNode || turnNode;
    const roleSelectors =
      role === "assistant"
        ? [
            '[data-message-content]',
            '[data-testid*="message-content"]',
            ".markdown",
            '[class*="markdown"]',
            ".prose",
            '[class*="prose"]',
            '[class*="text-message"]'
          ]
        : ['[class*="whitespace-pre-wrap"]', "p", '[dir="auto"]', "span"];

    const fallbackSelectors = [
      '[data-message-content]',
      '[data-testid*="message-content"]',
      ".markdown",
      '[class*="markdown"]',
      ".prose",
      '[class*="prose"]',
      '[class*="whitespace-pre-wrap"]',
      '[class*="text-message"]',
      '[dir="auto"]'
    ];

    const candidates = Array.from(
      rootForSearch.querySelectorAll([...new Set([...roleSelectors, ...fallbackSelectors])].join(","))
    ).filter((node) => {
      const text = (node.innerText || "").trim();
      if (!text) {
        return false;
      }
      if (node.querySelector("textarea,input,form")) {
        return false;
      }
      if (node.querySelector('[data-message-author-role]')) {
        return false;
      }
      return true;
    });

    const top = pickLargestByText(candidates);
    if (top) {
      return top;
    }

    if (!roleNode) {
      return turnNode;
    }

    const leafCandidates = Array.from(roleNode.querySelectorAll("div,p,span")).filter(
      (el) => (el.textContent || "").trim().length > 0
    );

    return pickLargestByText(leafCandidates) || roleNode;
  }

  function getDirectRenderableBlocks(contentRoot) {
    if (!contentRoot || !(contentRoot instanceof Element)) {
      return [];
    }

    const children = Array.from(contentRoot.children).filter(
      (el) =>
        !el.classList.contains("hsr-role-meta") &&
        !el.classList.contains("hsr-random-sticker") &&
        !el.classList.contains("hsr-image-group") &&
        !el.classList.contains("hsr-typing-shell") &&
        !el.classList.contains("hsr-seq-loader")
    );

    const blocks = [];
    for (const child of children) {
      if (child.classList.contains("hsr-block-wrap")) {
        const inner = child.firstElementChild;
        if (inner) {
          blocks.push(inner);
        }
        continue;
      }
      blocks.push(child);
    }

    return blocks;
  }

  function isTopLevelSemantic(element, contentRoot) {
    if (!element || !contentRoot) {
      return false;
    }

    let current = element.parentElement;
    while (current && current !== contentRoot) {
      if (current.matches(SEMANTIC_BLOCK_SELECTOR)) {
        return false;
      }
      current = current.parentElement;
    }

    return true;
  }

  function findFallbackTextBlock(contentRoot) {
    const nodes = Array.from(contentRoot.querySelectorAll("p,div,span")).filter((el) => {
      const text = (el.textContent || "").trim();
      if (!text) {
        return false;
      }
      if (
        el.closest(
          ".hsr-block-wrap, .hsr-role-meta, .hsr-random-sticker, .hsr-typing-shell, .hsr-seq-loader"
        )
      ) {
        return false;
      }
      if (el.querySelector("pre,table,ul,ol,blockquote,img,video,svg,button,input,textarea")) {
        return false;
      }
      return true;
    });

    return pickLargestByText(nodes);
  }

  function getRenderableBlocks(contentRoot) {
    if (!contentRoot || !(contentRoot instanceof Element)) {
      return [];
    }

    const semantic = Array.from(contentRoot.querySelectorAll(SEMANTIC_BLOCK_SELECTOR)).filter(
      (el) =>
        isTopLevelSemantic(el, contentRoot) &&
        !el.closest(
          ".hsr-block-wrap, .hsr-role-meta, .hsr-random-sticker, .hsr-typing-shell, .hsr-seq-loader"
        )
    );

    if (semantic.length) {
      return semantic;
    }

    const direct = getDirectRenderableBlocks(contentRoot);
    if (direct.length) {
      return direct;
    }

    const fallback = findFallbackTextBlock(contentRoot);
    return fallback ? [fallback] : [];
  }

  function detectBlockKind(block) {
    if (!block || !(block instanceof Element)) {
      return "unknown";
    }

    const tag = block.tagName.toLowerCase();

    if (/^h[1-6]$/.test(tag)) {
      return "heading";
    }
    if (tag === "ul" || tag === "ol") {
      return "list";
    }
    if (tag === "blockquote") {
      return "blockquote";
    }
    if (tag === "hr") {
      return "hr";
    }
    if (tag === "pre" || block.querySelector("pre > code")) {
      return "code-block";
    }
    if (tag === "code") {
      return "inline-code";
    }
    if (tag === "table" || block.querySelector("table")) {
      return "table";
    }
    if (isImageBlock(block)) {
      return "image";
    }
    if (isAttachmentNode(block)) {
      return "file-attachment";
    }
    if (isWidgetNode(block)) {
      return "widget";
    }
    if (tag === "p" || tag === "div" || tag === "span") {
      return "paragraph";
    }

    return "unknown";
  }

  function isImageBlock(block) {
    if (!block || !(block instanceof Element)) {
      return false;
    }

    const tag = block.tagName.toLowerCase();
    if (["img", "figure", "picture"].includes(tag)) {
      return true;
    }

    const images = Array.from(block.querySelectorAll("img"));
    if (!images.length) {
      return false;
    }

    // Multiple images are almost always an image/gallery block.
    if (images.length >= 2) {
      return true;
    }

    // Keep non-image rich content out.
    if (block.querySelector("pre,table,ul,ol,blockquote")) {
      return false;
    }

    const textNodes = Array.from(block.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE);
    const directText = textNodes.map((node) => String(node.textContent || "")).join(" ").trim();
    const paragraphLikeText = Array.from(block.querySelectorAll("p,li")).reduce(
      (sum, el) => sum + String(el.textContent || "").trim().length,
      0
    );

    // If there is real paragraph/list text, treat as paragraph block.
    if (paragraphLikeText >= 80 || directText.length >= 80) {
      return false;
    }

    // Single image + short badges/captions should still be handled as image.
    return true;
  }

  function isAttachmentNode(block) {
    const link = block.matches("a") ? block : block.querySelector("a[href]");
    if (!link) {
      return false;
    }

    const href = link.getAttribute("href") || "";
    const download = link.hasAttribute("download");
    return download || /\/files?\//i.test(href) || /attachment/i.test(href);
  }

  function isWidgetNode(block) {
    return Boolean(
      block.matches('[data-testid*="widget"]') ||
        block.matches('[class*="widget"]') ||
        block.querySelector('[data-testid*="widget"]')
    );
  }

  function isParagraphCandidate(block) {
    if (!block || !(block instanceof Element)) {
      return false;
    }

    const tag = block.tagName.toLowerCase();
    if (tag === "p") {
      return true;
    }

    if (tag !== "div" && tag !== "span") {
      return false;
    }

    const text = (block.textContent || "").trim();
    if (!text) {
      return false;
    }

    const banned = block.querySelector(
      "pre,table,ul,ol,blockquote,img,video,svg,button,details,summary"
    );
    return !banned;
  }

  function hasInlineFormatting(block) {
    if (!block || !(block instanceof Element)) {
      return false;
    }

    return Boolean(
      block.querySelector("a,strong,em,b,i,code,kbd,mark,sup,sub,math,mjx-container")
    );
  }

  window.HSRSelectors = {
    findTurnNodes,
    getRole,
    isStreaming,
    getPrimaryContentRoot,
    getDirectRenderableBlocks,
    getRenderableBlocks,
    detectBlockKind,
    isParagraphCandidate,
    hasInlineFormatting
  };
})();
