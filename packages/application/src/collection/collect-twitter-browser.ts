import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright-core";
import type { PublicCollectionResult } from "@yunyingbot/shared";
import { resolveBrowserExecutablePath } from "./browser-runtime.js";
import { recordCollectionRun } from "./record-collection-run.js";

const nowIso = () => new Date().toISOString();

const TWITTER_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const LOGIN_WALL_MARKERS = [
  "don’t miss what’s happening",
  "don't miss what's happening",
  "log in",
  "sign up",
  "join x today",
  "sign in to x"
];

const normalizeTwitterUrl = (value: string): string => value.replace(/^https:\/\/x\.com/i, "https://twitter.com");

const extractTweetId = (value: string): string | null => {
  const match = value.match(/\/status\/(\d+)/i);
  return match?.[1] ?? null;
};

type TwitterPageStatus = "valid_tweet" | "weak_capture" | "blocked_wall" | "profile_or_unknown";

interface ExtractedArticle {
  index: number;
  text: string;
  handles: string[];
  statusIds: string[];
  datetime: string | null;
  metrics: {
    replies: number | null;
    reposts: number | null;
    likes: number | null;
    bookmarks: number | null;
    views: number | null;
  };
}

interface TwitterPageExtraction {
  finalUrl: string;
  title: string | null;
  metaDescription: string | null;
  bodyPreview: string;
  pageStatus: TwitterPageStatus;
  statusReason: string;
  mainTweet: ExtractedArticle | null;
  replies: ExtractedArticle[];
  tweetQualityScore: number;
  commentQualityScore: number;
}

const clampScore = (value: number): number => Math.max(1, Math.min(10, Number(value.toFixed(1))));

