const SHARE_PARAM = "entry";

const appState = {
  archive: null,
  entryByShare: new Map(),
  nodeById: new Map(),
  currentResearchNodeId: null,
  navigationStack: [],
  activeEntry: null,
};

const elements = {
  siteTitle: document.querySelector("[data-site-title]"),
  siteTagline: document.querySelector("[data-site-tagline]"),
  siteIntro: document.querySelector("[data-site-intro]"),
  sectionCount: document.querySelector("[data-section-count]"),
  entryCount: document.querySelector("[data-entry-count]"),
  generatedAt: document.querySelector("[data-generated-at]"),
  footerTimestamp: document.querySelector("[data-footer-timestamp]"),
  aiSummary: document.querySelector("[data-ai-summary]"),
  latestGrid: document.querySelector("[data-latest-grid]"),
  aiGrid: document.querySelector("[data-ai-grid]"),
  projectsGrid: document.querySelector("[data-projects-grid]"),
  folderGrid: document.querySelector("[data-folder-grid]"),
  researchArticleGrid: document.querySelector("[data-research-article-grid]"),
  breadcrumb: document.querySelector("[data-breadcrumb]"),
  researchMeta: document.querySelector("[data-research-meta]"),
  researchBack: document.querySelector("[data-research-back]"),
  researchHome: document.querySelector("[data-research-home]"),
  homeView: document.querySelector("[data-home-view]"),
  articleView: document.querySelector("[data-article-view]"),
  articleKicker: document.querySelector("[data-article-kicker]"),
  articleTitle: document.querySelector("[data-article-title]"),
  articleMeta: document.querySelector("[data-article-meta]"),
  articleContent: document.querySelector("[data-article-content]"),
  articleStatus: document.querySelector("[data-article-status]"),
  articleBack: document.querySelector("[data-article-back]"),
  articleHome: document.querySelector("[data-article-home]"),
  articleCopy: document.querySelector("[data-article-copy]"),
  articleDownload: document.querySelector("[data-article-download]"),
  articleShare: document.querySelector("[data-article-share]"),
  articleWebPlay: document.querySelector("[data-article-web-play]"),
};

const dateTimeFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});
const relativeFormatter = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  loadArchive();
});

function bindEvents() {
  elements.researchBack.addEventListener("click", navigateBackInResearchTree);
  elements.researchHome.addEventListener("click", navigateResearchHome);
  elements.articleBack.addEventListener("click", returnToArticleCategory);
  elements.articleHome.addEventListener("click", goToHomeScreen);
  elements.articleCopy.addEventListener("click", copyActiveEntryContent);
  elements.articleDownload.addEventListener("click", downloadActiveEntry);
  elements.articleShare.addEventListener("click", copyArticleShareLink);
  elements.articleWebPlay.addEventListener("click", toggleArticleAudioPlayback);
}

async function loadArchive() {
  try {
    appState.archive = window.__LYRA_ARCHIVE_DATA__ || (await fetchArchiveJson());
    buildLookupMaps();
    bootstrapState();
    renderHome();

    const sharedEntry = findSharedEntryFromUrl();
    if (sharedEntry) {
      openArticle(sharedEntry, { syncUrl: false });
    } else {
      goToHomeScreen({ syncUrl: false });
    }
  } catch (error) {
    console.error(error);
    renderFatalError("Archivdaten konnten nicht geladen werden.");
  }
}

