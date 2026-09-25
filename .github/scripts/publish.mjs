import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const postsDir = path.join(root, "content", "posts");
const inboxDir = path.join(root, "inbox");
const eventName = process.env.GITHUB_EVENT_NAME || "";
const eventPath = process.env.GITHUB_EVENT_PATH;
const repository = process.env.GITHUB_REPOSITORY || "";
const token = process.env.GITHUB_TOKEN || "";
const branch = process.env.DEFAULT_BRANCH || "main";
const chapterHeadingPattern = /^(?:第\s*[0-9零〇一二三四五六七八九十百千万两]+\s*[章节回话卷篇部集幕](?:\s*[:：、.\-—]\s*.*|\s+.+)?|序章(?:\s*[:：、.\-—]\s*.*|\s+.+)?|序言(?:\s*[:：、.\-—]\s*.*|\s+.+)?|楔子(?:\s*[:：、.\-—]\s*.*|\s+.+)?|引子(?:\s*[:：、.\-—]\s*.*|\s+.+)?|前言(?:\s*[:：、.\-—]\s*.*|\s+.+)?|后记(?:\s*[:：、.\-—]\s*.*|\s+.+)?|终章(?:\s*[:：、.\-—]\s*.*|\s+.+)?|尾声(?:\s*[:：、.\-—]\s*.*|\s+.+)?|番外(?:\s*[0-9零〇一二三四五六七八九十百千万两]+)?(?:\s*[:：、.\-—]\s*.*|\s+.+)?|Chapter\s+(?:\d+|[IVXLCDM]+)(?:\s*[:：、.\-—]\s*.*|\s+.+)?|Prologue(?:\s*[:：、.\-—]\s*.*|\s+.+)?|Epilogue(?:\s*[:：、.\-—]\s*.*|\s+.+)?)$/iu;

function runGit(args, options = {}) {
  return execFileSync("git", args, {
    cwd: root,
    stdio: options.quiet ? "ignore" : "inherit",
    ...options,
  });
}

function clean(value) {
  const text = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!text || text === "_No response_" || text === "_No Response_") return "";
  return text;
}

