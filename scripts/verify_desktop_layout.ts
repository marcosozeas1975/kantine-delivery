import { chromium } from 'playwright';

async function verifyLayout() {
  console.log('🚀 INICIANDO VERIFICAÇÃO DE LAYOUT DESKTOP E AUDITORIA DE VIEWPORT\n');

  const browser = await chromium.launch({ headless: true });
  
  // Test both 1720px (user reference) and 1440px (desktop baseline)
  for (const vpWidth of [1720, 1440]) {
    console.log(`\n========================================================================`);
    console.log(`TESTANDO VIEWPORT: ${vpWidth}px x 900px`);
    console.log(`========================================================================`);

    const context = await browser.newContext({
      viewport: { width: vpWidth, height: 900 }
    });
    const page = await context.newPage();

    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    // Wait for the main element and table to render
    await page.waitForSelector('main');
    await page.waitForTimeout(1500);

    const metrics = await page.evaluate(() => {
      const main = document.querySelector('main');
      const table = document.querySelector('table');
      const card = main ? (main.querySelector('.bg-white.rounded-2xl') as HTMLElement) : null;
      
      const viewportWidth = window.innerWidth;
      const mainRect = main ? main.getBoundingClientRect() : null;
      const cardRect = card ? card.getBoundingClientRect() : null;
      const tableRect = table ? table.getBoundingClientRect() : null;

      // Find ID/Status cell and Actions cell
      const firstRow = table ? table.querySelector('tbody tr') : null;
      const idStatusCell = firstRow ? firstRow.querySelector('td:nth-child(1)') : null;
      const actionsCell = firstRow ? firstRow.querySelector('td:last-child') : null;

      const idStatusRect = idStatusCell ? idStatusCell.getBoundingClientRect() : null;
      const actionsRect = actionsCell ? actionsCell.getBoundingClientRect() : null;

      // Header top bar and tabs
      const headerTop = document.querySelector('header > div:first-child');
      const headerTabs = document.querySelector('header > div:last-child');
      const headerTopRect = headerTop ? headerTop.getBoundingClientRect() : null;
      const headerTabsRect = headerTabs ? headerTabs.getBoundingClientRect() : null;

      const hasDocHorizontalScroll = document.documentElement.scrollWidth > window.innerWidth;
      const tableWrapper = table ? table.parentElement : null;
      const hasTableHorizontalScroll = tableWrapper ? tableWrapper.scrollWidth > tableWrapper.clientWidth : false;

      return {
        viewportWidth,
        mainWidth: mainRect ? mainRect.width : 0,
        mainLeft: mainRect ? mainRect.left : 0,
        mainRight: mainRect ? mainRect.right : 0,
        cardWidth: cardRect ? cardRect.width : 0,
        cardLeft: cardRect ? cardRect.left : 0,
        cardRight: cardRect ? cardRect.right : 0,
        tableWidth: tableRect ? tableRect.width : 0,
        tableLeft: tableRect ? tableRect.left : 0,
        tableRight: tableRect ? tableRect.right : 0,
        idStatusLeft: idStatusRect ? idStatusRect.left : 0,
        idStatusRight: idStatusRect ? idStatusRect.right : 0,
        actionsLeft: actionsRect ? actionsRect.left : 0,
        actionsRight: actionsRect ? actionsRect.right : 0,
        headerTopLeft: headerTopRect ? headerTopRect.left : 0,
        headerTopRight: headerTopRect ? headerTopRect.right : 0,
        hasDocHorizontalScroll,
        hasTableHorizontalScroll,
      };
    });

    const contentUsageRatio = metrics.cardWidth / metrics.viewportWidth;
    const mainUsageRatio = metrics.mainWidth / metrics.viewportWidth;

    console.log(`VIEWPORT_WIDTH: ${metrics.viewportWidth}px`);
    console.log(`MAIN_CONTENT_WIDTH: ${metrics.cardWidth.toFixed(1)}px (Card) / ${metrics.mainWidth.toFixed(1)}px (Main)`);
    console.log(`CONTENT_USAGE_RATIO: ${(contentUsageRatio * 100).toFixed(2)}% (Target >= 94%, pref 96-98%)`);
    console.log(`LEFT_CONTENT_X: ${metrics.cardLeft.toFixed(1)}px`);
    console.log(`RIGHT_CONTENT_X: ${metrics.cardRight.toFixed(1)}px`);
    console.log(`TABLE_LEFT: ${metrics.tableLeft.toFixed(1)}px`);
    console.log(`TABLE_RIGHT: ${metrics.tableRight.toFixed(1)}px`);
    console.log(`ACTIONS_LEFT: ${metrics.actionsLeft.toFixed(1)}px`);
    console.log(`ACTIONS_RIGHT: ${metrics.actionsRight.toFixed(1)}px`);
    console.log(`HEADER_TOP_LEFT: ${metrics.headerTopLeft.toFixed(1)}px | HEADER_TOP_RIGHT: ${metrics.headerTopRight.toFixed(1)}px`);
    console.log(`HORIZONTAL_SCROLL_DESKTOP: ${metrics.hasDocHorizontalScroll || metrics.hasTableHorizontalScroll ? 'YES' : 'NO'}`);
    console.log(`LEFT_CLIPPING: ${metrics.tableLeft < 0 || (metrics.idStatusLeft && metrics.idStatusLeft < 0) ? 'YES' : 'NO'}`);
    console.log(`RIGHT_CLIPPING: ${metrics.tableRight > metrics.viewportWidth || (metrics.actionsRight && metrics.actionsRight > metrics.viewportWidth) ? 'YES' : 'NO'}`);

    // Take screenshot
    const screenshotPath = `public/evidence_desktop_${vpWidth}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`📸 Evidência visual capturada: ${screenshotPath}`);

    // Assertions
    if (contentUsageRatio < 0.94) {
      throw new Error(`❌ contentUsageRatio ${(contentUsageRatio * 100).toFixed(2)}% é menor que o mínimo de 94%!`);
    }
    if (metrics.tableRight > metrics.viewportWidth) {
      throw new Error(`❌ Table right (${metrics.tableRight}px) ultrapassa viewport (${metrics.viewportWidth}px)!`);
    }
    if (metrics.actionsRight > metrics.viewportWidth) {
      throw new Error(`❌ Actions right (${metrics.actionsRight}px) ultrapassa viewport (${metrics.viewportWidth}px)!`);
    }
    if (metrics.hasDocHorizontalScroll) {
      throw new Error(`❌ Document possui horizontal scroll em desktop!`);
    }

    console.log(`✅ TESTE PASSOU PARA VIEWPORT ${vpWidth}px`);
    await context.close();
  }

  await browser.close();
  console.log('\n🎉 TODAS AS VERIFICAÇÕES DE LAYOUT CONCLUÍDAS COM SUCESSO!');
}

verifyLayout().catch((err) => {
  console.error('❌ ERRO NA VERIFICAÇÃO:', err);
  process.exit(1);
});