async function fetchArchiveJson() {
  const response = await fetch("./data/archive.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function buildLookupMaps() {
  appState.entryByShare.clear();
  appState.nodeById.clear();

  for (const entry of appState.archive.entries || []) {
    appState.entryByShare.set(entry.share_key, entry);
  }

  for (const node of appState.archive.research?.nodes || []) {
    appState.nodeById.set(node.id, node);
  }
}

function bootstrapState() {
  const research = appState.archive.research;
  appState.currentResearchNodeId = research?.root_node_id || null;
  appState.navigationStack = [];
  appState.activeEntry = null;

  const aiCount = appState.archive.ai_templates?.entry_count || 0;
  const researchNodeCount = research?.node_count || 0;
  elements.sectionCount.textContent = `${2 + researchNodeCount} Bereiche`;
  elements.entryCount.textContent = `${appState.archive.entry_count || 0} Einträge`;
  elements.generatedAt.textContent = `Generiert: ${formatDateTime(appState.archive.generated_at)}`;
  elements.footerTimestamp.textContent = formatDateTime(appState.archive.generated_at);
  elements.siteTitle.textContent = appState.archive.site?.title || "Archiv";
  elements.siteTagline.textContent = appState.archive.site?.tagline || "";
  elements.siteIntro.textContent = appState.archive.site?.intro || "";
  elements.aiSummary.textContent = `Aktuell ${aiCount} AI-Vorlagen verfügbar.`;
}

function renderHome() {
  renderAiSection();
  renderProjectsSection();
  renderResearchNode();
}

function renderLatestSection() {
  elements.latestGrid.innerHTML = "";
  const latestEntries = appState.archive.latest_entries || [];

  if (!latestEntries.length) {
    elements.latestGrid.appendChild(createStateCard("Noch keine neuen Inhalte erkannt."));
    return;
  }

  for (let index = 0; index < latestEntries.length; index += 1) {
    const latestItem = latestEntries[index];
    const entry = appState.entryByShare.get(latestItem.share_key);
    if (!entry) {
      continue;
    }
    elements.latestGrid.appendChild(
      createArticleCard(entry, {
        contextLabel: "Neu",
        compact: index > 0,
        featured: index === 0,
        includeCategoryJump: true,
      }),
    );
  }
}

function renderAiSection() {
  elements.aiGrid.innerHTML = "";
  const shareKeys = appState.archive.ai_templates?.entry_share_keys || [];

  if (!shareKeys.length) {
    elements.aiGrid.appendChild(createStateCard("Im AI-Bereich sind noch keine Einträge."));
    return;
  }

  for (const shareKey of shareKeys) {
    const entry = appState.entryByShare.get(shareKey);
    if (!entry) {
      continue;
    }
    elements.aiGrid.appendChild(createArticleCard(entry, { contextLabel: "AI-Vorlage" }));
  }
}

function renderProjectsSection() {
  elements.projectsGrid.innerHTML = "";
  const projects = appState.archive.lyras_projekte?.entries || [];

  if (!projects.length) {
    elements.projectsGrid.appendChild(createStateCard("Noch keine Projekte vorhanden."));
    return;
  }

  for (const project of projects) {
    elements.projectsGrid.appendChild(createProjectCard(project));
  }
}

function createProjectCard(project) {
  const card = document.createElement("article");
  card.className = "news-card";
  card.innerHTML = `
    <p class="card-kicker">Projekt</p>
    <h3>${escapeHtml(project.title)}</h3>
    <p class="card-summary">${escapeHtml(project.description)}</p>
  `;

  const actionRow = document.createElement("div");
  actionRow.className = "card-actions";

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "card-open";
  openButton.textContent = "Öffnen";
  openButton.addEventListener("click", () => {
    window.open(project.link, "_blank");
  });
  actionRow.appendChild(openButton);

  card.appendChild(actionRow);
  return card;
}

function renderResearchNode() {
  const node = getCurrentResearchNode();
  elements.folderGrid.innerHTML = "";
  elements.researchArticleGrid.innerHTML = "";

  if (!node) {
    elements.folderGrid.appendChild(createStateCard("Recherchen-Struktur konnte nicht geladen werden."));
    return;
  }

  renderResearchMeta(node);
  renderBreadcrumb(node);
  renderResearchFolders(node);
  renderResearchEntries(node);
  updateResearchControlState(node);
}

function renderResearchMeta(node) {
  const parentInfo = node.parent_id ? "Unterkategorie" : "Hauptkategorie";
  elements.researchMeta.textContent =
    `${parentInfo} | ${node.folder_count} Ordner | ${node.entry_count} Dateien | Zuletzt geändert ${formatDateTime(node.modified_at)}`;
}

function renderBreadcrumb(node) {
  elements.breadcrumb.innerHTML = "";
  const chain = getNodeChain(node);

  for (let index = 0; index < chain.length; index += 1) {
    const crumbNode = chain[index];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "crumb";
    button.textContent = crumbNode.label;
    button.disabled = crumbNode.id === node.id;
    button.addEventListener("click", () => openResearchNode(crumbNode.id, { pushHistory: true }));
    elements.breadcrumb.appendChild(button);
  }
}

function renderResearchFolders(node) {
  if (!node.child_node_ids.length) {
    elements.folderGrid.appendChild(createStateCard("Keine Unterordner auf dieser Ebene."));
    return;
  }

  for (const childId of node.child_node_ids) {
    const childNode = appState.nodeById.get(childId);
    if (!childNode) {
      continue;
    }
    const card = document.createElement("button");
    card.type = "button";
    card.className = "folder-card";
    card.innerHTML = `
      <p class="folder-kicker">Ordner</p>
      <h3>${escapeHtml(childNode.label)}</h3>
      <p>${childNode.folder_count} Unterordner | ${childNode.entry_count} Dateien</p>
      <p>Zuletzt geändert ${escapeHtml(formatDateTime(childNode.modified_at))}</p>
    `;
    card.addEventListener("click", () => openResearchNode(childNode.id, { pushHistory: true }));
    elements.folderGrid.appendChild(card);
  }
}

function renderResearchEntries(node) {
  if (!node.entry_share_keys.length) {
    elements.researchArticleGrid.appendChild(createStateCard("Keine Artikel auf dieser Ebene."));
    return;
  }

  for (const shareKey of node.entry_share_keys) {
    const entry = appState.entryByShare.get(shareKey);
    if (!entry) {
      continue;
    }
    elements.researchArticleGrid.appendChild(createArticleCard(entry, { contextLabel: "Artikel" }));
  }
}

function updateResearchControlState(node) {
  elements.researchBack.disabled = appState.navigationStack.length === 0;
  elements.researchHome.disabled = node.id === appState.archive.research?.root_node_id;
}

function openCategoryForEntry(entry) {
  if (!entry?.node_id) {
    return;
  }
  appState.currentResearchNodeId = entry.node_id;
  renderResearchNode();
  goToHomeScreen({ syncUrl: true });
}

function createArticleCard(entry, options = {}) {
  const {
    contextLabel = "Eintrag",
    compact = false,
    featured = false,
    includeCategoryJump = false,
  } = options;
  const card = document.createElement("article");
  card.className = `news-card${compact ? " compact" : ""}${featured ? " featured" : ""}`;
  card.innerHTML = `
    <p class="card-kicker">${escapeHtml(contextLabel)}</p>
    <p class="card-category">${escapeHtml(entry.category_path || "Ohne Kategorie")}</p>
    <h3>${escapeHtml(entry.title)}</h3>
    <p class="card-summary">${escapeHtml(entry.description || "Artikel öffnen")}</p>
    <div class="card-meta">
      <span>${escapeHtml(entry.source_filename)}</span>
      <span>${escapeHtml(formatDateTime(entry.modified_at))}</span>
      <span>${escapeHtml(formatAge(entry.modified_ts))}</span>
    </div>
  `;

  const actionRow = document.createElement("div");
  actionRow.className = "card-actions";

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "card-open";
  openButton.textContent = "Öffnen";
  openButton.addEventListener("click", () => openArticle(entry, { syncUrl: true }));
  actionRow.appendChild(openButton);

  if (includeCategoryJump && entry.node_id) {
    const categoryButton = document.createElement("button");
    categoryButton.type = "button";
    categoryButton.className = "card-open secondary";
    categoryButton.textContent = "Kategorie öffnen";
    categoryButton.addEventListener("click", () => openCategoryForEntry(entry));
    actionRow.appendChild(categoryButton);
  }

  card.appendChild(actionRow);
  return card;
}

function createStateCard(text) {
  const card = document.createElement("div");
  card.className = "state-card";
  card.textContent = text;
  return card;
}

function openResearchNode(nodeId, options = {}) {
  const { pushHistory = false } = options;
  const targetNode = appState.nodeById.get(nodeId);
  if (!targetNode) {
    return;
  }

  if (pushHistory && appState.currentResearchNodeId && appState.currentResearchNodeId !== nodeId) {
    appState.navigationStack.push(appState.currentResearchNodeId);
  }

  appState.currentResearchNodeId = nodeId;
  renderResearchNode();
}

function navigateBackInResearchTree() {
  const previousNodeId = appState.navigationStack.pop();
  if (!previousNodeId) {
    return;
  }
  appState.currentResearchNodeId = previousNodeId;
  renderResearchNode();
}

function navigateResearchHome() {
  const rootNodeId = appState.archive.research?.root_node_id;
  if (!rootNodeId) {
    return;
  }
  if (appState.currentResearchNodeId !== rootNodeId) {
    appState.navigationStack.push(appState.currentResearchNodeId);
  }
  appState.currentResearchNodeId = rootNodeId;
  renderResearchNode();
}

function getNodeChain(node) {
  const chain = [];
  let cursor = node;
  while (cursor) {
    chain.unshift(cursor);
    cursor = cursor.parent_id ? appState.nodeById.get(cursor.parent_id) : null;
  }
  return chain;
}

function openArticle(entry, options = {}) {
  const { syncUrl = true } = options;
  appState.activeEntry = entry;

  if (entry.node_id && appState.currentResearchNodeId !== entry.node_id) {
    if (appState.currentResearchNodeId) {
      appState.navigationStack.push(appState.currentResearchNodeId);
    }
    appState.currentResearchNodeId = entry.node_id;
    renderResearchNode();
  }

  document.body.classList.add("article-open");
  elements.articleView.hidden = false;
  renderArticle(entry);

  if (syncUrl) {
    updateShareUrl(entry.share_key);
  }
}

function renderArticle(entry) {
  stopArticleMediaPlayback({ silent: true });
  const kindLabel = entry.content_kind === "template" ? "AI-Vorlage" : "Recherche-Artikel";
  elements.articleKicker.textContent = kindLabel;
  elements.articleTitle.textContent = entry.title;
  elements.articleMeta.textContent =
    `${entry.category_path} | Zuletzt geändert ${formatDateTime(entry.modified_at)} | ${formatAge(entry.modified_ts)}`;
  elements.articleStatus.textContent = "Artikelansicht geladen.";
  elements.articleCopy.disabled = entry.preview_type !== "markdown";
  elements.articleWebPlay.disabled = !entry.audio;
  elements.articleWebPlay.textContent = entry.audio ? "Audio abspielen" : "Keine Audio-Datei";
  elements.articleContent.innerHTML = "";

  const mediaInfo = document.createElement("section");
  mediaInfo.className = "article-info";
  mediaInfo.innerHTML = `
    <span>${escapeHtml(entry.preview_type === "pdf" ? "PDF-Originalansicht" : "Markdown-Darstellung")}</span>
    <span>${escapeHtml(entry.source_filename)}</span>
    <span>${entry.has_audio ? "Audio verfügbar" : "Ohne Audio"}</span>
  `;
  elements.articleContent.appendChild(mediaInfo);

  if (entry.preview_type === "pdf") {
    const pdfFrame = document.createElement("iframe");
    pdfFrame.className = "article-pdf";
    pdfFrame.src = `${entry.source_url}#view=FitH`;
    pdfFrame.title = `${entry.title} PDF`;
    elements.articleContent.appendChild(pdfFrame);
  } else {
    const articleBody = document.createElement("article");
    articleBody.className = "article-body";
    articleBody.innerHTML = entry.content_html;
    prepareArticleBody(articleBody);
    elements.articleContent.appendChild(articleBody);
  }

  if (entry.audio) {
    const audioBox = document.createElement("section");
    audioBox.className = "audio-box";
    audioBox.innerHTML = `
      <h3>Audio-Datei</h3>
      <p>Diese Datei ist verfügbar: ${escapeHtml(entry.audio.filename)}</p>
    `;
    const mediaExtension = (entry.audio.extension || "").toLowerCase();
    const mediaType = getMediaMimeType(mediaExtension);
    if (mediaExtension === ".mp4") {
      const player = document.createElement("video");
      player.controls = true;
      player.preload = "metadata";
      player.className = "article-media";
      player.setAttribute("data-article-media-player", "true");
      player.addEventListener("play", syncArticleAudioButtonState);
      player.addEventListener("pause", syncArticleAudioButtonState);
      player.addEventListener("ended", syncArticleAudioButtonState);
      const source = document.createElement("source");
      source.src = entry.audio.url;
      source.type = mediaType;
      player.appendChild(source);
      audioBox.appendChild(player);
    } else {
      const player = document.createElement("audio");
      player.controls = true;
      player.preload = "metadata";
      player.setAttribute("data-article-media-player", "true");
      player.addEventListener("play", syncArticleAudioButtonState);
      player.addEventListener("pause", syncArticleAudioButtonState);
      player.addEventListener("ended", syncArticleAudioButtonState);
      const source = document.createElement("source");
      source.src = entry.audio.url;
      source.type = mediaType;
      player.appendChild(source);
      audioBox.appendChild(player);
    }
    elements.articleContent.appendChild(audioBox);
  }

  syncArticleAudioButtonState();
}

function prepareArticleBody(articleBody) {
  const tables = articleBody.querySelectorAll("table");
  for (const table of tables) {
    if (table.parentElement?.classList.contains("table-wrap")) {
      continue;
    }
    const wrapper = document.createElement("div");
    wrapper.className = "table-wrap";
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  }
}

function returnToArticleCategory() {
  if (!appState.activeEntry) {
    goToHomeScreen();
    return;
  }

  if (appState.activeEntry.node_id) {
    appState.currentResearchNodeId = appState.activeEntry.node_id;
    renderResearchNode();
  }
  goToHomeScreen({ syncUrl: true });
}

function goToHomeScreen(options = {}) {
  const { syncUrl = true } = options;
  stopArticleMediaPlayback({ silent: true });
  appState.activeEntry = null;
  document.body.classList.remove("article-open");
  elements.articleView.hidden = true;
  if (syncUrl) {
    clearShareUrl();
  }
}

async function copyActiveEntryContent() {
  if (!appState.activeEntry || appState.activeEntry.preview_type !== "markdown") {
    return;
  }
  const copied = await copyText(appState.activeEntry.content || "");
  elements.articleStatus.textContent = copied ? "Inhalt wurde kopiert." : "Kopieren war nicht möglich.";
}

function downloadActiveEntry() {
  if (!appState.activeEntry) {
    return;
  }
  triggerDownload(appState.activeEntry.source_url, appState.activeEntry.source_filename);
  elements.articleStatus.textContent = "Originaldatei wird heruntergeladen.";
}

async function copyArticleShareLink() {
  if (!appState.activeEntry) {
    return;
  }
  const link = buildShareLink(appState.activeEntry.share_key);
  const copied = await copyText(link);
  elements.articleStatus.textContent = copied ? "Teillink wurde kopiert." : "Teillink konnte nicht kopiert werden.";
}

function getArticleMediaPlayer() {
  return elements.articleContent.querySelector("[data-article-media-player]");
}

function syncArticleAudioButtonState() {
  const player = getArticleMediaPlayer();
  if (!appState.activeEntry?.audio || !player) {
    elements.articleWebPlay.disabled = true;
    elements.articleWebPlay.textContent = "Keine Audio-Datei";
    return;
  }

  elements.articleWebPlay.disabled = false;
  elements.articleWebPlay.textContent = player.paused ? "Audio abspielen" : "Audio pausieren";
}

async function toggleArticleAudioPlayback() {
  const player = getArticleMediaPlayer();
  if (!appState.activeEntry?.audio || !player) {
    elements.articleStatus.textContent = "Für diesen Artikel ist keine Audio-Datei vorhanden.";
    syncArticleAudioButtonState();
    return;
  }

  if (player.paused) {
    try {
      await player.play();
      elements.articleStatus.textContent = "Audio-Wiedergabe gestartet.";
    } catch (error) {
      console.error(error);
      elements.articleStatus.textContent = "Audio-Wiedergabe konnte nicht gestartet werden.";
    }
  } else {
    player.pause();
    elements.articleStatus.textContent = "Audio-Wiedergabe pausiert.";
  }

  syncArticleAudioButtonState();
}

function stopArticleMediaPlayback(options = {}) {
  const { silent = false } = options;
  const player = getArticleMediaPlayer();
  if (!player) {
    return;
  }

  const wasPlaying = !player.paused;
  player.pause();
  syncArticleAudioButtonState();

  if (!silent && wasPlaying) {
    elements.articleStatus.textContent = "Audio-Wiedergabe gestoppt.";
  }
}

function findSharedEntryFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const shareKey = params.get(SHARE_PARAM);
  if (!shareKey) {
    return null;
  }

  return appState.entryByShare.get(shareKey) || null;
}

