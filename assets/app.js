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
  folderGrid: document.querySelector("[data-folder-grid]"),
  researchArticleGrid: document.querySelector("[data-research-article-grid]"),
  breadcrumb: document.querySelector("[data-breadcrumb]"),
  researchMeta: document.querySelector("[data-research-meta]"),
  researchBack: document.querySelector("[data-research-back]"),
  researchUp: document.querySelector("[data-research-up]"),
  researchHome: document.querySelector("[data-research-home]"),
  homeView: document.querySelector("[data-home-view]"),
  articleView: document.querySelector("[data-article-view]"),
  articleKicker: document.querySelector("[data-article-kicker]"),
  articleTitle: document.querySelector("[data-article-title]"),
  articleMeta: document.querySelector("[data-article-meta]"),
  articleContent: document.querySelector("[data-article-content]"),
  articleStatus: document.querySelector("[data-article-status]"),
  articleBack: document.querySelector("[data-article-back]"),
  articleUp: document.querySelector("[data-article-up]"),
  articleHome: document.querySelector("[data-article-home]"),
  articleCopy: document.querySelector("[data-article-copy]"),
  articleDownload: document.querySelector("[data-article-download]"),
  articleShare: document.querySelector("[data-article-share]"),
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
  elements.researchUp.addEventListener("click", navigateUpInResearchTree);
  elements.researchHome.addEventListener("click", navigateResearchHome);
  elements.articleBack.addEventListener("click", returnToArticleCategory);
  elements.articleUp.addEventListener("click", jumpToArticleParentCategory);
  elements.articleHome.addEventListener("click", goToHomeScreen);
  elements.articleCopy.addEventListener("click", copyActiveEntryContent);
  elements.articleDownload.addEventListener("click", downloadActiveEntry);
  elements.articleShare.addEventListener("click", copyArticleShareLink);
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
  elements.entryCount.textContent = `${appState.archive.entry_count || 0} Eintraege`;
  elements.generatedAt.textContent = `Generiert: ${formatDateTime(appState.archive.generated_at)}`;
  elements.footerTimestamp.textContent = formatDateTime(appState.archive.generated_at);
  elements.siteTitle.textContent = appState.archive.site?.title || "Archiv";
  elements.siteTagline.textContent = appState.archive.site?.tagline || "";
  elements.siteIntro.textContent = appState.archive.site?.intro || "";
  elements.aiSummary.textContent = `Aktuell ${aiCount} AI Vorlagen verfuegbar.`;
}

function renderHome() {
  renderLatestSection();
  renderAiSection();
  renderResearchNode();
}

function renderLatestSection() {
  elements.latestGrid.innerHTML = "";
  const latestEntries = appState.archive.latest_entries || [];

  if (!latestEntries.length) {
    elements.latestGrid.appendChild(createStateCard("Noch keine neuen Inhalte erkannt."));
    return;
  }

  for (const latestItem of latestEntries) {
    const entry = appState.entryByShare.get(latestItem.share_key);
    if (!entry) {
      continue;
    }
    elements.latestGrid.appendChild(createArticleCard(entry, { contextLabel: "Neu", compact: true }));
  }
}

function renderAiSection() {
  elements.aiGrid.innerHTML = "";
  const shareKeys = appState.archive.ai_templates?.entry_share_keys || [];

  if (!shareKeys.length) {
    elements.aiGrid.appendChild(createStateCard("Im AI-Bereich sind noch keine Eintraege."));
    return;
  }

  for (const shareKey of shareKeys) {
    const entry = appState.entryByShare.get(shareKey);
    if (!entry) {
      continue;
    }
    elements.aiGrid.appendChild(createArticleCard(entry, { contextLabel: "AI Vorlage" }));
  }
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
    `${parentInfo} | ${node.folder_count} Ordner | ${node.entry_count} Dateien | Zuletzt geaendert ${formatDateTime(node.modified_at)}`;
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
      <p>Zuletzt geaendert ${escapeHtml(formatDateTime(childNode.modified_at))}</p>
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
  elements.researchUp.disabled = !node.parent_id;
  elements.researchHome.disabled = node.id === appState.archive.research?.root_node_id;
}

