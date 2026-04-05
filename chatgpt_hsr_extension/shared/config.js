(() => {
  const catalog = window.HSRCharacterCatalog;
  if (!catalog) {
    return;
  }

  const CONFIG_KEY = "hsrConfig";
  const SITE_KEYS = ["chatgpt", "gemini"];
  const DEFAULT_HEADER_TITLE = "오공열차";
  const DEFAULT_HEADER_SUBTITLE = "인간개조의 용광로";
  const LEGACY_HEADER_TITLES = new Set(["오공열차"]);
  const LEGACY_HEADER_SUBTITLES = new Set(["인간개조의 용광로", "인간개조의 용광로"]);
  const LEGACY_USER_NAMES = new Set(["Stelle", "stelle"]);

  const DEFAULT_SITE_PROFILE = Object.freeze({
    enabled: true,
    splitMaxChars: 180,
    assistantCharacterId: catalog.DEFAULT_CHARACTER_ID,
    userName: "오공이",
    headerTitle: DEFAULT_HEADER_TITLE,
    headerSubtitle: DEFAULT_HEADER_SUBTITLE
  });

  const DEFAULT_CONFIG = Object.freeze({
    popupTargetSite: "chatgpt",
    sites: {
      chatgpt: { ...DEFAULT_SITE_PROFILE },
      gemini: { ...DEFAULT_SITE_PROFILE }
    }
  });

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (Number.isNaN(number)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, number));
  }

  function normalizeSiteKey(siteKey) {
    return SITE_KEYS.includes(siteKey) ? siteKey : "chatgpt";
  }

  function detectSiteFromLocation(target = window.location) {
    const hostname = String(target && target.hostname ? target.hostname : "").toLowerCase();
    if (hostname === "gemini.google.com") {
      return "gemini";
    }
    return "chatgpt";
  }

  function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeSiteProfile(raw, fallback = DEFAULT_SITE_PROFILE) {
    const source = raw && typeof raw === "object" ? raw : {};
    const base = fallback && typeof fallback === "object" ? fallback : DEFAULT_SITE_PROFILE;
    const assistantCharacterId = catalog.normalizeCharacterId(
      source.assistantCharacterId ||
        catalog.migrateLegacyActorPreset(source.actorPreset) ||
        base.assistantCharacterId ||
        catalog.DEFAULT_CHARACTER_ID
    );

    const normalized = {
      enabled: Boolean(source.enabled ?? base.enabled ?? DEFAULT_SITE_PROFILE.enabled),
      splitMaxChars: clampNumber(
        source.splitMaxChars ?? base.splitMaxChars,
        160,
        320,
        DEFAULT_SITE_PROFILE.splitMaxChars
      ),
      assistantCharacterId,
      userName:
        String(source.userName ?? base.userName ?? "").trim().slice(0, 24) ||
        DEFAULT_SITE_PROFILE.userName,
      headerTitle:
        String(source.headerTitle ?? base.headerTitle ?? "").trim().slice(0, 24) ||
        DEFAULT_SITE_PROFILE.headerTitle,
      headerSubtitle:
        String(source.headerSubtitle ?? base.headerSubtitle ?? "").trim().slice(0, 36) ||
        DEFAULT_SITE_PROFILE.headerSubtitle
    };

    if (LEGACY_USER_NAMES.has(normalized.userName)) {
      normalized.userName = DEFAULT_SITE_PROFILE.userName;
    }
    if (LEGACY_HEADER_TITLES.has(normalized.headerTitle)) {
      normalized.headerTitle = DEFAULT_SITE_PROFILE.headerTitle;
    }
    if (LEGACY_HEADER_SUBTITLES.has(normalized.headerSubtitle)) {
      normalized.headerSubtitle = DEFAULT_SITE_PROFILE.headerSubtitle;
    }

    return normalized;
  }

  function isLegacyFlatConfig(raw) {
    if (!raw || typeof raw !== "object" || raw.sites) {
      return false;
    }

    return [
      "enabled",
      "assistantCharacterId",
      "actorPreset",
      "splitMaxChars",
      "userName",
      "headerTitle",
      "headerSubtitle",
      "domains",
      "scope"
    ].some((key) => key in raw);
  }

  function mergeConfig(raw) {
    const source = raw && typeof raw === "object" ? raw : null;

    if (!source) {
      return cloneData(DEFAULT_CONFIG);
    }

    const popupTargetSite = normalizeSiteKey(source.popupTargetSite);

    if (isLegacyFlatConfig(source)) {
      const migratedChatGPT = normalizeSiteProfile(source, DEFAULT_SITE_PROFILE);
      return {
        popupTargetSite,
        sites: {
          chatgpt: migratedChatGPT,
          gemini: normalizeSiteProfile(source.sites && source.sites.gemini, migratedChatGPT)
        }
      };
    }

    const rawSites = source.sites && typeof source.sites === "object" ? source.sites : {};
    const chatgptProfile = normalizeSiteProfile(rawSites.chatgpt, DEFAULT_SITE_PROFILE);
    const geminiProfile = normalizeSiteProfile(rawSites.gemini, chatgptProfile);

    return {
      popupTargetSite,
      sites: {
        chatgpt: chatgptProfile,
        gemini: geminiProfile
      }
    };
  }

  function getSiteProfile(rawConfig, siteKey) {
    const merged = mergeConfig(rawConfig);
    const key = normalizeSiteKey(siteKey);
    return { ...merged.sites[key] };
  }

  function getRuntimeSiteProfile(rawConfig, siteKey) {
    const key = normalizeSiteKey(siteKey);
    const profile = getSiteProfile(rawConfig, key);
    return {
      ...profile,
      siteKey: key,
      splitMaxSentences: 2,
      stickerPack: catalog.getStickerPack(profile.assistantCharacterId)
    };
  }

  function setSiteProfile(rawConfig, siteKey, nextProfile) {
    const merged = mergeConfig(rawConfig);
    const key = normalizeSiteKey(siteKey);
    merged.sites[key] = normalizeSiteProfile(nextProfile, merged.sites[key]);
    return mergeConfig(merged);
  }

  function updateSiteProfile(rawConfig, siteKey, patch) {
    const merged = mergeConfig(rawConfig);
    const key = normalizeSiteKey(siteKey);
    merged.sites[key] = normalizeSiteProfile(
      { ...merged.sites[key], ...(patch && typeof patch === "object" ? patch : {}) },
      merged.sites[key]
    );
    return mergeConfig(merged);
  }

  function setPopupTargetSite(rawConfig, siteKey) {
    const merged = mergeConfig(rawConfig);
    merged.popupTargetSite = normalizeSiteKey(siteKey);
    return mergeConfig(merged);
  }

  function needsPersist(raw, merged) {
    return JSON.stringify(raw || null) !== JSON.stringify(merged || null);
  }

  window.HSRConfigModel = {
    CONFIG_KEY,
    SITE_KEYS,
    DEFAULT_CONFIG: cloneData(DEFAULT_CONFIG),
    DEFAULT_SITE_PROFILE: { ...DEFAULT_SITE_PROFILE },
    normalizeSiteKey,
    detectSiteFromLocation,
    mergeConfig,
    getSiteProfile,
    getRuntimeSiteProfile,
    setSiteProfile,
    updateSiteProfile,
    setPopupTargetSite,
    needsPersist
  };
})();