const insertEvidence = (
  db: DatabaseSync,
  taskId: string,
  sourceId: string,
  evidenceType: string,
  title: string | null,
  summary: string,
  rawContent: string,
  credibilityLevel: "low" | "medium" | "high"
) => {
  const now = nowIso();
  db.prepare(
    `INSERT INTO evidences (
      id, task_id, source_id, evidence_type, title, summary, raw_content, credibility_level, captured_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), taskId, sourceId, evidenceType, title, summary, rawContent.slice(0, 50000), credibilityLevel, now, now);
};

const computeTweetQualityScore = (pageStatus: TwitterPageStatus, mainTweet: ExtractedArticle | null, title: string | null): number => {
  if (pageStatus === "blocked_wall") {
    return 1;
  }

  if (!mainTweet) {
    return 2;
  }

  let score = 3;
  score += Math.min(3.5, mainTweet.text.length / 180);
  score += mainTweet.datetime ? 1 : 0;
  score += mainTweet.handles.length > 0 ? 0.8 : 0;
  score += title && title !== "X" ? 0.7 : 0;
  score += mainTweet.metrics.views && mainTweet.metrics.views > 0 ? 0.5 : 0;

  return clampScore(score);
};

const computeCommentQualityScore = (pageStatus: TwitterPageStatus, replies: ExtractedArticle[]): number => {
  if (pageStatus === "blocked_wall") {
    return 1;
  }

  if (replies.length === 0) {
    return 2.5;
  }

  const averageLength = replies.reduce((sum, reply) => sum + reply.text.length, 0) / replies.length;
  const uniqueReplyCount = new Set(replies.map((reply) => reply.text)).size;
  const uniquenessRatio = replies.length === 0 ? 0 : uniqueReplyCount / replies.length;

  let score = 2.5;
  score += Math.min(2.5, replies.length * 0.5);
  score += Math.min(3, averageLength / 80);
  score += uniquenessRatio * 2;

  return clampScore(score);
};

const captureTwitterPage = async (
  executablePath: string,
  sourceUrl: string,
  targetTweetId: string | null
): Promise<TwitterPageExtraction> => {
  const browser = await chromium.launch({
    executablePath,
    headless: true
  });

  try {
    const page = await browser.newPage({
      userAgent: TWITTER_BROWSER_USER_AGENT,
      viewport: { width: 1440, height: 1200 },
      locale: "en-US"
    });

    await page.goto(normalizeTwitterUrl(sourceUrl), {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    await page.waitForTimeout(3500);
    for (let step = 0; step < 3; step += 1) {
      await page.evaluate(() => {
        window.scrollBy({ top: 1400, behavior: "instant" });
      });
      await page.waitForTimeout(1400);
    }

    const extracted = (await page.evaluate(`
      (() => {
        const tweetId = ${JSON.stringify(targetTweetId)};
        function normalizeText(value) {
          return (value || "").replace(/\\s+/g, " ").replace(/\\u00a0/g, " ").trim();
        }
        function extractStatusId(href) {
          const match = href.match(/\\/status\\/(\\d+)/i);
          return match ? match[1] : null;
        }
        function extractHandle(href) {
          try {
            const url = new URL(href, window.location.origin);
            const parts = url.pathname.split("/").filter(Boolean);
            if (parts.length >= 2 && parts[1] === "status") {
              return parts[0] || null;
            }
            return null;
          } catch {
            return null;
          }
        }
        function parseMetricValue(rawValue) {
          const normalized = normalizeText(rawValue).toLowerCase().replace(/,/g, "");
          if (!normalized) {
            return null;
          }
          const match = normalized.match(/([0-9]+(?:\\.[0-9]+)?)([kmb]|万|亿)?/i);
          if (!match) {
            return null;
          }
          const base = Number(match[1]);
          if (!Number.isFinite(base)) {
            return null;
          }
          const unit = match[2] || "";
          if (unit === "k") return Math.round(base * 1_000);
          if (unit === "m") return Math.round(base * 1_000_000);
          if (unit === "b") return Math.round(base * 1_000_000_000);
          if (unit === "万") return Math.round(base * 10_000);
          if (unit === "亿") return Math.round(base * 100_000_000);
          return Math.round(base);
        }
        function readMetricFromTestId(article, testId) {
          const node = article.querySelector('[data-testid="' + testId + '"]');
          if (!node) {
            return null;
          }
          const value = parseMetricValue(node.innerText || node.textContent || "");
          if (value !== null) {
            return value;
          }
          const parentValue = parseMetricValue(node.parentElement && (node.parentElement.innerText || node.parentElement.textContent));
          return parentValue;
        }
        function readViewsMetric(article, articleText, bodyTextValue) {
          const viewNode = article.querySelector('a[href*="/analytics"]');
          const directValue = parseMetricValue(viewNode && (viewNode.innerText || viewNode.textContent || ""));
          if (directValue !== null) {
            return directValue;
          }
          const match = (articleText + " " + bodyTextValue).match(/([0-9]+(?:\\.[0-9]+)?(?:[kmb]|万|亿)?)\\s*(views|查看)/i);
          if (!match) {
            return null;
          }
          return parseMetricValue(match[1]);
        }

        const bodyText = normalizeText(document.body && document.body.innerText);
        const title = normalizeText(document.title) || null;
        const metaDescription = normalizeText(document.querySelector('meta[name="description"]')?.getAttribute("content")) || null;
        const articles = Array.from(document.querySelectorAll("article"))
          .map((article, index) => {
            const text = normalizeText(article.innerText);
            const hrefs = Array.from(article.querySelectorAll("a[href]"))
              .map((anchor) => anchor.getAttribute("href") || "")
              .map((href) => {
                try {
                  return new URL(href, window.location.origin).href;
                } catch {
                  return href;
                }
              });

            const statusIds = Array.from(new Set(hrefs.map((href) => extractStatusId(href)).filter(Boolean)));
            const handles = Array.from(new Set(hrefs.map((href) => extractHandle(href)).filter(Boolean)));
            const datetime = article.querySelector("time")?.getAttribute("datetime") || null;
            const metrics = {
              replies: readMetricFromTestId(article, "reply"),
              reposts: readMetricFromTestId(article, "retweet"),
              likes: readMetricFromTestId(article, "like"),
              bookmarks: readMetricFromTestId(article, "bookmark"),
              views: readViewsMetric(article, text, bodyText)
            };

            return { index, text, handles, statusIds, datetime, metrics };
          })
          .filter((article) => article.text.length > 0);

        const loginWall = ${JSON.stringify(LOGIN_WALL_MARKERS)}.some((marker) => bodyText.toLowerCase().includes(marker));
        const hasTweetTitleMetadata = !!title && title !== "X" && title.includes(" on X:");
        const matchingArticle = tweetId ? articles.find((article) => article.statusIds.includes(tweetId)) : null;
        const mainTweet = matchingArticle || articles[0] || null;
        const replies = articles.filter((article) => article !== mainTweet).slice(0, 6);

        let pageStatus = "profile_or_unknown";
        let statusReason = "Page did not clearly match a tweet detail layout.";

        if (loginWall && hasTweetTitleMetadata) {
          pageStatus = "weak_capture";
          statusReason = "The tweet body is behind a login wall, but the page title still exposes tweet metadata.";
        } else if (loginWall) {
          pageStatus = "blocked_wall";
          statusReason = "Page content matches a login wall or restricted-view prompt.";
        } else if (mainTweet && mainTweet.text.length >= 40) {
          pageStatus = "valid_tweet";
          statusReason = "A tweet-like article with meaningful visible text was extracted.";
        } else if (mainTweet) {
          pageStatus = "weak_capture";
          statusReason = "The page loaded, but the extracted tweet text is too short or too generic.";
        }

        return {
          finalUrl: window.location.href,
          title,
          metaDescription,
          bodyPreview: bodyText.slice(0, 1200),
          pageStatus,
          statusReason,
          mainTweet,
          replies
        };
      })()
    `)) as Omit<TwitterPageExtraction, "tweetQualityScore" | "commentQualityScore">;

    return {
      ...extracted,
      tweetQualityScore: computeTweetQualityScore(extracted.pageStatus, extracted.mainTweet, extracted.title),
      commentQualityScore: computeCommentQualityScore(extracted.pageStatus, extracted.replies)
    };
  } finally {
    await browser.close();
  }
};

const buildTweetSummary = (capture: TwitterPageExtraction): string => {
  if (capture.pageStatus === "blocked_wall") {
    return capture.statusReason;
  }

  if (capture.mainTweet?.text) {
    return capture.mainTweet.text.slice(0, 500);
  }

  return (capture.metaDescription ?? capture.bodyPreview ?? "No visible tweet text extracted.").slice(0, 500);
};

export const collectTwitterBrowser = async (
  db: DatabaseSync,
  repoRoot: string,
  taskId: string
): Promise<PublicCollectionResult> => {
  const browserExecutablePath = resolveBrowserExecutablePath(repoRoot);
  const sources = db
    .prepare(
      `SELECT id, source_url
       FROM sources
       WHERE task_id = ?
         AND source_type = 'twitter'`
    )
    .all(taskId) as Array<{ id: string; source_url: string }>;

  const collectedSources: string[] = [];
  const skippedSources: string[] = [];
  const warnings: string[] = [];
  let evidenceCount = 0;
  const now = nowIso();
  let sawPartial = false;

  if (!browserExecutablePath) {
    warnings.push("No supported browser executable is available for Twitter browser collection.");
    const result = {
      taskId,
      collectedSources,
      skippedSources: sources.map((source) => source.source_url),
      warnings,
      evidenceCount
    };
    recordCollectionRun(db, {
      taskId,
      collectorKey: "twitter_browser_fetch",
      sourceType: "twitter",
      status: "failed",
      collectedCount: 0,
      skippedCount: result.skippedSources.length,
      evidenceCount: 0,
      warnings
    });
    return result;
  }

  for (const source of sources) {
    try {
      const capture = await captureTwitterPage(browserExecutablePath, source.source_url, extractTweetId(source.source_url));

      insertEvidence(
        db,
        taskId,
        source.id,
        "twitter_page_capture",
        capture.title,
        `${capture.pageStatus}: ${capture.statusReason}`.slice(0, 500),
        JSON.stringify(capture, null, 2),
        "low"
      );
      evidenceCount += 1;

      insertEvidence(
        db,
        taskId,
        source.id,
        "twitter_page_assessment",
        `Twitter page assessment for ${source.source_url}`,
        `page_status=${capture.pageStatus}; tweet_quality=${capture.tweetQualityScore}; comment_quality=${capture.commentQualityScore}; replies=${capture.replies.length}`.slice(
          0,
          500
        ),
        JSON.stringify(
          {
            pageStatus: capture.pageStatus,
            statusReason: capture.statusReason,
            tweetQualityScore: capture.tweetQualityScore,
            commentQualityScore: capture.commentQualityScore,
            replyCount: capture.replies.length
          },
          null,
          2
        ),
        capture.pageStatus === "valid_tweet" ? "medium" : "low"
      );
      evidenceCount += 1;

      if (capture.mainTweet && capture.pageStatus !== "blocked_wall") {
        insertEvidence(
          db,
          taskId,
          source.id,
          "twitter_post_detail",
          capture.title,
          buildTweetSummary(capture),
          JSON.stringify(capture.mainTweet, null, 2),
          capture.pageStatus === "valid_tweet" ? "medium" : "low"
        );
        evidenceCount += 1;

        insertEvidence(
          db,
          taskId,
          source.id,
          "twitter_posts",
          capture.title,
          buildTweetSummary(capture),
          JSON.stringify(
            {
              pageStatus: capture.pageStatus,
              mainTweet: capture.mainTweet,
              tweetQualityScore: capture.tweetQualityScore
            },
            null,
            2
          ),
          capture.pageStatus === "valid_tweet" ? "medium" : "low"
        );
        evidenceCount += 1;
      }

      if (capture.replies.length > 0) {
        insertEvidence(
          db,
          taskId,
          source.id,
          "twitter_reply_sample",
          `Reply sample for ${source.source_url}`,
          `${capture.replies.length} visible replies sampled from the tweet page.`.slice(0, 500),
          JSON.stringify(capture.replies, null, 2),
          capture.pageStatus === "valid_tweet" ? "medium" : "low"
        );
        evidenceCount += 1;
      }

      if (capture.pageStatus === "blocked_wall") {
        warnings.push(`Twitter browser fetch hit a login wall for ${source.source_url}.`);
        db.prepare(`UPDATE sources SET access_status = ?, updated_at = ? WHERE id = ?`).run("failed", now, source.id);
        skippedSources.push(source.source_url);
        continue;
      }

      if (capture.pageStatus === "weak_capture" || capture.pageStatus === "profile_or_unknown") {
        warnings.push(`Twitter browser fetch only produced a weak capture for ${source.source_url}: ${capture.statusReason}`);
        db.prepare(`UPDATE sources SET access_status = ?, updated_at = ? WHERE id = ?`).run("partial", now, source.id);
        collectedSources.push(source.source_url);
        sawPartial = true;
        continue;
      }

      db.prepare(`UPDATE sources SET access_status = ?, updated_at = ? WHERE id = ?`).run("completed", now, source.id);
      collectedSources.push(source.source_url);
    } catch (error) {
      skippedSources.push(source.source_url);
      warnings.push(
        `Twitter browser fetch could not collect ${source.source_url}: ${
          error instanceof Error ? error.message : "unknown_error"
        }`
      );
      db.prepare(`UPDATE sources SET access_status = ?, updated_at = ? WHERE id = ?`).run("failed", now, source.id);
    }
  }

  if (evidenceCount > 0) {
    db.prepare(`UPDATE analysis_tasks SET collection_status = ?, updated_at = ? WHERE id = ?`).run(
      "evidence_ready",
      now,
      taskId
    );
  }

  const runStatus: "completed" | "partial" | "failed" =
    collectedSources.length === 0 ? "failed" : skippedSources.length > 0 || sawPartial || warnings.length > 0 ? "partial" : "completed";

  recordCollectionRun(db, {
    taskId,
    collectorKey: "twitter_browser_fetch",
    sourceType: "twitter",
    status: runStatus,
    collectedCount: collectedSources.length,
    skippedCount: skippedSources.length,
    evidenceCount,
    warnings
  });

  return {
    taskId,
    collectedSources,
    skippedSources,
    warnings,
    evidenceCount
  };
};
