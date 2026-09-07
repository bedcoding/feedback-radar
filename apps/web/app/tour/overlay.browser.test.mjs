import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Render the real tour and filter controls in a synthetic browser fixture.
// No application server, database, environment file or external request is used.
const dir = fileURLToPath(new URL('.', import.meta.url));
const navigationMock = `
  import { useSyncExternalStore } from 'react';
  const subscribe = callback => {
    window.addEventListener('fixture-navigation', callback);
    return () => window.removeEventListener('fixture-navigation', callback);
  };
  const navigate = href => {
    window.history.replaceState(null, '', href);
    window.dispatchEvent(new Event('fixture-navigation'));
  };
  const router = { replace: navigate, push: navigate };
  export const useRouter = () => router;
  export const usePathname = () => useSyncExternalStore(subscribe, () => location.pathname);
  export const useSearchParams = () => new URLSearchParams(useSyncExternalStore(subscribe, () => location.search));
`;
const entry = `
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { useSearchParams } from 'next/navigation';
  import { TourOverlay } from './TourOverlay';
  import { buildTourSteps } from './steps';
  import { ChannelFilters } from '../_channels/ChannelFilters';
  const steps = buildTourSteps('Example', { live: true });
  function Fixture() {
    const tab = useSearchParams().get('tab') ?? 'brief2';
    const section = (target, children) => <section key={target} data-tour={target} style={{padding:16, margin:16, border:'1px solid #ccc'}}>{children ?? target}</section>;
    return <>
      <main>
        {tab === 'brief2' && section('briefing', <>
          {section('periods', <input type="date" aria-label="Fixture date" defaultValue="2026-01-01" />)}
          {section('services', 'Service A')}
          {window.fixtureCountry && section('countries', 'Country card')}
          <article tabIndex={0} data-scrollable="true" aria-label="Scrollable card" style={{height:70, overflow:'auto'}}><div style={{height:700}}>Scrollable content</div></article>
        </>)}
        {tab === 'channels' && <>
          {section('categories', <ChannelFilters menus={[{id:'topic', label:'분류', allHref:'#all', options:[{key:'a',label:'A',count:1,href:'#a'},{key:'b',label:'B',count:2,href:'#b'}]}]}/>)}
          {section('items', 'Post list')}{section('irrelevant-row', 'Unrelated posts')}
        </>}
        {tab === 'collect' && <>{section('scheduler')}{section('progress')}</>}
        {tab === 'settings' && <>{section('prompt')}{section('tagger')}{section('collect')}</>}
      </main>
      <TourOverlay steps={steps}/>
    </>;
  }
  createRoot(document.getElementById('root')).render(<Fixture/>);
`;

const bundle = await build({
  stdin: { contents: entry, resolveDir: dir, sourcefile: 'fixture.tsx', loader: 'tsx' },
  bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"test"' },
  plugins: [{ name: 'fixture-boundaries', setup(builder) {
    builder.onResolve({ filter: /^next\/(navigation|link)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
      contents: args.path === 'next/navigation' ? navigationMock : `import React from 'react'; export default function Link(props) { return React.createElement('a', props); }`,
      loader: 'js', resolveDir: dir,
    }));
    builder.onLoad({ filter: /\.css$/ }, () => ({ contents: 'export default {};', loader: 'js' }));
  } }],
});

test('tour browser interactions on synthetic data', async t => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="root"></div>' }));
  const counter = () => page.locator('.tour-step-no').innerText();
  const next = () => page.locator('.tour-actions .primary').click();
  async function open(country = false, sourceStep = 1, tab = 'brief2') {
    await page.goto(`http://tour.test/tour?tab=${tab}&tstep=${sourceStep}`);
    await page.evaluate(value => { window.fixtureCountry = value; }, country);
    await page.addStyleTag({ content: `:root {--panel:white;--text:#192238;--muted:#607085;--border:#dce2ea;--accent:#192238;--accent-fg:white;--link:#3564b1;--accent-line:#99aacc;--bg:#f5f6f8} body{margin:0;font-family:Arial,sans-serif} *{box-sizing:border-box}` + readFileSync(new URL('./tour.css', import.meta.url), 'utf8') });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.waitForSelector('.tour-step-no');
  }
  try {
    await t.test('missing country step is omitted in both directions, with matching dots', async () => {
      await open();
      await next(); await next();
      const before = await counter();
      await next();
      assert.match(await page.locator('.tour-card h3').innerText(), /쓰인 날/);
      await page.getByRole('button', { name: '이전', exact: true }).click();
      assert.equal(await counter(), before);
      const [, total] = (await counter()).split(' / ');
      assert.equal(await page.locator('.tour-dots .dot').count(), Number(total));
      await open(false, 4);
      assert.match(await page.locator('.tour-card h3').innerText(), /쓰인 날/);
    });
    await t.test('country step highlights the card when present', async () => {
      await open(true, 4);
      assert.match(await page.locator('.tour-card h3').innerText(), /나라마다/);
      assert.equal(await page.locator('.tour-spot').count(), 1);
    });
    await t.test('Enter activates Previous and Dashboard instead of advancing', async () => {
      await open(true, 3);
      await page.getByRole('button', { name: '이전', exact: true }).focus();
      await page.keyboard.press('Enter');
      assert.match(await counter(), /^2 \/ /);
      await page.getByRole('button', { name: '대시보드', exact: true }).focus();
      await page.keyboard.press('Enter');
      assert.equal(new URL(page.url()).pathname, '/');
    });
    await t.test('date and scroll-card keys do not advance; Escape closes only an open menu', async () => {
      await open(true, 5);
      const before = await counter();
      await page.getByLabel('Fixture date').focus();
      await page.keyboard.press('ArrowLeft');
      assert.equal(await counter(), before);
      await page.getByLabel('Scrollable card').focus();
      await page.keyboard.press('Space');
      assert.equal(await counter(), before);
      await open(true, 9, 'channels');
      await page.getByRole('button', { name: '분류', exact: true }).click({ force: true });
      assert.equal(await page.getByRole('menu').count(), 1);
      const menuStep = await counter();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('[role="menu"]'));
      assert.equal(new URL(page.url()).pathname, '/tour');
      assert.equal(await counter(), menuStep);
      await page.keyboard.press('Escape');
      assert.equal(new URL(page.url()).pathname, '/');
    });
    await t.test('tab notice, full mouse navigation, card bounds and finish labels', async () => {
      for (const [width, height] of [[1440, 900], [1280, 720]]) {
        await page.setViewportSize({ width, height });
        await open();
        let sawChannelNotice = false;
        for (let i = 0; i < 30; i++) {
          const text = await counter();
          const [position, total] = text.split(' / ').map(Number);
          const notice = await page.locator('.tour-next-tab').allTextContents();
          if (notice.some(value => value.includes('채널별 탭'))) sawChannelNotice = true;
          const box = await page.locator('.tour-card').boundingBox();
          assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= height, 'card fits viewport');
          if (position === total) {
            assert.equal(await page.getByRole('button', { name: '끝내기', exact: true }).count(), 2);
            await page.locator('.tour-bar').getByRole('button', { name: '끝내기', exact: true }).click();
            assert.equal(new URL(page.url()).pathname, '/');
            break;
          }
          await next();
          assert.notEqual(await counter(), text);
        }
        assert.ok(sawChannelNotice);
      }
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
