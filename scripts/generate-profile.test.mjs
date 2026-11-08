import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { test } from 'node:test';
import { parseStats, parseLanguages, renderAssets } from './generate-profile.mjs';

const statsResponse = `<svg>
  <style>@keyframes rankAnimation { from { stroke-dashoffset: 251.32741228718345; } to { stroke-dashoffset: 125.66370614359172; } }</style>
  <text data-testid="stars">1,234</text>
  <text data-testid="commits">42</text>
  <text data-testid="prs">0</text>
  <text data-testid="issues">0</text>
  <text data-testid="contribs">0</text>
  <text data-testid="level-rank-icon">B+</text>
  <text>Total Commits (last year):</text>
</svg>`;

const languagesResponse = `<svg>
  <g><circle cx="5" cy="6" r="5" fill="#f34b7d" />
  <text data-testid="lang-name">C&#43;&#43; 60.00%</text></g>
  <g><circle cx="5" cy="6" r="5" fill="#dea584" />
  <text data-testid="lang-name">Rust 40.00%</text></g>
</svg>`;

test('zero activity is retained while large counts, rank, and period are decoded', () => {
  const parsed = parseStats(statsResponse);
  assert.equal(parsed.stars, 1234);
  assert.equal(parsed.prs, 0);
  assert.equal(parsed.contribs, 0);
  assert.equal(parsed.rank, 'B+');
  assert.equal(parsed.rankProgress, 0.5);
  assert.equal(parsed.commitLabel, 'Total Commits (last year):');
});

test('HTTP-200 error cards and incomplete stats are rejected instead of becoming zeroes', () => {
  assert.throws(() => parseStats('<svg><text>Something went wrong: rate limit</text></svg>'), /missing/);
  assert.throws(() => parseStats(statsResponse.replace('<text data-testid="stars">1,234</text>', '')), /missing stars/);
  assert.throws(() => parseStats(statsResponse.replace('>42<', '>NaN<')), /Invalid commits/);
  assert.throws(() => parseStats(statsResponse.replace('>B+<', '>unknown<')), /Invalid rank/);
});

test('language percentages and encoded names are validated', () => {
  const parsed = parseLanguages(languagesResponse);
  assert.deepEqual(parsed.map(item => [item.name, item.percent]), [['C++', 60], ['Rust', 40]]);
  assert.throws(() => parseLanguages(languagesResponse.replace('40.00%', '10.00%')), /sum/);
  assert.throws(() => parseLanguages('<svg><text>Rate limit exceeded</text></svg>'), /Invalid language/);
});

test('both themes have equally sized statistics cards and escape upstream text', () => {
  const stats = parseStats(statsResponse);
  stats.commitLabel = 'Commits <unsafe> & "quoted":';
  const languages = parseLanguages(languagesResponse);
  languages[0].name = '<script>alert(1)</script>';
  const files = renderAssets({ stats, languages });
  assert.equal(Object.keys(files).length, 24);
  for (const mode of ['light', 'dark']) {
    for (const name of ['stats', 'languages']) {
      const svg = files[`${name}-${mode}.svg`];
      assert.match(svg, /width="800" height="160" viewBox="0 0 800 160"/);
      assert.doesNotMatch(svg, /<script>|<unsafe>/);
      assert.match(svg, /<title id="title">/);
      assert.match(files[`${name}-mobile-${mode}.svg`], /width="320" height="160" viewBox="0 0 320 160"/);
    }
    assert.match(files[`stats-${mode}.svg`], /&lt;unsafe&gt;/);
    assert.match(files[`languages-${mode}.svg`], /&lt;script&gt;/);
  }
  assert.match(files['stats-light.svg'], /fill="#fff3f7"/);
  assert.match(files['stats-dark.svg'], /fill="#141321"/);
});

test('README includes both theme variants and every referenced image exists', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const pictures = [...readme.matchAll(/<picture>([\s\S]*?)<\/picture>/g)];
  assert.equal(pictures.length, 6);
  for (const [, picture] of pictures) {
    assert.match(picture, /prefers-color-scheme: dark/);
    assert.match(picture, /prefers-color-scheme: light/);
    assert.match(picture, /max-width: 600px/);
    assert.match(picture, /mobile-dark\.svg/);
    assert.match(picture, /mobile-light\.svg/);
    assert.match(picture, /<img[^>]+alt="[^"]+"/);
  }
  const paths = new Set([...readme.matchAll(/(?:src|srcset)="\.\/(assets\/[^"\s]+)"/g)].map(match => match[1]));
  assert.equal(paths.size, 24);
  for (const path of paths) await access(new URL(`../${path}`, import.meta.url));
});
