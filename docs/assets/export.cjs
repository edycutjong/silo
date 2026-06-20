const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const assets = [
  { file: 'generate-og-image.html', width: 1200, height: 630, output: 'og-image.png' },
  { file: 'generate-youtube-thumbnail.html', width: 1280, height: 720, output: 'youtube-thumbnail.png' },
  { file: 'generate-devpost-thumbnail.html', width: 1200, height: 800, output: 'devpost-thumbnail.png' },
  { file: 'generate-devpost-gallery.html', width: 1200, height: 800, output: 'devpost-gallery.png' },
  { file: 'generate-readme-hero.html', width: 1280, height: 640, output: 'readme-hero.png' },
];

(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ deviceScaleFactor: 2 });
    const page = await context.newPage();

    for (const asset of assets) {
      const start = Date.now();
      await page.setViewportSize({ width: asset.width, height: asset.height });
      
      const fileUrl = `file://${path.resolve(__dirname, asset.file)}`;
      await page.goto(fileUrl);
      
      // Await until custom Google fonts are fully loaded
      await page.evaluate(() => document.fonts.ready);
      
      // Take the screenshot with animations disabled to prevent frozen frames
      await page.screenshot({
        path: path.resolve(__dirname, asset.output),
        fullPage: false,
        animations: 'disabled',
      });
      
      console.log(`✓ ${asset.output} (${Date.now() - start}ms)`);
    }

    // Rasterize icon.svg
    const svgPath = path.resolve(__dirname, 'icon.svg');
    if (fs.existsSync(svgPath)) {
      const svg = fs.readFileSync(svgPath, 'utf-8');
      for (const size of [512, 1024]) {
        const start = Date.now();
        await page.setViewportSize({ width: size, height: size });
        
        // Setup direct HTML view of SVG for perfect screenshot rasterization
        await page.setContent(`<style>html,body{margin:0;padding:0;overflow:hidden;}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
        await page.evaluate(() => document.fonts.ready);
        
        await page.screenshot({
          path: path.resolve(__dirname, `icon-${size}.png`),
          omitBackground: true,
          animations: 'disabled',
        });
        
        console.log(`✓ icon-${size}.png (${Date.now() - start}ms)`);
      }
    } else {
      console.error('Error: icon.svg not found!');
    }
  } catch (error) {
    console.error('Export failed:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
