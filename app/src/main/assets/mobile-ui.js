(function seedSearcherMobileUi() {
  "use strict";

  if (globalThis.__UMA_SEED_SEARCHER_MOBILE_UI__) return;

  const ICONS = {
    hints: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="m12 6 1.5 4 4 .5-3 2.8.8 4.2-3.3-2-3.3 2 .8-4.2-3-2.8 4-.5Z"/></svg>',
    roles: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c.5-4 2.7-6 6.5-6s6 2 6.5 6"/></svg>',
    factors: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="2"/><rect x="14" y="4" width="6" height="6" rx="2"/><rect x="4" y="14" width="6" height="6" rx="2"/><rect x="14" y="14" width="6" height="6" rx="2"/></svg>',
    results: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12"/><path d="m3.5 6 .8.8L6 5M3.5 12l.8.8L6 11M3.5 18l.8.8L6 17"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h5M15 6h5M4 12h9M17 12h3M4 18h3M11 18h9"/><circle cx="12" cy="6" r="2.5"/><circle cx="15" cy="12" r="2.5"/><circle cx="9" cy="18" r="2.5"/></svg>'
  };
  const PAGE_ORDER = ["roles", "factors", "results", "hints", "settings"];
  const PAGE_LABELS = {
    hints: "技能",
    roles: "角色",
    factors: "因子",
    results: "结果",
    settings: "设置"
  };
  const FACTOR_MODE_STORAGE_KEY = "uma-seed-mobile-factor-mode";
  const APP_VERSION = "0.1.52";
  const PROJECT_URL = "https://github.com/yyahz/umamusume-seed-searcher-android";
  const VERSION_SOURCE_URL = `${PROJECT_URL.replace("https://github.com", "https://raw.githubusercontent.com")}/main/app/build.gradle`;
  const BWIKI_URL = "https://wiki.biligame.com/umamusume/";
  const TOOL_EXTERNAL_URL = "https://game.bilibili.com/tool/pd/?uma_seed_external=1";

  let activePage = "roles";
  let hintOverlayOpen = false;
  let beforeHints = "roles";
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
      heading.innerHTML = '<div><h3>已选因子</h3></div><div class="mobile-selected-actions"></div>';
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
      const empty = block.querySelector(".tier-empty");
      if (empty) empty.textContent = `暂无${tierNames[block.dataset.factorTier] || "该优先级"}因子`;
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
    activeFactorTier = editor.dataset.mobileEditorTier || activeFactorTier;
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

  function releaseApkUrl(version) {
    const normalized = String(version || "").replace(/^v/i, "");
    return `${PROJECT_URL}/releases/download/v${normalized}/uma-seed-searcher-android-v${normalized}-debug.apk`;
  }

  function renderAppSettings(section) {
    if (!section) return;
    const busy = ["checking", "downloading", "ready", "permission", "installer"].includes(updateCheck.state);
    const installAction = updateCheck.url
      ? `<button class="mobile-update-install" type="button" data-mobile-install-update ${busy ? "disabled" : ""}>${updateCheck.state === "downloading" ? "下载中…" : "立即更新"}</button>`
      : "";
    section.innerHTML = `<div class="section-head"><div><h2>应用设置</h2><p class="helper">版本与更新</p></div></div><div class="mobile-update-card"><div class="mobile-update-icon">${ICONS.settings}</div><div class="mobile-update-copy"><b>种马搜索器</b><span>当前版本 v${APP_VERSION}</span></div><button type="button" data-mobile-check-update ${busy ? "disabled" : ""}>${updateCheck.state === "checking" ? "检查中…" : "检查更新"}</button><div class="mobile-update-footer"><p class="mobile-update-status" data-update-state="${updateCheck.state}" role="status"></p>${installAction}</div></div><a class="mobile-project-link" href="${PROJECT_URL}" rel="noopener noreferrer">打开 GitHub 项目页</a>`;
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

  function ensureDataStatementSection(ui) {
    let section = ui.body.querySelector("[data-mobile-data-statement]");
    if (!section) {
      section = document.createElement("section");
      section.className = "section mobile-data-statement";
      section.dataset.mobileDataStatement = "";
      section.dataset.mobileSection = "settings";
      ui.body.appendChild(section);
    }
    section.innerHTML = `<div class="section-head"><div><h2>数据与服务声明</h2><p class="helper">本工具的资料参考与搜索依托</p></div></div><div class="mobile-statement-list"><a href="${BWIKI_URL}" rel="noopener noreferrer"><span><b>数据来源</b><small>赛马娘 BWIKI</small></span><strong>打开</strong></a><a href="${TOOL_EXTERNAL_URL}" rel="noopener noreferrer"><span><b>搜索依托</b><small>吗哩吗哩工具箱</small></span><strong>打开</strong></a></div>`;
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
        updateCheck = { state: "available", message: `发现新版本 v${latest}`, latest, url: releaseApkUrl(latest) };
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
      updateCheck = { state: "available", message: `发现新版本 v${latest}`, latest, url: releaseApkUrl(latest) };
    } else {
      updateCheck = { state: "current", message: "当前已是最新版本", latest, url: "" };
    }
    ensureAppSettingsSection(findUi());
  };

  globalThis.__umaSeedCachedUpdate = (version) => {
    // A late disk-check callback must not replace a newer user-initiated check.
    if (updateCheck.state !== "idle" || compareVersions(version, APP_VERSION) <= 0) return;
    updateCheck = { state: "available", message: `v${version} 已下载，可直接安装`, latest: version, url: releaseApkUrl(version) };
    ensureAppSettingsSection(findUi());
  };

  globalThis.__umaSeedInstallStatus = (state, message) => {
    updateCheck = {
      ...updateCheck,
      state: String(state || "error"),
      message: String(message || "更新失败，请稍后重试")
    };
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
    ensureDataStatementSection(ui);
    updateRolePagination(ui);
    updateNavigation(ui);
  }

  function activate(page, options = {}) {
    const ui = findUi();
    if (!ui || !PAGE_ORDER.includes(page)) return false;
    if (!options.skipSave) scrollPositions.set(activePage, ui.body.scrollTop);
    if (page === "hints" && activePage !== "hints") beforeHints = activePage;
    activePage = page;
    const hintFrame = ui.root.getElementById("mobile-hints-frame");
    if (page === "hints" && !hintFrame.hasAttribute("src")) hintFrame.src = "https://appassets.androidplatform.net/index.html";
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
        if (activePage === "hints") {
          if (hintOverlayOpen) ui.root.getElementById("mobile-hints-frame").contentWindow.postMessage({type:"uma-hints-back"},"https://appassets.androidplatform.net");
          else activate(beforeHints, {resetScroll:false});
          return true;
        }
        const backPages = PAGE_ORDER.filter(page => page !== "hints");
        const index = backPages.indexOf(activePage);
        if (index <= 0) return false;
        activate(backPages[index - 1], { resetScroll: false });
        return true;
      },
      activate
    };
    ui.host.dataset.mobileUi = "true";
    ui.host.dataset.mobilePage = activePage;
    ui.host.dataset.mobileFactorMode = factorEntryMode;

    const style = document.createElement("style");
    style.id = "uma-mobile-ui-style";
    // Official umamusume.jp svg.teitetsu path, unchanged. Third-party artwork,
    // excluded from MIT; see THIRD_PARTY_NOTICES.md for source and rights status.
    const officialHorseshoePath = "M100.7 94.6c-2.4-2.1-7-3.9-4.4-7.8 18.8-27.1 10.9-70.4-22.4-81.6C67.5 2.9 60.7 1.8 54 1.8S40.4 3 34.1 5.2C.7 16.5-7.1 59.8 11.7 86.8c2.6 3.8-2 5.7-4.4 7.8-1.6 1.3-1.8 3.5-.5 5 2.8 3.2 5.7 6.4 8.6 9.5 1.4 1.7 3.6 1.2 5.1 0 7.1-4.7 14.1-9.4 21.2-14.1.8-.5 1.3-1.2 1.5-2.1.3-1.3 0-2.4-1.1-3.3-3.1-2.9-5.5-6.2-7.3-10.1-3.9-8.8-5-20.5-2-29.7 3.1-9.9 11.8-15.3 21.2-15.3s18.1 5.4 21.2 15.3c2.9 9.2 1.9 20.9-2 29.7-1.8 3.8-4.2 7.2-7.3 10.1-1 .9-1.4 2-1.1 3.3.2.9.7 1.6 1.5 2.1 7.1 4.7 14.1 9.4 21.2 14.1 1.5 1.2 3.7 1.6 5.1 0 2.9-3.2 5.7-6.3 8.6-9.5 1.4-1.5 1.1-3.7-.5-5";
    const horseshoeDecoration = "data:image/svg+xml," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="420" viewBox="0 0 360 420"><defs><path id="shoe" d="${officialHorseshoePath}"/></defs><g opacity=".30">${[
        [22,28,.20,-25,"#e78dbd"],[178,75,.15,18,"#80bfe5"],
        [338,135,.22,155,"#a7cf73"],[85,190,.16,-15,"#c3a0e1"],
        [245,242,.23,205,"#efc35f"],[14,292,.17,28,"#70cbb7"],
        [140,357,.21,165,"#e899b6"],[321,390,.15,-32,"#8fa7ed"]
      ].map(([x,y,scale,angle,color]) => `<use href="#shoe" fill="${color}" transform="translate(${x} ${y}) rotate(${angle}) scale(${scale}) translate(-54 -56)"/>`).join("")}</g></svg>`
    );
    const facetBackground = "data:image/svg+xml," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="760" viewBox="0 0 600 760"><rect width="600" height="760" fill="#fcfbff"/><g opacity=".6"><path d="M0 0L220 120 35 300Z" fill="#f8ddeb"/><path d="M600 0L390 170 520 365 600 330Z" fill="#d9effb"/><path d="M0 510L235 390 160 690Z" fill="#e1f1cf"/><path d="M600 515L395 590 540 760 600 760Z" fill="#fff0bf"/><path d="M220 120L380 0 390 170Z" fill="#e9e0f8"/><path d="M35 300L235 390 0 510Z" fill="#ddf2ec"/><path d="M235 390L520 365 395 590Z" fill="#f8e0eb"/><path d="M160 690L395 590 300 760Z" fill="#e0e8fc"/></g></svg>'
    );
    style.textContent = `
      :host([data-mobile-ui="true"]) {
        --mobile-nav-height:64px;
        --mobile-action-height:68px;
        --surface:#fff;
        --surface-2:#f8f7ff;
        --ink:#29324a;
        --muted:#667087;
        --line:#e2e3ee;
        --brand:#315cff;
        --brand-dark:#2347c4;
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
      :host([data-mobile-ui="true"][data-mobile-page="factors"]) .panel-header,
      :host([data-mobile-ui="true"][data-mobile-page="results"]) .panel-header,
      :host([data-mobile-ui="true"][data-mobile-page="settings"]) .panel-header { display:none; }
      :host([data-mobile-ui="true"]) h1 { font-size:18px; }
      :host([data-mobile-ui="true"]) .brand-credit { color:var(--muted); font-size:9px; opacity:.78; }
      :host([data-mobile-ui="true"]) .subtitle { display:none; }
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
      :host([data-mobile-ui="true"][data-mobile-has-factors="false"]) .mobile-tier-tabs,
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
      :host([data-mobile-ui="true"]) .result-top {
        --result-main-avatar:60px;
        --result-parent-avatar:28px;
        --result-avatar-gap:4px;
        --result-parent-gap:4px;
        grid-template-columns:calc(var(--result-main-avatar) + var(--result-parent-avatar) + var(--result-avatar-gap)) minmax(0,1fr) auto;
        gap:8px;
        padding:10px;
      }
      :host([data-mobile-ui="true"]) .hero-family { width:calc(var(--result-main-avatar) + var(--result-parent-avatar) + var(--result-avatar-gap)); height:var(--result-main-avatar); grid-template-columns:var(--result-main-avatar) var(--result-parent-avatar); gap:var(--result-avatar-gap); }
      :host([data-mobile-ui="true"]) .hero-family .hero-image { width:var(--result-main-avatar); height:var(--result-main-avatar); border-radius:15px; }
      :host([data-mobile-ui="true"]) .parent-images { height:var(--result-main-avatar); grid-template-rows:repeat(2,var(--result-parent-avatar)); gap:var(--result-parent-gap); }
      :host([data-mobile-ui="true"]) .parent-image { width:var(--result-parent-avatar); height:var(--result-parent-avatar); border-radius:8px; }
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
        grid-template-columns:repeat(5,1fr);
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
      :host([data-mobile-ui="true"]) [data-mobile-check-update],
      :host([data-mobile-ui="true"]) .mobile-update-install { box-sizing:border-box; flex:0 0 auto; width:76px; min-width:76px; min-height:44px; border:0; border-radius:11px; padding:10px 11px; display:inline-flex; align-items:center; justify-content:center; font-size:11px; line-height:1.4; font-weight:800; white-space:nowrap; }
      :host([data-mobile-ui="true"]) [data-mobile-check-update] { color:var(--brand-dark); background:#eaf7ef; }
      :host([data-mobile-ui="true"]) [data-mobile-check-update]:disabled { opacity:.55; }
      :host([data-mobile-ui="true"]) .mobile-update-footer { grid-column:2 / -1; min-width:0; display:flex; align-items:center; justify-content:space-between; gap:10px; }
      :host([data-mobile-ui="true"]) .mobile-update-status { min-width:0; margin:0; color:var(--muted); font-size:11px; line-height:1.35; }
      :host([data-mobile-ui="true"]) .mobile-update-status[data-update-state="available"] { color:var(--brand-dark); font-weight:750; }
      :host([data-mobile-ui="true"]) .mobile-update-status[data-update-state="error"] { color:var(--danger); }
      :host([data-mobile-ui="true"]) .mobile-update-install { color:#fff; background:var(--brand); }
      :host([data-mobile-ui="true"]) .mobile-update-install:disabled { opacity:.58; }
      :host([data-mobile-ui="true"]) .mobile-project-link { min-height:48px; display:flex; align-items:center; justify-content:center; margin-top:10px; border:1px solid var(--line); border-radius:13px; color:var(--brand-dark); background:#fff; font-size:12px; font-weight:750; text-decoration:none; }
      :host([data-mobile-ui="true"]) .mobile-data-statement { padding:16px; }
      :host([data-mobile-ui="true"]) .mobile-data-statement .section-head { margin-bottom:10px; }
      :host([data-mobile-ui="true"]) .mobile-statement-list { overflow:hidden; border:1px solid var(--line); border-radius:16px; background:#fff; }
      :host([data-mobile-ui="true"]) .mobile-statement-list a { min-height:60px; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 14px; color:var(--ink); text-decoration:none; }
      :host([data-mobile-ui="true"]) .mobile-statement-list a + a { border-top:1px solid var(--line); }
      :host([data-mobile-ui="true"]) .mobile-statement-list span { min-width:0; display:grid; gap:2px; }
      :host([data-mobile-ui="true"]) .mobile-statement-list b { font-size:13px; }
      :host([data-mobile-ui="true"]) .mobile-statement-list small { overflow:hidden; color:var(--muted); font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
      :host([data-mobile-ui="true"]) .mobile-statement-list strong { flex:0 0 auto; color:var(--brand-dark); font-size:12px; }
      /* Local GUI trial: readable compact cards and adaptive content density. */
      /* Official-site-inspired local trial. Decorations never receive pointer input. */
      :host([data-mobile-ui="true"]) .panel {
        background-color:var(--surface-2);
        background-image:url("${horseshoeDecoration}"),url("${facetBackground}");
        background-size:360px 420px,600px 760px;
        background-position:center top,center top;
        background-repeat:repeat,repeat;
      }
      :host([data-mobile-ui="true"]) .panel-header {
        background:linear-gradient(115deg,#fff6fa,#fff 48%,#eef8ff);
        border-bottom:3px solid transparent;
        border-image:linear-gradient(90deg,#ee78b7,#af97ec,#71bcec,#8fcd8a,#f2d478) 1;
      }
      :host([data-mobile-ui="true"]) .mobile-nav {
        background:#fff;
        border-top-color:#dfe3f2;
        box-shadow:0 -4px 16px #444e8510;
      }
      :host([data-mobile-ui="true"]) .mobile-nav-button.active {
        color:#2347c4;
        background:linear-gradient(135deg,#e5ecff,#f0edff);
        box-shadow:inset 0 -3px #315cff;
      }
      :host([data-mobile-ui="true"]) .mobile-nav-button.active[data-mobile-target="factors"] { color:#ac337d; background:#fcebf6; box-shadow:inset 0 -3px #e765ac; }
      :host([data-mobile-ui="true"]) .mobile-nav-button.active[data-mobile-target="results"] { color:#327c49; background:#eaf6e6; box-shadow:inset 0 -3px #75b85a; }
      :host([data-mobile-ui="true"]) .mobile-nav-button.active[data-mobile-target="settings"] { color:#7750ad; background:#f0eafb; box-shadow:inset 0 -3px #a789d1; }
      :host([data-mobile-ui="true"]) .section-head h2 { color:var(--ink); border-left:4px solid #315cff; padding-left:9px; }
      :host([data-mobile-ui="true"]) #body > .section[data-mobile-factor-order="picker"] > .section-head h2 { border-left-color:#ef5ab5; }
      :host([data-mobile-ui="true"]) .mobile-data-statement > .section-head h2 { border-left-color:#65b947; }
      :host([data-mobile-ui="true"]) .primary { background:linear-gradient(115deg,#356aff,#3451e5); box-shadow:0 4px 10px #315cff24; }
      :host([data-mobile-ui="true"]) .primary:disabled { box-shadow:none; }
      :host([data-mobile-ui="true"]) .mobile-factor-mode,
      :host([data-mobile-ui="true"]) .mobile-tier-tabs { background:#f0f1f8; }
      :host([data-mobile-ui="true"]) .mobile-update-icon,
      :host([data-mobile-ui="true"]) [data-mobile-check-update],
      :host([data-mobile-ui="true"]) .mobile-search-head svg,
      :host([data-mobile-ui="true"]) .mobile-search-head strong { background:#edf1ff; }
      :host([data-mobile-ui="true"]) .factor-option { display:grid; grid-template-columns:minmax(0,1fr); grid-template-areas:"name" "badge" "mapping"; gap:3px; text-align:left; align-content:start; }
      :host([data-mobile-ui="true"]) .factor-option-name { grid-area:name; font-size:12px; line-height:1.45; }
      :host([data-mobile-ui="true"]) .factor-option-state { grid-area:badge; font-size:9px; font-weight:650; }
      :host([data-mobile-ui="true"]) .factor-option-mapping { font-size:10px; }
      :host([data-mobile-ui="true"][data-mobile-page="factors"]) .section,
      :host([data-mobile-ui="true"][data-mobile-page="results"]) .section { border-radius:16px; box-shadow:0 3px 12px #4b488512; }
      :host([data-mobile-ui="true"]) #body > .section[data-mobile-factor-order="picker"] > .section-head .helper { display:none; }
      :host([data-mobile-ui="true"]) #body > .section[data-mobile-factor-order="picker"] > .section-head h2 { font-size:18px; }
      :host([data-mobile-ui="true"]) .mobile-selected-heading { margin-top:20px; padding-top:12px; border-top:1px solid var(--line); }
      :host([data-mobile-ui="true"]) .mobile-selected-heading h3 { font-size:15px; }
      :host([data-mobile-ui="true"]) .mobile-tier-tabs { gap:2px; border-radius:12px; padding:3px; }
      :host([data-mobile-ui="true"]) .mobile-tier-tabs button { min-height:44px; }
      :host([data-mobile-ui="true"]) .mobile-tier-tabs button[data-mobile-tier-filter="4"] { color:#9b4a16; }
      :host([data-mobile-ui="true"]) .selected-list { gap:8px; }
      :host([data-mobile-ui="true"]) .selected-card { grid-template-columns:minmax(0,1fr); grid-template-areas:"identity" "summary"; gap:6px; min-height:60px; padding:9px; border-radius:12px; align-content:start; }
      :host([data-mobile-ui="true"]) .selected-name { font-size:12px; line-height:1.4; display:block; overflow:visible; }
      :host([data-mobile-ui="true"]) .mobile-factor-card-summary { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:4px; }
      :host([data-mobile-ui="true"]) .mobile-factor-card-summary span { font-size:10px; }
      :host([data-mobile-ui="true"]) .mobile-factor-card-summary b { font-size:9px; padding:2px 5px; }
      :host([data-mobile-ui="true"]) .required-tier .mobile-factor-card-summary b { color:#9b4a16; background:#fff0df; }
      :host([data-mobile-ui="true"][data-mobile-page="results"]) #results-section { padding:0; background:transparent; box-shadow:none; }
      :host([data-mobile-ui="true"]) .result-list { gap:14px; }
      :host([data-mobile-ui="true"]) .result-card { background:#fff; border:1px solid var(--line); box-shadow:0 3px 12px #63864e0a; }
      :host([data-mobile-ui="true"]) .result-top { padding:10px 12px 0; align-items:center; }
      :host([data-mobile-ui="true"]) .result-identity { display:grid; justify-items:start; align-content:center; gap:4px; }
      :host([data-mobile-ui="true"]) .result-name { font-size:15px; line-height:1.4; }
      :host([data-mobile-ui="true"]) .result-meta { margin-top:0; font-size:11px; line-height:1.4; }
      :host([data-mobile-ui="true"]) .result-required { display:inline-block; margin-top:0; border-radius:6px; padding:3px 6px; color:var(--brand-dark); background:#eaf7ef; font-size:11px; font-weight:750; }
      :host([data-mobile-ui="true"]) .result-card[data-required-state="unmet"] .result-required { color:#9b381e; background:#fff0e8; }
      :host([data-mobile-ui="true"]) .result-card[data-required-state="unmet"] .score-value { color:var(--muted); }
      :host([data-mobile-ui="true"]) .result-id { font-size:11px; line-height:1.4; color:var(--muted); font-variant-numeric:tabular-nums; overflow-wrap:anywhere; min-width:0; }
      :host([data-mobile-ui="true"]) .result-copy { min-height:44px; margin-top:4px; padding:0 8px; border:0; background:#edf1ff; border-radius:10px; }
      :host([data-mobile-ui="true"]) .results-rerun { min-height:44px; border-radius:10px; }
      :host([data-mobile-ui="true"]) .result-summary { font-size:10px; line-height:1.5; background:transparent; padding-inline:0; }
      :host([data-mobile-ui="true"]) .match-list { padding:8px 12px 14px; }
      :host([data-mobile-ui="true"]) .match-chip { padding:7px 8px; font-size:11px; line-height:1.45; }
      :host([data-mobile-ui="true"]) .factor-chip-stars { font-size:10px; }
      @media (min-width:600px) and (min-height:600px) {
        :host([data-mobile-ui="true"][data-mobile-page="factors"]) .panel-body,
        :host([data-mobile-ui="true"][data-mobile-page="results"]) .panel-body { padding-inline:24px; }
        :host([data-mobile-ui="true"]) #factor-catalog,
        :host([data-mobile-ui="true"][data-mobile-factor-color="white"]) #factor-catalog,
        :host([data-mobile-ui="true"]) .selected-list,
        :host([data-mobile-ui="true"]) .recognition-list,
        :host([data-mobile-ui="true"]) .factor-chip-list { grid-template-columns:repeat(3,minmax(0,1fr)); }
        :host([data-mobile-ui="true"]) .selected-name { font-size:13px; }
        :host([data-mobile-ui="true"]) .result-name { font-size:18px; }
        :host([data-mobile-ui="true"]) .result-meta { font-size:12px; }
        :host([data-mobile-ui="true"]) .score-value { font-size:28px; }
      }
      @media (min-width:1000px) and (min-height:600px) {
        :host([data-mobile-ui="true"][data-mobile-page="factors"]) .panel-body,
        :host([data-mobile-ui="true"][data-mobile-page="results"]) .panel-body { padding-inline:max(24px,calc((100% - 1120px) / 2)); }
        :host([data-mobile-ui="true"]) #factor-catalog,
        :host([data-mobile-ui="true"][data-mobile-factor-color="white"]) #factor-catalog,
        :host([data-mobile-ui="true"]) .selected-list,
        :host([data-mobile-ui="true"]) .recognition-list { grid-template-columns:repeat(4,minmax(0,1fr)); }
        :host([data-mobile-ui="true"]) .factor-chip-list { grid-template-columns:repeat(4,minmax(0,1fr)); }
      }
      @media (min-width:600px) and (min-height:600px) {
        :host([data-mobile-ui="true"]) .result-top {
          --result-main-avatar:80px;
          --result-parent-avatar:38px;
          --result-parent-gap:4px;
        }
        :host([data-mobile-ui="true"]) .hero-family .hero-image { border-radius:18px; }
        :host([data-mobile-ui="true"]) .parent-image { border-radius:10px; }
      }
      @media (min-width:840px) and (min-height:720px) {
        :host([data-mobile-ui="true"]) .result-top {
          --result-main-avatar:96px;
          --result-parent-avatar:46px;
          --result-parent-gap:4px;
        }
        :host([data-mobile-ui="true"]) .hero-family .hero-image { border-radius:21px; }
        :host([data-mobile-ui="true"]) .parent-image { border-radius:12px; }
      }
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
    style.textContent += `
      :host([data-mobile-ui="true"]) #mobile-hints-frame{display:none;position:absolute;inset:0 0 calc(var(--mobile-nav-height) + env(safe-area-inset-bottom));width:100%;height:calc(100% - var(--mobile-nav-height) - env(safe-area-inset-bottom));border:0;background:transparent}
      :host([data-mobile-page="hints"]) #mobile-hints-frame{display:block}
      :host([data-mobile-page="hints"]) .panel-header,:host([data-mobile-page="hints"]) #body{display:none!important}
      :host([data-mobile-ui="true"]) .mobile-nav-button.active[data-mobile-target="hints"]{color:#b07916;background:#fff5d9;box-shadow:inset 0 -3px #dfb947}
    `;
    ui.root.appendChild(style);
    const hintFrame = document.createElement("iframe");
    hintFrame.id = "mobile-hints-frame";
    hintFrame.title = "支援卡技能检索";
    hintFrame.setAttribute("sandbox","allow-scripts allow-same-origin");
    ui.panel.appendChild(hintFrame);
    window.addEventListener("message",event=>{
      if(event.origin!=="https://appassets.androidplatform.net" || event.source!==hintFrame.contentWindow)return;
      if(event.data?.type==="uma-hints-overlay") hintOverlayOpen=Boolean(event.data.open);
    });

    const nav = document.createElement("nav");
    nav.className = "mobile-nav";
    nav.setAttribute("role", "tablist");
    nav.setAttribute("aria-label", "主要页面");
    nav.innerHTML = ["roles", "factors", "results", "hints", "settings"].map((page) => `
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
      if (event.target.closest("[data-mobile-install-update]")) {
        if (globalThis.UmaSeedApp?.installUpdate) globalThis.UmaSeedApp.installUpdate(updateCheck.latest);
        else if (updateCheck.url) location.href = updateCheck.url;
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
    globalThis.UmaSeedApp?.restoreDownloadedUpdate?.();
  }

  install();
})();
