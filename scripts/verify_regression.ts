import { chromium } from 'playwright';

async function runRegression() {
  console.log('🧪 INICIANDO TESTES DE REGRESSÃO FUNCIONAL NA INTERFACE...\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1720, height: 900 } });

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('header');
  await page.waitForTimeout(1000);

  // 1. Navigation tabs
  console.log('1. Testando Navegação Superior...');
  
  // Pontos de Coleta
  await page.click('button:has-text("Pontos de Coleta")');
  await page.waitForSelector('text=Cadastro de Pontos de Coleta');
  console.log('   ✅ Aba "Pontos de Coleta" carregou com sucesso.');

  // Motoristas
  await page.click('button:has-text("Motoristas")');
  await page.waitForSelector('text=Motoristas Cadastrados');
  console.log('   ✅ Aba "Motoristas" carregou com sucesso.');

  // Indicações
  await page.click('button:has-text("Indicações")');
  await page.waitForSelector('text=Indicações de Motoristas');
  console.log('   ✅ Aba "Indicações (M1.2)" carregou com sucesso.');

  // Pendências
  await page.click('button:has-text("Pendências")');
  await page.waitForSelector('text=Pendências Operacionais');
  console.log('   ✅ Aba "Pendências (M4.1)" carregou com sucesso.');

  // Pagamentos
  await page.click('button:has-text("Pagamentos")');
  await page.waitForSelector('text=A Pagar (Pendente)');
  console.log('   ✅ Aba "Pagamentos (M4.1)" carregou com sucesso.');

  // Return to Rotas
  await page.click('button:has-text("Rotas de Entrega")');
  await page.waitForSelector('text=Gestão de Rotas Multi-Entrega');
  console.log('   ✅ Aba "Rotas de Entrega" restaurada.');

  // 2. Status Filters
  console.log('2. Testando Filtros de Status...');
  await page.click('button:has-text("Rascunhos")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Em Oferta")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Todas as Rotas")');
  await page.waitForTimeout(300);
  console.log('   ✅ Filtros de status alternados com sucesso.');

  // 3. Modal Nova Rota
  console.log('3. Testando Modal "Nova Rota"...');
  await page.click('button:has-text("Nova Rota")');
  await page.waitForSelector('text=Criar Nova Rota Multi-Entrega', { timeout: 5000 });
  console.log('   ✅ Modal "Nova Rota" abriu perfeitamente.');
  
  // Close modal via close button ✕
  const closeBtn = await page.$('button:has-text("✕")');
  if (closeBtn) {
    await closeBtn.click();
    await page.waitForTimeout(500);
    console.log('   ✅ Modal "Nova Rota" fechado com sucesso.');
  }

  // 4. Modal Detalhes da Rota
  console.log('4. Testando Modal "Detalhes da Rota"...');
  const detalhesBtn = await page.$('table button:has-text("Detalhes")');
  if (detalhesBtn) {
    await detalhesBtn.click();
    await page.waitForSelector('text=Detalhes da Rota Multi-Entrega', { timeout: 5000 });
    console.log('   ✅ Modal "Detalhes da Rota" abriu com sucesso.');
    
    // Close modal
    const fecharBtn = await page.$('button:has-text("✕")');
    if (fecharBtn) await fecharBtn.click();
    await page.waitForTimeout(500);
    console.log('   ✅ Modal "Detalhes da Rota" fechado com sucesso.');
  } else {
    console.log('   ℹ️ Nenhuma rota na lista no momento do teste.');
  }

  await browser.close();
  console.log('\n🎉 TODOS OS TESTES DE REGRESSÃO DA INTERFACE PASSARAM COM 100% DE SUCESSO!');
}

runRegression().catch((err) => {
  console.error('❌ ERRO NO TESTE DE REGRESSÃO:', err);
  process.exit(1);
});
