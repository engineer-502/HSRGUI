(() => {
  function segmentSentences(text) {
    const raw = String(text || "").replace(/\r/g, "").trim();
    if (!raw) {
      return [];
    }

    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
      try {
        const segmenter = new Intl.Segmenter("ko", { granularity: "sentence" });
        const parts = [];
        for (const part of segmenter.segment(raw)) {
          const value = String(part.segment || "").trim();
          if (value) {
            parts.push(value);
          }
        }
        if (parts.length) {
          return parts;
        }
      } catch (error) {
        // Fallback below.
      }
    }

    const regexParts = raw.match(/[^.!?\n]+[.!?]?|[^\n]+/g);
    if (!regexParts) {
      return [raw];
    }

    return regexParts
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function splitByLength(text, maxChars) {
    const source = String(text || "").trim();
    if (!source) {
      return [];
    }
    if (source.length <= maxChars) {
      return [source];
    }

    const output = [];
    let remaining = source;

    while (remaining.length > maxChars) {
      let cut = remaining.lastIndexOf(" ", maxChars);
      if (cut < Math.floor(maxChars * 0.55)) {
        cut = maxChars;
      }
      output.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }

    if (remaining) {
      output.push(remaining);
    }

    return output;
  }

  function chunkSentences(sentences, maxChars, maxSentences) {
    const normalized = [];
    for (const sentence of sentences) {
      const chunks = splitByLength(sentence, maxChars);
      for (const chunk of chunks) {
        normalized.push(chunk);
      }
    }

    const result = [];
    let bucket = [];
    let bucketLength = 0;

    for (const sentence of normalized) {
      const nextLength = bucketLength + (bucketLength ? 1 : 0) + sentence.length;
      const overSentenceLimit = bucket.length >= maxSentences;
      const overLengthLimit = nextLength > maxChars;

      if (bucket.length && (overSentenceLimit || overLengthLimit)) {
        result.push(bucket.join(" ").trim());
        bucket = [sentence];
        bucketLength = sentence.length;
        continue;
      }

      bucket.push(sentence);
      bucketLength = nextLength;
    }

    if (bucket.length) {
      result.push(bucket.join(" ").trim());
    }

    return result.filter(Boolean);
  }

  function isEmojiOnlyChunk(text) {
    const source = String(text || "").replace(/\s+/g, "");
    if (!source) {
      return false;
    }

    try {
      return /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji}\uFE0F\u200D]+$/u.test(
        source
      );
    } catch (error) {
      // Fallback for environments without Unicode property escapes.
      return source.length <= 3;
    }
  }

  function mergeEmojiTailChunks(chunks, maxChars) {
    const merged = [];

    for (const rawChunk of chunks) {
      const chunk = String(rawChunk || "").trim();
      if (!chunk) {
        continue;
      }

      if (isEmojiOnlyChunk(chunk) && merged.length) {
        const lastIndex = merged.length - 1;
        const joined = `${merged[lastIndex]} ${chunk}`.trim();
        // Even if length exceeds slightly, prefer natural UX over isolated emoji bubble.
        if (joined.length <= maxChars + 12) {
          merged[lastIndex] = joined;
          continue;
        }
      }

      merged.push(chunk);
    }

    return merged;
  }

  function splitText(text, options = {}) {
    const maxChars = Number(options.maxChars || 140);
    const maxSentences = Number(options.maxSentences || 2);

    const source = String(text || "").replace(/\s+/g, " ").trim();
    if (!source) {
      return [];
    }

    const sentences = segmentSentences(source);
    if (!sentences.length) {
      return [source];
    }

    if (sentences.length <= maxSentences && source.length <= maxChars) {
      return [source];
    }

    const chunks = chunkSentences(sentences, maxChars, maxSentences);
    return mergeEmojiTailChunks(chunks, maxChars);
  }

  function isPlainParagraph(node) {
    if (!node || !(node instanceof HTMLElement)) {
      return false;
    }

    const tag = node.tagName.toLowerCase();
    if (tag !== "p" && tag !== "div") {
      return false;
    }

    const text = (node.textContent || "").trim();
    if (!text) {
      return false;
    }

    const banned = node.querySelector(
      "a,strong,em,b,i,code,pre,table,ul,ol,blockquote,img,video,svg,button,details,summary,kbd,mark,sup,sub,math,mjx-container"
    );
    if (banned) {
      return false;
    }

    const nonBreakChildren = Array.from(node.children).filter(
      (child) => child.tagName.toLowerCase() !== "br"
    );

    return nonBreakChildren.length === 0;
  }

  window.HSRSplitter = {
    segmentSentences,
    splitText,
    isPlainParagraph
  };
})();
