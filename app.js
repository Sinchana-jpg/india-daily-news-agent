const DATA_URL = `./data/news.json`;
const els = {
  grid: document.querySelector('#newsGrid'), status: document.querySelector('#statusMessage'),
  updated: document.querySelector('#updatedAt'), count: document.querySelector('#storyCount'),
  major: document.querySelector('#majorCount'), sources: document.querySelector('#sourceCount'),
  search: document.querySelector('#searchInput'), category: document.querySelector('#categoryFilter'),
  chips: document.querySelector('#categoryChips'), empty: document.querySelector('#emptyState'),
  refresh: document.querySelector('#refreshBtn'), clear: document.querySelector('#clearFilters')
};
let allStories = [];
let activeCategory = 'all';
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function formatDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-IN', { day:'numeric', month:'short', hour:'numeric', minute:'2-digit', timeZone:'Asia/Kolkata' }).format(date) + ' IST';
}
function categories(stories) { return [...new Set(stories.map(story => story.category || 'General'))].sort(); }
function setupCategories(stories) {
  const values = categories(stories);
  els.category.innerHTML = '<option value="all">All categories</option>' + values.map(cat => `<option value="${safe(cat)}">${safe(cat)}</option>`).join('');
  els.chips.innerHTML = ['all', ...values].map(cat => `<button type="button" class="chip ${cat === activeCategory ? 'active' : ''}" data-category="${safe(cat)}">${cat === 'all' ? 'All stories' : safe(cat)}</button>`).join('');
  els.chips.querySelectorAll('.chip').forEach(button => button.addEventListener('click', () => {
    activeCategory = button.dataset.category; els.category.value = activeCategory; renderStories(); updateChips();
  }));
}
function updateChips() { els.chips.querySelectorAll('.chip').forEach(button => button.classList.toggle('active', button.dataset.category === activeCategory)); }
function renderStories() {
  const term = els.search.value.trim().toLowerCase();
  const selected = allStories.filter(story => {
    const cat = story.category || 'General';
    const matchesCategory = activeCategory === 'all' || cat === activeCategory;
    const searchable = [story.title, story.summary, story.source, cat].join(' ').toLowerCase();
    return matchesCategory && searchable.includes(term);
  });
  els.grid.innerHTML = selected.map(story => {
    const title = safe(story.title || 'Untitled story');
    const url = safe(story.url || '#');
    const category = safe(story.category || 'General');
    const source = safe(story.source || 'News source');
    const summary = safe(story.summary || 'Open the original article for more details.');
    const major = story.is_major ? '<span class="major-tag">TOP STORY</span>' : '';
    return `<article class="news-card"><div class="card-top"><span class="category-tag">${category}</span>${major}</div><h3>${title}</h3><p class="summary">${summary}</p><div class="card-bottom"><span class="source-line">${source} · ${safe(formatDate(story.published_at_ist || story.published_at_utc))}</span><a class="read-link" href="${url}" target="_blank" rel="noopener noreferrer">Read story ↗</a></div></article>`;
  }).join('');
  els.empty.hidden = selected.length > 0;
  els.grid.hidden = selected.length === 0;
  els.status.textContent = selected.length ? `Showing ${selected.length} of ${allStories.length} stories` : '';
}
async function loadNews(showLoading = true) {
  if (showLoading) els.status.textContent = 'Fetching the latest saved briefing…';
  els.refresh.disabled = true;
  try {
    const response = await fetch(`${DATA_URL}?refresh=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`News data returned ${response.status}`);
    const data = await response.json();
    allStories = Array.isArray(data.stories) ? data.stories : [];
    els.count.textContent = data.total_stories ?? allStories.length;
    els.major.textContent = allStories.filter(story => story.is_major).length;
    els.sources.textContent = Array.isArray(data.sources_checked) ? data.sources_checked.length : 0;
    const timestamp = data.generated_at_ist || data.generated_at_utc;
    els.updated.textContent = timestamp ? `Updated ${formatDate(timestamp)} · Times shown in IST` : 'The first briefing has not been generated yet.';
    setupCategories(allStories);
    renderStories();
    if (!allStories.length) els.status.textContent = 'No news data yet. Run the “India Daily News” workflow in the repository’s Actions tab.';
  } catch (error) {
    console.error(error);
    els.status.textContent = 'Could not load news data. Check that data/news.json exists and GitHub Pages is enabled.';
    els.grid.innerHTML = '';
  } finally { els.refresh.disabled = false; }
}
els.search.addEventListener('input', renderStories);
els.category.addEventListener('change', () => { activeCategory = els.category.value; updateChips(); renderStories(); });
els.refresh.addEventListener('click', () => loadNews());
els.clear.addEventListener('click', () => { els.search.value = ''; activeCategory = 'all'; els.category.value = 'all'; updateChips(); renderStories(); });
loadNews();