function buildShareLink(shareKey) {
  const url = new URL(window.location.href);
  url.searchParams.set(SHARE_PARAM, shareKey);
  return url.toString();
}

function updateShareUrl(shareKey) {
  const url = new URL(window.location.href);
  url.searchParams.set(SHARE_PARAM, shareKey);
  window.history.replaceState({}, "", url);
}

function clearShareUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(SHARE_PARAM)) {
    return;
  }
  url.searchParams.delete(SHARE_PARAM);
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", nextUrl || url.pathname);
}

function getCurrentResearchNode() {
  return appState.nodeById.get(appState.currentResearchNodeId) || null;
}

function renderFatalError(message) {
  document.body.classList.remove("article-open");
  elements.articleView.hidden = true;
  elements.latestGrid.innerHTML = "";
  elements.latestGrid.appendChild(createStateCard(message));
}

function formatDateTime(value) {
  if (!value) {
    return "unbekannt";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "unbekannt";
  }
  return dateTimeFormatter.format(parsed);
}

function formatAge(unixSeconds) {
  if (!unixSeconds) {
    return "Alter unbekannt";
  }

  const diffMs = (unixSeconds * 1000) - Date.now();
  const absSeconds = Math.abs(diffMs / 1000);
  if (absSeconds < 90) {
    return "gerade eben";
  }
  if (absSeconds < 3600) {
    return relativeFormatter.format(Math.round(diffMs / 60000), "minute");
  }
  if (absSeconds < 86400) {
    return relativeFormatter.format(Math.round(diffMs / 3600000), "hour");
  }
  if (absSeconds < 2592000) {
    return relativeFormatter.format(Math.round(diffMs / 86400000), "day");
  }
  return relativeFormatter.format(Math.round(diffMs / 2592000000), "month");
}

function triggerDownload(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function getMediaMimeType(extension) {
  switch ((extension || "").toLowerCase()) {
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".m4a":
    case ".mp4a":
      return "audio/mp4";
    case ".ogg":
      return "audio/ogg";
    case ".mp4":
      return "video/mp4";
    default:
      return "application/octet-stream";
  }
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (error) {
    try {
      const helper = document.createElement("textarea");
      helper.value = value;
      helper.setAttribute("readonly", "");
      helper.style.position = "absolute";
      helper.style.left = "-9999px";
      document.body.appendChild(helper);
      helper.select();
      const success = document.execCommand("copy");
      helper.remove();
      return success;
    } catch (fallbackError) {
      console.error(fallbackError);
      console.error(error);
      return false;
    }
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
