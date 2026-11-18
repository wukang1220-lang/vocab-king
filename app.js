"use strict";

const lexicon = window.LEXICON;
const lessons = window.LESSONS;
const tiers = ["國中核心", "課綱常用", "高中銜接"];
const tierColors = ["purp", "mint", "orange"];
const familyColors = { 字首: "purp", 字根: "mint", 字尾: "orange", 合成字: "pink" };
const familyScopes = {
  all: "所有分級", cap: "會考課綱（核心與常用）", bridge: "高中銜接優先（課綱外第 1–2 級）",
  extension: "所有高中銜接",
};
const names = {
  home: "我是單字王", families: "字首、字根、字尾", lesson: "字首、字根、字尾", bank: "單字庫",
  review: "複習清單", rewards: "成就與獎勵", sources: "字庫來源與使用說明", practice: "練習",
};
const main = document.querySelector("#main");
const dialog = document.querySelector("#word-dialog");
const settings = document.querySelector("#settings");
const toast = document.querySelector("#toast");
const storageKey = "word-king-progress-v1";
const preferenceKey = "word-king-preferences-v1";
const preferenceFields = [...settings.querySelectorAll('input[type="radio"]')];
const preferences = loadPreferences();
const dailyGoal = 10;
const taipeiDate = new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Taipei",
});
const taipeiLabel = new Intl.DateTimeFormat("zh-TW", {
  month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Taipei",
});
const number = new Intl.NumberFormat("zh-TW");
const keyOf = (word) => word.toLowerCase();
const words = new Map(lexicon.map((word) => [keyOf(word.w), word]));
const familyById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
const byPriority = [...lexicon].sort((a, b) => a.t - b.t || a.r - b.r);
const stats = loadProgress();
const bankFilter = { query: "", tier: "all", family: "all", personal: "all", page: 1 };
let familyFilter = "全部";
let familyScope = "all";
let familyQuery = "";
let lessonPage = 1;
let reviewFilter = "全部";
let practice = null;
let toastTimer;
let dialogWord = null;
let dialogTrigger = null;

function loadPreferences() {
  const selected = { "text-size": "large", "speech-rate": "0.9" };
  try {
    const saved = JSON.parse(localStorage.getItem(preferenceKey));
    for (const input of preferenceFields) {
      if (saved?.[input.name] === input.value) selected[input.name] = input.value;
    }
  } catch {
    // Preferences still work for the current page if storage is unavailable.
  }
  return selected;
}

function applyPreferences() {
  document.documentElement.dataset.textSize = preferences["text-size"];
  for (const input of preferenceFields) input.checked = preferences[input.name] === input.value;
}

function loadProgress() {
  const empty = { xp: 0, days: {}, progress: {}, stars: {}, completed: {}, bestStreak: 0 };
  try {
    const previous = JSON.parse(localStorage.getItem(storageKey));
    return { ...empty, ...previous };
  } catch {
    return empty;
  }
}

function saveProgress() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(stats));
  } catch {
    showToast("無法在此瀏覽器儲存進度，本次開啟期間仍可繼續練習。");
  }
}

