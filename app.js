const DATA_URL = "./data/news.json";

const els = {
  grid: document.querySelector("#newsGrid"),
  status: document.querySelector("#statusMessage"),
  updated: document.querySelector("#updatedAt"),
  count: document.querySelector("#storyCount"),
  major: document.querySelector("#majorCount"),
  sources: document.querySelector("#sourceCount"),
  search: document.querySelector("#searchInput"),
  category: document.querySelector("#categoryFilter"),
  chips: document.querySelector("#categoryChips"),
  empty: document.querySelector("#emptyState"),
  refresh: document.querySelector("#refreshBtn"),
  clear: document.querySelector("#clearFilters")
};

let allStories = [];
let activeCategory = "all";

const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

function safeArticleUrl(value) {
  try {
    const parsed = new URL(String(value || ""), window.location.href);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : "#";
  } catch {
    return "#";
  }
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
    timeZone: "Asia/Kolkata"
  }).format(date) + " IST";
}

function getCategories(stories) {
  return [...new Set(stories.map((story) => story.category || "General"))].sort();
}

function setupCategories(stories) {
  const values = getCategories(stories);
  els.category.innerHTML = '<option value="all">All categories</option>' +
    values.map((cat) => `<option value="${safe(cat)}">${safe(cat)}</option>`).join("");

  els.chips.innerHTML = ["all", ...values].map((cat) => `
    <button type="button" class="chip ${cat === activeCategory ? "active" : ""}"
      data-category="${safe(cat)}" aria-pressed="${cat === activeCategory}">
      ${cat === "all" ? "All stories" : safe(cat)}
    </button>
  `).join("");

  els.chips.querySelectorAll(".chip").forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category;
      els.category.value = activeCategory;
      renderStories();
      updateChips();
    });
  });
}

function updateChips() {
  els.chips.querySelectorAll(".chip").forEach((button) => {
    const isActive = button.dataset.category === activeCategory;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderStories() {
  const term = els.search.value.trim().toLowerCase();

  const selected = allStories.filter((story) => {
    const category = story.category || "General";
    const matchesCategory = activeCategory === "all" || category === activeCategory;
    const searchable = [story.title, story.summary, story.source, category].join(" ").toLowerCase();
    return matchesCategory && searchable.includes(term);
  });

  els.grid.innerHTML = selected.map((story) => {
    const title = safe(story.title || "Untitled story");
    const url = safeArticleUrl(story.url);
    const category = safe(story.category || "General");
    const source = safe(story.source || "News source");
    const summary = safe(story.summary || "Open the original article for more details.");
    const major = story.is_major ? '<span class="major-tag">✦ TOP STORY</span>' : "";
    const date = safe(formatDate(story.published_at_ist || story.published_at_utc));

    return `
      <article class="news-card">
        <div class="card-top">
          <span class="category-tag">${category}</span>
          ${major}
        </div>
        <h3>${title}</h3>
        <p class="summary">${summary}</p>
        <div class="card-bottom">
          <span class="source-line" title="${source}">${source} · ${date}</span>
          <a class="read-link" href="${safe(url)}" target="_blank" rel="noopener noreferrer">
            Read story ↗
          </a>
        </div>
      </article>
    `;
  }).join("");

  els.empty.hidden = selected.length !== 0;
  els.grid.hidden = selected.length === 0;
  els.status.textContent = selected.length
    ? `Showing ${selected.length} of ${allStories.length} stories`
    : (allStories.length ? "No stories match those filters." : "");
}

async function loadNews(showLoading = true) {
  if (showLoading) els.status.textContent = "Fetching the latest saved briefing…";
  els.refresh.disabled = true;
  els.refresh.classList.add("is-loading");

  try {
    const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`News data returned ${response.status}`);

    const data = await response.json();
    allStories = Array.isArray(data.stories) ? data.stories : [];

    els.count.textContent = data.total_stories ?? allStories.length;
    els.major.textContent = allStories.filter((story) => story.is_major).length;
    els.sources.textContent = Array.isArray(data.sources_checked) ? data.sources_checked.length : "—";

    const timestamp = data.generated_at_ist || data.generated_at_utc;
    els.updated.textContent = timestamp
      ? `Updated ${formatDate(timestamp)} · Times shown in IST`
      : "The first briefing has not been generated yet.";

    setupCategories(allStories);
    renderStories();

    if (!allStories.length) {
      els.status.textContent = "No news data yet. Run the India Daily News workflow in your repository’s Actions tab.";
    }
  } catch (error) {
    console.error("India Brief could not load news:", error);
    els.status.textContent = "We couldn't load the briefing. Check that data/news.json exists and GitHub Pages is enabled.";
    els.grid.innerHTML = "";
    els.grid.hidden = true;
    els.empty.hidden = false;
  } finally {
    els.refresh.disabled = false;
    els.refresh.classList.remove("is-loading");
  }
}

els.search.addEventListener("input", renderStories);
els.category.addEventListener("change", () => {
  activeCategory = els.category.value;
  updateChips();
  renderStories();
});
els.refresh.addEventListener("click", () => loadNews());
els.clear.addEventListener("click", () => {
  els.search.value = "";
  activeCategory = "all";
  els.category.value = "all";
  updateChips();
  renderStories();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    els.search.focus();
  }
  if (event.key === "Escape" && document.activeElement === els.search) {
    els.search.value = "";
    renderStories();
    els.search.blur();
  }
});

loadNews();
