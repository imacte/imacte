import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const username = 'imacte';
const service = 'https://github-stats-extended.vercel.app';
const palettes = {
  light: { bg: '#fff3f7', text: '#884460', muted: '#775566', title: '#c32969', icon: '#b84b78', border: '#edbfd1', heading: '#3e2632', badge: '#fce7f0', badgeText: '#a92e60', project: '#fff9fc' },
  dark: { bg: '#141321', text: '#a9fef7', muted: '#b6b5c4', title: '#fe428e', icon: '#f8d847', border: '#8b8b99', heading: '#e6edf3', badge: '#343b45', badgeText: '#ffffff', project: '#0d1117' },
};
const projects = [
  { name: 'yumi', platform: 'Rust / Android', lines: ['Android CPU 调度控制器。结合 eBPF 监控、帧感知调度与 WebUI，', '探索性能与功耗的平衡。'], mobileLines: ['Android CPU 调度控制器，结合 eBPF', '监控、帧感知调度与 WebUI，探索', '性能与功耗的平衡。'], tags: 'eBPF · Frame-aware scheduling · WebUI' },
  { name: 'RoxaZip', platform: 'C++ / Windows / Linux', lines: ['基于 7-Zip 与 7-Zip ZS 的压缩工具。', '扩展编解码器，提供暗色模式与资源管理器集成。'], mobileLines: ['基于 7-Zip 与 7-Zip ZS 的压缩工具。', '扩展编解码器，提供暗色模式与', '资源管理器集成。'], tags: 'Archive manager · Codecs · Desktop integration' },
  { name: 'RsRazer', platform: 'Rust / Windows', lines: ['Rust 编写的 Windows 雷蛇设备控制工具，', '支持灯效、DPI、宏与 Chroma 集成。'], mobileLines: ['Rust 编写的 Windows 雷蛇设备', '控制工具，支持灯效、DPI、宏', '与 Chroma 集成。'], tags: 'Device control · Lighting · Native app' },
];

export function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}

function decodeXml(value) {
  return value.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => String.fromCodePoint(code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[name]);
}

function textById(svg, id) {
  const match = svg.match(new RegExp(`<text\\b[^>]*\\bdata-testid=["']${id}["'][^>]*>([\\s\\S]*?)<\\/text>`));
  if (!match) throw new Error(`Statistics response is missing ${id}; existing cards were not changed.`);
  return decodeXml(match[1]).trim();
}

export function parseStats(svg) {
  const stats = {};
  for (const id of ['stars', 'commits', 'prs', 'issues', 'contribs']) {
    const value = textById(svg, id).replace(/,/g, '');
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`Invalid ${id} count.`);
    stats[id] = Number(value);
  }
  stats.rank = textById(svg, 'level-rank-icon');
  if (!/^(S|A\+|A|A-|B\+|B|B-|C\+|C)$/.test(stats.rank)) throw new Error('Invalid rank.');
  const offset = svg.match(/\bto\s*\{[^}]*stroke-dashoffset:\s*([\d.]+)/);
  if (!offset) throw new Error('Rank progress is missing.');
  stats.rankProgress = Number((1 - Number(offset[1]) / (2 * Math.PI * 40)).toFixed(6));
  if (!Number.isFinite(stats.rankProgress) || stats.rankProgress < 0 || stats.rankProgress > 1) throw new Error('Invalid rank progress.');
  const label = svg.match(/<text\b[^>]*>\s*(Total Commits[^<]+)<\/text>/);
  if (!label) throw new Error('Commit period is missing.');
  stats.commitLabel = decodeXml(label[1]).trim();
  return stats;
}

export function parseLanguages(svg) {
  const items = [];
  const pattern = /<circle\b[^>]*fill="(#[0-9a-f]{6})"[^>]*\/>\s*<text\b[^>]*data-testid="lang-name"[^>]*>([\s\S]*?)<\/text>/gi;
  for (const match of svg.matchAll(pattern)) {
    const label = decodeXml(match[2]).trim().match(/^(.+?)\s+(\d+(?:\.\d+)?)%$/);
    if (!label) throw new Error('Invalid language label.');
    items.push({ name: label[1], percent: Number(label[2]), color: match[1] });
  }
  if (!items.length || items.length > 6 || items.some(item => item.percent < 0 || item.percent > 100)) throw new Error('Invalid language response.');
  const total = items.reduce((sum, item) => sum + item.percent, 0);
  if (Math.abs(total - 100) > 0.1) throw new Error('Language percentages do not sum to 100%.');
  return items;
}

