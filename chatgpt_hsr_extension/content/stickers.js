(() => {
  const PRESET_STICKER_PACKS = {
    "march7th-stelle": Array.from({ length: 16 }, (_, index) => `sticker_${index + 1}.png`),
    "acheron-stelle": ["sticker_193.png", "sticker_194.png", "sticker_195.png", "sticker_196.png"],
    "castorice-stelle": [
      "sticker_330.png",
      "sticker_336.png",
      "sticker_337.png",
      "sticker_338.png",
      "sticker_339.png",
      "sticker_340.png",
      "sticker_425.png"
    ]
  };

  const DEFAULT_STICKERS = PRESET_STICKER_PACKS["march7th-stelle"].slice();
  const DEFAULT_STICKER_SET = new Set(
    Object.values(PRESET_STICKER_PACKS)
      .flat()
      .map((name) => name.toLowerCase())
  );

  function normalizeStickerPack(input, fallbackPack = DEFAULT_STICKERS) {
    const fallback =
      Array.isArray(fallbackPack) && fallbackPack.length ? fallbackPack.slice() : DEFAULT_STICKERS.slice();

    if (!Array.isArray(input) || !input.length) {
      return fallback;
    }

    const sanitized = input
      .map((value) => String(value || "").trim())
      .filter((value) => DEFAULT_STICKER_SET.has(value.toLowerCase()));

    return sanitized.length ? sanitized : fallback;
  }

  function shouldInjectSticker(params) {
    const safe = params && typeof params === "object" ? params : {};
    const enabled = Boolean(safe.enabled);
    const rate = Number(safe.rate || 0);
    const cooldown = Number(safe.cooldown || 0);
    const currentTurn = Number(safe.currentTurn || 0);
    const lastTurn = Number(safe.lastTurn || -9999);

    if (!enabled) {
      return false;
    }
    if (currentTurn - lastTurn <= cooldown) {
      return false;
    }
    return Math.random() < rate;
  }

  function pickSticker(stickerPack) {
    const pool = normalizeStickerPack(stickerPack);
    const index = Math.floor(Math.random() * pool.length);
    return pool[index];
  }

  function stickerRuntimeUrl(fileName) {
    return chrome.runtime.getURL("assets/stickers/" + fileName);
  }

  window.HSRStickers = {
    PRESET_STICKER_PACKS,
    DEFAULT_STICKERS,
    normalizeStickerPack,
    shouldInjectSticker,
    pickSticker,
    stickerRuntimeUrl
  };
})();
