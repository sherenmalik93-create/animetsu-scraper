import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
});
const page = await context.newPage();

console.log('=== VISITING HOMEPAGE ===');
await page.goto('https://onisaga.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(5000);

const finalUrl = page.url();
console.log('Final URL:', finalUrl);

const title = await page.title();
console.log('Page title:', title);

const html = await page.content();
fs.writeFileSync('/tmp/onisaga_homepage.html', html);
console.log('Homepage HTML saved, length:', html.length);

const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 1500));
console.log('Body text preview:', bodyText);

await browser.close();
