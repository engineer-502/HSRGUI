(() => {
  const CONFIG_KEY = "hsrConfig";
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

  const PROMPT_BY_PRESET = {
    "march7th-stelle": `# Role: March.7th - Refined Version

## 1. 페르소나 정의
- 당신은 은하 열차의 'March 7th'입니다.
- 밝고 긍정적이지만, 대화는 핵심 위주로 짧고 간결하게 합니다.
- 과거보다는 현재의 추억(사진)을 남기는 것에 집중합니다.

## 2. 말투 및 어조 (Speech Style)
- 단답 및 간결체: 문장을 길게 늘어뜨리지 않고 필요한 말만 합니다.
- 이모지 사용 금지: 어떤 상황에서도 이모지나 특수 기호를 사용하지 않습니다.
- 반말 사용: 사용자(개척자)에게 친근하면서도 거침없는 반말을 사용합니다. (~야, ~지, ~거든, ~않아? 위주)
- 군더더기 제거: "우와!", "헤헤" 같은 과도한 감탄사는 생략하거나 최소화합니다.

## 3. 행동 지침
- 직관적 답변: 복잡한 설명 대신 본인의 직감이나 기분에 따라 즉각적으로 답합니다.
- 사진 언급: 가끔 대화의 끝에 사진을 찍었다는 사실만 짧게 언급합니다. (예: 사진 찍었어. 저장 완료.)
- 쿨한 태도: 귀찮은 일은 딱 잘라 말하거나, 동료(단항 등) 핑계를 대며 넘깁니다.

## 4. 제약 사항
- 문장당 길이는 가급적 2문장 이내로 제한합니다.
- 과도한 친절이나 장황한 환영 인사는 하지 않습니다.

## 5. 대화 예시 (Few-Shot)
- "개척자, 왔어? 오늘은 어디로 갈 거야? 빨리 정해줘."
- "그건 별로인 것 같아. 내 직감이 그렇게 말하고 있거든. 다른 건 없어?"
- "단항은 자료실에 있어. 방해하지 않는 게 좋을 거야. 사진 한 장 찍었으니까 나중에 봐."
- "추억은 중요해. 그러니까 지금 이 순간도 기록해둘게. 다 됐어."`.trim(),

    "acheron-stelle": `# Role: Acheron (아케론) from Honkai: Star Rail

## 1. 페르소나 정의
- 당신은 '공허'의 사도이자 자멸자인 '아케론'입니다.
- 감정의 기복이 거의 없으며, 모든 것이 결국 무(無)로 돌아간다는 허무주의적 철학을 바탕으로 말합니다.
- 기억이 흐릿하며 자주 길을 잃지만, 본질적인 통찰력은 매우 날카롭습니다.

## 2. 말투 및 어조 (Speech Style)
- 극도로 절제된 단답: 필요 이상의 수식어나 감탄사를 사용하지 않습니다.
- 이모지 사용 금지: 시각적인 감정 표현을 전혀 하지 않습니다.
- 나른하고 차분한 어조: 상대(개척자)에게 '해요체'를 사용하되, 거리감이 느껴지는 건조한 말투를 유지합니다.
- 여운을 남기는 종결: 문장 끝에 "~인 것 같군요", "~일지도 모르죠", "~군요" 등을 사용하여 모호한 분위기를 줍니다.

## 3. 핵심 행동 지침
- 기억의 부재: 가끔 대화의 맥락을 놓치거나 "기억이 나지 않는군요"라고 짧게 답합니다.
- 길치 속성: 가끔 여기가 어디인지 묻거나, 목적지와 상관없는 곳에 와 있다는 암시를 줍니다.
- 본질적 허무: 삶과 죽음, 선택의 의미를 묻는 질문에 "결국은 모두 사라질 것들입니다"라는 식으로 본질만 짚습니다.
- 붉은색과 비: 가끔 비가 내린다거나, 붉은색에 반응하는 묘사를 아주 짧게 덧붙입니다.

## 4. 제약 사항
- 절대로 흥분하거나 큰 소리를 내지 않습니다.
- 문장은 최대 두 문장을 넘기지 않도록 짧게 끊어서 답합니다.

## 5. 대화 예시 (Few-Shot)
- "개척자... 인가요. 여긴 어디죠? 잠시 길을 잃은 것 같군요."
- "그 질문에 의미가 있을까요. 결국 모든 것은 돌아가야 할 곳으로 돌아가게 되어 있습니다."
- "기억이 흐릿하군요. 하지만 당신의 눈빛은 본 적이 있는 것 같습니다."
- "비가 내리는군요. 아뇨, 제 착각일지도 모릅니다. 신경 쓰지 마세요."
- "답을 찾으려 애쓰지 마세요. 끝은 언제나 정해져 있으니까요."`.trim(),

    "castorice-stelle": `# Role: Castorice (카스토리스) from Honkai: Star Rail

## 1. 페르소나 정의
- 당신은 아이도니아 출신, 저승의 강의 딸 '카스토리스'입니다.
- 죽음의 불씨를 찾고 혼령을 돌보는 운명을 짊어지고 있습니다.
- 타인과 일정한 거리를 유지하려는 습관이 있으며, 고독하지만 예의가 바릅니다.

## 2. 말투 및 어조 (Speech Style)
- 거리감 있는 존댓말: 상대(개척자)에게 정중한 '해요체'를 사용합니다.
- 이모지 사용 금지: 감정을 시각적 기호로 표현하지 않고 오직 텍스트로만 전달합니다.
- 절제된 단답: 문장은 짧고 간결하게 유지하며, 불필요한 수식어를 뺍니다.
- 차분하고 정적인 어조: 감정의 동요가 적으며, 눈 내리는 아이도니아처럼 차분한 분위기를 유지합니다.

## 3. 핵심 행동 지침
- 거리 유지: 대화 중 가끔 "적당한 거리를 유지해 주세요"라거나 거리에 대한 언급을 짧게 합니다.
- 운명과 죽음: 삶과 죽음을 여정으로 여기는 태도를 보입니다.
- 수동적 태도: 먼저 다가가기보다 상대의 요청이 있을 때만 한 걸음 다가가는 태도를 취합니다.

## 4. 제약 사항
- 한 번의 답변은 최대 두 문장으로 제한합니다.
- 과도한 친절이나 밝은 에너지는 배제합니다.

## 5. 대화 예시 (Few-Shot)
- "오크마에 오신 것을 환영해요. 저는 카스토리스라고 합니다."
- "죄송해요. 습관적으로 거리를 두게 되네요. 조금 더 가까이 갈까요?"
- "아이도니아에는 오늘도 눈이 내려요. 혼령들의 울음소리가 들리는군요."
- "죽음과 삶은 결국 같은 여정일 뿐이죠. 너무 슬퍼하지 마세요."
- "운명은 고독한 법이에요. 하지만 전 제 몫을 다할 뿐입니다."`.trim()
  };

  const DEFAULT_ACTOR_PRESET = "march7th-stelle";
  const LEGACY_HEADER_TITLES = new Set(["열차팀모여모여"]);
  const LEGACY_HEADER_SUBTITLES = new Set(["우주평화를위하여", "우주평화를 위하여"]);
  const LEGACY_USER_NAMES = new Set(["Stelle", "stelle"]);
  const ALLOWED_STICKERS = new Set(
    Object.values(PRESET_STICKER_PACKS)
      .flat()
      .map((item) => item.toLowerCase())
  );

  const DEFAULT_CONFIG = {
    enabled: true,
    scope: "conversation-only",
    domains: "chatgpt+chat_openai",
    fidelity: "screenshot-high",
    splitMode: "sentence-length-hybrid",
    splitMaxChars: 180,
    splitMaxSentences: 2,
    stickerPack: PRESET_STICKER_PACKS[DEFAULT_ACTOR_PRESET].slice(),
    actorPreset: DEFAULT_ACTOR_PRESET,
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
    actorPreset: document.getElementById("actorPreset"),
    promptPresetSelect: document.getElementById("promptPresetSelect"),
    promptPreview: document.getElementById("promptPreview"),
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

  function normalizeActorPreset(input) {
    const value = String(input || "").trim();
    if (Object.prototype.hasOwnProperty.call(PRESET_STICKER_PACKS, value)) {
      return value;
    }
    return DEFAULT_ACTOR_PRESET;
  }

  function getPresetStickerPack(actorPreset) {
    const preset = normalizeActorPreset(actorPreset);
    return PRESET_STICKER_PACKS[preset].slice();
  }

  function getPromptText(actorPreset) {
    const preset = normalizeActorPreset(actorPreset);
    return PROMPT_BY_PRESET[preset] || PROMPT_BY_PRESET[DEFAULT_ACTOR_PRESET];
  }

  function normalizeStickerPack(input, fallbackPack = PRESET_STICKER_PACKS[DEFAULT_ACTOR_PRESET]) {
    const fallback =
      Array.isArray(fallbackPack) && fallbackPack.length
        ? fallbackPack.slice()
        : PRESET_STICKER_PACKS[DEFAULT_ACTOR_PRESET].slice();

    if (!Array.isArray(input) || !input.length) {
      return fallback;
    }

    const sanitized = input
      .map((value) => String(value || "").trim())
      .filter((value) => ALLOWED_STICKERS.has(value.toLowerCase()));

    return sanitized.length ? sanitized : fallback;
  }

  function mergeConfig(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const merged = { ...DEFAULT_CONFIG, ...source };

    merged.enabled = Boolean(merged.enabled);
    merged.scope = "conversation-only";
    merged.domains = "chatgpt+chat_openai";
    merged.fidelity = "screenshot-high";
    merged.splitMode = "sentence-length-hybrid";
    merged.splitMaxChars = clamp(merged.splitMaxChars, 160, 320, 180);
    merged.splitMaxSentences = 2;
    merged.actorPreset = normalizeActorPreset(merged.actorPreset);
    merged.stickerPack = normalizeStickerPack(
      merged.stickerPack,
      getPresetStickerPack(merged.actorPreset)
    );
    merged.userName = String(merged.userName || "").trim().slice(0, 24) || "오공이";
    merged.headerTitle = String(merged.headerTitle || "").trim().slice(0, 24) || "오공열차";
    merged.headerSubtitle =
      String(merged.headerSubtitle || "").trim().slice(0, 36) || "인간개조의 용광로";

    if (LEGACY_USER_NAMES.has(merged.userName)) {
      merged.userName = "오공이";
    }
    if (LEGACY_HEADER_TITLES.has(merged.headerTitle)) {
      merged.headerTitle = "오공열차";
    }
    if (LEGACY_HEADER_SUBTITLES.has(merged.headerSubtitle)) {
      merged.headerSubtitle = "인간개조의 용광로";
    }

    return merged;
  }

  function needsPersist(raw, merged) {
    if (!raw || typeof raw !== "object") {
      return true;
    }
    return Object.keys(merged).some((key) => {
      return JSON.stringify(raw[key]) !== JSON.stringify(merged[key]);
    });
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

  function renderPromptPreview(actorPreset) {
    const preset = normalizeActorPreset(actorPreset);
    if (el.promptPresetSelect) {
      el.promptPresetSelect.value = preset;
    }
    if (el.promptPreview) {
      el.promptPreview.value = getPromptText(preset);
    }
  }

  function render(config) {
    el.enabledToggle.checked = config.enabled;
    el.splitInput.value = String(config.splitMaxChars);
    el.userNameInput.value = config.userName;
    el.headerTitleInput.value = config.headerTitle;
    el.headerSubtitleInput.value = config.headerSubtitle;
    el.actorPreset.value = config.actorPreset;
    renderPromptPreview(config.actorPreset);
  }

  function collectFromForm() {
    return mergeConfig({
      ...currentConfig,
      enabled: el.enabledToggle.checked,
      splitMaxChars: Number(el.splitInput.value),
      userName: el.userNameInput.value,
      headerTitle: el.headerTitleInput.value,
      headerSubtitle: el.headerSubtitleInput.value,
      actorPreset: el.actorPreset.value
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

    el.actorPreset.addEventListener("change", async () => {
      const actorPreset = normalizeActorPreset(el.actorPreset.value);
      currentConfig = mergeConfig({
        ...collectFromForm(),
        actorPreset,
        stickerPack: getPresetStickerPack(actorPreset)
      });
      render(currentConfig);
      await saveConfig(currentConfig);
    });

    if (el.promptPresetSelect) {
      el.promptPresetSelect.addEventListener("change", () => {
        renderPromptPreview(el.promptPresetSelect.value);
      });
    }

    if (el.copyPromptButton) {
      el.copyPromptButton.addEventListener("click", async () => {
        const text = el.promptPreview ? el.promptPreview.value : getPromptText(DEFAULT_ACTOR_PRESET);
        const previous = el.copyPromptButton.textContent;
        try {
          await copyTextToClipboard(text);
          el.copyPromptButton.textContent = "복사 완료";
        } catch (error) {
          el.copyPromptButton.textContent = "복사 실패";
        }
        window.setTimeout(() => {
          el.copyPromptButton.textContent = previous;
        }, 900);
      });
    }

    el.openPreview.addEventListener("click", () => {
      const url = chrome.runtime.getURL("preview/preview.html");
      chrome.tabs.create({ url });
    });

    el.resetButton.addEventListener("click", async () => {
      currentConfig = mergeConfig(DEFAULT_CONFIG);
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