async function fetchSvg(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { Accept: 'image/svg+xml' }, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Statistics service returned HTTP ${response.status}.`);
      const body = await response.text();
      if (!body.includes('<svg') || body.length > 1000000) throw new Error('Invalid statistics response.');
      return body;
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

function svgDocument(height, title, description, body, width = 800) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">${escapeXml(title)}</title>
<desc id="desc">${escapeXml(description)}</desc>
<style>text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',Arial,sans-serif} .mono{font-family:Consolas,monospace}</style>
${body}
</svg>\n`;
}

const text = (x, y, value, fill, size = 14, extra = '') => `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" ${extra}>${escapeXml(value)}</text>`;
const frame = (p, height, background = p.bg, width = 800) => `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="6" fill="${background}" stroke="${p.border}"/>`;

function statsIcon(type, x, y, color) {
  const shapes = {
    stars: '<path d="m8 1 2.1 4.3 4.8.7-3.5 3.4.8 4.8L8 12l-4.2 2.2.8-4.8L1.1 6l4.8-.7Z"/>',
    commits: '<circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/>',
    prs: '<circle cx="4" cy="3" r="2"/><circle cx="4" cy="13" r="2"/><circle cx="12" cy="13" r="2"/><path d="M4 5v6m5-8h1a2 2 0 0 1 2 2v6M9 1 7 3l2 2"/>',
    issues: '<circle cx="8" cy="8" r="6"/><path d="M8 4v5m0 2v1"/>',
    contribs: '<path d="M8 3C5 1 3 1 1 2v11c2-1 4-1 7 1 3-2 5-2 7-1V2c-2-1-4-1-7 1Zm0 0v11"/>',
  };
  return `<g transform="translate(${x} ${y})" stroke="${color}" fill="none" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${shapes[type]}</g>`;
}

export function renderStats(stats, p, mobile = false) {
  const width = mobile ? 320 : 800, cx = mobile ? 280 : 735, radius = mobile ? 25 : 34;
  const labels = [['stars', mobile ? 'Stars:' : 'Total Stars Earned:'], ['commits', mobile ? stats.commitLabel.replace('Total ', '') : stats.commitLabel], ['prs', mobile ? 'Pull requests:' : 'Total PRs:'], ['issues', mobile ? 'Issues:' : 'Total Issues:'], ['contribs', mobile ? 'Contributed repos (year):' : 'Contributed to (last year):']];
  const rows = labels.map(([id, label], index) => {
    const y = 56 + index * 20;
    return statsIcon(id, mobile ? 12 : 22, y - 12, p.icon) + text(mobile ? 34 : 48, y, label, p.text, mobile ? 11.5 : 13, 'font-weight="600"') + text(mobile ? 240 : 635, y, stats[id].toLocaleString('en-US'), p.text, 13, `font-weight="600"${mobile ? ' text-anchor="end"' : ''}`);
  }).join('\n');
  const circumference = 2 * Math.PI * radius;
  return svgDocument(160, `${username}'s GitHub Stats`, labels.map(([id, label]) => `${label} ${stats[id]}`).join(' · ') + ` · Rank ${stats.rank}`, frame(p, 160, p.bg, width)
    + text(mobile ? 12 : 22, 29, `${username}'s GitHub Stats`, p.title, mobile ? 17 : 18, 'font-weight="600"') + rows
    + `<circle cx="${cx}" cy="92" r="${radius}" fill="none" stroke="${p.title}" stroke-width="5" opacity="0.2"/>
<circle cx="${cx}" cy="92" r="${radius}" fill="none" stroke="${p.title}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${circumference.toFixed(3)}" stroke-dashoffset="${(circumference * (1 - stats.rankProgress)).toFixed(3)}" transform="rotate(-90 ${cx} 92)" opacity="0.85"/>`
    + text(cx, 100, stats.rank, p.text, mobile ? 23 : 26, 'text-anchor="middle" font-weight="700"'), width);
}

export function renderLanguages(languages, p, mobile = false) {
  const width = mobile ? 320 : 800, margin = mobile ? 14 : 22, barWidth = width - margin * 2;
  const columns = mobile ? 2 : 3;
  const total = languages.reduce((sum, item) => sum + item.percent, 0);
  let x = margin;
  const segments = languages.map(item => {
    const width = barWidth * item.percent / total;
    const segment = `<rect x="${x.toFixed(3)}" y="57" width="${width.toFixed(3)}" height="8" fill="${item.color}"/>`;
    x += width;
    return segment;
  }).join('');
  const legend = languages.map((item, index) => {
    const lx = margin + 5 + (index % columns) * (mobile ? 146 : 254), ly = (mobile ? 89 : 99) + Math.floor(index / columns) * (mobile ? 26 : 30);
    return `<circle cx="${lx}" cy="${ly - 4}" r="4.5" fill="${item.color}"/>` + text(lx + 10, ly, `${item.name} ${item.percent.toFixed(2)}%`, p.muted, mobile ? 12 : 13);
  }).join('\n');
  return svgDocument(160, 'Most Used Languages', languages.map(item => `${item.name}: ${item.percent}%`).join(' · '), frame(p, 160, p.bg, width)
    + text(margin, 29, 'Most Used Languages', p.title, mobile ? 17 : 18, 'font-weight="600"')
    + `<defs><clipPath id="language-bar"><rect x="${margin}" y="57" width="${barWidth}" height="8" rx="4"/></clipPath></defs>`
    + `<g clip-path="url(#language-bar)">${segments}</g>` + legend, width);
}

