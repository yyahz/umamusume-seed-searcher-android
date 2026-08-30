(function seedSearcherMobileUi() {
  "use strict";

  if (globalThis.__UMA_SEED_SEARCHER_MOBILE_UI__) return;

  const ICONS = {
    roles: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c.5-4 2.7-6 6.5-6s6 2 6.5 6"/></svg>',
    factors: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="2"/><rect x="14" y="4" width="6" height="6" rx="2"/><rect x="4" y="14" width="6" height="6" rx="2"/><rect x="14" y="14" width="6" height="6" rx="2"/></svg>',
    results: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12"/><path d="m3.5 6 .8.8L6 5M3.5 12l.8.8L6 11M3.5 18l.8.8L6 17"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h5M15 6h5M4 12h9M17 12h3M4 18h3M11 18h9"/><circle cx="12" cy="6" r="2.5"/><circle cx="15" cy="12" r="2.5"/><circle cx="9" cy="18" r="2.5"/></svg>'
  };
  const PAGE_ORDER = ["roles", "factors", "results", "settings"];
  const PAGE_LABELS = {
    roles: "角色",
    factors: "因子",
    results: "结果",
    settings: "设置"
  };
  const FACTOR_MODE_STORAGE_KEY = "uma-seed-mobile-factor-mode";
  const APP_VERSION = "0.1.29";
  const PROJECT_URL = "https://github.com/yyahz/umamusume-seed-searcher-android";
  const VERSION_SOURCE_URL = `${PROJECT_URL.replace("https://github.com", "https://raw.githubusercontent.com")}/main/app/build.gradle`;

  let activePage = "roles";
  let rolePage = 0;
  let applyScheduled = false;
  let awaitingResults = false;
  let factorEntryMode = loadFactorEntryMode();
  let activeFactorTier = "1";
  let recognitionPage = 0;
  let colorDrag = null;
  let colorSettleTimer = 0;
  let scrollRestoreToken = 0;
  let renderScrollSnapshot = null;
  let updateCheck = { state: "idle", message: "尚未检查更新", latest: "", url: "" };
  const scrollPositions = new Map();

  function loadFactorEntryMode() {
    try {
      const saved = localStorage.getItem(FACTOR_MODE_STORAGE_KEY);
      return saved === "recognizer" ? "recognizer" : "manual";
    } catch (_) {
      return "manual";
    }
  }

  function setFactorEntryMode(ui, mode, persist = true) {
    if (!ui || !["manual", "recognizer"].includes(mode)) return;
    factorEntryMode = mode;
    ui.host.dataset.mobileFactorMode = mode;
    ui.root.querySelectorAll("[data-factor-entry-mode]").forEach((button) => {
      const active = button.dataset.factorEntryMode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    if (persist) {
      try {
        localStorage.setItem(FACTOR_MODE_STORAGE_KEY, mode);
      } catch (_) {
        // The mode still works for the current session when storage is unavailable.
      }
    }
  }

  function findUi() {
    const host = document.getElementById("uma-seed-optimizer-host");
    const root = host?.shadowRoot;
    const panel = root?.getElementById("panel");
    const body = root?.getElementById("body");
    return host && root && panel && body ? { host, root, panel, body } : null;
  }

  function textCount(element) {
    const match = String(element?.textContent || "").match(/\d+/);
    return match ? Number(match[0]) : 0;
  }

  function restoreScrollPosition(ui, page, top, settle = false) {
    if (!ui || page !== activePage) return;
    const token = settle ? ++scrollRestoreToken : scrollRestoreToken;
    const apply = () => {
      if (token !== scrollRestoreToken || page !== activePage) return;
      ui.body.scrollTop = top;
    };
    scrollPositions.set(page, top);
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
    if (settle) {
      setTimeout(apply, 80);
      setTimeout(apply, 180);
    }
  }

  function clearColorDragIndicators(ui) {
    ui?.root.querySelectorAll("#priority-list .dragging,#priority-list .drag-settling,#priority-list .drop-before,#priority-list .drop-after").forEach((item) => {
      item.classList.remove("dragging", "drag-settling", "drop-before", "drop-after");
      item.style.removeProperty("--mobile-drag-y");
    });
  }

  function colorInsertionIndex(list, sourceItem, clientY) {
    const remaining = [...list.querySelectorAll(".priority-item")].filter((item) => item !== sourceItem);
    let index = 0;
    while (index < remaining.length) {
      const rect = remaining[index].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) break;
      index += 1;
    }
    return index;
  }

  function moveColorToIndex(color, targetIndex, savedTop) {
    const ui = findUi();
    if (!ui) return;
    ui.root.activeElement?.blur();
    ui.root.dispatchEvent(new CustomEvent("uma-seed-color-reorder", {
      detail: { color, targetIndex }
    }));
    restoreScrollPosition(ui, activePage, savedTop, true);
  }

  function beginColorDrag(target, inputId, clientY, ui) {
    if (colorSettleTimer) return false;
    const handle = target instanceof Element ? target.closest("#priority-list .priority-item > div") : null;
    const item = handle?.closest(".priority-item");
    const list = item?.closest("#priority-list");
    if (!handle || !item || !list) return false;
    const items = [...list.querySelectorAll(".priority-item")];
    const itemTop = item.getBoundingClientRect().top;
    colorDrag = {
      inputId,
      color: item.dataset.color,
      item,
      list,
      startY: clientY,
      startIndex: items.indexOf(item),
      targetIndex: items.indexOf(item),
      slotOffsets: items.map((candidate) => candidate.getBoundingClientRect().top - itemTop),
      savedTop: ui.body.scrollTop,
      moved: false
    };
    item.style.setProperty("--mobile-drag-y", "0px");
    item.classList.add("dragging");
    return true;
  }

  function updateColorDrag(inputId, clientY) {
    if (!colorDrag || inputId !== colorDrag.inputId) return;
    if (Math.abs(clientY - colorDrag.startY) >= 6) colorDrag.moved = true;
    if (!colorDrag.moved) return;
    const minOffset = colorDrag.slotOffsets[0];
    const maxOffset = colorDrag.slotOffsets[colorDrag.slotOffsets.length - 1];
    const dragOffset = Math.min(maxOffset, Math.max(minOffset, clientY - colorDrag.startY));
    colorDrag.item.style.setProperty("--mobile-drag-y", `${dragOffset}px`);
    colorDrag.targetIndex = colorInsertionIndex(colorDrag.list, colorDrag.item, clientY);
    colorDrag.list.querySelectorAll(".drop-before,.drop-after").forEach((item) => {
      item.classList.remove("drop-before", "drop-after");
    });
    const remaining = [...colorDrag.list.querySelectorAll(".priority-item")].filter((item) => item !== colorDrag.item);
    if (!remaining.length) return;
    if (colorDrag.targetIndex >= remaining.length) remaining[remaining.length - 1].classList.add("drop-after");
    else remaining[colorDrag.targetIndex].classList.add("drop-before");
  }

  function finishColorDrag(inputId, ui, cancelled = false) {
    if (!colorDrag || inputId !== colorDrag.inputId) return;
    const completed = colorDrag;
    colorDrag = null;
    completed.list.querySelectorAll(".drop-before,.drop-after").forEach((item) => {
      item.classList.remove("drop-before", "drop-after");
    });
    if (cancelled || !completed.moved || completed.targetIndex === completed.startIndex) {
      clearColorDragIndicators(ui);
      return;
    }
    const finish = () => {
      colorSettleTimer = 0;
      clearColorDragIndicators(ui);
      moveColorToIndex(completed.color, completed.targetIndex, completed.savedTop);
    };
    completed.item.classList.add("drag-settling");
    completed.item.style.setProperty("--mobile-drag-y", `${completed.slotOffsets[completed.targetIndex]}px`);
    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) finish();
    else colorSettleTimer = setTimeout(finish, 140);
  }

  function findTouch(event, inputId, changed = false) {
    const touches = changed ? event.changedTouches : event.touches;
    return [...touches].find((touch) => `touch-${touch.identifier}` === inputId) || null;
  }

  function updateRolePagination(ui, reset = false) {
    if (!ui) return;
    const catalog = ui.root.getElementById("role-catalog");
    const shell = ui.root.getElementById("role-catalog-shell");
    if (!catalog || !shell) return;
    const options = [...catalog.querySelectorAll(".role-option")];
    const pageSize = 4;
    const pageCount = Math.max(1, Math.ceil(options.length / pageSize));
    if (reset) rolePage = 0;
    rolePage = Math.min(pageCount - 1, Math.max(0, rolePage));
    const start = rolePage * pageSize;
    options.forEach((option, index) => {
      option.hidden = index < start || index >= start + pageSize;
    });

    let controls = shell.querySelector(".mobile-role-pagination");
    if (!controls) {
      controls = document.createElement("div");
      controls.className = "mobile-role-pagination";
      catalog.after(controls);
    }
    controls.hidden = options.length <= pageSize;
    controls.innerHTML = `<button type="button" data-role-page="previous" ${rolePage === 0 ? "disabled" : ""}>上一组</button><span>第 ${rolePage + 1} / ${pageCount} 组</span><button type="button" data-role-page="next" ${rolePage >= pageCount - 1 ? "disabled" : ""}>下一组</button>`;
  }

  function updateRecognitionPagination(ui, reset = false) {
    if (!ui) return;
    const feedback = ui.root.getElementById("recognition-feedback");
    const list = feedback?.querySelector(".recognition-list");
    if (!feedback || !list) return;
    const items = [...list.querySelectorAll(":scope > .recognition-item")];
    items.forEach((item) => {
      const stars = item.querySelector(".recognition-stars");
      if (!stars || stars.dataset.mobileCompact === "true") return;
      const text = stars.textContent || "";
      const total = text.match(/家系\s*(\d+)★/)?.[1];
      const self = text.match(/本体\s*(\d+)★/)?.[1];
      const tier = text.match(/(?:^|·\s*)(高|中|低|必需)(?:\s|$)/)?.[1];
      if (total && self) stars.textContent = `家${total}★ · 本${self}★${tier ? ` · ${tier}` : ""}`;
      stars.dataset.mobileCompact = "true";
    });
    const pageSize = 8;
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    if (reset) recognitionPage = 0;
    recognitionPage = Math.min(pageCount - 1, Math.max(0, recognitionPage));
    const start = recognitionPage * pageSize;
    items.forEach((item, index) => {
      item.hidden = index < start || index >= start + pageSize;
    });
    let controls = feedback.querySelector(".mobile-recognition-pagination");
    if (!controls) {
      controls = document.createElement("div");
      controls.className = "mobile-recognition-pagination";
      list.after(controls);
    }
    controls.hidden = items.length <= pageSize;
    controls.innerHTML = `<button type="button" data-recognition-page="previous" ${recognitionPage === 0 ? "disabled" : ""}>上一批</button><span>${recognitionPage + 1} / ${pageCount} · 共 ${items.length} 项</span><button type="button" data-recognition-page="next" ${recognitionPage >= pageCount - 1 ? "disabled" : ""}>下一批</button>`;
  }

  function setFactorHeading(section) {
    const heading = section?.querySelector(".section-head h2");
    const helper = section?.querySelector(".section-head .helper");
    if (!heading || !helper) return;
    heading.textContent = "选择与调整因子";
    helper.textContent = "可逐项选择或粘贴攻略识别；已选项在下方统一调整。";
  }

  function ensureFactorModeSwitch(section, ui) {
    const recognizer = section?.querySelector(".quick-recognizer");
    if (!recognizer || !ui) return;
    let control = section.querySelector(".mobile-factor-mode-switch");
    if (!control) {
      control = document.createElement("div");
      control.className = "mobile-factor-mode-switch";
      control.setAttribute("role", "tablist");
      control.setAttribute("aria-label", "因子选择方式");
      control.innerHTML = '<button type="button" role="tab" data-factor-entry-mode="manual">逐项选择</button><button type="button" role="tab" data-factor-entry-mode="recognizer">智能识别</button>';
      recognizer.before(control);
    }
    setFactorEntryMode(ui, factorEntryMode, false);
  }

  function applyFactorTierFilter(section, tier = activeFactorTier) {
    const blocks = [...(section?.querySelectorAll(".tier-block[data-factor-tier]") || [])];
    if (!blocks.length) return;
    if (!blocks.some((block) => block.dataset.factorTier === String(tier))) tier = blocks[0].dataset.factorTier;
    activeFactorTier = String(tier);
    section.querySelectorAll("[data-mobile-tier-filter]").forEach((button) => {
      const active = button.dataset.mobileTierFilter === activeFactorTier;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    blocks.forEach((block) => block.classList.toggle("mobile-tier-active", block.dataset.factorTier === activeFactorTier));
  }

  function ensureFactorEditingHeading(section) {
    const firstTier = section?.querySelector(".tier-block");
    if (!firstTier) return;
    let heading = section.querySelector(".mobile-selected-heading");
    if (!heading) {
      heading = document.createElement("div");
      heading.className = "mobile-selected-heading";
      heading.innerHTML = '<div><h3>已选因子设置</h3><p>按优先级查看，点击因子卡修改。</p></div><div class="mobile-selected-actions"></div>';
      firstTier.before(heading);
    }
    const reset = section.querySelector("#reset-factors");
    if (reset) heading.querySelector(".mobile-selected-actions")?.appendChild(reset);
    const blocks = [...section.querySelectorAll(".tier-block[data-factor-tier]")];
    let tabs = section.querySelector(".mobile-tier-tabs");
    if (!tabs) {
      tabs = document.createElement("div");
      tabs.className = "mobile-tier-tabs";
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", "因子优先级");
      heading.after(tabs);
    }
    const tierNames = { "1": "高", "2": "中", "3": "低", "4": "必需" };
    tabs.style.setProperty("--mobile-tier-count", String(blocks.length));
    tabs.innerHTML = blocks.map((block) => {
      const tier = block.dataset.factorTier;
      const count = block.querySelectorAll(".selected-card").length;
      return `<button type="button" role="tab" data-mobile-tier-filter="${tier}">${tierNames[tier] || tier}<span>${count}</span></button>`;
    }).join("");
    blocks.forEach((block) => {
      block.classList.toggle("mobile-tier-empty", Boolean(block.querySelector(".tier-empty")));
      block.querySelectorAll(".selected-card").forEach((card) => {
        card.draggable = false;
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", `${card.querySelector(".selected-name")?.textContent || "因子"}，点击编辑`);
        let summary = card.querySelector(".mobile-factor-card-summary");
        if (!summary) {
          summary = document.createElement("div");
          summary.className = "mobile-factor-card-summary";
          card.appendChild(summary);
        }
        const total = card.querySelector("[data-total-star-key]")?.value || "1";
        const self = card.querySelector("[data-self-star-key]")?.value || "0";
        summary.innerHTML = `<span>家${total}★ · 本${self}★</span><b>${tierNames[block.dataset.factorTier] || "高"}</b>`;
      });
    });
    applyFactorTierFilter(section);
  }

  function ensureFactorEditor(ui) {
    let scrim = ui.panel.querySelector(".mobile-factor-editor-scrim");
    let editor = ui.panel.querySelector(".mobile-factor-editor");
    if (scrim && editor) return { scrim, editor };
    scrim = document.createElement("div");
    scrim.className = "mobile-factor-editor-scrim";
    editor = document.createElement("section");
    editor.className = "mobile-factor-editor";
    editor.setAttribute("role", "dialog");
    editor.setAttribute("aria-modal", "true");
    editor.setAttribute("aria-label", "编辑因子");
    editor.innerHTML = `<div class="mobile-editor-handle" aria-hidden="true"></div><div class="mobile-editor-head"><div><h3 data-mobile-editor-name>编辑因子</h3><p data-mobile-editor-subtype></p></div></div><div class="mobile-editor-fields"><fieldset><legend>家系至少</legend><div class="mobile-editor-choice-grid total" data-mobile-editor-options="total" role="group" aria-label="家系至少"></div></fieldset><fieldset><legend>本体至少</legend><div class="mobile-editor-choice-grid self" data-mobile-editor-options="self" role="group" aria-label="本体至少"></div></fieldset><fieldset><legend>优先级</legend><div class="mobile-editor-choice-grid tier" data-mobile-editor-options="tier" role="group" aria-label="优先级"></div></fieldset></div><div class="mobile-editor-actions"><button class="mobile-editor-delete" type="button" data-mobile-editor-delete>删除这个因子</button></div>`;
    ui.panel.append(scrim, editor);
    return { scrim, editor };
  }

  function populateEditorChoices(editor, kind, source) {
    const container = editor.querySelector(`[data-mobile-editor-options="${kind}"]`);
    if (!container) return;
    const selectedValue = source.value;
    container.replaceChildren(...[...source.options].map((option) => {
      const button = document.createElement("button");
      const value = String(option.value);
      button.type = "button";
      button.dataset.mobileEditorChoice = kind;
      button.dataset.value = value;
      button.textContent = kind === "self" && value === "0" ? "无要求" : option.textContent.trim().split(" · ")[0];
      button.classList.toggle("selected", value === selectedValue);
      button.setAttribute("aria-pressed", String(value === selectedValue));
      return button;
    }));
  }

  function closeFactorEditor(ui) {
    if (!ui) return;
    delete ui.host.dataset.mobileFactorEditorOpen;
    const editor = ui.panel.querySelector(".mobile-factor-editor");
    if (editor) delete editor.dataset.factorKey;
  }

  function openFactorEditor(ui, card) {
    const key = card?.dataset.key;
    const total = card?.querySelector("[data-total-star-key]");
    const self = card?.querySelector("[data-self-star-key]");
    const tier = card?.querySelector("[data-tier-key]");
    if (!ui || !key || !total || !self || !tier) return;
    const { editor } = ensureFactorEditor(ui);
    editor.dataset.factorKey = key;
    editor.dataset.mobileEditorTotal = total.value;
    editor.dataset.mobileEditorSelf = self.value;
    editor.dataset.mobileEditorTier = tier.value;
    editor.dataset.mobileEditorDirty = "false";
    editor.querySelector("[data-mobile-editor-name]").textContent = card.querySelector(".selected-name")?.textContent || "编辑因子";
    editor.querySelector("[data-mobile-editor-subtype]").textContent = card.querySelector(".selected-subtype")?.textContent || "";
    populateEditorChoices(editor, "total", total);
    populateEditorChoices(editor, "self", self);
    populateEditorChoices(editor, "tier", tier);
    ui.host.dataset.mobileFactorEditorOpen = "true";
    requestAnimationFrame(() => editor.querySelector('[data-mobile-editor-choice="total"].selected')?.focus({ preventScroll: true }));
  }

  function saveFactorEditor(ui) {
    const editor = ui?.panel.querySelector(".mobile-factor-editor");
    const key = editor?.dataset.factorKey;
    if (!key) return;
    ui.root.dispatchEvent(new CustomEvent("uma-seed-update-factor", {
      detail: {
        key,
        minStars: editor.dataset.mobileEditorTotal,
        minSelfStars: editor.dataset.mobileEditorSelf,
        tier: editor.dataset.mobileEditorTier
      }
    }));
    closeFactorEditor(ui);
  }

  function updateRecognitionActionBar(ui, factorSection) {
    let bar = ui.panel.querySelector(".mobile-recognition-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "mobile-recognition-bar";
      ui.panel.appendChild(bar);
    }
    const preview = factorSection?.querySelector("#recognition-feedback");
    const draft = factorSection?.querySelector("#recognition-draft");
    const mode = preview ? "preview" : draft ? "draft" : "none";
    ui.host.dataset.mobileRecognitionState = mode;
    if (mode === "preview") {
      const apply = factorSection.querySelector("#stage-factor-recognition");
      bar.innerHTML = `<button type="button" class="secondary" data-recognition-forward="cancel-factor-recognition">返回修改</button><button type="button" class="primary" data-recognition-forward="stage-factor-recognition" ${apply?.disabled ? "disabled" : ""}>${apply?.textContent || "加入待导入"}</button>`;
    } else if (mode === "draft") {
      const apply = factorSection.querySelector("#apply-pending-recognition");
      bar.innerHTML = `<button type="button" class="secondary" data-recognition-continue>继续添加</button><button type="button" class="primary" data-recognition-forward="apply-pending-recognition">${apply?.textContent || "应用全部"}</button>`;
    } else {
      bar.replaceChildren();
    }
  }

  function updateNavigation(ui) {
    const roleSection = ui.body.querySelector(':scope > .section[data-mobile-section="roles"]');
    const factorSection = ui.body.querySelector(':scope > .section[data-mobile-section~="factors"]');
    const resultsSection = ui.root.getElementById("results-section");
    const roleCount = textCount(roleSection?.querySelector(".badge"));
    const factorCount = textCount(factorSection?.querySelector(".badge"));
    const resultCountElement = resultsSection?.querySelector(".result-count");
    const resultCount = Number(resultCountElement?.dataset.totalCount) || textCount(resultCountElement);
    const counts = { roles: roleCount, factors: factorCount, results: resultCount };
    ui.host.dataset.mobileHasFactors = String(factorCount > 0);

    ui.root.querySelectorAll(".mobile-nav-button").forEach((button) => {
      const page = button.dataset.mobileTarget;
      const isActive = page === activePage;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", String(isActive));
      const badge = button.querySelector(".mobile-nav-badge");
      const count = counts[page] || 0;
      if (badge) {
        badge.textContent = String(count);
        badge.hidden = count === 0;
      }
    });
  }

  function ensureEmptyResults(ui, hasResults) {
    let empty = ui.body.querySelector("[data-mobile-empty-results]");
    if (hasResults) {
      empty?.remove();
      return;
    }
    if (!empty) {
      empty = document.createElement("section");
      empty.className = "section mobile-results-empty";
      empty.dataset.mobileEmptyResults = "";
      empty.dataset.mobileSection = "results";
      ui.body.appendChild(empty);
    }
    const statusText = ui.root.getElementById("status")?.textContent.trim() || "";
    const progress = awaitingResults ? statusText.match(/(\d+)\/(\d+)/) : null;
    const current = Number(progress?.[1]) || 0;
    const total = Number(progress?.[2]) || 0;
    const percent = total ? Math.max(0, Math.min(100, current / total * 100)) : 0;
    empty.classList.toggle("searching", awaitingResults);
    if (awaitingResults) {
      const planName = statusText.match(/正在搜索“(.+?)”/)?.[1] || "正在准备查询计划";
      const candidateCount = Number(statusText.match(/已收集\s*(\d+)\s*位候选/)?.[1]);
      empty.innerHTML = `<div class="mobile-search-head">${ICONS.results}<h2>正在寻找合适种马</h2><strong>${total ? `${current} / ${total}` : "准备中"}</strong></div><div class="mobile-search-progress" role="progressbar" aria-label="搜索进度 ${current} / ${total || 1}" aria-valuemin="0" aria-valuemax="${total || 1}" aria-valuenow="${current}"><span style="width:${percent}%"></span></div><div class="mobile-search-meta"><span data-mobile-search-plan></span><span data-mobile-search-count></span></div>`;
      empty.querySelector("[data-mobile-search-plan]").textContent = planName === "正在准备查询计划" ? planName : `当前：${planName}`;
      empty.querySelector("[data-mobile-search-count]").textContent = Number.isFinite(candidateCount) ? `${candidateCount} 位候选` : "等待候选";
    } else {
      empty.innerHTML = `${ICONS.results}<h2>还没有推荐结果</h2><p>先在“因子”中选择条件、确认星级并开始搜索。</p>`;
    }
  }

  function compareVersions(left, right) {
    const normalize = (value) => String(value || "").replace(/^v/i, "").split(".").map((part) => Number(part) || 0);
    const a = normalize(left);
    const b = normalize(right);
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
    }
    return 0;
  }

  function renderAppSettings(section) {
    if (!section) return;
    section.innerHTML = `<div class="section-head"><div><h2>应用设置</h2><p class="helper">版本与更新</p></div></div><div class="mobile-update-card"><div class="mobile-update-icon">${ICONS.settings}</div><div class="mobile-update-copy"><b>种马搜索器</b><span>当前版本 v${APP_VERSION}</span></div><button type="button" data-mobile-check-update ${updateCheck.state === "checking" ? "disabled" : ""}>${updateCheck.state === "checking" ? "检查中…" : "检查更新"}</button><p class="mobile-update-status" data-update-state="${updateCheck.state}" role="status"></p>${updateCheck.url ? `<a class="mobile-update-link" href="${updateCheck.url}" rel="noopener noreferrer">查看新版</a>` : ""}</div><a class="mobile-project-link" href="${PROJECT_URL}" rel="noopener noreferrer">打开 GitHub 项目页</a>`;
    section.querySelector(".mobile-update-status").textContent = updateCheck.message;
  }

  function ensureAppSettingsSection(ui) {
    let section = ui.body.querySelector("[data-mobile-app-settings]");
    if (!section) {
      section = document.createElement("section");
      section.className = "section mobile-app-settings";
      section.dataset.mobileAppSettings = "";
      section.dataset.mobileSection = "settings";
      ui.body.appendChild(section);
    }
    renderAppSettings(section);
  }

  async function checkForUpdates(ui) {
    if (updateCheck.state === "checking") return;
    updateCheck = { state: "checking", message: "正在读取 GitHub 版本信息…", latest: "", url: "" };
    ensureAppSettingsSection(ui);
    if (globalThis.UmaSeedApp?.checkForUpdates) {
      globalThis.UmaSeedApp.checkForUpdates();
      return;
    }
    try {
      const response = await fetch(VERSION_SOURCE_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const source = await response.text();
      const latest = source.match(/versionName\s+["']([^"']+)["']/)?.[1];
      if (!latest) throw new Error("未找到版本号");
      if (compareVersions(latest, APP_VERSION) > 0) {
        updateCheck = { state: "available", message: `发现新版本 v${latest}`, latest, url: PROJECT_URL };
      } else {
        updateCheck = { state: "current", message: "当前已是最新版本", latest, url: "" };
      }
    } catch (_) {
      updateCheck = { state: "error", message: "暂时无法检查，请稍后重试", latest: "", url: "" };
    }
    ensureAppSettingsSection(findUi());
  }

  globalThis.__umaSeedUpdateResult = (latest, error) => {
    if (error || !latest) {
      updateCheck = { state: "error", message: "暂时无法检查，请稍后重试", latest: "", url: "" };
    } else if (compareVersions(latest, APP_VERSION) > 0) {
      updateCheck = { state: "available", message: `发现新版本 v${latest}`, latest, url: PROJECT_URL };
    } else {
      updateCheck = { state: "current", message: "当前已是最新版本", latest, url: "" };
    }
    ensureAppSettingsSection(findUi());
  };

  function mapSections(ui) {
    const sections = [...ui.body.children].filter((element) => element.classList.contains("section"));
    const contentSections = sections.filter((section) => !section.hasAttribute("data-mobile-empty-results"));
    const roleSection = contentSections[0];
    const prioritySection = contentSections[1];
    const factorSection = contentSections[2];
    const settingsSection = contentSections[3];
    const resultsSection = ui.root.getElementById("results-section");

    if (roleSection) {
      roleSection.dataset.mobileSection = "roles";
      const heading = roleSection.querySelector(".section-head h2");
      if (heading) heading.textContent = "选择角色";
    }
    if (prioritySection) {
      prioritySection.dataset.mobileSection = "roles";
      const heading = prioritySection.querySelector(".section-head h2");
      if (heading) heading.textContent = "优先级排序";
    }
    if (factorSection) {
      factorSection.dataset.mobileSection = "factors";
      factorSection.dataset.mobileFactorOrder = "picker";
      setFactorHeading(factorSection);
      ensureFactorModeSwitch(factorSection, ui);
      ensureFactorEditingHeading(factorSection);
      const activeFactorTab = factorSection.querySelector(".factor-tab.active[data-tab]");
      if (activeFactorTab) ui.host.dataset.mobileFactorColor = activeFactorTab.dataset.tab;
    }
    updateRecognitionActionBar(ui, factorSection);
    updateRecognitionPagination(ui);
    if (settingsSection && settingsSection !== resultsSection) {
      settingsSection.dataset.mobileSection = "factors";
      settingsSection.dataset.mobileFactorOrder = "settings";
      const heading = settingsSection.querySelector(".section-head h2");
      if (heading) heading.textContent = "搜索设置";
    }
    if (resultsSection) resultsSection.dataset.mobileSection = "results";

    ensureEmptyResults(ui, Boolean(resultsSection));
    ensureAppSettingsSection(ui);
    updateRolePagination(ui);
    updateNavigation(ui);
  }

  function activate(page, options = {}) {
    const ui = findUi();
    if (!ui || !PAGE_ORDER.includes(page)) return false;
    if (!options.skipSave) scrollPositions.set(activePage, ui.body.scrollTop);
    activePage = page;
    ui.host.dataset.mobilePage = page;
    mapSections(ui);
    const pageName = PAGE_LABELS[page];
    ui.panel.setAttribute("aria-label", `种马搜索器 · ${pageName}`);
    const targetTop = options.resetScroll ? 0 : (scrollPositions.get(page) || 0);
    if (options.resetScroll) scrollPositions.set(page, 0);
    ui.body.scrollTop = targetTop;
    requestAnimationFrame(() => {
      ui.body.scrollTop = targetTop;
      const heading = ui.body.querySelector(`.section[data-mobile-section~="${page}"] h2`);
      heading?.setAttribute("tabindex", "-1");
    });
    return true;
  }

  function install() {
    const ui = findUi();
    if (!ui) {
      setTimeout(install, 50);
      return;
    }
    if (ui.root.getElementById("uma-mobile-ui-style")) return;

    globalThis.__UMA_SEED_SEARCHER_MOBILE_UI__ = {
      back() {
        const index = PAGE_ORDER.indexOf(activePage);
        if (index <= 0) return false;
        activate(PAGE_ORDER[index - 1], { resetScroll: false });
        return true;
      },
      activate
    };
    ui.host.dataset.mobileUi = "true";
    ui.host.dataset.mobilePage = activePage;
    ui.host.dataset.mobileFactorMode = factorEntryMode;

    const style = document.createElement("style");
    style.id = "uma-mobile-ui-style";
    style.textContent = `
      :host([data-mobile-ui="true"]) {
        --mobile-nav-height:64px;
        --mobile-action-height:68px;
        --surface:#fff;
        --surface-2:#f4f7f5;
        --ink:#17241d;
        --muted:#607067;
        --line:#e2e9e4;
        --brand:#16a064;
        --brand-dark:#087445;
      }
      :host([data-mobile-ui="true"]) .launcher,
      :host([data-mobile-ui="true"]) .scrim { display:none!important; }
      :host([data-mobile-ui="true"]) .panel {
        width:100vw!important;
        max-width:none!important;
        height:100vh!important;
        max-height:100vh!important;
        background:var(--surface-2);
        box-shadow:none;
      }
      :host([data-mobile-ui="true"]) .panel-header {
        min-height:64px;
        padding:10px 16px;
        color:var(--ink);
        background:#fff;
        border-bottom:1px solid var(--line);
        box-shadow:0 1px 8px #0c2d1b0a;
      }
      :host([data-mobile-ui="true"]) .title-wrap { gap:10px; }
      :host([data-mobile-ui="true"]) .brand-mark {
        width:42px;
        height:42px;
        border-radius:14px;
        background:#edf7f1;
        box-shadow:none;
      }
      :host([data-mobile-ui="true"]) h1 { font-size:18px; }
      :host([data-mobile-ui="true"]) .brand-credit { color:var(--muted); font-size:9px; opacity:.78; }
      :host([data-mobile-ui="true"]) .subtitle { margin-top:1px; color:var(--muted); font-size:11px; }
      :host([data-mobile-ui="true"]) .subtitle { display:grid; gap:0; }
      :host([data-mobile-ui="true"]) .source-link { min-height:18px; color:var(--brand-dark); line-height:1.35; }
      :host([data-mobile-ui="true"]) #close { display:none!important; }
      :host([data-mobile-ui="true"]) .panel-body {
        display:flex;
        flex-direction:column;
        overflow-y:auto!important;
        overscroll-behavior-y:contain;
        touch-action:pan-y!important;
        -webkit-overflow-scrolling:touch;
        padding:14px 12px calc(var(--mobile-nav-height) + 18px + env(safe-area-inset-bottom));
        scroll-behavior:smooth;
      }
      :host([data-mobile-ui="true"][data-mobile-page="factors"]) .panel-body {
        padding-bottom:calc(var(--mobile-nav-height) + var(--mobile-action-height) + 20px + env(safe-area-inset-bottom));
      }
      :host([data-mobile-ui="true"]) #body > .section[data-mobile-factor-order="settings"] { order:1; }
      :host([data-mobile-ui="true"]) #body > .section[data-mobile-factor-order="picker"] { order:2; }
      :host([data-mobile-ui="true"]) #body > .section { display:none; }
      :host([data-mobile-ui="true"][data-mobile-page="roles"]) #body > .section[data-mobile-section~="roles"],
      :host([data-mobile-ui="true"][data-mobile-page="factors"]) #body > .section[data-mobile-section~="factors"],
      :host([data-mobile-ui="true"][data-mobile-page="results"]) #body > .section[data-mobile-section~="results"],
      :host([data-mobile-ui="true"][data-mobile-page="settings"]) #body > .section[data-mobile-section~="settings"] { display:block; }
      :host([data-mobile-ui="true"]) .section {
        margin-bottom:12px;
        padding:16px;
        border:0;
        border-radius:20px;
        background:#fff;
        box-shadow:0 4px 18px #1638230d;
      }
      :host([data-mobile-ui="true"]) .section-head { margin-bottom:14px; }
      :host([data-mobile-ui="true"]) h2 { font-size:19px; line-height:1.35; }
      :host([data-mobile-ui="true"]) .helper { margin-top:5px; font-size:13px; line-height:1.55; }
      :host([data-mobile-ui="true"]) .badge { padding:5px 9px; font-size:12px; }
      :host([data-mobile-ui="true"]) button,
      :host([data-mobile-ui="true"]) select,
      :host([data-mobile-ui="true"]) input { touch-action:manipulation; }
      :host([data-mobile-ui="true"]) button:active { filter:brightness(.96); }
      :host([data-mobile-ui="true"]) .role-catalog,
      :host([data-mobile-ui="true"]) .factor-catalog {
        max-height:none!important;
        overflow:visible!important;
        overscroll-behavior:auto!important;
      }
      :host([data-mobile-ui="true"]) .role-catalog { grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
      :host([data-mobile-ui="true"]) #body > .section[data-mobile-section="roles"]:first-child .section-head { margin-bottom:8px; }
      :host([data-mobile-ui="true"]) #body > .section[data-mobile-section="roles"]:first-child .helper { display:none; }
      :host([data-mobile-ui="true"]) .role-tools { gap:6px; }
      :host([data-mobile-ui="true"]) .role-tools .search-input { min-height:44px; }
      :host([data-mobile-ui="true"]) .role-tab { min-height:40px; }
      :host([data-mobile-ui="true"]) .selected-role-summary { min-height:32px; margin-top:6px; padding-block:4px; }
      :host([data-mobile-ui="true"]) .role-catalog-shell { margin-top:6px; }
      :host([data-mobile-ui="true"]) .role-option {
        min-height:52px;
        grid-template-columns:34px minmax(0,1fr);
        gap:7px;
        padding:5px;
        border-radius:12px;
      }
      :host([data-mobile-ui="true"]) .role-image { width:34px; height:34px; border-radius:9px; }
      :host([data-mobile-ui="true"]) .role-option-name { font-size:11px; line-height:1.3; }
      :host([data-mobile-ui="true"]) .role-rarity { margin-top:1px; font-size:9px; }
      :host([data-mobile-ui="true"]) .mobile-role-pagination {
        min-height:48px;
        display:grid;
        grid-template-columns:1fr auto 1fr;
        align-items:center;
        gap:8px;
        padding:6px;
        border-top:1px solid var(--line);
        color:var(--muted);
        font-size:11px;
        font-variant-numeric:tabular-nums;
        text-align:center;
      }
      :host([data-mobile-ui="true"]) .mobile-role-pagination button {
        min-height:44px;
        border:0;
        border-radius:11px;
        color:var(--brand-dark);
        background:#eaf7ef;
        font-size:12px;
        font-weight:750;
      }
      :host([data-mobile-ui="true"]) .mobile-role-pagination button:disabled { opacity:.38; }
      :host([data-mobile-ui="true"]) .factor-option-name { font-size:13px; }
      :host([data-mobile-ui="true"]) .factor-option-name { font-size:14px; }
      :host([data-mobile-ui="true"]) .priority-item {
        min-height:60px;
        border:0;
        border-left:5px solid var(--factor-color);
        border-radius:16px;
        box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--factor-color) 20%,var(--line));
      }
      :host([data-mobile-ui="true"]) #priority-list .priority-item > div {
        min-height:48px;
        display:flex;
        flex-direction:column;
        justify-content:center;
        touch-action:none;
        cursor:grab;
      }
      :host([data-mobile-ui="true"]) #priority-list .priority-item.dragging > div { cursor:grabbing; }
      :host([data-mobile-ui="true"]) #priority-list .priority-item.dragging {
        z-index:5;
        opacity:.98;
        transform:translate3d(0,var(--mobile-drag-y,0),0);
        box-shadow:0 14px 30px #173d292e,inset 0 0 0 1px color-mix(in srgb,var(--factor-color) 32%,var(--line));
        will-change:transform;
      }
      :host([data-mobile-ui="true"]) #priority-list .priority-item.drag-settling {
        transition:transform 140ms cubic-bezier(.2,.8,.2,1),box-shadow 140ms ease;
      }
      :host([data-mobile-ui="true"]) .mobile-factor-mode-switch {
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:4px;
        margin-bottom:12px;
        padding:4px;
        border-radius:14px;
        background:#edf2ef;
      }
      :host([data-mobile-ui="true"]) .mobile-factor-mode-switch button {
        min-height:44px;
        border:0;
        border-radius:11px;
        color:var(--muted);
        background:transparent;
        font-size:13px;
        font-weight:750;
      }
      :host([data-mobile-ui="true"]) .mobile-factor-mode-switch button.active {
        color:var(--brand-dark);
        background:#fff;
        box-shadow:0 3px 10px #173d2914;
      }
      :host([data-mobile-ui="true"][data-mobile-factor-mode="manual"]) .quick-recognizer { display:none; }
      :host([data-mobile-ui="true"][data-mobile-factor-mode="recognizer"]) .factor-manual-heading { display:flex; align-items:end; justify-content:space-between; gap:8px; margin:14px 0 8px; }
      :host([data-mobile-ui="true"]) .factor-manual-heading b { font-size:15px; }
      :host([data-mobile-ui="true"]) .factor-manual-heading span { color:var(--muted); font-size:10px; }
      :host([data-mobile-ui="true"]) .quick-recognizer {
        margin-bottom:8px;
        padding:12px;
        border:0;
        border-radius:16px;
        background:#f1f8f4;
      }
      :host([data-mobile-ui="true"]) .recognizer-kicker { display:none; }
      :host([data-mobile-ui="true"]) .recognizer-textarea { min-height:116px; }
      :host([data-mobile-ui="true"]) .recognizer-actions { gap:8px; }
      :host([data-mobile-ui="true"]) .recognizer-hint { font-size:10px; line-height:1.45; }
      :host([data-mobile-ui="true"]) .recognition-feedback { gap:7px; }
      :host([data-mobile-ui="true"]) .recognition-summary { padding:7px 9px; font-size:11px; }
      :host([data-mobile-ui="true"]) .recognition-tier-note { padding:7px 9px; font-size:10px; line-height:1.45; }
      :host([data-mobile-ui="true"]) .recognition-list { grid-template-columns:repeat(2,minmax(0,1fr)); gap:5px; }
      :host([data-mobile-ui="true"]) .recognition-item {
        min-height:46px;
        grid-template-columns:minmax(0,1fr);
        align-content:start;
        align-items:start;
        gap:1px;
        padding:4px 5px;
        border-radius:8px;
      }
      :host([data-mobile-ui="true"]) .recognition-item[hidden] { display:none!important; }
      :host([data-mobile-ui="true"]) .recognition-name { display:-webkit-box; overflow:hidden; font-size:10px; line-height:1.2; white-space:normal; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
      :host([data-mobile-ui="true"]) .recognition-kind { overflow:hidden; font-size:8px; line-height:1.2; white-space:nowrap; text-overflow:ellipsis; }
      :host([data-mobile-ui="true"]) .recognition-stars { overflow:hidden; font-size:8px; line-height:1.2; text-align:left; white-space:nowrap; text-overflow:ellipsis; }
      :host([data-mobile-ui="true"]) .mobile-recognition-pagination {
        display:grid;
        grid-template-columns:1fr auto 1fr;
        align-items:center;
        gap:6px;
        padding:5px;
        border:1px solid var(--line);
        border-radius:11px;
        color:var(--muted);
        background:#fff;
        font-size:9px;
        text-align:center;
      }
      :host([data-mobile-ui="true"]) .mobile-recognition-pagination[hidden] { display:none!important; }
      :host([data-mobile-ui="true"]) .mobile-recognition-pagination button { min-height:40px; border:0; border-radius:9px; color:var(--brand-dark); background:#eaf7ef; font-size:11px; font-weight:750; }
      :host([data-mobile-ui="true"]) .mobile-recognition-pagination button:disabled { opacity:.38; }
      :host([data-mobile-ui="true"]) .recognition-issue { padding:7px 9px; font-size:10px; }
      :host([data-mobile-ui="true"]) .recognizer-label { font-size:15px; }
      :host([data-mobile-ui="true"]) .recognizer-helper,
      :host([data-mobile-ui="true"]) .recognizer-hint { font-size:12px; }
      :host([data-mobile-ui="true"]) .recognizer-textarea {
        min-height:108px;
        border-color:#d6e4da;
        border-radius:14px;
        padding:12px;
        font-size:16px;
      }
      :host([data-mobile-ui="true"]) .recognizer-button,
      :host([data-mobile-ui="true"]) .recognition-apply { min-height:46px; background:var(--brand); color:#fff; }
      :host([data-mobile-ui="true"]) .factor-tab { min-height:44px; border-radius:12px; font-size:13px; }
      :host([data-mobile-ui="true"]) .factor-tabs { margin-bottom:8px; }
      :host([data-mobile-ui="true"]) .search-input { min-height:46px; border-radius:13px; font-size:16px; }
      :host([data-mobile-ui="true"]) #factor-search::placeholder { font-size:12px; }
      :host([data-mobile-ui="true"]) .factor-option { min-height:48px; border-radius:11px; padding:7px 9px; }
      :host([data-mobile-ui="true"]) #factor-catalog {
        grid-template-columns:repeat(2,minmax(0,1fr));
        grid-auto-rows:minmax(48px,auto);
        align-items:start;
        gap:6px;
      }
      :host([data-mobile-ui="true"][data-mobile-factor-color="white"]) #factor-catalog { grid-template-columns:repeat(2,minmax(0,1fr)); }
      :host([data-mobile-ui="true"][data-mobile-has-factors="false"]) .tier-block,
      :host([data-mobile-ui="true"][data-mobile-has-factors="false"]) .mobile-selected-heading { display:none!important; }
      :host([data-mobile-ui="true"]) .mobile-selected-heading { display:flex; align-items:center; justify-content:space-between; gap:10px; margin:16px 0 6px; }
      :host([data-mobile-ui="true"]) .mobile-selected-heading h3 { margin:0; font-size:17px; line-height:1.4; }
      :host([data-mobile-ui="true"]) .mobile-selected-heading p { margin:4px 0 0; color:var(--muted); font-size:12px; line-height:1.5; }
      :host([data-mobile-ui="true"]) .mobile-selected-actions { flex:0 0 auto; }
      :host([data-mobile-ui="true"]) .mobile-selected-actions .reset-factors { min-width:56px; min-height:44px; padding:0 10px; border:0; color:var(--danger); background:transparent; }
      :host([data-mobile-ui="true"]) .mobile-tier-tabs {
        display:grid;
        grid-template-columns:repeat(var(--mobile-tier-count),minmax(0,1fr));
        gap:5px;
        margin:8px 0;
        padding:4px;
        border-radius:13px;
        background:#eef2ef;
      }
      :host([data-mobile-ui="true"]) .mobile-tier-tabs button {
        min-height:42px;
        display:flex;
        align-items:center;
        justify-content:center;
        gap:5px;
        border:0;
        border-radius:10px;
        color:var(--muted);
        background:transparent;
        font-size:12px;
        font-weight:800;
      }
      :host([data-mobile-ui="true"]) .mobile-tier-tabs button span { min-width:18px; border-radius:99px; padding:2px 5px; background:#ffffffa8; font-size:9px; }
      :host([data-mobile-ui="true"]) .mobile-tier-tabs button.active { color:var(--factor-color); background:#fff; box-shadow:0 3px 10px #173d2914; }
      :host([data-mobile-ui="true"]) .tier-block {
        display:none;
        margin-top:6px;
        overflow:visible;
        border:0;
        background:transparent;
      }
      :host([data-mobile-ui="true"]) .tier-block.mobile-tier-active { display:block; }
      :host([data-mobile-ui="true"]) .tier-label { display:none; }
      :host([data-mobile-ui="true"]) .selected-list { min-height:44px; grid-template-columns:repeat(2,minmax(0,1fr)); gap:5px; padding:0; }
      :host([data-mobile-ui="true"]) .tier-empty { min-height:42px; }
      :host([data-mobile-ui="true"]) .tier-block.mobile-tier-empty .selected-list { grid-template-columns:1fr; }
      :host([data-mobile-ui="true"]) .selected-card {
        grid-template-columns:minmax(0,1fr) auto;
        grid-template-areas:"identity summary";
        align-items:center;
        gap:4px;
        min-height:44px;
        padding:4px 5px;
        border-left-width:3px;
        border-radius:8px;
        cursor:pointer;
        touch-action:manipulation;
      }
      :host([data-mobile-ui="true"]) .factor-drag-handle,
      :host([data-mobile-ui="true"]) .compact-factor-field,
      :host([data-mobile-ui="true"]) .tier-field { display:none!important; }
      :host([data-mobile-ui="true"]) .selected-name { font-size:10px; white-space:normal; line-height:1.25; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
      :host([data-mobile-ui="true"]) .selected-subtype { display:none; }
      :host([data-mobile-ui="true"]) .mobile-factor-card-summary { grid-area:summary; display:grid; justify-items:end; gap:1px; }
      :host([data-mobile-ui="true"]) .mobile-factor-card-summary span { color:var(--muted); font-size:7px; white-space:nowrap; }
      :host([data-mobile-ui="true"]) .mobile-factor-card-summary b { border-radius:99px; padding:1px 5px; color:var(--factor-color); background:var(--factor-soft); font-size:7px; }
      :host([data-mobile-ui="true"]) .mobile-factor-editor-scrim { position:absolute; z-index:8; inset:0; display:none; background:#11291d73; }
      :host([data-mobile-ui="true"]) .mobile-factor-editor {
        position:absolute;
        z-index:9;
        left:0;
        right:0;
        bottom:0;
        display:grid;
        gap:14px;
        padding:8px 16px calc(18px + env(safe-area-inset-bottom));
        border-radius:22px 22px 0 0;
        background:#fff;
        box-shadow:0 -16px 40px #1027192e;
        max-height:calc(100dvh - 64px);
        overflow:auto;
        transform:translateY(105%);
        transition:transform 180ms ease-out;
      }
      :host([data-mobile-ui="true"][data-mobile-factor-editor-open="true"]) .mobile-factor-editor-scrim { display:block; }
      :host([data-mobile-ui="true"][data-mobile-factor-editor-open="true"]) .mobile-factor-editor { transform:translateY(0); }
      :host([data-mobile-ui="true"][data-mobile-factor-editor-open="true"]) .panel-body { overflow:hidden!important; }
      :host([data-mobile-ui="true"]) .mobile-editor-handle { width:38px; height:4px; margin:auto; border-radius:99px; background:#d8ded9; }
      :host([data-mobile-ui="true"]) .mobile-editor-head { display:flex; align-items:start; justify-content:space-between; gap:12px; }
      :host([data-mobile-ui="true"]) .mobile-editor-head h3 { margin:0; font-size:18px; line-height:1.35; }
      :host([data-mobile-ui="true"]) .mobile-editor-head p { margin:3px 0 0; color:var(--muted); font-size:11px; }
      :host([data-mobile-ui="true"]) .mobile-editor-fields { display:grid; gap:12px; }
      :host([data-mobile-ui="true"]) .mobile-editor-fields fieldset { min-width:0; display:grid; gap:6px; margin:0; border:0; padding:0; }
      :host([data-mobile-ui="true"]) .mobile-editor-fields legend { padding:0; color:var(--muted); font-size:11px; font-weight:750; }
      :host([data-mobile-ui="true"]) .mobile-editor-choice-grid { display:grid; gap:6px; }
      :host([data-mobile-ui="true"]) .mobile-editor-choice-grid.total { grid-template-columns:repeat(5,minmax(0,1fr)); }
      :host([data-mobile-ui="true"]) .mobile-editor-choice-grid.self,
      :host([data-mobile-ui="true"]) .mobile-editor-choice-grid.tier { grid-template-columns:repeat(4,minmax(0,1fr)); }
      :host([data-mobile-ui="true"]) .mobile-editor-choice-grid button { min-width:0; min-height:48px; border:1px solid var(--line); border-radius:11px; padding:0 4px; color:var(--ink); background:#f8faf8; font-size:12px; font-weight:800; }
      :host([data-mobile-ui="true"]) .mobile-editor-choice-grid button.selected { color:var(--brand-dark); border-color:var(--brand); background:#e8f7ee; box-shadow:inset 0 0 0 1px var(--brand); }
      :host([data-mobile-ui="true"]) .mobile-editor-actions { display:grid; grid-template-columns:1fr; }
      :host([data-mobile-ui="true"]) .mobile-editor-actions button { min-height:48px; border:1px solid var(--line); border-radius:12px; color:var(--muted); background:#fff; font-weight:800; }
      :host([data-mobile-ui="true"]) .mobile-editor-actions .mobile-editor-delete { color:var(--danger); border-color:#f0d5d1; background:#fff8f7; }
      :host([data-mobile-ui="true"]) #body > .section[data-mobile-factor-order="settings"] { padding:14px; }
      :host([data-mobile-ui="true"]) #body > .section[data-mobile-factor-order="settings"] .section-head { margin-bottom:10px; }
      :host([data-mobile-ui="true"]) #body > .section[data-mobile-factor-order="settings"] .section-head h2 { font-size:17px; }
      :host([data-mobile-ui="true"]) #body > .section[data-mobile-factor-order="settings"] .helper { display:none; }
      :host([data-mobile-ui="true"]) .settings { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
      :host([data-mobile-ui="true"]) .field-label { min-width:0; font-size:11px; }
      :host([data-mobile-ui="true"]) .settings .field-label:first-child {
        grid-column:1 / -1;
        display:grid;
        grid-template-columns:auto minmax(0,1fr);
        align-items:center;
        gap:10px;
      }
      :host([data-mobile-ui="true"]) .settings .field-label:first-child .select { margin-top:0; }
      :host([data-mobile-ui="true"]) .select { min-height:44px; }
      :host([data-mobile-ui="true"]) .toggle {
        min-height:48px;
        margin-top:4px;
        gap:6px;
        border:1px solid var(--line);
        border-radius:11px;
        padding:4px 8px;
        background:#fbfcfb;
        font-size:11px;
        line-height:1.35;
      }
      :host([data-mobile-ui="true"]) .toggle input { width:18px; height:18px; flex:0 0 auto; }
      :host([data-mobile-ui="true"][data-mobile-page="results"]) #results-section { padding:12px; }
      :host([data-mobile-ui="true"]) .results-head { align-items:flex-start; margin-bottom:9px; }
      :host([data-mobile-ui="true"]) .results-head .helper { display:none; }
      :host([data-mobile-ui="true"]) .results-tools { align-items:center; flex-direction:row; gap:6px; }
      :host([data-mobile-ui="true"]) .result-count { font-size:10px; }
      :host([data-mobile-ui="true"]) .results-rerun { min-height:34px; padding-inline:9px; }
      :host([data-mobile-ui="true"]) .result-card { border:0; border-radius:16px; box-shadow:inset 0 0 0 1px var(--line); }
      :host([data-mobile-ui="true"]) .result-top { grid-template-columns:48px minmax(0,1fr) auto; gap:8px; padding:10px; }
      :host([data-mobile-ui="true"]) .hero-image { width:48px; height:48px; border-radius:12px; }
      :host([data-mobile-ui="true"]) .result-rank { left:-4px; top:-5px; height:22px; min-width:26px; font-size:9px; }
      :host([data-mobile-ui="true"]) .result-name { font-size:14px; line-height:1.25; }
      :host([data-mobile-ui="true"]) .result-meta { margin-top:2px; white-space:normal; font-size:10px; line-height:1.35; }
      :host([data-mobile-ui="true"]) .result-meta-row { align-items:flex-end; gap:5px; }
      :host([data-mobile-ui="true"]) .result-copy { min-height:32px; padding:0 7px; }
      :host([data-mobile-ui="true"]) .result-copy svg { width:14px; height:14px; }
      :host([data-mobile-ui="true"]) .score { min-width:48px; }
      :host([data-mobile-ui="true"]) .score-value { font-size:21px; }
      :host([data-mobile-ui="true"]) .score-track { height:5px; margin-inline:10px; }
      :host([data-mobile-ui="true"]) .breakdown { grid-template-columns:repeat(4,minmax(0,1fr)); gap:4px; padding:8px 10px 4px; }
      :host([data-mobile-ui="true"]) .breakdown-item { min-height:43px; display:grid; place-content:center; border-radius:9px; padding:4px 2px; }
      :host([data-mobile-ui="true"]) .breakdown-item b { font-size:12px; }
      :host([data-mobile-ui="true"]) .breakdown-item span { font-size:8px; line-height:1.25; }
      :host([data-mobile-ui="true"]) .result-summary { margin:5px 10px 1px; padding:5px 7px; }
      :host([data-mobile-ui="true"]) .match-list { gap:8px; padding:6px 10px 10px; }
      :host([data-mobile-ui="true"]) .result-factor-label { gap:5px; }
      :host([data-mobile-ui="true"]) .result-other-heading { margin-top:2px; padding-top:7px; border-top:1px solid var(--line); }
      :host([data-mobile-ui="true"]) .factor-chip-list { grid-template-columns:repeat(2,minmax(0,1fr)); gap:4px; }
      :host([data-mobile-ui="true"]) .match-chip { border-radius:8px; padding:5px 6px; font-size:10px; line-height:1.25; }
      :host([data-mobile-ui="true"]) .factor-chip-stars { font-size:8px; }
      :host([data-mobile-ui="true"]) .action-bar {
        display:none!important;
        z-index:5;
        bottom:calc(var(--mobile-nav-height) + env(safe-area-inset-bottom));
        gap:0;
        padding:7px 12px;
        border-top:1px solid var(--line);
        background:#fffffff7;
        box-shadow:0 -5px 18px #1835220d;
        backdrop-filter:none;
      }
      :host([data-mobile-ui="true"][data-mobile-page="factors"]) .action-bar { display:grid!important; }
      :host([data-mobile-ui="true"][data-mobile-page="factors"][data-mobile-recognition-state="preview"]) .action-bar,
      :host([data-mobile-ui="true"][data-mobile-page="factors"][data-mobile-recognition-state="draft"]) .action-bar { display:none!important; }
      :host([data-mobile-ui="true"]) .mobile-recognition-bar {
        position:absolute;
        z-index:5;
        left:0;
        right:0;
        bottom:calc(var(--mobile-nav-height) + env(safe-area-inset-bottom));
        display:none;
        grid-template-columns:1fr 1fr;
        gap:8px;
        padding:7px 12px;
        border-top:1px solid var(--line);
        background:#fffffff7;
        box-shadow:0 -5px 18px #1835220d;
      }
      :host([data-mobile-ui="true"][data-mobile-page="factors"][data-mobile-recognition-state="preview"]) .mobile-recognition-bar,
      :host([data-mobile-ui="true"][data-mobile-page="factors"][data-mobile-recognition-state="draft"]) .mobile-recognition-bar { display:grid; }
      :host([data-mobile-ui="true"]) .mobile-recognition-bar button { min-height:52px; border-radius:14px; font-size:13px; font-weight:800; }
      :host([data-mobile-ui="true"]) .mobile-recognition-bar .secondary { border:1px solid var(--line); color:var(--muted); background:#fff; }
      :host([data-mobile-ui="true"]) .recognition-feedback > .recognition-preview-actions { display:none; }
      :host([data-mobile-ui="true"]) .recognition-draft > .recognition-preview-actions .recognition-apply { display:none; }
      :host([data-mobile-ui="true"]) .recognition-draft > .recognition-preview-actions .recognition-cancel { width:100%; }
      :host([data-mobile-ui="true"]) .status { display:none; min-height:18px; overflow:hidden; font-size:11px; white-space:nowrap; text-overflow:ellipsis; }
      :host([data-mobile-ui="true"]) .status.error,
      :host([data-mobile-ui="true"]) .status.success { display:block; margin-bottom:4px; }
      :host([data-mobile-ui="true"]) .primary {
        min-height:52px;
        border-radius:14px;
        background:var(--brand);
        box-shadow:0 7px 18px #16945e2b;
        font-size:15px;
      }
      :host([data-mobile-ui="true"]) .mobile-nav {
        position:absolute;
        z-index:6;
        left:0;
        right:0;
        bottom:0;
        min-height:calc(var(--mobile-nav-height) + env(safe-area-inset-bottom));
        display:grid;
        grid-template-columns:repeat(4,1fr);
        align-items:start;
        gap:4px;
        padding:7px 8px calc(6px + env(safe-area-inset-bottom));
        border-top:1px solid var(--line);
        background:#fffffff9;
        box-shadow:0 -5px 20px #1835220d;
      }
      :host([data-mobile-ui="true"]) .mobile-nav-button {
        position:relative;
        min-width:0;
        min-height:50px;
        display:grid;
        place-items:center;
        align-content:center;
        gap:2px;
        border:0;
        border-radius:15px;
        color:#718078;
        background:transparent;
        font-size:11px;
        font-weight:700;
      }
      :host([data-mobile-ui="true"]) .mobile-nav-button svg {
        width:23px;
        height:23px;
        stroke-width:1.8;
      }
      :host([data-mobile-ui="true"]) .mobile-nav-button.active { color:var(--brand-dark); background:#eaf7ef; }
      :host([data-mobile-ui="true"]) .mobile-nav-badge {
        position:absolute;
        top:3px;
        left:calc(50% + 8px);
        min-width:17px;
        height:17px;
        display:grid;
        place-items:center;
        border:2px solid #fff;
        border-radius:99px;
        padding:0 3px;
        color:#fff;
        background:var(--brand);
        font-size:9px;
        font-weight:800;
        font-variant-numeric:tabular-nums;
      }
      :host([data-mobile-ui="true"]) .mobile-results-empty {
        min-height:48vh;
        align-content:center;
        justify-items:center;
        text-align:center;
      }
      :host([data-mobile-ui="true"]) .mobile-results-empty > svg {
        width:56px;
        height:56px;
        margin-bottom:14px;
        padding:13px;
        border-radius:18px;
        color:var(--brand-dark);
        background:#eaf7ef;
      }
      :host([data-mobile-ui="true"]) .mobile-results-empty p { max-width:280px; margin:8px 0 0; color:var(--muted); font-size:14px; line-height:1.6; }
      :host([data-mobile-ui="true"]) .mobile-results-empty.searching { min-height:0; align-content:start; justify-items:stretch; padding:18px; text-align:left; }
      :host([data-mobile-ui="true"]) .mobile-search-head { min-width:0; display:grid; grid-template-columns:40px minmax(0,1fr) auto; align-items:center; gap:10px; }
      :host([data-mobile-ui="true"]) .mobile-search-head svg { width:40px; height:40px; box-sizing:border-box; padding:9px; border-radius:13px; color:var(--brand-dark); background:#eaf7ef; }
      :host([data-mobile-ui="true"]) .mobile-search-head h2 { min-width:0; margin:0; overflow:hidden; font-size:17px; line-height:1.3; white-space:nowrap; text-overflow:ellipsis; }
      :host([data-mobile-ui="true"]) .mobile-search-head strong { border-radius:99px; padding:5px 8px; color:var(--brand-dark); background:#eaf7ef; font-size:12px; font-variant-numeric:tabular-nums; white-space:nowrap; }
      :host([data-mobile-ui="true"]) .mobile-search-progress { width:100%; height:7px; margin-top:16px; overflow:hidden; border-radius:99px; background:#dfeae3; }
      :host([data-mobile-ui="true"]) .mobile-search-progress span { display:block; height:100%; border-radius:inherit; background:var(--brand); transition:width 180ms ease-out; }
      :host([data-mobile-ui="true"]) .mobile-search-meta { min-width:0; display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:12px; margin-top:10px; color:var(--muted); font-size:12px; line-height:1.35; }
      :host([data-mobile-ui="true"]) .mobile-search-meta span:first-child { min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
      :host([data-mobile-ui="true"]) .mobile-search-meta span:last-child { color:var(--brand-dark); font-weight:750; white-space:nowrap; }
      :host([data-mobile-ui="true"]) .mobile-app-settings { padding:16px; }
      :host([data-mobile-ui="true"]) .mobile-app-settings .section-head { margin-bottom:10px; }
      :host([data-mobile-ui="true"]) .mobile-update-card { display:grid; grid-template-columns:44px minmax(0,1fr) auto; align-items:center; gap:10px; border:1px solid var(--line); border-radius:16px; padding:12px; background:#fbfcfb; }
      :host([data-mobile-ui="true"]) .mobile-update-icon { width:44px; height:44px; display:grid; place-items:center; border-radius:13px; color:var(--brand-dark); background:#eaf7ef; }
      :host([data-mobile-ui="true"]) .mobile-update-icon svg { width:23px; height:23px; }
      :host([data-mobile-ui="true"]) .mobile-update-copy { min-width:0; display:grid; gap:2px; }
      :host([data-mobile-ui="true"]) .mobile-update-copy b { font-size:14px; }
      :host([data-mobile-ui="true"]) .mobile-update-copy span { color:var(--muted); font-size:11px; }
      :host([data-mobile-ui="true"]) [data-mobile-check-update] { min-height:44px; border:0; border-radius:11px; padding:0 11px; color:var(--brand-dark); background:#eaf7ef; font-size:11px; font-weight:800; white-space:nowrap; }
      :host([data-mobile-ui="true"]) [data-mobile-check-update]:disabled { opacity:.55; }
      :host([data-mobile-ui="true"]) .mobile-update-status { grid-column:2 / -1; margin:0; color:var(--muted); font-size:11px; }
      :host([data-mobile-ui="true"]) .mobile-update-status[data-update-state="available"] { color:var(--brand-dark); font-weight:750; }
      :host([data-mobile-ui="true"]) .mobile-update-status[data-update-state="error"] { color:var(--danger); }
      :host([data-mobile-ui="true"]) .mobile-update-link { grid-column:2 / -1; width:max-content; color:var(--brand-dark); font-size:12px; font-weight:800; }
      :host([data-mobile-ui="true"]) .mobile-project-link { min-height:48px; display:flex; align-items:center; justify-content:center; margin-top:10px; border:1px solid var(--line); border-radius:13px; color:var(--brand-dark); background:#fff; font-size:12px; font-weight:750; text-decoration:none; }
      @media (max-width:370px) {
        :host([data-mobile-ui="true"]) .panel-body { padding-inline:9px; }
        :host([data-mobile-ui="true"]) .section { padding:14px; border-radius:18px; }
        :host([data-mobile-ui="true"]) .selected-list { gap:5px; }
        :host([data-mobile-ui="true"]) .selected-card { min-height:42px; padding-inline:4px; }
        :host([data-mobile-ui="true"]) .factor-description { display:none; }
      }
      @media (max-width:330px) {
        :host([data-mobile-ui="true"]) .settings { grid-template-columns:1fr; }
      }
      @media (orientation:landscape) and (max-height:520px) {
        :host([data-mobile-ui="true"]) .panel-header { min-height:54px; padding-block:6px; }
        :host([data-mobile-ui="true"]) .brand-mark { width:38px; height:38px; }
        :host([data-mobile-ui="true"]) .section { padding:14px; }
      }
      @media (prefers-reduced-motion:reduce) {
        :host([data-mobile-ui="true"]) .panel-body { scroll-behavior:auto; }
        :host([data-mobile-ui="true"]) #priority-list .priority-item.drag-settling { transition:none; }
      }
    `;
    ui.root.appendChild(style);

    const nav = document.createElement("nav");
    nav.className = "mobile-nav";
    nav.setAttribute("role", "tablist");
    nav.setAttribute("aria-label", "主要页面");
    nav.innerHTML = PAGE_ORDER.map((page) => `
      <button class="mobile-nav-button" type="button" role="tab" data-mobile-target="${page}" aria-label="${PAGE_LABELS[page]}" aria-selected="${page === activePage}">
        ${ICONS[page]}<span>${PAGE_LABELS[page]}</span><span class="mobile-nav-badge" hidden></span>
      </button>
    `).join("");
    ui.panel.appendChild(nav);

    nav.addEventListener("click", (event) => {
      const button = event.target.closest(".mobile-nav-button");
      if (button) activate(button.dataset.mobileTarget);
    });
    ui.root.addEventListener("pointerdown", (event) => {
      scrollPositions.set(activePage, ui.body.scrollTop);
      if (event.pointerType === "mouse" && beginColorDrag(event.target, `pointer-${event.pointerId}`, event.clientY, ui)) {
        event.preventDefault();
      }
    }, true);
    ui.root.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse" || !colorDrag) return;
      event.preventDefault();
      updateColorDrag(`pointer-${event.pointerId}`, event.clientY);
    }, true);
    ui.root.addEventListener("pointerup", (event) => finishColorDrag(`pointer-${event.pointerId}`, ui), true);
    ui.root.addEventListener("pointercancel", (event) => finishColorDrag(`pointer-${event.pointerId}`, ui, true), true);
    ui.root.addEventListener("touchstart", (event) => {
      scrollPositions.set(activePage, ui.body.scrollTop);
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (beginColorDrag(event.target, `touch-${touch.identifier}`, touch.clientY, ui)) event.preventDefault();
    }, { capture: true, passive: false });
    ui.root.addEventListener("touchmove", (event) => {
      if (!colorDrag?.inputId.startsWith("touch-")) return;
      const touch = findTouch(event, colorDrag.inputId);
      if (!touch) return;
      event.preventDefault();
      updateColorDrag(colorDrag.inputId, touch.clientY);
    }, { capture: true, passive: false });
    ui.root.addEventListener("touchend", (event) => {
      if (!colorDrag?.inputId.startsWith("touch-")) return;
      const inputId = colorDrag.inputId;
      if (!findTouch(event, inputId, true)) return;
      event.preventDefault();
      finishColorDrag(inputId, ui);
    }, { capture: true, passive: false });
    ui.root.addEventListener("touchcancel", (event) => {
      if (!colorDrag?.inputId.startsWith("touch-")) return;
      const inputId = colorDrag.inputId;
      event.preventDefault();
      finishColorDrag(inputId, ui, true);
    }, { capture: true, passive: false });
    ui.root.addEventListener("change", () => {
      scrollPositions.set(activePage, ui.body.scrollTop);
    }, true);
    ui.root.addEventListener("click", (event) => {
      if (event.target.closest("#recognize-factor-text")) recognitionPage = 0;
      if (event.target.closest("[data-mobile-check-update]")) {
        checkForUpdates(ui);
        return;
      }
      if (event.target.closest(".mobile-factor-editor-scrim")) {
        const editor = ui.panel.querySelector(".mobile-factor-editor");
        if (editor?.dataset.mobileEditorDirty === "true") saveFactorEditor(ui);
        else closeFactorEditor(ui);
        return;
      }
      const editorChoice = event.target.closest("[data-mobile-editor-choice]");
      if (editorChoice) {
        const editor = editorChoice.closest(".mobile-factor-editor");
        const kind = editorChoice.dataset.mobileEditorChoice;
        const datasetKey = `mobileEditor${kind[0].toUpperCase()}${kind.slice(1)}`;
        editor.dataset[datasetKey] = editorChoice.dataset.value;
        editor.dataset.mobileEditorDirty = "true";
        editorChoice.parentElement.querySelectorAll("[data-mobile-editor-choice]").forEach((button) => {
          const selected = button === editorChoice;
          button.classList.toggle("selected", selected);
          button.setAttribute("aria-pressed", String(selected));
        });
        return;
      }
      if (event.target.closest("[data-mobile-editor-delete]")) {
        const editor = ui.panel.querySelector(".mobile-factor-editor");
        const key = editor?.dataset.factorKey;
        if (key) ui.root.dispatchEvent(new CustomEvent("uma-seed-remove-factor", { detail: { key } }));
        closeFactorEditor(ui);
        return;
      }
      const tierFilter = event.target.closest("[data-mobile-tier-filter]");
      if (tierFilter) {
        applyFactorTierFilter(tierFilter.closest(".section"), tierFilter.dataset.mobileTierFilter);
        return;
      }
      const recognitionPageButton = event.target.closest("[data-recognition-page]");
      if (recognitionPageButton && !recognitionPageButton.disabled) {
        recognitionPage += recognitionPageButton.dataset.recognitionPage === "next" ? 1 : -1;
        updateRecognitionPagination(ui);
        ui.root.getElementById("recognition-feedback")?.scrollIntoView({ block: "nearest" });
        return;
      }
      const selectedCard = event.target.closest(".selected-card[data-key]");
      if (selectedCard && ui.host.dataset.mobilePage === "factors") {
        openFactorEditor(ui, selectedCard);
        return;
      }
      const recognitionForward = event.target.closest("[data-recognition-forward]");
      if (recognitionForward) {
        ui.root.getElementById(recognitionForward.dataset.recognitionForward)?.click();
        return;
      }
      if (event.target.closest("[data-recognition-continue]")) {
        const input = ui.root.getElementById("bulk-factor-input");
        input?.scrollIntoView({ block: "center" });
        input?.focus();
        return;
      }
      const factorModeButton = event.target.closest("[data-factor-entry-mode]");
      if (factorModeButton) {
        setFactorEntryMode(ui, factorModeButton.dataset.factorEntryMode);
        return;
      }
      const orderButton = event.target.closest("#priority-list .order-up,#priority-list .order-down");
      if (orderButton) {
        const savedTop = scrollPositions.get(activePage) ?? ui.body.scrollTop;
        ui.root.activeElement?.blur();
        restoreScrollPosition(ui, activePage, savedTop, true);
      }
      const rolePageButton = event.target.closest("[data-role-page]");
      if (rolePageButton && !rolePageButton.disabled) {
        rolePage += rolePageButton.dataset.rolePage === "next" ? 1 : -1;
        updateRolePagination(ui);
        ui.root.getElementById("role-catalog")?.scrollIntoView({ block: "nearest" });
        return;
      }
      if (event.target.closest("[data-role-rarity]")) {
        rolePage = 0;
        requestAnimationFrame(() => updateRolePagination(findUi(), true));
      }
      const searchButton = event.target.closest("#search-button");
      if (!searchButton || searchButton.disabled) return;
      awaitingResults = true;
      activate("results", { resetScroll: true });
    }, true);
    ui.root.addEventListener("input", (event) => {
      if (event.target.closest("#role-search")) {
        rolePage = 0;
        requestAnimationFrame(() => updateRolePagination(findUi(), true));
      }
    }, true);
    ui.root.addEventListener("uma-seed-render-start", (event) => {
      closeFactorEditor(ui);
      const top = Number(event.detail?.scrollTop);
      renderScrollSnapshot = {
        page: activePage,
        top: Number.isFinite(top) ? top : ui.body.scrollTop
      };
      scrollPositions.set(renderScrollSnapshot.page, renderScrollSnapshot.top);
    });
    ui.root.addEventListener("uma-seed-render-end", () => {
      const snapshot = renderScrollSnapshot;
      renderScrollSnapshot = null;
      if (!snapshot || snapshot.page !== activePage) return;
      const currentUi = findUi();
      if (!currentUi) return;
      mapSections(currentUi);
      restoreScrollPosition(currentUi, snapshot.page, snapshot.top, true);
    });

    const observer = new MutationObserver(() => {
      if (applyScheduled) return;
      applyScheduled = true;
      requestAnimationFrame(() => {
        applyScheduled = false;
        const currentUi = findUi();
        if (!currentUi) return;
        const hasResults = Boolean(currentUi.root.getElementById("results-section"));
        if (hasResults) awaitingResults = false;
        else if (awaitingResults && currentUi.root.getElementById("status")?.matches(".error,.success")) awaitingResults = false;
        mapSections(currentUi);
        restoreScrollPosition(currentUi, activePage, scrollPositions.get(activePage) || 0);
      });
    });
    observer.observe(ui.body, { childList: true });
    mapSections(ui);
  }

  install();
})();
