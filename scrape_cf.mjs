import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'] });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1920, height: 1080 }
});

// Remove webdriver property
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  // Override plugins
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  // Override languages
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
});

const page = await context.newPage();

console.log('=== VISITING HOMEPAGE ===');
await page.goto('https://onisaga.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });

// Wait for CF challenge to potentially resolve
console.log('Waiting for Cloudflare challenge...');
try {
  await page.waitForFunction(() => {
    return !document.title.includes('Just a moment');
  }, { timeout: 15000 });
  console.log('CF challenge passed!');
} catch(e) {
  console.log('CF challenge did not pass within timeout');
}

const finalUrl = page.url();
console.log('Final URL:', finalUrl);

const title = await page.title();
console.log('Page title:', title);

const html = await page.content();
fs.writeFileSync('/tmp/onisaga_after_cf.html', html);
console.log('HTML saved, length:', html.length);

const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 2000));
console.log('Body text preview:', bodyText);

await browser.close();
