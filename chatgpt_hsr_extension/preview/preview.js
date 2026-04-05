(() => {
  const catalog = window.HSRCharacterCatalog;
  const configModel = window.HSRConfigModel;
  if (!catalog || !configModel) {
    return;
  }

  const copyButtons = document.querySelectorAll("[data-copy]");
  for (const button of copyButtons) {
    button.addEventListener("click", async () => {
      const text = button.getAttribute("data-copy") || "";
      try {
        await navigator.clipboard.writeText(text.replace(/\\n/g, "\n"));
        const old = button.textContent;
        button.textContent = "Copied";
        setTimeout(() => {
          button.textContent = old;
        }, 900);
      } catch (error) {
        button.textContent = "Copy failed";
      }
    });
  }

  function getStoredConfig() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(configModel.CONFIG_KEY, (result) => {
        resolve(result[configModel.CONFIG_KEY] || null);
      });
    });
  }

  function getSiteKeyFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const site = params.get("site");
    if (!site) {
      return null;
    }
    return configModel.normalizeSiteKey(site);
  }

  function applyPreviewProfile(profile) {
    const character = catalog.getCharacter(profile.assistantCharacterId);
    const assistantIconUrl = chrome.runtime.getURL(`assets/icons/${character.iconFile}`);
    const userIconUrl = chrome.runtime.getURL(catalog.DEFAULT_USER_ICON);

    const title = document.getElementById("previewHeaderTitle");
    const subtitle = document.getElementById("previewHeaderSubtitle");
    if (title) {
      title.textContent = profile.headerTitle;
    }
    if (subtitle) {
      subtitle.textContent = profile.headerSubtitle;
    }

    document.querySelectorAll("#previewAssistantNameTop,#previewAssistantNameBottom").forEach((node) => {
      node.textContent = character.displayName;
    });
    document.querySelectorAll("#previewAssistantIconTop,#previewAssistantIconBottom").forEach((node) => {
      node.src = assistantIconUrl;
      node.alt = character.displayName;
    });

    const userName = document.getElementById("previewUserName");
    const userIcon = document.getElementById("previewUserIcon");
    if (userName) {
      userName.textContent = profile.userName;
    }
    if (userIcon) {
      userIcon.src = userIconUrl;
      userIcon.alt = profile.userName;
    }
  }

  async function init() {
    const stored = await getStoredConfig();
    const merged = configModel.mergeConfig(stored);
    const siteKey = getSiteKeyFromQuery() || merged.popupTargetSite;
    const profile = configModel.getRuntimeSiteProfile(merged, siteKey);
    applyPreviewProfile(profile);
  }

  init();
})();