function today() {
  const parts = Object.fromEntries(taipeiDate.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDate(date, days) {
  const shifted = new Date(date + "T12:00:00Z");
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function streak() {
  const date = today();
  let cursor = stats.days[date]?.seen.length ? date : shiftDate(date, -1);
  let total = 0;
  while (stats.days[cursor]?.seen.length) {
    total += 1;
    cursor = shiftDate(cursor, -1);
  }
  return total;
}

function level() {
  const n = Math.floor(stats.xp / 100) + 1;
  const labels = ["單字新手", "字彙冒險家", "字族探索者", "字根達人", "單字王"];
  return { n, label: labels[Math.min(n - 1, labels.length - 1)], progress: stats.xp % 100 };
}

function masteredCount() {
  return Object.values(stats.progress).filter((item) => item.step >= 2).length;
}

function reviewWords(filter = "全部") {
  const date = today();
  return lexicon.filter((word) => {
    const key = keyOf(word.w);
    const item = stats.progress[key];
    const due = item?.due <= date;
    if (filter === "收藏") return stats.stars[key];
    if (filter === "答錯") return item?.wrong;
    return due || stats.stars[key];
  }).sort((a, b) => {
    const left = stats.progress[keyOf(a.w)];
    const right = stats.progress[keyOf(b.w)];
    return Number(Boolean(right?.wrong)) - Number(Boolean(left?.wrong))
      || (left?.due || "9999").localeCompare(right?.due || "9999");
  });
}

function badges() {
  return [
    ["zap", "初次闖關", "累積 10 XP", stats.xp >= 10, "purp"],
    ["target", "每日達標", "一天作答 10 個不同單字", Object.values(stats.days).some((day) => day.seen.length >= dailyGoal), "mint"],
    ["flame", "三日不間斷", "連續 3 天完成至少一題", stats.bestStreak >= 3, "orange"],
    ["blocks", "拆字新手", "通過 1 個字族測驗", Object.keys(stats.completed).length >= 1, "purp"],
    ["book", "字彙好手", "精熟 20 個單字", masteredCount() >= 20, "mint"],
    ["trophy", "單字王", "累積 500 XP", stats.xp >= 500, "orange"],
  ];
}

function esc(text = "") {
  const symbols = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(text).replace(/[&<>"']/g, (char) => symbols[char]);
}

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function iconBox(name, color) {
  return `<span class="icon-box ${color}">${icon(name)}</span>`;
}

function tag(text, color) {
  return `<span class="tag ${color}">${esc(text)}</span>`;
}

function showToast(message) {
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.textContent = ""; }, 3200);
}

function progressBar(value, max, label) {
  return `<div class="track" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0"
    aria-valuemax="${max}" aria-valuenow="${Math.min(value, max)}"><span style="width:${Math.min(value / max, 1) * 100}%"></span></div>`;
}

function audioButton(word) {
  return `<button class="icon-button" data-say="${esc(word)}" aria-label="播放 ${esc(word)} 的發音">${icon("volume")}</button>`;
}

function starButton(word) {
  const saved = Boolean(stats.stars[keyOf(word)]);
  return `<button class="icon-button" data-star="${esc(word)}" aria-pressed="${saved}"
    aria-label="收藏 ${esc(word)}">${icon("star")}</button>`;
}

function shell(page) {
  document.querySelector("#page-name").textContent = names[page];
  for (const link of document.querySelectorAll("[data-nav]")) {
    const current = page === "lesson" ? "families" : page;
    if (link.dataset.nav === current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  const count = reviewWords("答錯").length;
  document.querySelector("#nav-review").textContent = count || "";
  document.querySelector("#top-streak").innerHTML = `${icon("flame")} ${streak()} 天連續`;
  document.querySelector("#top-level").innerHTML = `${icon("zap")} Lv. ${level().n}`;
  const answered = stats.days[today()]?.seen.length || 0;
  document.querySelector("#side-goal").innerHTML =
    `<span class="goal-label">${icon("target")} 每日目標 <small>${Math.min(answered, dailyGoal)}/${dailyGoal}</small></span>` +
    progressBar(answered, dailyGoal, "每日作答單字");
}

function pageTitle(title, subtitle) {
  return `<div class="page-heading"><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>`;
}

function statCard(name, value, unit, image, color) {
  return `<div class="stat-card">${iconBox(image, color)}
    <div><span class="stat-label">${name}</span><span class="stat-value">${number.format(value)} <small>${unit}</small></span></div></div>`;
}

function actionCard(title, detail, image, color, link) {
  return `<a class="action-card" href="${link}">${iconBox(image, color)}
    <span><strong>${title}</strong><span class="action-detail">${detail}</span></span>${icon("right")}</a>`;
}

function renderHome() {
  const featured = lessons.find((lesson) => !stats.completed[lesson.id]) || lessons[0];
  const count = reviewWords().length;
  const done = stats.days[today()]?.seen.length >= dailyGoal;
  main.innerHTML = `
    <div class="page-heading home-heading">
      <div><h1>我是單字王</h1><p>每天記一點，讓英文單字越來越熟悉。</p></div>
      <span class="date">${icon("cal")} ${taipeiLabel.format(new Date())}</span>
    </div>
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <span class="hero-label">${icon("zap")} 每日挑戰</span>
        <h2 id="hero-title">解鎖你的單字力！</h2>
        <p>從字首、字根看懂單字，完成 10 題累積 XP。</p>
        <a class="btn white" href="#practice/daily">${done ? "再練一次" : "開始今日挑戰"} ${icon("arrow")}</a>
      </div>
      <div class="hero-art" aria-hidden="true">
        <i class="hero-grid"></i><i class="orbit"></i><i class="orbit b"></i>
        <span class="letter-card re">re-<small>再一次</small></span>
        <span class="letter-card port">port<small>運送</small></span>
        <span class="letter-card ful">-ful<small>充滿</small></span>
        <span class="hero-plus">+</span><span class="art-spark s1">✦</span><span class="art-spark s2">✧</span><span class="art-spark s3">✦</span>
      </div>
    </section>
    <div class="stat-grid" aria-label="學習統計">
      ${statCard("累積經驗", stats.xp, "XP", "zap", "purp")}
      ${statCard("連續學習", streak(), "天", "flame", "orange")}
      ${statCard("精熟單字", masteredCount(), "個", "target", "mint")}
    </div>
    <div class="home-columns">
      <section>
        <div class="section-head"><h2>開始學習</h2></div>
        <div class="action-stack">
          ${actionCard("字首、字根、字尾", `探索 ${lessons.length} 組構詞，把會考與銜接單字串起來`, "blocks", "purp", "#families")}
          ${actionCard("英文單字卡", "先想意思，再翻卡看答案", "cards", "mint", "#practice/flash")}
          ${actionCard("複習清單", count ? `${count} 個單字可複習` : "答錯或收藏的單字會出現在這裡", "repeat", "pink", "#review")}
        </div>
      </section>
      <section>
        <div class="section-head"><h2>推薦字族</h2><a href="#families">所有字族 ${icon("right")}</a></div>
        <div class="featured">
          <div class="featured-top">${iconBox("spark", "orange")}<div><b>${esc(featured.form)}</b><p>${featured.kind} · ${esc(featured.meaning)}</p></div></div>
          <div class="tiles">${featured.words.slice(0, 3).map(([word]) => `<span>${esc(word)}</span>`).join("")}</div>
          <a class="btn line" href="#lesson/${featured.id}">學這組字族 ${icon("arrow")}</a>
        </div>
      </section>
    </div>`;
}

function filterChips(options, active, category) {
  return options.map((value) =>
    `<button class="chip" data-${category}="${esc(value)}" aria-pressed="${value === active}">${esc(value)}</button>`
  ).join("");
}

function familyEntries(lesson) {
  return lesson.words.filter(([form]) => {
    const word = words.get(keyOf(form));
    if (familyScope === "cap") return word.t < 2;
    if (familyScope === "bridge") return word.b;
    if (familyScope === "extension") return word.t === 2;
    return true;
  });
}

function familyScopeSelect() {
  return `<select id="family-scope" class="family-scope" aria-label="構詞練習範圍">
    ${Object.entries(familyScopes).map(([id, label]) =>
      `<option value="${id}" ${familyScope === id ? "selected" : ""}>${label}</option>`).join("")}
  </select>`;
}

function renderFamilies() {
  const capWords = lexicon.filter((word) => word.t < 2).length;
  const capAnnotated = lexicon.filter((word) => word.t < 2 && word.f.length).length;
  const bridgeAnnotated = lexicon.filter((word) => word.b && word.f.length).length;
  main.innerHTML = pageTitle("字首、字根、字尾", `${lessons.length} 組構詞練習，連結 ${number.format(capAnnotated)} 個會考課綱詞及 ${number.format(bridgeAnnotated)} 個優先銜接詞。`) + `
    <div class="family-filter-area">
      <div class="filter-row" aria-label="構詞類型">${filterChips(["全部", ...Object.keys(familyColors)], familyFilter, "family-filter")}</div>
      <div class="search-controls">
        <label class="search">${icon("search")}<input id="family-query" aria-label="搜尋字族或成員單字" placeholder="搜尋字族或單字，例如 -tion、teacher" value="${esc(familyQuery)}"></label>
        ${familyScopeSelect()}
        <a class="btn line" href="#bank" data-course-bank>查看完整會考課綱 ${number.format(capWords)} 詞</a>
      </div>
    </div>
    <div id="family-results"></div>`;
  renderFamilyResults();
}

function renderFamilyResults() {
  const query = familyQuery.trim().toLowerCase();
  const selected = lessons
    .filter((lesson) => familyFilter === "全部" || lesson.kind === familyFilter)
    .map((lesson) => ({ lesson, entries: familyEntries(lesson) }))
    .filter(({ lesson, entries }) => entries.length && (!query ||
      [lesson.form, lesson.meaning, ...entries.map(([word]) => word)].some((value) => value.toLowerCase().includes(query))));
  document.querySelector("#family-results").innerHTML = selected.length
    ? `<div class="family-grid">
      ${selected.map(({ lesson, entries }) => `<article class="panel family-card">
        <div class="family-card-top">${tag(lesson.kind, familyColors[lesson.kind])}
          <small class="muted">${entries.length} 詞</small></div>
        <h2>${esc(lesson.form)}</h2>
        <p>${esc(lesson.meaning)}</p>
        <div class="tiles">${entries.slice(0, 3).map(([word]) => `<span>${esc(word)}</span>`).join("")}</div>
        <a class="quiet" href="#lesson/${lesson.id}" aria-label="學習 ${esc(lesson.form)} 字族">學習這組 ${icon("right")}</a>
      </article>`).join("")}
    </div>` : emptyPanel("找不到符合的字族", "可換個關鍵字，或調整構詞類型及練習範圍。");
}

function exampleCredit(id, author) {
  return `<a href="https://tatoeba.org/en/sentences/show/${id}" target="_blank" rel="noopener">${esc(author || "Tatoeba")}</a>`;
}

function exampleLine(english, chinese, englishId, englishAuthor, chineseId, chineseAuthor) {
  return `<div class="example">
    <div><span lang="en">${esc(english)}</span>
      ${chinese ? `<small>${esc(chinese)}</small>` : ""}
      ${englishId ? `<small class="example-credit">Tatoeba · ${exampleCredit(englishId, englishAuthor)}
        ${chineseId ? ` / ${exampleCredit(chineseId, chineseAuthor)}` : ""}</small>` : ""}
    </div>
    <button class="icon-button sentence-audio" data-say="${esc(english)}" aria-label="朗讀例句：${esc(english)}" title="朗讀例句">
      ${icon("volume")}
    </button>
  </div>`;
}

function lessonEntry(word, lesson = familyById.get(word.f[0])) {
  return lesson?.words.find(([form]) => keyOf(form) === keyOf(word.w));
}

function wordExample(word, entry = lessonEntry(word)) {
  const example = entry?.[5] ? entry.slice(5, 7) : window.EXAMPLES?.[keyOf(word.w)];
  return example ? exampleLine(...example) : '<p class="example muted">例句暫時無法載入，請重新整理。</p>';
}

function partsLine(entry) {
  return `<div class="hint parts-line"><span lang="en">${esc(entry[1])}</span>
    ${entry[7] ? `<span class="dialog-actions">${entry[7].map(audioButton).join("")}</span>` : ""}</div>`;
}

function renderLesson(id) {
  const lesson = familyById.get(id);
  if (!lesson) return renderFamilies();
  const entries = familyEntries(lesson);
  const items = entries.map(([form]) => words.get(keyOf(form)));
  const sampleCount = Math.min(4, items.length);
  const rest = items.slice(sampleCount);
  const perPage = 20;
  const numPages = Math.max(Math.ceil(rest.length / perPage), 1);
  lessonPage = Math.min(lessonPage, numPages);
  const first = (lessonPage - 1) * perPage;
  main.innerHTML = `<a class="quiet" href="#families">${icon("left")} 回所有字族</a>
    <section class="panel family-banner">
      ${tag(lesson.kind, familyColors[lesson.kind])}
      <h1>${esc(lesson.form)}</h1>
      <h2>${esc(lesson.meaning)}</h2>
      <p>${esc(lesson.intro)}</p>
    </section>
    <div class="search-controls">${familyScopeSelect()} <small class="muted">${entries.length} 個符合的詞</small></div>
    <div class="family-example-grid">
      ${entries.slice(0, sampleCount).map((entry) => {
        const [word, , hint, gloss, pos] = entry;
        return `
        <article class="panel family-example">
          <header><h2>${esc(word)}</h2><div class="dialog-actions">${audioButton(word)}${starButton(word)}</div></header>
          ${partsLine(entry)}${hint && !lesson.inflection ? `<p class="muted">${esc(hint)}</p>` : ""}
          <p><small class="muted">${esc(pos)}</small> <strong>${esc(gloss)}</strong></p>
          ${wordExample(words.get(keyOf(word)), entry)}
        </article>`;
      }).join("")}
    </div>
    ${items.length > sampleCount ? `<section class="lesson-word-list">
      <div class="section-head"><h2>更多字族成員</h2></div>
      ${wordList(rest.slice(first, first + perPage), false, lesson)}
      ${numPages > 1 ? `<div class="pagination">
        <button class="btn line" data-lesson-page="-1" ${lessonPage === 1 ? "disabled" : ""}>上一頁</button>
        <span aria-live="polite">第 ${lessonPage} / ${numPages} 頁</span>
        <button class="btn line" data-lesson-page="1" ${lessonPage === numPages ? "disabled" : ""}>下一頁</button>
      </div>` : ""}
    </section>` : ""}
    ${items.length ? `<a class="btn primary family-foot" href="#practice/family/${lesson.id}">${icon("zap")}
      ${stats.completed[id] ? "再做字族測驗" : "開始字族測驗"} · ${Math.min(10, items.length)} 題 ${icon("arrow")}</a>`
      : emptyPanel("此分級沒有對應的詞", "可在上方切換練習範圍。")}`;
}

function wordList(items, withReviewStatus = false, lesson) {
  return `<div class="panel table-panel"><ul class="word-list">
    ${items.map((word) => {
      const item = stats.progress[keyOf(word.w)];
      const status = item?.wrong ? tag("答錯", "pink") : item?.due <= today() ? tag("待複習", "orange") : tag("已收藏", "purp");
      const entry = lesson ? lessonEntry(word, lesson) : null;
      return `<li class="word-row">
        <div><button class="word-link" data-word="${esc(word.w)}">${esc(word.w)}</button>
          ${entry ? `<small class="word-parts" lang="en">${esc(entry[1])}</small>` : ""}</div>
        <span class="word-gloss"><small>${esc(word.p)}</small>${esc(word.d)}</span>
        ${withReviewStatus ? status : tag(tiers[word.t], tierColors[word.t])}
        <div class="row-actions">${audioButton(word.w)}${entry?.[7]?.slice(0, 1).map(audioButton).join("") || ""}${starButton(word.w)}</div>
        ${withReviewStatus ? wordExample(word) : ""}
      </li>`;
    }).join("")}
  </ul></div>`;
}

function renderBank() {
  main.innerHTML = pageTitle("單字庫", `搜尋 ${number.format(lexicon.length)} 個字詞，查中文、聽發音或加入收藏。`) + `
    <div class="search-controls">
      <label class="search">${icon("search")}<input id="query" aria-label="搜尋英文或中文" placeholder="搜尋英文或中文，例如 transport" value="${esc(bankFilter.query)}"></label>
      <select id="tier" aria-label="字彙分級">
        <option value="all">所有分級</option><option value="cap">完整會考課綱</option><option value="bridge">高中銜接優先</option>${tiers.map((tier, index) => `<option value="${index}">${tier}</option>`).join("")}
      </select>
      <select id="family" aria-label="字族">
        <option value="all">所有字族</option>${lessons.map((lesson) => `<option value="${lesson.id}">${esc(lesson.form)} · ${lesson.kind}</option>`).join("")}
      </select>
      <select id="personal" aria-label="學習狀態">
        <option value="all">全部單字</option><option value="stars">已收藏</option><option value="mastered">已精熟</option>
      </select>
      <a class="btn line" href="vocab.csv" download="單字王-國中英文單字庫.csv">${icon("download")} 下載 CSV</a>
    </div>
    <div id="bank-results"></div>`;
  for (const id of ["tier", "family", "personal"]) document.getElementById(id).value = bankFilter[id];
  renderBankResults();
}

function matchingWords() {
  const { query, tier, family, personal } = bankFilter;
  const term = query.toLocaleLowerCase().trim();
  const results = lexicon.filter((word) => {
    const key = keyOf(word.w);
    return (tier === "all" || (tier === "cap" && word.t < 2) || (tier === "bridge" && word.b) || Number(tier) === word.t)
      && (family === "all" || word.f.includes(family))
      && (personal !== "stars" || stats.stars[key])
      && (personal !== "mastered" || stats.progress[key]?.step >= 2)
      && (!term || [word.w, word.d, ...word.a].some((field) => field.toLocaleLowerCase().includes(term)));
  });
  if (term) {
    const rank = (word) => keyOf(word.w) === term ? 0 : keyOf(word.w).startsWith(term) ? 1 : 2;
    results.sort((a, b) => rank(a) - rank(b));
  }
  return results;
}

function renderBankResults() {
  const matches = matchingWords();
  const perPage = 18;
  const maxPage = Math.max(Math.ceil(matches.length / perPage), 1);
  bankFilter.page = Math.min(bankFilter.page, maxPage);
  const start = (bankFilter.page - 1) * perPage;
  document.querySelector("#bank-results").innerHTML = `
    <div class="section-head"><small class="muted" aria-live="polite">${number.format(matches.length)} 個字詞</small>
      <a class="quiet" href="#practice/bank" ${matches.length ? "" : 'hidden style="display:none"'}>練習這些字 ${icon("right")}</a></div>
    ${matches.length ? wordList(matches.slice(start, start + perPage)) : emptyPanel("找不到符合的單字", "試試其他關鍵字或篩選條件。")}
    ${maxPage > 1 ? `<div class="pagination">
      <button class="btn line" data-bank-page="-1" ${bankFilter.page === 1 ? "disabled" : ""}>上一頁</button>
      <span aria-live="polite">第 ${bankFilter.page} / ${maxPage} 頁</span>
      <button class="btn line" data-bank-page="1" ${bankFilter.page === maxPage ? "disabled" : ""}>下一頁</button>
    </div>` : ""}`;
}

function emptyPanel(title, text, link = "", label = "") {
  return `<div class="panel empty"><h2>${title}</h2><p>${text}</p>
    ${link ? `<a class="btn soft" href="${link}">${label} ${icon("arrow")}</a>` : ""}</div>`;
}

function renderReview() {
  const items = reviewWords(reviewFilter);
  main.innerHTML = pageTitle("複習清單", "優先練習錯題和到期單字，也可以重溫自己收藏的字。") + `
    <div class="filter-row">
      ${filterChips(["全部", "答錯", "收藏"], reviewFilter, "review-filter")}
      ${items.length ? `<a class="btn primary" href="#practice/review">${icon("repeat")} 開始複習</a>` : ""}
    </div>
    ${items.length ? wordList(items, true) : emptyPanel("這裡目前沒有要複習的單字", "作答後，答錯的單字會自動加入複習清單。", "#practice/daily", "開始挑戰")}`;
}

function renderRewards() {
  const current = level();
  const awards = badges();
  const date = today();
  const answered = stats.days[date]?.seen.length || 0;
  main.innerHTML = pageTitle("成就與獎勵", "每答對一個單字，就朝下一個等級邁進。") + `
    <div class="flow">
      <section class="panel reward-hero">
        ${tag("Lv. " + current.n, "purp")}
        <h2>${current.label}</h2>
        <p>累積 <strong>${number.format(stats.xp)} XP</strong> · 距離下一級還要 ${100 - current.progress} XP</p>
        ${progressBar(current.progress, 100, "升級經驗")}
        <p class="muted">每天每個單字首次答對得 10 XP。首次通過一組字族測驗另得 20 XP。</p>
      </section>
      <section class="panel flow">
        <div class="section-head"><h2>七日學習紀錄</h2><span class="muted">連續 ${streak()} 天</span></div>
        <div class="day-list">
          ${Array.from({ length: 7 }, (_, index) => {
            const day = shiftDate(date, index - 6);
            const count = stats.days[day]?.seen.length || 0;
            return `<div class="day ${count ? "mark" : ""}"><span>${day.slice(5).replace("-", "/")}</span><span>${count} 題</span></div>`;
          }).join("")}
        </div>
        <p class="muted">今日進度 ${Math.min(answered, dailyGoal)} / ${dailyGoal} 個單字</p>
      </section>
      <section>
        <div class="section-head"><h2>成就徽章</h2><span class="muted">${awards.filter((badge) => badge[3]).length} / ${awards.length} 已解鎖</span></div>
        <div class="badge-grid">${awards.map(([image, title, requirement, earned, color]) => `
          <article class="panel badge ${earned ? "" : "locked"}">${iconBox(image, color)}
            <h3>${title}</h3><p>${requirement}</p>${tag(earned ? "已解鎖" : "未解鎖", earned ? "mint" : "purp")}
          </article>`).join("")}</div>
      </section>
    </div>`;
}

function renderSources() {
  const counts = tiers.map((_, index) => lexicon.filter((word) => word.t === index).length);
  const bridgeCount = lexicon.filter((word) => word.b).length;
  main.innerHTML = pageTitle("字庫來源與使用說明", `收錄 ${number.format(lexicon.length)} 個不同的英文詞條，含單字及常用片語。`) + `
    <div class="flow">
      <section class="panel">
        <h2>字彙分級</h2>
        <ul class="sources-list">
          <li>國中核心 ${number.format(counts[0])} 詞條、課綱常用 ${number.format(counts[1])} 詞條。依教育部英語文課綱附錄五的兩份字表，以主詞條計數，同列變體可搜尋。<a href="https://www.naer.edu.tw/PageSyllabus?fid=29" target="_blank" rel="noopener">國教院課綱公告</a></li>
          <li>高中銜接 ${number.format(counts[2])} 詞條，其中 ${number.format(bridgeCount)} 詞是大考中心第 1–2 級且在國中課綱以外的優先詞。另收第 3–4 級及構詞單元的實用延伸詞。<a href="https://www.ceec.edu.tw/xmdoc?xsmsid=0K213553204833715309" target="_blank" rel="noopener">大考中心參考詞彙表</a></li>
          <li>部分釋義由 <a href="https://github.com/skywind3000/ECDICT" target="_blank" rel="noopener">ECDICT</a> 摘整並轉換為繁體中文。<a href="dictionary-license.txt">MIT 授權聲明</a></li>
          <li>部分例句及翻譯選自 <a href="https://tatoeba.org/" target="_blank" rel="noopener">Tatoeba</a>，使用 <a href="https://creativecommons.org/licenses/by/2.0/fr/" target="_blank" rel="noopener">CC BY 2.0 FR</a> 授權。作者及原句連結在例句下方，中文翻譯轉為繁體。</li>
        </ul>
        <div class="quiz-foot"><a class="btn line" href="vocab.csv" download="單字王-國中英文單字庫.csv">${icon("download")} 下載完整字庫</a></div>
      </section>
      <section class="panel">
        <h2>練習與複習</h2>
        <ul class="sources-list">
          <li>同個單字在兩個不同日期首次答對後，達到精熟。答錯會加入複習清單，答對後會依熟練程度延後複習。</li>
          <li>進度、收藏、XP 和徽章儲存在目前的瀏覽器。連續學習天數以台灣日期計算。</li>
          <li>發音使用瀏覽器的英文語音。可用右上角的顯示與朗讀設定調整全站字體和語速。</li>
          <li>字族單元用字首、字根、字尾、合成字及詞形變化提供記憶線索。拆字拼法可能因歷史或拼寫規則改變，實際詞義宜搭配例句理解。</li>
        </ul>
      </section>
    </div>`;
}

function randomFor(seed) {
  let value = 2166136261;
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [result[index], result[selected]] = [result[selected], result[index]];
  }
  return result;
}

const practiceModes = {
  daily: { title: "每日挑戰", back: "#home" },
  flash: { title: "英文單字卡", back: "#home" },
  family: { title: "字族測驗", back: "#families" },
  bank: { title: "單字庫練習", back: "#bank" },
  review: { title: "複習練習", back: "#review" },
};

function startPractice(mode, id) {
  const config = Object.hasOwn(practiceModes, mode) ? practiceModes[mode] : null;
  const lesson = familyById.get(id);
  if (!config || (mode === "family" && !lesson)) return null;
  const random = mode === "daily" ? randomFor(today()) : Math.random;
  let items;
  if (mode === "family") {
    const candidates = shuffle(familyEntries(lesson).map(([word]) => words.get(keyOf(word))), random);
    items = candidates.sort((a, b) => Number(stats.progress[keyOf(a.w)]?.step || 0) -
      Number(stats.progress[keyOf(b.w)]?.step || 0)).slice(0, 10);
  } else if (mode === "bank") {
    items = shuffle(matchingWords()).slice(0, 10);
  } else if (mode === "review") {
    items = reviewWords(reviewFilter).slice(0, 10);
  } else if (mode === "flash") {
    const seen = stats.progress;
    const newWords = byPriority.filter((word) => !seen[keyOf(word.w)]);
    items = shuffle((newWords.length ? newWords : byPriority).slice(0, 180)).slice(0, 10);
  } else {
    const learningDays = Object.keys(stats.days).filter((day) => day < today()).length;
    const core = byPriority.filter((word) => word.t === 0);
    const extras = byPriority.filter((word) => word.t === 1);
    const familyWords = byPriority.filter((word) => word.f.length && word.t < 2);
    const offset = (learningDays * 13) % (core.length - 110);
    items = shuffle(familyWords, random).slice(0, 2);
    items.push(...shuffle(core.slice(offset, offset + 110), random).filter((word) => !items.includes(word)).slice(0, 6));
    items.push(...shuffle(extras.slice(0, 200), random).filter((word) => !items.includes(word)).slice(0, 2));
    items = shuffle(items, random);
  }
  return {
    mode, lesson, items, random, index: 0, answers: [], xp: 0, choice: null, options: null,
    flipped: false, done: false, title: lesson ? `字族測驗 · ${lesson.form}` : config.title,
    back: lesson ? `#lesson/${id}` : config.back,
  };
}

function glossParts(text) {
  return text.split("；").map((part) => part.replace(/[（(].*?[）)]/g, "").trim());
}

function optionsFor(word) {
  const current = practice;
  if (current.lesson?.inflection) {
    const expected = lessonEntry(word, current.lesson)[7][0];
    const alternatives = new Set([word.w]);
    for (const id of word.f) {
      const group = familyById.get(id);
      if (group.inflection) {
        for (const form of lessonEntry(word, group)[7]) alternatives.add(form);
      }
    }
    alternatives.delete(expected);
    const choices = [...alternatives, ...current.items.filter((item) => item !== word).map((item) => item.w)];
    return shuffle([expected, ...new Set(choices)].slice(0, 4), current.random)
      .map((text) => ({ text, correct: text === expected }));
  }
  const preferEnglish = current.mode === "family" && current.index % 2 === 1;
  const meaning = glossParts(word.d);
  const distractors = current.lesson
    ? current.items.filter((item) => item !== word)
    : lexicon.filter((item) => item !== word && item.t === word.t && item.r < 15000);
  const chosen = [{ word, correct: true }];
  for (const distractor of [...shuffle(distractors, current.random), ...shuffle(lexicon.slice(0, 150), current.random)]) {
    const next = glossParts(distractor.d);
    if (chosen.some((option) => option.word === distractor) || next.some((part) => meaning.includes(part))) continue;
    if (chosen.some((option) => glossParts(option.word.d)[0] === next[0])) continue;
    chosen.push({ word: distractor, correct: false });
    if (chosen.length === 4) break;
  }
  return shuffle(chosen, current.random).map((choice) => ({
    ...choice,
    text: preferEnglish ? choice.word.w : choice.word.d,
  }));
}

function recordAnswer(word, correct) {
  const key = keyOf(word.w);
  const date = today();
  const day = stats.days[date] ||= { seen: [], right: [] };
  const progress = stats.progress[key] ||= { step: 0, due: date, lastRight: "", wrong: false };
  let xp = 0;
  if (!day.seen.includes(key)) day.seen.push(key);
  if (correct) {
    if (!day.right.includes(key)) {
      day.right.push(key);
      xp = 10;
    }
    if (progress.lastRight !== date) {
      progress.step = Math.min(progress.step + 1, 5);
      progress.lastRight = date;
    }
    progress.due = shiftDate(date, [1, 1, 3, 7, 15, 30][progress.step]);
  } else {
    progress.step = Math.min(progress.step, 1);
    progress.due = date;
  }
  progress.wrong = !correct;
  stats.bestStreak = Math.max(stats.bestStreak, streak());
  stats.xp += xp;
  saveProgress();
  return xp;
}

function finishPractice() {
  const current = practice;
  current.done = true;
  if (current.lesson && !stats.completed[current.lesson.id] &&
      current.answers.filter((answer) => answer.correct).length / current.items.length >= 0.8) {
    stats.completed[current.lesson.id] = today();
    stats.xp += 20;
    current.xp += 20;
    current.bonus = true;
    saveProgress();
  }
}

function advance() {
  const current = practice;
  if (current.index + 1 >= current.items.length) {
    finishPractice();
  } else {
    current.index += 1;
    current.flipped = false;
    current.choice = null;
    current.options = null;
  }
  renderPractice();
  document.querySelector(".quiz-panel h1")?.focus();
}

function renderPracticeResult() {
  const current = practice;
  const wrong = current.answers.filter((answer) => !answer.correct).map(({ word }) => word);
  const correct = current.answers.length - wrong.length;
  const flash = current.mode === "flash";
  const passed = current.lesson && correct / current.items.length >= 0.8;
  return `
    <div class="panel quiz-panel">
      <div class="quiz-question">
        ${iconBox("trophy", "orange")}
        <h1 tabindex="-1">${flash ? "完成單字卡" : passed ? "字族測驗通過！" : "練習完成！"}</h1>
        <p>${flash ? `已查看 ${current.items.length} 個字詞` : `答對 ${correct} / ${current.items.length} 題 · 本輪 +${current.xp} XP`}</p>
        ${current.bonus ? "<p>首次通過獎勵 20 XP 已加入本輪經驗。</p>" : ""}
        ${current.lesson && !passed ? "<p>答對至少 80% 即可通過這組字族。</p>" : ""}
        ${wrong.length ? `<p class="muted">複習清單已收錄 ${wrong.length} 個答錯的單字。</p>` : ""}
      </div>
      <div class="quiz-foot">
        ${wrong.length ? `<a class="btn soft" href="#review">${icon("repeat")} 查看複習清單</a>` : ""}
        <button class="btn line" data-restart>再練一次</button>
        <a class="btn primary" href="#rewards">查看獎勵 ${icon("arrow")}</a>
      </div>
    </div>
    ${wrong.length ? `<div class="quiz-panel">${wordList(wrong, true)}</div>` : ""}`;
}

function renderFlash(word) {
  const current = practice;
  const entry = lessonEntry(word);
  return `
    <section class="panel quiz-panel">
      <div class="quiz-question">
        ${tag(tiers[word.t], tierColors[word.t])}
        <h1 tabindex="-1">${esc(word.w)}</h1>
        ${audioButton(word.w)}
      </div>
      ${current.flipped ? `<div class="flash-answer">
        <p><small class="muted">${esc(word.p)}</small> <strong>${esc(word.d)}</strong></p>
        ${entry ? `<p class="hint">${esc(entry[1])}${entry[2] ? ` · ${esc(entry[2])}` : ""}</p>` : ""}
        ${wordExample(word, entry)}
      </div>` : '<p class="flash-answer muted">先想想這個單字的意思。</p>'}
      <div class="quiz-foot">${starButton(word.w)}
        ${current.flipped
          ? `<button class="btn primary" data-next>${current.index + 1 === current.items.length ? "完成" : "下一個單字"} ${icon("arrow")}</button>`
          : "<button class='btn primary' data-flip>翻卡看答案</button>"}
      </div>
    </section>`;
}

function renderQuestion(word) {
  const current = practice;
  const inflection = current.lesson?.inflection;
  const reverse = current.mode === "family" && !inflection && current.index % 2 === 1;
  current.options ||= optionsFor(word);
  const answered = current.choice !== null;
  const answer = current.answers.at(-1);
  const entry = lessonEntry(word, current.lesson || undefined);
  return `
    <section class="panel quiz-panel">
      <div class="quiz-question">
        <p class="muted">${inflection ? `選出${current.lesson.id === "adjective-degree" ? "形容詞的比較級" : current.lesson.meaning}` : reverse ? "選出正確的英文單字" : "選出最符合的中文意思"}</p>
        <h1 tabindex="-1">${esc(reverse ? word.d : word.w)}</h1>
        ${!reverse || answered ? audioButton(word.w) : ""}
      </div>
      <div class="quiz-options" aria-label="作答選項">
        ${current.options.map((option, index) => {
          const status = !answered ? "" : option.correct ? "correct" : index === current.choice ? "wrong" : "";
          return `<button class="option ${status}" data-answer="${index}" ${answered ? "disabled" : ""}>
            <b>${"ABCD"[index]}</b><span>${esc(option.text)}</span>
            ${status ? icon(status === "correct" ? "check" : "close") : ""}
          </button>`;
        }).join("")}
      </div>
      ${answered ? `<div class="quiz-feed ${answer.correct ? "mint" : "pink"}" role="status">
        <p>${answer.correct ? (answer.xp ? "答對了！+10 XP" : "答對了！") : "這題已加入複習清單。"}</p>
        <p><strong>${esc(word.w)}</strong> · ${esc(word.d)}</p>
        ${entry ? partsLine(entry) : ""}
        ${entry?.[2] && !inflection ? `<p>${esc(entry[2])}</p>` : ""}
        ${wordExample(word, entry)}
      </div><div class="quiz-foot">
        ${starButton(word.w)}
        <button class="btn primary" data-next>${current.index + 1 === current.items.length ? "查看結果" : "下一題"} ${icon("arrow")}</button>
      </div>` : ""}
    </section>`;
}

function renderPractice() {
  const current = practice;
  shell("practice");
  if (!current || !current.items.length) {
    main.innerHTML = emptyPanel("目前沒有可以練習的單字", "選擇一組字族或從單字庫挑選。", "#bank", "打開單字庫");
    return;
  }
  main.innerHTML = `<div class="quiz-layout">
    <div class="quiz-top"><a class="quiet" href="${current.back}">${icon("left")} 返回</a>
      <strong>${esc(current.title)}</strong>
      <span>${current.done ? current.items.length : current.index + 1} / ${current.items.length}</span>
    </div>
    ${progressBar(current.done ? current.items.length : current.index + (current.choice === null && !current.flipped ? 0 : 1), current.items.length, "練習進度")}
    ${current.done ? renderPracticeResult() :
      current.mode === "flash" ? renderFlash(current.items[current.index]) : renderQuestion(current.items[current.index])}
  </div>`;
}

function say(word) {
  if (!("speechSynthesis" in window)) {
    showToast("這個瀏覽器目前無法播放英文語音。");
    return;
  }
  window.speechSynthesis.cancel();
  const speech = new SpeechSynthesisUtterance(word);
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find((item) => item.lang === "en-US") || voices.find((item) => item.lang.startsWith("en"));
  speech.lang = voice?.lang || "en-US";
  if (voice) speech.voice = voice;
  speech.rate = Number(preferences["speech-rate"]);
  speech.onerror = (event) => {
    if (!["canceled", "interrupted"].includes(event.error)) showToast("目前無法播放英文語音。可確認裝置已安裝英文語音。");
  };
  window.speechSynthesis.speak(speech);
}

function openWord(word, trigger) {
  dialogWord = word;
  dialogTrigger = trigger;
  const item = stats.progress[keyOf(word.w)];
  dialog.innerHTML = `
    <header class="word-heading"><h2 id="word-title">${esc(word.w)}</h2>
      <div class="dialog-actions">${audioButton(word.w)}${starButton(word.w)}
        <button class="icon-button" data-close aria-label="關閉單字詳細資料" autofocus>${icon("close")}</button>
      </div>
    </header>
    <div class="dialog-body">
      <div>${tag(tiers[word.t], tierColors[word.t])} ${item?.step >= 2 ? tag("已精熟", "mint") : ""}</div>
      <p><small class="muted">${esc(word.p)}</small> <strong>${esc(word.d)}</strong></p>
      ${word.a.length ? `<p class="muted">同列變體 ${word.a.map(esc).join("、")}</p>` : ""}
      ${wordExample(word)}
      ${word.f.map((id) => {
        const lesson = familyById.get(id);
        const entry = lessonEntry(word, lesson);
        return `<div class="dialog-body">${partsLine(entry)}
          <a class="quiet" href="#lesson/${id}">前往 ${esc(lesson.form)} 字族 ${icon("right")}</a></div>`;
      }).join("")}
      <small class="muted">${esc(word.source)}</small>
    </div>`;
  if (!dialog.open) dialog.showModal();
}

function toggleStar(word) {
  const key = keyOf(word);
  const enabled = !stats.stars[key];
  if (enabled) stats.stars[key] = true;
  else delete stats.stars[key];
  saveProgress();
  document.querySelectorAll("[data-star]").forEach((button) => {
    if (keyOf(button.dataset.star) === key) button.setAttribute("aria-pressed", enabled);
  });
  showToast(enabled ? "已加入收藏" : "已取消收藏");
  const page = location.hash.slice(1).split("/")[0];
  if (page === "bank" && bankFilter.personal === "stars") renderBankResults();
  if (page === "review") renderReview();
}

function closeMenu() {
  document.body.classList.remove("menu-open");
  document.querySelector("#menu").setAttribute("aria-expanded", "false");
  document.querySelector("#menu").setAttribute("aria-label", "開啟選單");
}

function route() {
  const [requested, option, id] = location.hash.slice(1).split("/");
  const page = Object.hasOwn(names, requested) ? requested : "home";
  lessonPage = 1;
  if (dialog.open) dialog.close();
  if (settings.open) settings.close();
  closeMenu();
  shell(page);
  if (page === "home") renderHome();
  if (page === "families") renderFamilies();
  if (page === "lesson") renderLesson(option);
  if (page === "bank") renderBank();
  if (page === "review") renderReview();
  if (page === "rewards") renderRewards();
  if (page === "sources") renderSources();
  if (page === "practice") {
    practice = startPractice(option, id);
    renderPractice();
  }
  document.title = page === "home" ? names.home : `${names[page]} · 單字王`;
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) {
    if (event.target.closest("[data-course-bank]")) {
      Object.assign(bankFilter, { query: "", tier: "cap", family: "all", personal: "all", page: 1 });
    }
    if (event.target.closest(".skip")) {
      event.preventDefault();
      main.focus();
    } else if (event.target === dialog || event.target === settings) {
      if (event.offsetX < 0 || event.offsetY < 0 || event.offsetX >= event.target.offsetWidth || event.offsetY >= event.target.offsetHeight) {
        event.target.close();
      }
    } else if (event.target.closest(".shell")) {
      closeMenu();
    }
    return;
  }
  const { say: spoken, star, word, familyFilter: family, reviewFilter: review, bankPage, answer } = button.dataset;
  if (spoken) say(spoken);
  if (button.id === "open-settings") {
    closeMenu();
    settings.showModal();
  }
  if (star) toggleStar(star);
  if (word && words.has(keyOf(word))) openWord(words.get(keyOf(word)), button);
  if (button.hasAttribute("data-close")) dialog.close();
  if (family) {
    familyFilter = family;
    renderFamilies();
    main.querySelector('[aria-pressed="true"]')?.focus();
  }
  if (button.dataset.lessonPage) {
    const id = location.hash.split("/")[1];
    lessonPage += Number(button.dataset.lessonPage);
    renderLesson(id);
    main.querySelector(".lesson-word-list .word-link")?.focus();
  }
  if (review) {
    reviewFilter = review;
    renderReview();
    main.querySelector('[aria-pressed="true"]')?.focus();
  }
  if (bankPage) {
    bankFilter.page += Number(bankPage);
    renderBankResults();
    document.querySelector("#bank-results .word-link")?.focus();
  }
  if (answer !== undefined && practice?.options?.[Number(answer)] && practice.choice === null) {
    practice.choice = Number(answer);
    const current = practice.items[practice.index];
    const correct = practice.options[practice.choice].correct;
    const xp = recordAnswer(current, correct);
    practice.answers.push({ word: current, correct, xp });
    practice.xp += xp;
    renderPractice();
    main.querySelector("[data-next]")?.focus();
  }
  if (button.hasAttribute("data-next") && practice) advance();
  if (button.hasAttribute("data-flip") && practice) {
    practice.flipped = true;
    renderPractice();
    main.querySelector("[data-next]")?.focus();
  }
  if (button.hasAttribute("data-restart")) route();
  if (button.id === "menu") {
    const opened = document.body.classList.toggle("menu-open");
    button.setAttribute("aria-expanded", opened);
    button.setAttribute("aria-label", opened ? "關閉選單" : "開啟選單");
    if (opened) document.querySelector(".sidebar .brand").focus();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "family-query") {
    familyQuery = event.target.value;
    renderFamilyResults();
    return;
  }
  if (event.target.id !== "query") return;
  bankFilter.query = event.target.value;
  bankFilter.page = 1;
  renderBankResults();
});

document.addEventListener("change", (event) => {
  if (event.target.id === "family-scope") {
    familyScope = event.target.value;
    lessonPage = 1;
    const [page, id] = location.hash.slice(1).split("/");
    if (page === "lesson" && familyById.has(id)) {
      renderLesson(id);
      document.querySelector("#family-scope")?.focus();
    } else {
      renderFamilyResults();
    }
    return;
  }
  if (preferenceFields.includes(event.target)) {
    preferences[event.target.name] = event.target.value;
    if (event.target.name === "speech-rate") window.speechSynthesis?.cancel();
    applyPreferences();
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(preferences));
    } catch {
      showToast("此瀏覽器目前無法保存設定。");
    }
    return;
  }
  if (!["tier", "family", "personal"].includes(event.target.id)) return;
  bankFilter[event.target.id] = event.target.value;
  bankFilter.page = 1;
  renderBankResults();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.body.classList.contains("menu-open")) {
    closeMenu();
    document.querySelector("#menu").focus();
  }
});

dialog.addEventListener("close", () => {
  if (dialogWord && dialogTrigger?.isConnected) dialogTrigger.focus();
  dialogWord = null;
  dialogTrigger = null;
});
window.addEventListener("hashchange", route);
applyPreferences();
route();
