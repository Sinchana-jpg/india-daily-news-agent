# India Daily News Agent

A scheduled GitHub Actions agent that collects recent Indian news from RSS feeds, deduplicates headlines, assigns broad categories, and commits:
- `reports/DAILY_NEWS.md` — latest daily brief
- `reports/daily/YYYY-MM-DD.md` — dated archive
- `data/news.json` — structured data for a website/dashboard

## Deploy
1. Create a GitHub repository such as `india-daily-news-agent`.
2. Upload all files from this ZIP, preserving `.github/workflows/daily-news.yml`.
3. Open **Settings → Actions → General → Workflow permissions**, enable **Read and write permissions**, and save.
4. Open **Actions → India Daily News → Run workflow → Run workflow**.
5. Check `reports/DAILY_NEWS.md` and `data/news.json`.

Runs daily at 7:00 AM IST (01:30 UTC). GitHub scheduled runs can be delayed.

## Optional AI summaries
Add `OPENAI_API_KEY` as a repository secret under **Settings → Secrets and variables → Actions**. The API may incur charges. Optionally set repository variable `OPENAI_MODEL`; default is `gpt-4.1-mini`. Without the key, rule-based classification and reporting still work.

## Website
A static website can fetch `data/news.json` from `https://raw.githubusercontent.com/OWNER/REPO/main/data/news.json`. The agent stores headlines, short RSS excerpts, timestamps and links, not full articles. Follow publisher terms, link to original reporting, and check syndication/reuse rules before commercial use.

Feed availability and descriptions can vary. The importance score is a heuristic, not an objective measure of truth or significance.
hiaa
