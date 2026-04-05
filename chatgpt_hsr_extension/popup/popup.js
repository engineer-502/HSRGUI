(() => {
  const catalog = window.HSRCharacterCatalog;
  const configModel = window.HSRConfigModel;
  if (!catalog || !configModel) {
    return;
  }

  const CONFIG_KEY = configModel.CONFIG_KEY;

  const el = {
    siteTabs: Array.from(document.querySelectorAll(".site-tab")),
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

  let currentConfig = configModel.mergeConfig(null);
  let activeSiteKey = currentConfig.popupTargetSite;

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

  function promptStatusLabel(status) {
    return status === "ready" ? "준비 완료" : "준비 중";
  }

  function getActiveProfile() {
    return configModel.getSiteProfile(currentConfig, activeSiteKey);
  }

  function saveCurrentConfig() {
    return saveConfig(currentConfig);
  }

  function renderTabs() {
    for (const button of el.siteTabs) {
      const isActive = button.dataset.siteKey === activeSiteKey;
      button.classList.toggle("selected", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.tabIndex = isActive ? 0 : -1;
    }
    document.body.dataset.activeSiteKey = activeSiteKey;
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
    subtitle.textContent = character.subtitle || character.summary || "";
    body.appendChild(title);
    body.appendChild(subtitle);

    button.appendChild(image);
    button.appendChild(body);
    button.addEventListener("click", async () => {
      currentConfig = configModel.updateSiteProfile(currentConfig, activeSiteKey, {
        assistantCharacterId: character.id
      });
      render();
      await saveCurrentConfig();
    });
    return button;
  }

  function renderCharacterList(profile) {
    const query = (el.characterSearchInput.value || "").trim().toLowerCase();
    const visible = catalog
      .getVisibleCharacters()
      .filter((character) => !query || catalog.getSearchableText(character).includes(query));

    el.characterCount.textContent = `${visible.length}명`;
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
      items.forEach((character) => group.appendChild(createCharacterButton(character, profile.assistantCharacterId)));
      el.characterList.appendChild(group);
    }
  }

  function renderCharacterCard(character) {
    el.selectedCharacterIcon.src = chrome.runtime.getURL(`assets/icons/${character.iconFile}`);
    el.selectedCharacterIcon.alt = character.displayName;
    el.selectedCharacterName.textContent = character.displayName;
    el.selectedCharacterStatus.textContent = "";
    el.selectedCharacterStatus.dataset.status = "";
    el.selectedCharacterSubtitle.textContent = character.subtitle || character.summary || "";
  }

  function renderPrompt(character) {
    const isReady = character.promptStatus === "ready";
    el.promptPreview.value = catalog.getPromptText(character.id);
    el.promptState.textContent = isReady ? "준비 완료" : "준비 중";
    el.copyPromptButton.disabled = !isReady;
    el.copyPromptButton.textContent = isReady ? "프롬프트 복사" : "프롬프트 준비 중";
  }

  function render() {
    const profile = getActiveProfile();
    const character = catalog.getCharacter(profile.assistantCharacterId);

    renderTabs();
    el.enabledToggle.checked = profile.enabled;
    el.splitInput.value = String(profile.splitMaxChars);
    el.userNameInput.value = profile.userName;
    el.headerTitleInput.value = profile.headerTitle;
    el.headerSubtitleInput.value = profile.headerSubtitle;
    renderCharacterCard(character);
    renderCharacterList(profile);
    renderPrompt(character);
  }

  function collectPatchFromForm() {
    return {
      enabled: el.enabledToggle.checked,
      splitMaxChars: Number(el.splitInput.value),
      userName: el.userNameInput.value,
      headerTitle: el.headerTitleInput.value,
      headerSubtitle: el.headerSubtitleInput.value
    };
  }

  async function persistFromForm() {
    currentConfig = configModel.updateSiteProfile(currentConfig, activeSiteKey, collectPatchFromForm());
    render();
    await saveCurrentConfig();
  }

  async function switchSite(siteKey) {
    activeSiteKey = configModel.normalizeSiteKey(siteKey);
    currentConfig = configModel.setPopupTargetSite(currentConfig, activeSiteKey);
    render();
    await saveCurrentConfig();
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
    for (const button of el.siteTabs) {
      button.addEventListener("click", () => {
        switchSite(button.dataset.siteKey);
      });
    }

    el.enabledToggle.addEventListener("change", persistFromForm);
    el.splitInput.addEventListener("change", persistFromForm);
    el.userNameInput.addEventListener("change", persistFromForm);
    el.headerTitleInput.addEventListener("change", persistFromForm);
    el.headerSubtitleInput.addEventListener("change", persistFromForm);
    el.characterSearchInput.addEventListener("input", () => renderCharacterList(getActiveProfile()));

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
      chrome.tabs.create({
        url: chrome.runtime.getURL(`preview/preview.html?site=${encodeURIComponent(activeSiteKey)}`)
      });
    });

    el.resetButton.addEventListener("click", async () => {
      currentConfig = configModel.setSiteProfile(
        currentConfig,
        activeSiteKey,
        configModel.DEFAULT_SITE_PROFILE
      );
      el.characterSearchInput.value = "";
      render();
      await saveCurrentConfig();
    });
  }

  async function init() {
    const stored = await getStoredConfig();
    currentConfig = configModel.mergeConfig(stored);
    activeSiteKey = currentConfig.popupTargetSite;

    if (configModel.needsPersist(stored, currentConfig)) {
      await saveCurrentConfig();
    }

    render();
    bindEvents();
  }

  init();
})();
