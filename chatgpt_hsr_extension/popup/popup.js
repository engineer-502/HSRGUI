(() => {
  const catalog = window.HSRCharacterCatalog;
  if (!catalog) {
    return;
  }

  const CONFIG_KEY = "hsrConfig";
  const DEFAULT_CONFIG = {
    enabled: true,
    scope: "conversation-only",
    domains: "chatgpt+chat_openai",
    fidelity: "screenshot-high",
    splitMode: "sentence-length-hybrid",
    splitMaxChars: 180,
    splitMaxSentences: 2,
    assistantCharacterId: catalog.DEFAULT_CHARACTER_ID,
    stickerPack: catalog.DEFAULT_STICKERS.slice(),
    userName: "오공이",
    headerTitle: "오공열차",
    headerSubtitle: "인간개조의 용광로"
  };

  const el = {
    enabledToggle: document.getElementById("enabledToggle"),
    splitInput: document.getElementById("splitInput"),
    userNameInput: document.getElementById("userNameInput"),
    headerTitleInput: document.getElementById("headerTitleInput"),
    headerSubtitleInput: document.getElementById("headerSubtitleInput"),
    characterSearchInput: document.getElementById("characterSearchInput"),
    characterCount: document.getElementById("characterCount"),
    characterList: document.getElementById("characterList"),
    selectedCharacterIcon: document.getElementById("selectedCharacterIcon"),
    selectedCharacterName: document.getElementById("selectedCharacterName"),
    selectedCharacterStatus: document.getElementById("selectedCharacterStatus"),
    selectedCharacterSubtitle: document.getElementById("selectedCharacterSubtitle"),
    promptPreview: document.getElementById("promptPreview"),
    promptState: document.getElementById("promptState"),
    copyPromptButton: document.getElementById("copyPromptButton"),
    openPreview: document.getElementById("openPreview"),
    resetButton: document.getElementById("resetButton")
  };

  let currentConfig = { ...DEFAULT_CONFIG };

  function clamp(number, min, max, fallback) {
    const value = Number(number);
    if (Number.isNaN(value)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, value));
  }

  function mergeConfig(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const legacyId = catalog.migrateLegacyActorPreset(source.actorPreset);
    const assistantCharacterId = catalog.normalizeCharacterId(
      source.assistantCharacterId || legacyId || DEFAULT_CONFIG.assistantCharacterId
    );
    const merged = {
      ...DEFAULT_CONFIG,
      ...source,
      enabled: Boolean(source.enabled ?? DEFAULT_CONFIG.enabled),
      scope: "conversation-only",
      domains: "chatgpt+chat_openai",
      fidelity: "screenshot-high",
      splitMode: "sentence-length-hybrid",
      splitMaxChars: clamp(source.splitMaxChars, 160, 320, 180),
      splitMaxSentences: 2,
      assistantCharacterId,
      stickerPack: catalog.getStickerPack(assistantCharacterId),
      userName: String(source.userName || "").trim().slice(0, 24) || DEFAULT_CONFIG.userName,
      headerTitle: String(source.headerTitle || "").trim().slice(0, 24) || DEFAULT_CONFIG.headerTitle,
      headerSubtitle:
        String(source.headerSubtitle || "").trim().slice(0, 36) || DEFAULT_CONFIG.headerSubtitle
    };
    delete merged.actorPreset;
    return merged;
  }

  function getStoredConfig() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(CONFIG_KEY, (result) => {
        resolve(result[CONFIG_KEY] || null);
      });
    });
  }

  function saveConfig(config) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [CONFIG_KEY]: config }, resolve);
    });
  }

  function needsPersist(raw, merged) {
    if (!raw || typeof raw !== "object") {
      return true;
    }
    const keys = Object.keys(merged);
    return keys.some((key) => JSON.stringify(raw[key]) !== JSON.stringify(merged[key])) || "actorPreset" in raw;
  }

  function promptStatusLabel(status) {
    if (status === "ready") {
      return "READY";
    }
    return "PENDING";
  }

  function releaseStatusLabel(status) {
    if (status === "special") {
      return "SPECIAL";
    }
    if (status === "researching") {
      return "PENDING";
    }
    return "RELEASED";
  }

  function createCharacterButton(character, selectedId) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "character-option";
    if (character.id === selectedId) {
      button.classList.add("selected");
    }
    button.dataset.characterId = character.id;

    const image = document.createElement("img");
    image.src = chrome.runtime.getURL(`assets/icons/${character.iconFile}`);
    image.alt = character.displayName;

    const body = document.createElement("div");
    const title = document.createElement("div");
    title.className = "character-option-name";
    title.textContent = character.displayName;
    const subtitle = document.createElement("div");
    subtitle.className = "character-option-subtitle";
    subtitle.textContent =
      character.subtitle || (character.promptStatus === "ready" ? "연구 기반 프롬프트 사용 가능" : "프롬프트 리서치 대기 중");
    body.appendChild(title);
    body.appendChild(subtitle);

    const state = document.createElement("div");
    state.className = "character-option-state";
    state.textContent = releaseStatusLabel(character.releaseStatus);

    button.appendChild(image);
    button.appendChild(body);
    button.appendChild(state);
    button.addEventListener("click", async () => {
      currentConfig = mergeConfig({ ...currentConfig, assistantCharacterId: character.id });
      render(currentConfig);
      await saveConfig(currentConfig);
    });
    return button;
  }

  function renderCharacterList(config) {
    const query = (el.characterSearchInput.value || "").trim().toLowerCase();
    const visible = catalog
      .getVisibleCharacters()
      .filter((character) => !query || catalog.getSearchableText(character).includes(query));

    el.characterCount.textContent = `${visible.length} shown`;
    el.characterList.textContent = "";

    const order = ["released", "researching", "special"];
    for (const groupKey of order) {
      const items = visible.filter((character) => character.group === groupKey);
      if (!items.length) {
        continue;
      }
      const group = document.createElement("section");
      group.className = "character-group";
      const title = document.createElement("h3");
      title.textContent = catalog.GROUP_LABELS[groupKey] || groupKey;
      group.appendChild(title);
      items.forEach((character) => group.appendChild(createCharacterButton(character, config.assistantCharacterId)));
      el.characterList.appendChild(group);
    }
  }

  function renderCharacterCard(character) {
    el.selectedCharacterIcon.src = chrome.runtime.getURL(`assets/icons/${character.iconFile}`);
    el.selectedCharacterIcon.alt = character.displayName;
    el.selectedCharacterName.textContent = character.displayName;
    el.selectedCharacterStatus.textContent = promptStatusLabel(character.promptStatus);
    el.selectedCharacterStatus.dataset.status =
      character.promptStatus === "ready" ? character.releaseStatus : "pending";
    el.selectedCharacterSubtitle.textContent =
      character.subtitle || (character.promptStatus === "ready" ? "연구 기반 프롬프트가 준비되어 있습니다." : "리서치 대기 중인 캐릭터입니다.");
  }

  function renderPrompt(character) {
    const isReady = character.promptStatus === "ready";
    el.promptPreview.value = catalog.getPromptText(character.id);
    el.promptState.textContent = isReady ? "READY" : "PENDING";
    el.copyPromptButton.disabled = !isReady;
    el.copyPromptButton.textContent = isReady ? "프롬프트 복사" : "프롬프트 준비 중";
  }

  function render(config) {
    el.enabledToggle.checked = config.enabled;
    el.splitInput.value = String(config.splitMaxChars);
    el.userNameInput.value = config.userName;
    el.headerTitleInput.value = config.headerTitle;
    el.headerSubtitleInput.value = config.headerSubtitle;
    const character = catalog.getCharacter(config.assistantCharacterId);
    renderCharacterCard(character);
    renderCharacterList(config);
    renderPrompt(character);
  }

  function collectFromForm() {
    return mergeConfig({
      ...currentConfig,
      enabled: el.enabledToggle.checked,
      splitMaxChars: Number(el.splitInput.value),
      userName: el.userNameInput.value,
      headerTitle: el.headerTitleInput.value,
      headerSubtitle: el.headerSubtitleInput.value
    });
  }

  async function persistFromForm() {
    currentConfig = collectFromForm();
    render(currentConfig);
    await saveConfig(currentConfig);
  }

  async function copyTextToClipboard(text) {
    const value = String(text || "");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const helper = document.createElement("textarea");
    helper.value = value;
    helper.setAttribute("readonly", "readonly");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }

  function bindEvents() {
    el.enabledToggle.addEventListener("change", persistFromForm);
    el.splitInput.addEventListener("change", persistFromForm);
    el.userNameInput.addEventListener("change", persistFromForm);
    el.headerTitleInput.addEventListener("change", persistFromForm);
    el.headerSubtitleInput.addEventListener("change", persistFromForm);
    el.characterSearchInput.addEventListener("input", () => renderCharacterList(currentConfig));

    el.copyPromptButton.addEventListener("click", async () => {
      const previous = el.copyPromptButton.textContent;
      try {
        await copyTextToClipboard(el.promptPreview.value);
        el.copyPromptButton.textContent = "복사 완료";
      } catch (error) {
        el.copyPromptButton.textContent = "복사 실패";
      }
      window.setTimeout(() => {
        el.copyPromptButton.textContent = previous;
      }, 900);
    });

    el.openPreview.addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("preview/preview.html") });
    });

    el.resetButton.addEventListener("click", async () => {
      currentConfig = mergeConfig(DEFAULT_CONFIG);
      el.characterSearchInput.value = "";
      render(currentConfig);
      await saveConfig(currentConfig);
    });
  }

  async function init() {
    const stored = await getStoredConfig();
    currentConfig = mergeConfig(stored);
    if (needsPersist(stored, currentConfig)) {
      await saveConfig(currentConfig);
    }
    render(currentConfig);
    bindEvents();
  }

  init();
})();