function renderHeader(p, mode, mobile = false) {
  const center = mobile ? 160 : 400;
  const badges = [['RUST', 248, 68, '#803d2d'], ['C++', 324, 54, '#1d527a'], ['ANDROID', 386, 88, '#21654e'], ['eBPF', 482, 70, '#663a86']];
  return svgDocument(174, "Hi, I'm imacte", '从系统底层，到日常体验。Systems, native apps & everyday tools. Rust · C++ · Android · eBPF.',
    `<text x="${center}" y="46" text-anchor="middle" font-size="${mobile ? 28 : 36}" font-weight="600" fill="${p.heading}">Hi 👋, I'm <tspan fill="${p.title}">${username}</tspan></text>`
    + text(center, 83, '从系统底层，到日常体验。', p.text, mobile ? 15 : 17, 'text-anchor="middle"')
    + text(center, 110, 'Systems, native apps & everyday tools.', p.muted, mobile ? 13 : 14, 'text-anchor="middle"')
    + badges.map(([label, x, width, darkBg]) => {x -= mobile ? 240 : 0;return `<rect x="${x}" y="135" width="${width}" height="26" rx="3" fill="${mode === 'dark' ? darkBg : p.badge}"/>` + text(x + width / 2, 152, label, p.badgeText, 11, 'text-anchor="middle" font-weight="600" class="mono"');}).join(''), mobile ? 320 : 800);
}

function renderProject(project, p, mobile = false) {
  if (mobile) return svgDocument(160, project.name, project.lines.join('') + ' ' + project.platform,
    frame(p, 160, p.project, 320) + text(16, 29, project.name, p.title, 18, 'font-weight="600"')
    + text(16, 52, project.platform, p.muted, 12, 'class="mono"')
    + project.mobileLines.map((line, index) => text(16, 83 + index * 22, line, p.heading, 13)).join(''), 320);
  return svgDocument(128, project.name, project.lines.join('') + ' ' + project.platform,
    frame(p, 128, p.project) + text(24, 29, project.name, p.title, 18, 'font-weight="600"')
    + text(776, 29, project.platform, p.muted, 12, 'text-anchor="end" class="mono"')
    + project.lines.map((line, index) => text(24, 59 + index * 21, line, p.heading, 14)).join('')
    + text(24, 108, project.tags, p.muted, 12));
}

export function renderAssets(snapshot) {
  const files = {};
  for (const [mode, p] of Object.entries(palettes)) {
    for (const mobile of [false, true]) {
      const suffix = `${mobile ? 'mobile-' : ''}${mode}.svg`;
      files[`header-${suffix}`] = renderHeader(p, mode, mobile);
      files[`stats-${suffix}`] = renderStats(snapshot.stats, p, mobile);
      files[`languages-${suffix}`] = renderLanguages(snapshot.languages, p, mobile);
      for (const project of projects) files[`project-${project.name.toLowerCase()}-${suffix}`] = renderProject(project, p, mobile);
    }
  }
  return files;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--refresh')) throw new Error('Usage: node scripts/generate-profile.mjs [--refresh]');
  const snapshotPath = resolve(root, 'data/stats.json');
  let snapshot;
  if (args.includes('--refresh')) {
    const statsUrl = `${service}/api?username=${username}&show_icons=true&disable_animations=true&number_format=long`;
    const languagesUrl = `${service}/api/top-langs/?username=${username}&layout=compact&langs_count=6`;
    const [statsSvg, languagesSvg] = await Promise.all([fetchSvg(statsUrl), fetchSvg(languagesUrl)]);
    snapshot = { username, fetchedAt: new Date().toISOString(), sources: { stats: statsUrl, languages: languagesUrl }, stats: parseStats(statsSvg), languages: parseLanguages(languagesSvg) };
  } else {
    snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
  }
  const assets = renderAssets(snapshot);
  await mkdir(resolve(root, 'assets'), { recursive: true });
  await mkdir(dirname(snapshotPath), { recursive: true });
  for (const [name, svg] of Object.entries(assets)) await writeFile(resolve(root, 'assets', name), svg, 'utf8');
  if (args.includes('--refresh')) await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  console.log(`Generated ${Object.keys(assets).length} SVG assets for ${username}${args.includes('--refresh') ? ' with refreshed statistics' : ''}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
