(() => {
  const catalog = window.HSRCharacterCatalog;
  if (!catalog) {
    return;
  }

  const ALL_STICKERS = catalog.ALL_STICKERS.slice();
  const ALLOWED_STICKERS = new Set(ALL_STICKERS.map((name) => name.toLowerCase()));

  function normalizeStickerPack(input, fallbackPack = ALL_STICKERS) {
    const fallback =
      Array.isArray(fallbackPack) && fallbackPack.length ? fallbackPack.slice() : ALL_STICKERS.slice();
    if (!Array.isArray(input) || !input.length) {
      return fallback;
    }
    const sanitized = input
      .map((value) => String(value || "").trim())
      .filter((value) => ALLOWED_STICKERS.has(value.toLowerCase()));
    return sanitized.length ? sanitized : fallback;
  }

  function shouldInjectSticker(params) {
    const safe = params && typeof params === "object" ? params : {};
    const enabled = Boolean(safe.enabled);
    const rate = Number(safe.rate || 0);
    const cooldown = Number(safe.cooldown || 0);
    const currentTurn = Number(safe.currentTurn || 0);
    const lastTurn = Number(safe.lastTurn || -9999);
    if (!enabled || currentTurn - lastTurn <= cooldown) {
      return false;
    }
    return Math.random() < rate;
  }

  function pickSticker(stickerPack) {
    const pool = normalizeStickerPack(stickerPack);
    const index = Math.floor(Math.random() * pool.length);
    return pool[index];
  }

  window.HSRStickers = {
    ALL_STICKERS,
    DEFAULT_STICKERS: catalog.DEFAULT_STICKERS.slice(),
    normalizeStickerPack,
    pickSticker,
    shouldInjectSticker,
    stickerRuntimeUrl(fileName) {
      return chrome.runtime.getURL(`assets/stickers/${fileName}`);
    }
  };
})();