function section(body, label, { toEnd = false } = {}) {
  const text = String(body || "").replace(/\r\n?/g, "\n");
  const marker = `### ${label}\n`;
  const start = text.indexOf(marker);
  if (start === -1) return "";

  const rest = text.slice(start + marker.length).replace(/^\s*\n/, "");
  if (toEnd) return clean(rest);

  const end = rest.search(/\n### /);
  return clean(end === -1 ? rest : rest.slice(0, end));
}

function parseTags(value) {
  return clean(value)
    .split(/[,，、;；]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function chinaDateTime(isoDate) {
  const source = new Date(isoDate || Date.now());
  const shifted = new Date(source.getTime() + 8 * 60 * 60 * 1000);
  return {
    date: shifted.toISOString().slice(0, 10),
    dateTime: `${shifted.toISOString().slice(0, 19)}+08:00`,
  };
}

function normalizeContent(value) {
  const text = clean(value);
  if (!text) return "";

  const hasMarkdown = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s)|\*\*[^*]+\*\*|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|```/u.test(text);
  if (hasMarkdown) return text;

  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n\n");
}

function isChapterHeading(line) {
  const text = String(line || "").trim();
  return text.length > 0 && text.length <= 80 && chapterHeadingPattern.test(text);
}

function splitChapters(value) {
  const text = String(value || "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const headings = [];

  lines.forEach((line, index) => {
    if (isChapterHeading(line)) headings.push({ index, title: line.trim() });
  });

  if (headings.length < 2) return null;

  const chapters = [];
  const preface = lines.slice(0, headings[0].index).join("\n").trim();
  if (preface) chapters.push({ title: "序言", content: preface });

  headings.forEach((heading, index) => {
    const nextIndex = index + 1 < headings.length ? headings[index + 1].index : lines.length;
    const content = lines.slice(heading.index + 1, nextIndex).join("\n").trim();
    if (content) chapters.push({ title: heading.title, content });
  });

  return chapters.length > 1 ? chapters : null;
}

function parseChineseNumber(value) {
  const text = String(value || "").trim();
  if (/^\d+$/.test(text)) return Number(text);

  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
  let total = 0;
  let current = 0;

  for (const character of text) {
    if (character in digits) {
      current = digits[character];
      continue;
    }
    if (character in units) {
      const unit = units[character];
      if (unit === 10000) {
        total = (total + current) * unit;
        current = 0;
      } else {
        total += (current || 1) * unit;
        current = 0;
      }
    }
  }

  const result = total + current;
  return Number.isFinite(result) && result > 0 ? result : 1;
}

function parseBookVolume(rawTitle) {
  const title = String(rawTitle || "").trim();
  const volumePattern = /第\s*([0-9零〇一二三四五六七八九十百千万两]+)\s*卷(?:\s*[-—_:：]?\s*([^-—_:：]+))?/u;
  const match = title.match(volumePattern);

  if (!match) {
    return { bookTitle: title, volumeTitle: "正文", volumeWeight: 1 };
  }

  const volumeTitle = match[0]
    .replace(/\s*[-—_:：]\s*/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const bookTitle = title
    .replace(match[0], "")
    .replace(/^[\s\-—_:：]+|[\s\-—_:：]+$/g, "")
    .trim() || title;

  return {
    bookTitle,
    volumeTitle,
    volumeWeight: parseChineseNumber(match[1]),
  };
}

function yamlString(value) {
  return JSON.stringify(String(value || ""));
}

function createPost({
  dateTime,
  title,
  tags = [],
  summary = "",
  content,
  slug,
  series = "",
  volume = "",
  volumeWeight,
  chapter = "",
  chapterWeight,
  weight,
}) {
  const lines = [
    "---",
    `title: ${yamlString(title)}`,
    `date: ${dateTime}`,
    `slug: ${yamlString(slug)}`,
    `tags: [${tags.map(yamlString).join(", ")}]`,
  ];

  if (series) lines.push(`series: ${yamlString(series)}`);
  if (volume) lines.push(`volume: ${yamlString(volume)}`);
  if (Number.isFinite(volumeWeight)) lines.push(`volume_weight: ${volumeWeight}`);
  if (chapter) lines.push(`chapter: ${yamlString(chapter)}`);
  if (Number.isFinite(chapterWeight)) lines.push(`chapter_weight: ${chapterWeight}`);
  if (Number.isFinite(weight)) lines.push(`weight: ${weight}`);
  if (summary) lines.push(`summary: ${yamlString(summary)}`);
  lines.push("---", "", content.trim(), "");
  return lines.join("\n");
}

function slugify(value) {
  const slug = String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `article-${Date.now()}`;
}

function uniquePostName(baseSlug, date) {
  let slug = baseSlug;
  let fileName = `${date}-${slug}.md`;
  let counter = 2;

  while (fs.existsSync(path.join(postsDir, fileName))) {
    slug = `${baseSlug}-${counter}`;
    fileName = `${date}-${slug}.md`;
    counter += 1;
  }

  return { slug, fileName };
}

function decodeText(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString("utf8");
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(buffer.length - 2);
    for (let index = 2; index + 1 < buffer.length; index += 2) {
      swapped[index - 2] = buffer[index + 1];
      swapped[index - 1] = buffer[index];
    }
    return swapped.toString("utf16le");
  }

  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!utf8.includes("\ufffd")) return utf8;

  try {
    return new TextDecoder("gb18030").decode(buffer);
  } catch {
    return utf8;
  }
}

async function writeSeriesPosts({
  seriesTitle,
  volumeTitle = "正文",
  volumeWeight = 1,
  chapters,
  dateBaseMs,
  slugPrefix,
}) {
  await fsp.mkdir(postsDir, { recursive: true });
  const converted = [];
  const bookSlug = slugPrefix || slugify(seriesTitle);
  const volumeSlug = slugify(volumeTitle);
  const includeVolumeInTitle = volumeTitle && volumeTitle !== "正文";

  for (let index = 0; index < chapters.length; index += 1) {
    const item = chapters[index];
    const content = normalizeContent(item.content);
    if (!content) continue;

    const chapterNumber = index + 1;
    const slug = `${bookSlug}-${volumeSlug}-${String(chapterNumber).padStart(3, "0")}`;
    const fileName = `${slug}.md`;
    const { dateTime } = chinaDateTime(new Date(dateBaseMs + index * 1000).toISOString());
    const title = includeVolumeInTitle
      ? `${seriesTitle} · ${volumeTitle} · ${item.title}`
      : `${seriesTitle} · ${item.title}`;
    const summary = includeVolumeInTitle
      ? `《${seriesTitle}》${volumeTitle}：${item.title}`
      : `《${seriesTitle}》连载：${item.title}`;

    await fsp.writeFile(
      path.join(postsDir, fileName),
      createPost({
        dateTime,
        title,
        tags: ["连载", seriesTitle],
        summary,
        content,
        slug,
        series: seriesTitle,
        volume: volumeTitle,
        volumeWeight,
        chapter: item.title,
        chapterWeight: chapterNumber,
        weight: volumeWeight * 1000 + chapterNumber,
      }),
      "utf8",
    );

    converted.push(`content/posts/${fileName}`);
  }

  return converted;
}
async function convertIssue(event) {
  const issue = event.issue;
  const body = issue.body || "";
  const rawTitle = section(body, "文章标题") || String(issue.title || "").replace(/^\[发布\]\s*/, "").trim();
  const title = rawTitle || `文章 ${issue.number}`;
  const tags = parseTags(section(body, "标签"));
  const summary = section(body, "文章摘要").replace(/\s+/g, " ").trim();
  const content = normalizeContent(section(body, "正文", { toEnd: true }));

  if (!content) throw new Error("Issue 正文为空，未生成文章。");

  const chapters = splitChapters(content);
  if (chapters) {
    const { bookTitle, volumeTitle, volumeWeight } = parseBookVolume(title);
    return writeSeriesPosts({
      seriesTitle: bookTitle,
      volumeTitle,
      volumeWeight,
      chapters,
      dateBaseMs: new Date(issue.created_at).getTime(),
      slugPrefix: `post-${issue.number}-${slugify(volumeTitle)}`,
    });
  }

  const { date, dateTime } = chinaDateTime(issue.created_at);
  const slug = `post-${issue.number}`;
  const fileName = `${date}-${slug}.md`;
  const filePath = path.join(postsDir, fileName);

  await fsp.mkdir(postsDir, { recursive: true });
  await fsp.writeFile(
    filePath,
    createPost({ dateTime, title, tags, summary, content, slug }),
    "utf8",
  );

  return [`content/posts/${fileName}`];
}

async function convertInbox() {
  let entries = [];
  try {
    entries = await fsp.readdir(inboxDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const converted = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".txt")) continue;

    const sourcePath = path.join(inboxDir, entry.name);
    const buffer = await fsp.readFile(sourcePath);
    const rawTitle = path.basename(entry.name, path.extname(entry.name)).trim();
    const title = rawTitle || `文章 ${Date.now()}`;
    const content = normalizeContent(decodeText(buffer));

    if (!content) {
      console.warn(`跳过空文件：${entry.name}`);
      continue;
    }

    const chapters = splitChapters(content);
    if (chapters) {
      const { bookTitle, volumeTitle, volumeWeight } = parseBookVolume(title);
      const created = await writeSeriesPosts({
        seriesTitle: bookTitle,
        volumeTitle,
        volumeWeight,
        chapters,
        dateBaseMs: Date.now(),
      });
      converted.push(...created);
      await fsp.unlink(sourcePath);
      console.log(`已拆分连载：${entry.name} -> ${created.length} 章`);
      continue;
    }

    const { date, dateTime } = chinaDateTime(new Date().toISOString());
    const baseSlug = slugify(title);
    const { slug, fileName } = uniquePostName(baseSlug, date);

    await fsp.mkdir(postsDir, { recursive: true });
    await fsp.writeFile(
      path.join(postsDir, fileName),
      createPost({ dateTime, title, tags: [], content, slug }),
      "utf8",
    );
    await fsp.unlink(sourcePath);

    converted.push(`content/posts/${fileName}`);
    console.log(`已转换 TXT：${entry.name} -> ${fileName}`);
  }

  return converted;
}

async function githubApi(endpoint, init = {}) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  }

  return response.status === 204 ? null : response.json();
}

async function commitChanges(message) {
  if (process.env.DRY_RUN === "1") {
    console.log("DRY_RUN 已启用，跳过 Git 提交和推送。");
    return true;
  }

  runGit(["add", "-A"]);

  try {
    runGit(["diff", "--cached", "--quiet"], { quiet: true });
    console.log("没有需要提交的变化。");
    return false;
  } catch (error) {
    if (error.status !== 1) throw error;
  }

  runGit(["config", "user.name", "github-actions[bot]"]);
  runGit(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  runGit(["commit", "-m", message]);
  runGit(["push", "origin", `HEAD:${branch}`]);
  return true;
}

async function notifyIssue(issueNumber, title) {
  if (!repository || !token) return;

  await githubApi(`/repos/${repository}/issues/${issueNumber}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      body: `文章“${title}”已发布或更新。\n\n网站通常会在 1 到 2 分钟内完成更新。`,
    }),
  });

  await githubApi(`/repos/${repository}/issues/${issueNumber}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state: "closed", state_reason: "completed" }),
  });
}

async function main() {
  await fsp.mkdir(postsDir, { recursive: true });

  const event = eventPath ? JSON.parse(await fsp.readFile(eventPath, "utf8")) : {};
  const converted = [];

  if (eventName === "issues" && event.issue) {
    converted.push(...(await convertIssue(event)));
  } else {
    converted.push(...(await convertInbox()));
  }

  const commitMessage = converted.length
    ? `发布文章（${converted.length} 篇）`
    : "更新博客";
  const changed = await commitChanges(commitMessage);

  if (eventName === "issues" && event.issue) {
    const title = section(event.issue.body || "", "文章标题") ||
      String(event.issue.title || "").replace(/^\[发布\]\s*/, "").trim() ||
      `文章 ${event.issue.number}`;
    if (changed || converted.length) await notifyIssue(event.issue.number, title);
  }

  if (!changed) console.log("网站仍将继续构建和发布。");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});