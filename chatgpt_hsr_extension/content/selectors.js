(() => {
  const ROLE_NODE_SELECTOR = "[data-message-author-role]";
  const CHATGPT_STREAM_SELECTORS = [
    '[data-is-streaming="true"]',
    ".result-streaming",
    '[data-testid*="stop-button"]',
    'button[aria-label*="Stop"]',
    'button[aria-label*="중지"]'
  ];
  const SEMANTIC_BLOCK_SELECTOR = [
    "p",
    "pre",
    "table",
    "ul",
    "ol",
    "blockquote",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "figure",
    "response-element",
    ".attachment-container.search-images",
    "single-image",
    ".image-container"
  ].join(",");

  function detectSiteKey() {
    if (window.HSRConfigModel && typeof window.HSRConfigModel.detectSiteFromLocation === "function") {
      return window.HSRConfigModel.detectSiteFromLocation(window.location);
    }

    const hostname = String(window.location.hostname || "").toLowerCase();
    if (hostname === "gemini.google.com") {
      return "gemini";
    }
    return "chatgpt";
  }

  function normalizeRole(role) {
    const value = String(role || "").toLowerCase();
    if (value === "assistant" || value === "user") {
      return value;
    }
    return "unknown";
  }

  function uniqueNodes(nodes) {
    const seen = new Set();
    const result = [];
    for (const node of nodes) {
      if (!node || seen.has(node)) {
        continue;
      }
      seen.add(node);
      result.push(node);
    }
    return result;
  }

  function querySelfAndDescendants(root, selector) {
    if (!root) {
      return [];
    }

    const results = [];
    if (root instanceof Element && root.matches(selector)) {
      results.push(root);
    }

    if (root instanceof Element || root instanceof Document || root instanceof DocumentFragment) {
      results.push(...Array.from(root.querySelectorAll(selector)));
    }

    return uniqueNodes(results);
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

  function isGeminiAssistantTurnNode(node) {
    return Boolean(
      node &&
        node instanceof Element &&
        node.matches("response-container") &&
        node.closest("model-response")
    );
  }

  function isChatGPTStreamingTurn(turnNode) {
    if (!turnNode || !(turnNode instanceof Element)) {
      return false;
    }

    for (const selector of CHATGPT_STREAM_SELECTORS) {
      if (turnNode.matches(selector) || turnNode.querySelector(selector)) {
        return true;
      }
    }

    for (const selector of CHATGPT_STREAM_SELECTORS.slice(2)) {
      if (document.querySelector(selector)) {
        return true;
      }
    }

    return false;
  }

  function isElementVisiblyEnabled(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    if (node.getAttribute("aria-disabled") === "true" || node.hasAttribute("disabled")) {
      return false;
    }
    return node.offsetParent !== null;
  }

  function isGeminiComposerGenerating() {
    const candidates = Array.from(
      document.querySelectorAll(
        'button[aria-label*="대답 생성 중지"], button[aria-label*="생성 중지"], button[aria-label*="Stop"], .send-button.stop'
      )
    );

    return candidates.some((node) => isElementVisiblyEnabled(node));
  }

  const chatgptAdapter = {
    getSiteKey() {
      return "chatgpt";
    },
    findConversationRoot(root = document) {
      if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) {
        return null;
      }
      return root.querySelector("main") || document.querySelector("main");
    },
    findTurnNodes(root = document) {
      const roleNodes = querySelfAndDescendants(root, ROLE_NODE_SELECTOR);
      const turns = roleNodes
        .map((roleNode) => {
          return (
            roleNode.closest('article[data-testid^="conversation-turn-"]') ||
            roleNode.closest('[data-testid*="conversation-turn"]') ||
            roleNode.closest("article") ||
            roleNode.closest(".group.w-full") ||
            roleNode
          );
        })
        .filter(Boolean);
      return uniqueNodes(turns);
    },
    getRole(turnNode) {
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
    },
    getPrimaryContentRoot(turnNode, role = "unknown") {
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
        if (node.querySelector(ROLE_NODE_SELECTOR)) {
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
    },
    isStreaming(turnNode) {
      return isChatGPTStreamingTurn(turnNode);
    },
    findPendingAssistantTurnsFromMutation(node) {
      if (!(node instanceof Element)) {
        return [];
      }

      const turns = [];
      if (node.matches('[data-message-author-role="assistant"]')) {
        turns.push(
          node.closest('article[data-testid^="conversation-turn-"]') ||
            node.closest('[data-testid*="conversation-turn"]') ||
            node.closest("article") ||
            node.closest(".group.w-full") ||
            node
        );
      }

      turns.push(...this.findTurnNodes(node));
      return uniqueNodes(turns).filter((turn) => this.getRole(turn) === "assistant");
    },
    hasFinalActions(turnNode) {
      if (!turnNode || !(turnNode instanceof Element)) {
        return false;
      }

      const selectors = [
        '[data-testid*="copy-turn"]',
        '[data-testid*="conversation-turn-feedback"]',
        '[data-testid*="message-actions"]',
        'button[aria-label*="Copy"]',
        'button[aria-label*="복사"]',
        'button[aria-label*="Good response"]',
        'button[aria-label*="Bad response"]',
        'button[aria-label*="좋아요"]',
        'button[aria-label*="싫어요"]'
      ];

      return selectors.some((selector) => Boolean(turnNode.querySelector(selector)));
    }
  };

  const geminiAdapter = {
    getSiteKey() {
      return "gemini";
    },
    findConversationRoot(root = document) {
      if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) {
        return null;
      }

      return (
        root.querySelector("chat-window") ||
        root.querySelector("bard-sidenav-content .content-wrapper") ||
        root.querySelector("main.chat-app") ||
        root.querySelector("chat-app") ||
        document.querySelector("chat-window") ||
        document.querySelector("main.chat-app")
      );
    },
    findTurnNodes(root = document) {
      const nodes = querySelfAndDescendants(root, "user-query, response-container").filter((node) => {
        if (!(node instanceof Element)) {
          return false;
        }
        if (node.matches("user-query")) {
          return true;
        }
        return isGeminiAssistantTurnNode(node);
      });

      return uniqueNodes(nodes);
    },
    getRole(turnNode) {
      if (!turnNode || !(turnNode instanceof Element)) {
        return "unknown";
      }
      if (turnNode.matches("user-query")) {
        return "user";
      }
      if (isGeminiAssistantTurnNode(turnNode)) {
        return "assistant";
      }
      return "unknown";
    },
    getPrimaryContentRoot(turnNode, role = "unknown") {
      if (!turnNode || !(turnNode instanceof Element)) {
        return null;
      }

      if (role === "user") {
        return (
          turnNode.querySelector(".query-text") ||
          turnNode.querySelector(".user-query-bubble-with-background .query-text") ||
          turnNode.querySelector(".user-query-bubble-with-background") ||
          turnNode.querySelector(".query-content") ||
          turnNode
        );
      }

      return (
        turnNode.querySelector("message-content .markdown") ||
        turnNode.querySelector("message-content") ||
        turnNode.querySelector("structured-content-container .container") ||
        turnNode.querySelector(".response-content") ||
        turnNode
      );
    },
    isStreaming(turnNode) {
      if (!turnNode || !(turnNode instanceof Element)) {
        return false;
      }

      const busySignal =
        turnNode.matches('[aria-busy="true"]') ||
        turnNode.querySelector('message-content[aria-busy="true"]') ||
        turnNode.querySelector('.markdown[aria-busy="true"]') ||
        turnNode.querySelector('[aria-busy="true"]');

      if (
        !busySignal &&
        !turnNode.querySelector(".response-container-header-processing-state")
      ) {
        return false;
      }

      const processingState = turnNode.querySelector(".response-container-header-processing-state");
      const processingSignal = Boolean(
        processingState &&
          (processingState.childElementCount > 0 || (processingState.textContent || "").trim())
      );

      if (!busySignal && !processingSignal) {
        return false;
      }

      if (!isGeminiComposerGenerating()) {
        if (this.hasFinalActions(turnNode)) {
          return false;
        }

        const text = String(turnNode.innerText || turnNode.textContent || "").trim();
        if (text.length > 0) {
          return false;
        }
      }

      return busySignal || processingSignal;
    },
    findPendingAssistantTurnsFromMutation(node) {
      if (!(node instanceof Element)) {
        return [];
      }

      const turns = querySelfAndDescendants(node, "response-container").filter((candidate) =>
        isGeminiAssistantTurnNode(candidate)
      );

      return uniqueNodes(turns);
    },
    hasFinalActions(turnNode) {
      if (!turnNode || !(turnNode instanceof Element)) {
        return false;
      }

      const selectors = [
        "message-actions",
        '[data-test-id="copy-button"]',
        "thumb-up-button",
        "thumb-down-button",
        "regenerate-button",
        '[data-test-id="more-menu-button"]'
      ];

      return selectors.some((selector) => Boolean(turnNode.querySelector(selector)));
    }
  };

  function getCurrentAdapter() {
    return detectSiteKey() === "gemini" ? geminiAdapter : chatgptAdapter;
  }

  function isImageBlock(block) {
    if (!block || !(block instanceof Element)) {
      return false;
    }

    if (
      block.matches(".attachment-container.search-images") ||
      block.matches("single-image") ||
      block.matches(".image-container")
    ) {
      return true;
    }

    const tag = block.tagName.toLowerCase();
    if (["img", "figure", "picture"].includes(tag)) {
      return true;
    }

    const images = Array.from(block.querySelectorAll("img"));
    if (!images.length) {
      return false;
    }

    if (images.length >= 2) {
      return true;
    }

    if (block.querySelector("pre,table,ul,ol,blockquote")) {
      return false;
    }

    const textNodes = Array.from(block.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE);
    const directText = textNodes
      .map((node) => String(node.textContent || ""))
      .join(" ")
      .trim();
    const paragraphLikeText = Array.from(block.querySelectorAll("p,li")).reduce(
      (sum, el) => sum + String(el.textContent || "").trim().length,
      0
    );

    if (paragraphLikeText >= 80 || directText.length >= 80) {
      return false;
    }

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
        block.matches("response-element") ||
        block.querySelector('[data-testid*="widget"]')
    );
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
    getSiteKey() {
      return getCurrentAdapter().getSiteKey();
    },
    findConversationRoot(root = document) {
      return getCurrentAdapter().findConversationRoot(root);
    },
    findTurnNodes(root = document) {
      return getCurrentAdapter().findTurnNodes(root);
    },
    getRole(turnNode) {
      return getCurrentAdapter().getRole(turnNode);
    },
    getPrimaryContentRoot(turnNode, role = "unknown") {
      return getCurrentAdapter().getPrimaryContentRoot(turnNode, role);
    },
    isStreaming(turnNode) {
      return getCurrentAdapter().isStreaming(turnNode);
    },
    findPendingAssistantTurnsFromMutation(node) {
      return getCurrentAdapter().findPendingAssistantTurnsFromMutation(node);
    },
    hasFinalActions(turnNode) {
      return getCurrentAdapter().hasFinalActions(turnNode);
    },
    getDirectRenderableBlocks,
    getRenderableBlocks,
    detectBlockKind,
    isParagraphCandidate,
    hasInlineFormatting
  };
})();