function createArticleCard(entry, options = {}) {
  const { contextLabel = "Eintrag", compact = false } = options;
  const card = document.createElement("article");
  card.className = `news-card${compact ? " compact" : ""}`;
  card.innerHTML = `
    <p class="card-kicker">${escapeHtml(contextLabel)}</p>
    <h3>${escapeHtml(entry.title)}</h3>
    <p>${escapeHtml(entry.description || "Artikel oeffnen")}</p>
    <div class="card-meta">
      <span>${escapeHtml(entry.source_filename)}</span>
      <span>${escapeHtml(formatDateTime(entry.modified_at))}</span>
      <span>${escapeHtml(formatAge(entry.modified_ts))}</span>
    </div>
  `;

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "card-open";
  openButton.textContent = "Oeffnen";
  openButton.addEventListener("click", () => openArticle(entry, { syncUrl: true }));
  card.appendChild(openButton);
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

function navigateUpInResearchTree() {
  const currentNode = getCurrentResearchNode();
  if (!currentNode?.parent_id) {
    return;
  }

  if (appState.currentResearchNodeId !== currentNode.parent_id) {
    appState.navigationStack.push(appState.currentResearchNodeId);
  }
  appState.currentResearchNodeId = currentNode.parent_id;
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
    appState.navigationStack.push(appState.currentResearchNodeId);
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
  const kindLabel = entry.content_kind === "template" ? "AI Vorlage" : "Recherche Artikel";
  elements.articleKicker.textContent = kindLabel;
  elements.articleTitle.textContent = entry.title;
  elements.articleMeta.textContent =
    `${entry.category_path} | Zuletzt geaendert ${formatDateTime(entry.modified_at)} | ${formatAge(entry.modified_ts)}`;
  elements.articleStatus.textContent = "Artikelansicht geladen.";
  elements.articleCopy.disabled = entry.preview_type !== "markdown";
  elements.articleContent.innerHTML = "";

  const mediaInfo = document.createElement("section");
  mediaInfo.className = "article-info";
  mediaInfo.innerHTML = `
    <span>${escapeHtml(entry.preview_type === "pdf" ? "PDF Originalansicht" : "Markdown Darstellung")}</span>
    <span>${escapeHtml(entry.source_filename)}</span>
    <span>${entry.has_audio ? "Audio verfuegbar" : "Ohne Audio"}</span>
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
    elements.articleContent.appendChild(articleBody);
  }

  if (entry.audio) {
    const audioBox = document.createElement("section");
    audioBox.className = "audio-box";
    audioBox.innerHTML = `
      <h3>Vorleseoption</h3>
      <p>Diese Datei hat eine passende TTS-Aufnahme (${escapeHtml(entry.audio.filename)}).</p>
    `;
    const player = document.createElement("audio");
    player.controls = true;
    player.preload = "none";
    player.src = entry.audio.url;
    audioBox.appendChild(player);
    elements.articleContent.appendChild(audioBox);
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

function jumpToArticleParentCategory() {
  if (!appState.activeEntry?.node_id) {
    goToHomeScreen({ syncUrl: true });
    return;
  }

  const node = appState.nodeById.get(appState.activeEntry.node_id);
  if (!node?.parent_id) {
    goToHomeScreen({ syncUrl: true });
    return;
  }
  appState.currentResearchNodeId = node.parent_id;
  renderResearchNode();
  goToHomeScreen({ syncUrl: true });
}

function goToHomeScreen(options = {}) {
  const { syncUrl = true } = options;
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
  elements.articleStatus.textContent = copied ? "Inhalt wurde kopiert." : "Kopieren war nicht moeglich.";
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
