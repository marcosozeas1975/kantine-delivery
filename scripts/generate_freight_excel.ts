import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import {
  MOTO_RADIUS_TARIFF_TABLE,
  CAR_RADIUS_TARIFF_TABLE,
  CAR_RADIUS_DISPLAY_TIERS,
  calculateHaversineDistanceKm,
  PICKUP_PRESETS,
} from '../src/server/freightEngine.ts';
import type { ExtendedNeighborhood } from '../src/shared/freightNeighborhoods.ts';
import {
  UBERLANDIA_ADDITIONAL_NEIGHBORHOODS,
  getAllMappedNeighborhoods,
  resolveMotoTariff,
  resolveCarTariff,
} from '../src/shared/freightNeighborhoods.ts';

export type { ExtendedNeighborhood };
export {
  UBERLANDIA_ADDITIONAL_NEIGHBORHOODS,
  getAllMappedNeighborhoods,
  resolveMotoTariff,
  resolveCarTariff,
};

// Helper para garantir que todo font tenha name: 'Calibri' obrigatório pelo Excel
function font(opts: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> {
  return {
    name: 'Calibri',
    size: 10,
    ...opts,
  };
}

export async function generateFreightExcelWorkbook(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Kantine Gastronomia';
  workbook.lastModifiedBy = 'Kantine Delivery & Logística';
  workbook.created = new Date();
  workbook.modified = new Date();

  const neighborhoods = getAllMappedNeighborhoods();
  const matrizCoords = PICKUP_PRESETS.MATRIZ.coords;
  const vinhedosCoords = PICKUP_PRESETS.VINHEDOS.coords;

  // ==========================================
  // ABA 1: RESUMO & DIRETRIZES
  // ==========================================
  const sheetSummary = workbook.addWorksheet('Resumo & Diretrizes', {
    properties: { tabColor: { argb: 'FFD97706' } }, // Amber
    views: [{ showGridLines: true }],
  });

  sheetSummary.columns = [
    { width: 4 },
    { width: 34 },
    { width: 50 },
    { width: 26 },
    { width: 30 },
  ];

  // Header Kantine
  sheetSummary.mergeCells('B2:E2');
  const titleCell = sheetSummary.getCell('B2');
  titleCell.value = '🍰 KANTINE GASTRONOMIA — TABELA OFICIAL DE FRETES & LOGÍSTICA';
  titleCell.font = font({ size: 15, bold: true, color: { argb: 'FFFFFFFF' } });
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92400E' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheetSummary.getRow(2).height = 36;

  sheetSummary.mergeCells('B3:E3');
  const subTitleCell = sheetSummary.getCell('B3');
  subTitleCell.value = 'Sistema Unificado de Fretes por Raio Geodésico (Carro e Moto) • Uberlândia/MG';
  subTitleCell.font = font({ size: 10, italic: true, color: { argb: 'FF78350F' } });
  subTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  subTitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheetSummary.getRow(3).height = 24;

  // KPIs
  sheetSummary.getCell('B5').value = 'MÉTRICAS & DIRETRIZES DO MOTOR DE FRETES';
  sheetSummary.getCell('B5').font = font({ bold: true, size: 11, color: { argb: 'FF1F2937' } });

  const kpis = [
    ['Total de Bairros e Setores Mapeados', `${neighborhoods.length} localidades mapeadas com coordenadas`],
    ['Bairros da Tabela Original', '70 bairros oficiais Kantine'],
    ['Novos Bairros Mapeados & Sugeridos', '40 bairros/setores novos (Destacados em VERDE com tag ✨ NOVO MAPEADO)'],
    ['Base Geográfica Principal (Matriz)', 'Daniel Fonseca — Av. Getúlio Vargas, 1846'],
    ['Base Geográfica Secundária (Vinhedos)', 'Karaíba — Rua José Elias, 71'],
    ['Modelo de Precificação Carro', 'Por Raio Geodésico Haversine (1 km a 20 km: R$ 20,00 a R$ 44,00) — Regra de bairros removida'],
    ['Modelo de Precificação Moto', 'Por Raio Geodésico Haversine (1 km a 20 km: R$ 10,50 a R$ 31,00)'],
    ['Divisão Financeira Padrão', '90% Entregador Parceiro (Preço Final - 10%) / 10% Taxa de Gestão Kantine'],
    ['Regra Condomínio Horizontal', '+20% sobre a tarifa-base da parada (exclusivo para modalidade Carro)'],
    ['Regra de Agrupamento (Rotas 2+ paradas)', '70% do frete integral por parada agrupada (fator 0.70)'],
  ];

  let rIdx = 6;
  for (const [k, v] of kpis) {
    const kCell = sheetSummary.getCell(`B${rIdx}`);
    kCell.value = k;
    kCell.font = font({ bold: true, size: 10, color: { argb: 'FF374151' } });
    kCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    kCell.border = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };

    sheetSummary.mergeCells(`C${rIdx}:E${rIdx}`);
    const vCell = sheetSummary.getCell(`C${rIdx}`);
    vCell.value = v;
    vCell.font = font({ size: 10, color: { argb: 'FF111827' } });
    vCell.border = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };
    sheetSummary.getRow(rIdx).height = 20;
    rIdx++;
  }

  // Legenda de Cores
  rIdx += 2;
  sheetSummary.getCell(`B${rIdx}`).value = 'LEGENDA DE ABAS DA PLANILHA';
  sheetSummary.getCell(`B${rIdx}`).font = font({ bold: true, size: 11, color: { argb: 'FF1F2937' } });
  rIdx++;

  const sheetDescriptions = [
    ['🚗 Tabela Carro por Raio', 'Tabela oficial de Carro por distância (1 a 20 km) conforme nova tabela (Preço Final: R$ 20 a R$ 44; Motorista -10%)'],
    ['🏍️ Tabela Moto por Raio', 'Tabela oficial de Moto por raio geodésico (1 a 20 km: R$ 10,50 a R$ 31,00)'],
    ['🗺️ Tabela por Bairros (110)', '110 bairros de Uberlândia com distâncias das 2 unidades e tarifas calculadas por raio'],
    ['📐 Simulador e Regras', 'Exemplos práticos de agrupamento (70%) e adicional de condomínio horizontal (+20%)'],
  ];

  for (const [aba, desc] of sheetDescriptions) {
    sheetSummary.getCell(`B${rIdx}`).value = aba;
    sheetSummary.getCell(`B${rIdx}`).font = font({ bold: true, size: 10, color: { argb: 'FF1E40AF' } });
    sheetSummary.getCell(`B${rIdx}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    sheetSummary.getCell(`B${rIdx}`).border = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };

    sheetSummary.mergeCells(`C${rIdx}:E${rIdx}`);
    const dCell = sheetSummary.getCell(`C${rIdx}`);
    dCell.value = desc;
    dCell.font = font({ size: 10, color: { argb: 'FF374151' } });
    dCell.border = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };
    sheetSummary.getRow(rIdx).height = 20;
    rIdx++;
  }

  // ==========================================
  // ABA 2: TABELA CARRO POR RAIO (1 A 20 KM)
  // ==========================================
  const sheetCarRadius = workbook.addWorksheet('Tabela Carro por Raio', {
    properties: { tabColor: { argb: 'FFEA580C' } }, // Orange
    views: [{ state: 'frozen', ySplit: 3, showGridLines: true }],
  });

  sheetCarRadius.columns = [
    { width: 14 }, // A: Distância (km)
    { width: 22 }, // B: Intervalo Geodésico
    { width: 18 }, // C: Preço (R$)
    { width: 22 }, // D: Repasse Motorista (90%)
    { width: 22 }, // E: Margem Kantine (10%)
    { width: 45 }, // F: Exemplos de Bairros no Raio
    { width: 45 }, // G: Diretriz Operacional
  ];

  sheetCarRadius.mergeCells('A1:G1');
  const cHeader = sheetCarRadius.getCell('A1');
  cHeader.value = 'TABELA OFICIAL DE CARRO POR DISTÂNCIA / RAIO GEOGRÁFICO (1 A 20 KM)';
  cHeader.font = font({ size: 13, bold: true, color: { argb: 'FFFFFFFF' } });
  cHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC2410C' } };
  cHeader.alignment = { vertical: 'middle', horizontal: 'center' };
  sheetCarRadius.getRow(1).height = 30;

  sheetCarRadius.mergeCells('A2:G2');
  const cSub = sheetCarRadius.getCell('A2');
  cSub.value = 'Regra Oficial Kantine: Cálculo por Distância Geodésica Haversine • Condomínio Horizontal (+20% na Base)';
  cSub.font = font({ size: 10, italic: true, color: { argb: 'FF7C2D12' } });
  cSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } };
  cSub.alignment = { vertical: 'middle', horizontal: 'center' };
  sheetCarRadius.getRow(2).height = 20;

  const carHeaders = [
    'Distância (km)',
    'Intervalo Geodésico',
    'Preço Final (R$)',
    'Repasse Motorista (-10%) (90%)',
    'Taxa Kantine Gestão (10%)',
    'Exemplos de Bairros no Raio (a partir da Matriz)',
    'Diretriz Operacional',
  ];

  const carHeaderRow = sheetCarRadius.getRow(3);
  carHeaderRow.height = 26;
  carHeaderRow.values = carHeaders;
  carHeaderRow.eachCell((cell) => {
    cell.font = font({ size: 10, bold: true, color: { argb: 'FFFFFFFF' } });
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9A3412' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF431407' } },
      bottom: { style: 'medium', color: { argb: 'FF431407' } },
      left: { style: 'thin', color: { argb: 'FFFB923C' } },
      right: { style: 'thin', color: { argb: 'FFFB923C' } },
    };
  });

  const carRowsData = [
    { km: '1', range: 'Até 1,0 km', fee: 20.0, examples: 'Daniel Fonseca, Tabajaras, Martins', note: 'Tarifa Mínima de Carro (Preço Final: R$ 20,00 | Motorista: R$ 18,00)' },
    { km: '2', range: '1,1 a 2,0 km', fee: 23.0, examples: 'Centro, Fundinho, Osvaldo Rezende, Cazeca, Lídice', note: 'Área central e adjacências (Preço Final: R$ 23,00 | Motorista: R$ 20,70)' },
    { km: '3', range: '2,1 a 3,0 km', fee: 25.0, examples: 'Brasil, Tubalina, Patrimônio, Jaraguá, Saraiva', note: 'Região pericentral consolidada (Preço Final: R$ 25,00 | Motorista: R$ 22,50)' },
    { km: '4', range: '3,1 a 4,0 km', fee: 27.0, examples: 'Copacabana, Santa Maria, Vigilato Pereira, Roosevelt', note: 'Primeiro anel viário urbano (Preço Final: R$ 27,00 | Motorista: R$ 24,30)' },
    { km: '5', range: '4,1 a 5,0 km', fee: 29.0, examples: 'Santa Mônica, Tibery, Carajás, Morada da Colina, Lagoinha', note: 'Bairros residenciais de alta densidade (Preço Final: R$ 29,00 | Motorista: R$ 26,10)' },
    { km: '6', range: '5,1 a 6,0 km', fee: 30.0, examples: 'Jardim Botânico, Gávea, Jardim Karaíba, Dona Zulmira', note: 'Zona Sul Nobre e Zona Oeste (Preço Final: R$ 30,00 | Motorista: R$ 27,00)' },
    { km: '7', range: '6,1 a 7,0 km', fee: 31.0, examples: 'Luizote de Freitas, Grand Ville, Shopping Park, Santa Luzia', note: 'Faixa de 7 km (Preço Final: R$ 31,00 | Motorista: R$ 27,90)' },
    { km: '8', range: '7,1 a 8,0 km', fee: 32.0, examples: 'Novo Mundo, Umuarama, Custódio Pereira, Marta Helena', note: 'Faixa de 8 km (Preço Final: R$ 32,00 | Motorista: R$ 28,80)' },
    { km: '9', range: '8,1 a 9,0 km', fee: 33.0, examples: 'Granja Marileusa, Aclimação, Morumbi, Pacaembu', note: 'Faixa de 9 km (Preço Final: R$ 33,00 | Motorista: R$ 29,70)' },
    { km: '10', range: '9,1 a 10,0 km', fee: 33.0, examples: 'Distrito Industrial, Dom Almir, Residencial Integração, Portal do Vale', note: 'Faixa de 10 km (Preço Final: R$ 33,00 | Motorista: R$ 29,70)' },
    { km: '10-15', range: '10,1 a 15,0 km', fee: 38.0, examples: 'Morada Nova, Residencial Pequis, São Francisco, Monte Hebron', note: 'Faixa ampliada de 10 a 15 km (Preço Final: R$ 38,00 | Motorista: R$ 34,20)' },
    { km: '15-20', range: '15,1 a 20,0 km', fee: 44.0, examples: 'Extremo Oeste, Saída Pau Furado, Cruzeiro dos Peixotos (perímetro)', note: 'Faixa periurbana de 15 a 20 km (Preço Final: R$ 44,00 | Motorista: R$ 39,60)' },
  ];

  let carRowIdx = 4;
  for (const item of carRowsData) {
    const row = sheetCarRadius.getRow(carRowIdx);
    row.height = 22;

    const driverShare = parseFloat((item.fee * 0.9).toFixed(2));
    const kantineShare = parseFloat((item.fee * 0.1).toFixed(2));

    row.values = [
      item.km,
      item.range,
      item.fee,
      { formula: `C${carRowIdx}*0.9`, result: driverShare },
      { formula: `C${carRowIdx}*0.1`, result: kantineShare },
      item.examples,
      item.note,
    ];

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };

      const isEven = carRowIdx % 2 === 0;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFFFF7ED' },
      };

      cell.font = font({
        size: 10,
        bold: colNumber === 1 || colNumber === 3,
        color: colNumber === 3 ? { argb: 'FFC2410C' } : { argb: 'FF1F2937' },
      });

      if ([1, 2].includes(colNumber)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if ([3, 4, 5].includes(colNumber)) {
        cell.numFmt = '"R$" #,##0.00';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });

    carRowIdx++;
  }

  // Linha Sob Consulta Carro (> 20 km)
  const carConsultRow = sheetCarRadius.getRow(carRowIdx);
  carConsultRow.height = 24;
  carConsultRow.values = [
    '> 20 km',
    'Acima de 20.0 km',
    'SOB CONSULTA',
    'SOB CONSULTA',
    'SOB CONSULTA',
    'Distritos de Miraporanga (~22km), Martinésia (~23km), Tapuirama (~28.5km)',
    'Confirmação manual obrigatória com entregador e cliente',
  ];
  carConsultRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    cell.font = font({ size: 10, bold: true, color: { argb: 'FF92400E' } });
    cell.border = {
      top: { style: 'medium', color: { argb: 'FFEA580C' } },
      bottom: { style: 'medium', color: { argb: 'FFEA580C' } },
      left: { style: 'thin', color: { argb: 'FFEA580C' } },
      right: { style: 'thin', color: { argb: 'FFEA580C' } },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // ==========================================
  // ABA 3: TABELA MOTO POR RAIO (1 A 20 KM)
  // ==========================================
  const sheetRadius = workbook.addWorksheet('Tabela Moto por Raio', {
    properties: { tabColor: { argb: 'FF2563EB' } }, // Blue
    views: [{ state: 'frozen', ySplit: 3, showGridLines: true }],
  });

  sheetRadius.columns = [
    { width: 12 }, // A: Faixa de Raio
    { width: 22 }, // B: Intervalo Geodésico
    { width: 18 }, // C: Tarifa Moto (R$)
    { width: 22 }, // D: Repasse Motorista (90%)
    { width: 22 }, // E: Margem Kantine (10%)
    { width: 45 }, // F: Exemplos de Bairros no Raio
    { width: 45 }, // G: Diretriz Operacional
  ];

  sheetRadius.mergeCells('A1:G1');
  const rHeader = sheetRadius.getCell('A1');
  rHeader.value = 'TABELA OFICIAL DE MOTO POR RAIO GEOGRÁFICO HAVERSINE (1 A 20 KM)';
  rHeader.font = font({ size: 13, bold: true, color: { argb: 'FFFFFFFF' } });
  rHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  rHeader.alignment = { vertical: 'middle', horizontal: 'center' };
  sheetRadius.getRow(1).height = 30;

  sheetRadius.mergeCells('A2:G2');
  const rSub = sheetRadius.getCell('A2');
  rSub.value = 'Regra Oficial Kantine: Raio Geodésico em Linha Reta • Entregas de Moto não possuem taxa extra de condomínio';
  rSub.font = font({ size: 10, italic: true, color: { argb: 'FF1E293B' } });
  rSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
  rSub.alignment = { vertical: 'middle', horizontal: 'center' };
  sheetRadius.getRow(2).height = 20;

  const radiusHeaders = [
    'Faixa de Raio',
    'Intervalo Geodésico',
    'Tarifa Moto (R$)',
    'Repasse Motorista (90%)',
    'Margem Kantine (10%)',
    'Exemplos de Bairros no Raio (a partir da Matriz)',
    'Diretriz Operacional',
  ];

  const radiusHeaderRow = sheetRadius.getRow(3);
  radiusHeaderRow.height = 26;
  radiusHeaderRow.values = radiusHeaders;
  radiusHeaderRow.eachCell((cell) => {
    cell.font = font({ size: 10, bold: true, color: { argb: 'FFFFFFFF' } });
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0F172A' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF93C5FD' } },
      right: { style: 'thin', color: { argb: 'FF93C5FD' } },
    };
  });

  const radiusNeighborhoodExamples: Record<number, string> = {
    1: 'Daniel Fonseca, Tabajaras, Martins',
    2: 'Centro, Fundinho, Osvaldo Rezende, Cazeca, Lídice, Bom Jesus',
    3: 'Brasil, Tubalina, Patrimônio, Jaraguá, Saraiva, Cidade Jardim',
    4: 'Copacabana, Santa Maria, Vigilato Pereira, Roosevelt, Chácaras Tubalina',
    5: 'Santa Mônica, Tibery, Carajás, Morada da Colina, Lagoinha, Pampulha',
    6: 'Jardim Botânico, Gávea, Jardim Karaíba, Dona Zulmira, Jardim Patrícia, Planalto',
    7: 'Luizote de Freitas, Grand Ville, Shopping Park, Santa Luzia, Taiaman',
    8: 'Novo Mundo, Umuarama, Custódio Pereira, Marta Helena, Jardim Brasília',
    9: 'Granja Marileusa, Aclimação, Morumbi, Pacaembu, Guarani, Jardim Célia',
    10: 'Distrito Industrial, Dom Almir, Residencial Integração, Portal do Vale, Joana D\'Arc',
    11: 'Morada Nova, Residencial Pequis, São Francisco, Celebridade, Alvino Silva',
    12: 'Monte Hebron, Solidariedade, Chácaras Douradinho',
    13: 'Chácaras Camping Clube (BR-452)',
    14: 'Extremo Leste / Saída BR-452',
    15: 'Área Periurbana Leste / Represa de Capim Branco',
    16: 'Extremo Oeste / Saída Tupaciguara',
    17: 'Área Rural / Estrada do Pau Furado',
    18: 'Cruzeiro dos Peixotos (Perímetro)',
    19: 'Distrito Cruzeiro dos Peixotos (~18.5 km)',
    20: 'Limite Municipal Urbano de 20 km',
  };

  const radiusNotes: Record<number, string> = {
    1: 'Tarifa Mínima Operacional de Moto (R$ 10,50)',
    2: 'Região Central e Hipercentro',
    3: 'Região Pericentral Expandida',
    4: 'Primeiro Anel de Bairros Estruturados',
    5: 'Bairros de Alta Densidade / Universidades',
    6: 'Zona Sul Nobre e Zona Oeste Consolidada',
    7: 'Zonas Residenciais Intermediárias',
    8: 'Início de Vetores de Expansão Norte/Leste',
    9: 'Polo Tecnológico / Bairros Periféricos Leste',
    10: 'Limite da Malha Urbana Central Integrada',
    11: 'Bairros de Grande Porte da Periferia Oeste/Leste',
    12: 'Bairros Habitacionais e Chácaras Estruturadas',
    13: 'Setor de Chácaras e Condomínios Rurais',
    14: 'Raio de Média/Longa Distância',
    15: 'Raio de Média/Longa Distância',
    16: 'Raio de Média/Longa Distância',
    17: 'Raio Longo Periurbano',
    18: 'Raio Longo Periurbano',
    19: 'Proximidade de Distritos Municipais',
    20: 'Teto Máximo Tarifado Automaticamente por Raio',
  };

  let radiusRowIdx = 4;
  for (let km = 1; km <= 20; km++) {
    const fee = MOTO_RADIUS_TARIFF_TABLE[km];
    const row = sheetRadius.getRow(radiusRowIdx);
    row.height = 22;

    const lowerBound = km === 1 ? '0.0' : (km - 1 + 0.1).toFixed(1);
    const rangeText = `${lowerBound} km a ${km}.0 km`;
    const driverShare = parseFloat((fee * 0.9).toFixed(2));
    const kantineShare = parseFloat((fee * 0.1).toFixed(2));

    row.values = [
      `Até ${km} km`,
      rangeText,
      fee,
      { formula: `C${radiusRowIdx}*0.9`, result: driverShare },
      { formula: `C${radiusRowIdx}*0.1`, result: kantineShare },
      radiusNeighborhoodExamples[km] || 'Uberlândia',
      radiusNotes[km] || 'Tarifa Padrão por Raio',
    ];

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };

      const isEven = radiusRowIdx % 2 === 0;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' },
      };

      cell.font = font({
        size: 10,
        bold: colNumber === 1 || colNumber === 3,
        color: colNumber === 3 ? { argb: 'FF1E40AF' } : { argb: 'FF1F2937' },
      });

      if ([1, 2].includes(colNumber)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if ([3, 4, 5].includes(colNumber)) {
        cell.numFmt = '"R$" #,##0.00';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });

    radiusRowIdx++;
  }

  // Linha Sob Consulta Moto (> 20 km)
  const consultRow = sheetRadius.getRow(radiusRowIdx);
  consultRow.height = 24;
  consultRow.values = [
    '> 20 km',
    'Acima de 20.0 km (Distritos e Zona Rural)',
    'SOB CONSULTA',
    'SOB CONSULTA',
    'SOB CONSULTA',
    'Miraporanga (~22km), Martinésia (~23km), Tapuirama (~28.5km)',
    'Confirmação manual obrigatória pelo operador com entregador parceiro',
  ];
  consultRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    cell.font = font({ size: 10, bold: true, color: { argb: 'FF92400E' } });
    cell.border = {
      top: { style: 'medium', color: { argb: 'FFD97706' } },
      bottom: { style: 'medium', color: { argb: 'FFD97706' } },
      left: { style: 'thin', color: { argb: 'FFD97706' } },
      right: { style: 'thin', color: { argb: 'FFD97706' } },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // ==========================================
  // ABA 4: TABELA POR BAIRROS (110 BAIRROS MAPEADOS)
  // ==========================================
  const sheetNeighborhoods = workbook.addWorksheet('Tabela por Bairros (110)', {
    properties: { tabColor: { argb: 'FF059669' } }, // Emerald Green
    views: [{ state: 'frozen', ySplit: 3, showGridLines: true }],
  });

  sheetNeighborhoods.columns = [
    { width: 6 },  // A: Nº
    { width: 18 }, // B: Status / Origem (Destaque novos)
    { width: 32 }, // C: Nome do Bairro
    { width: 16 }, // D: Região/Zona
    { width: 18 }, // E: Distância Matriz (km)
    { width: 18 }, // F: Distância Vinhedos (km)
    { width: 22 }, // G: Tarifa Carro (por Raio)
    { width: 22 }, // H: Repasse Carro (90%)
    { width: 20 }, // I: Margem Carro (10%)
    { width: 20 }, // J: Raio Moto Aplicável
    { width: 18 }, // K: Tarifa Moto (R$)
    { width: 20 }, // L: Repasse Moto (90%)
    { width: 18 }, // M: Margem Moto (10%)
    { width: 50 }, // N: Critério / Rationale
    { width: 14 }, // O: Latitude
    { width: 14 }, // P: Longitude
  ];

  // Linha 1: Título Geral
  sheetNeighborhoods.mergeCells('A1:P1');
  const nHeader = sheetNeighborhoods.getCell('A1');
  nHeader.value = 'TABELA COMPLETA DE BAIRROS DE UBERLÂNDIA/MG COM TARIFAS POR RAIO (CARRO & MOTO)';
  nHeader.font = font({ size: 14, bold: true, color: { argb: 'FFFFFFFF' } });
  nHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };
  nHeader.alignment = { vertical: 'middle', horizontal: 'center' };
  sheetNeighborhoods.getRow(1).height = 32;

  // Linha 2: Subtítulo
  sheetNeighborhoods.mergeCells('A2:P2');
  const nSub = sheetNeighborhoods.getCell('A2');
  nSub.value = '110 Bairros Mapeados: 70 Oficiais Kantine + 40 Novos Bairros Inseridos com Destaque Visual em Verde';
  nSub.font = font({ size: 10, italic: true, color: { argb: 'FF1E293B' } });
  nSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
  nSub.alignment = { vertical: 'middle', horizontal: 'center' };
  sheetNeighborhoods.getRow(2).height = 20;

  // Linha 3: Cabeçalho das Colunas
  const colHeaders = [
    'Nº',
    'Status / Origem',
    'Bairro',
    'Região / Zona',
    'Dist. Matriz (km)',
    'Dist. Vinhedos (km)',
    'Tarifa Carro Raio (R$)',
    'Repasse Carro (90%)',
    'Margem Carro (10%)',
    'Raio Moto Aplicável',
    'Tarifa Moto (R$)',
    'Repasse Moto (90%)',
    'Margem Moto (10%)',
    'Critério / Bairro de Referência',
    'Latitude',
    'Longitude',
  ];

  const headerRow = sheetNeighborhoods.getRow(3);
  headerRow.height = 26;
  headerRow.values = colHeaders;
  headerRow.eachCell((cell) => {
    cell.font = font({ size: 10, bold: true, color: { argb: 'FFFFFFFF' } });
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF064E3B' } },
      bottom: { style: 'medium', color: { argb: 'FF064E3B' } },
      left: { style: 'thin', color: { argb: 'FF6EE7B7' } },
      right: { style: 'thin', color: { argb: 'FF6EE7B7' } },
    };
  });

  // Preenchimento dos 110 Bairros (Linhas 4 a 113)
  let rowCount = 4;
  for (let i = 0; i < neighborhoods.length; i++) {
    const item = neighborhoods[i];
    const distMatriz = calculateHaversineDistanceKm(
      matrizCoords.lat,
      matrizCoords.lng,
      item.coords.lat,
      item.coords.lng
    );
    const distVinhedos = calculateHaversineDistanceKm(
      vinhedosCoords.lat,
      vinhedosCoords.lng,
      item.coords.lat,
      item.coords.lng
    );

    const carTariff = resolveCarTariff(distMatriz);
    const motoTariff = resolveMotoTariff(distMatriz);
    const currentRow = sheetNeighborhoods.getRow(rowCount);

    const originText = item.isNew ? '✨ NOVO MAPEADO' : 'OFICIAL (70)';

    const carFeeValue = carTariff.fee !== null ? carTariff.fee : 'SOB CONSULTA';
    const carDriverShareObj = carTariff.fee !== null
      ? { formula: `G${rowCount}*0.9`, result: parseFloat((carTariff.fee * 0.9).toFixed(2)) }
      : 'SOB CONSULTA';
    const carKantineShareObj = carTariff.fee !== null
      ? { formula: `G${rowCount}*0.1`, result: parseFloat((carTariff.fee * 0.1).toFixed(2)) }
      : 'SOB CONSULTA';

    const motoFeeValue = motoTariff.fee !== null ? motoTariff.fee : 'SOB CONSULTA';
    const motoDriverShareObj = motoTariff.fee !== null
      ? { formula: `K${rowCount}*0.9`, result: parseFloat((motoTariff.fee * 0.9).toFixed(2)) }
      : 'SOB CONSULTA';
    const motoKantineShareObj = motoTariff.fee !== null
      ? { formula: `K${rowCount}*0.1`, result: parseFloat((motoTariff.fee * 0.1).toFixed(2)) }
      : 'SOB CONSULTA';

    currentRow.values = [
      i + 1,
      originText,
      item.name,
      item.zone,
      parseFloat(distMatriz.toFixed(1)),
      parseFloat(distVinhedos.toFixed(1)),
      carFeeValue,
      carDriverShareObj,
      carKantineShareObj,
      motoTariff.label,
      motoFeeValue,
      motoDriverShareObj,
      motoKantineShareObj,
      item.referenceRationale,
      item.coords.lat,
      item.coords.lng,
    ];

    // Destaque Visual para Novos Mapeados
    const isNew = item.isNew;
    const bgColor = isNew ? 'FFE8F8EE' : rowCount % 2 === 0 ? 'FFFFFFFF' : 'FFF9FAFB'; // Verde suave para novos
    const borderColor = isNew ? 'FF6EE7B7' : 'FFE5E7EB';

    currentRow.height = 22;
    currentRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bgColor },
      };

      cell.border = {
        top: { style: 'thin', color: { argb: borderColor } },
        bottom: { style: 'thin', color: { argb: borderColor } },
        left: { style: 'thin', color: { argb: borderColor } },
        right: { style: 'thin', color: { argb: borderColor } },
      };

      cell.font = font({
        size: 10,
        bold: colNumber === 3 || (colNumber === 2 && isNew) || colNumber === 7 || colNumber === 11,
        color: colNumber === 2 && isNew ? { argb: 'FF065F46' } : { argb: 'FF1F2937' },
      });

      // Formatação numérica compatível
      if ([5, 6].includes(colNumber)) {
        cell.numFmt = '0.0 "km"';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else if ([7, 8, 9, 11, 12, 13].includes(colNumber)) {
        if (typeof cell.value === 'number' || (typeof cell.value === 'object' && cell.value !== null)) {
          cell.numFmt = '"R$" #,##0.00';
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      } else if ([1, 2, 4, 10].includes(colNumber)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if ([15, 16].includes(colNumber)) {
        cell.numFmt = '0.0000';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });

    rowCount++;
  }

  // ==========================================
  // ABA 5: SIMULADOR DE MULTI-ENTREGAS & REGRAS
  // ==========================================
  const sheetSim = workbook.addWorksheet('Simulador e Regras', {
    properties: { tabColor: { argb: 'FF6366F1' } }, // Indigo
    views: [{ showGridLines: true }],
  });

  sheetSim.columns = [
    { width: 4 },
    { width: 35 },
    { width: 25 },
    { width: 25 },
    { width: 25 },
    { width: 35 },
  ];

  sheetSim.mergeCells('B2:F2');
  const simTitle = sheetSim.getCell('B2');
  simTitle.value = 'MOTOR DE FRETES KANTINE — REGRAS DE AGRUPAMENTO & REPASSE';
  simTitle.font = font({ size: 13, bold: true, color: { argb: 'FFFFFFFF' } });
  simTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
  simTitle.alignment = { vertical: 'middle', horizontal: 'center' };
  sheetSim.getRow(2).height = 32;

  const simSections = [
    {
      title: '1. REGRA DE MÚLTIPLAS ENTREGAS (AGRUPAMENTO — 70% POR PARADA)',
      desc: 'Quando uma rota possui 2 ou mais entregas, cada parada recebe desconto de 30% no valor cobrado (fator 0.70), barateando o custo por cliente e otimizando os ganhos do motorista por hora.',
      examples: [
        ['1 Entrega Isolada (Carro Raio 3 km — Preço Final R$ 25,00)', 'R$ 25,00 (100%)', 'Motorista: R$ 22,50 (90%)', 'Kantine: R$ 2,50 (10%)'],
        ['2 Entregas Agrupadas (2 x R$ 25,00 com fator 70%)', 'R$ 35,00 (2 x R$ 17,50)', 'Motorista: R$ 31,50 (90%)', 'Kantine: R$ 3,50 (10%)'],
        ['3 Entregas Agrupadas (3 x R$ 25,00 com fator 70%)', 'R$ 52,50 (3 x R$ 17,50)', 'Motorista: R$ 47,25 (90%)', 'Kantine: R$ 5,25 (10%)'],
      ],
    },
    {
      title: '2. ADICIONAL DE CONDOMÍNIO HORIZONTAL (+20%)',
      desc: 'Para entregas de Carro em condomínios horizontais fechados (ex: Cyrela, Bosque Karaíba, Paradiso, Village Altamira), incide acréscimo de +20% na tarifa-base para compensar o tempo de portaria e deslocamento interno.',
      examples: [
        ['Carro Raio 3 km Padrão (Sem Condomínio)', 'R$ 25,00', 'Motorista: R$ 22,50 (90%)', 'Kantine: R$ 2,50 (10%)'],
        ['Carro Raio 3 km + Condomínio Horizontal (+20%)', 'R$ 30,00 (+20%)', 'Motorista: R$ 27,00 (90%)', 'Kantine: R$ 3,00 (10%)'],
        ['Carro Raio 7 km + Condomínio Horizontal (+20%)', 'R$ 37,20 (+20% s/ R$31)', 'Motorista: R$ 33,48 (90%)', 'Kantine: R$ 3,72 (10%)'],
      ],
    },
  ];

  let sRow = 4;
  for (const sec of simSections) {
    sheetSim.mergeCells(`B${sRow}:F${sRow}`);
    const secHeader = sheetSim.getCell(`B${sRow}`);
    secHeader.value = sec.title;
    secHeader.font = font({ bold: true, size: 11, color: { argb: 'FFFFFFFF' } });
    secHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
    sheetSim.getRow(sRow).height = 24;
    sRow++;

    sheetSim.mergeCells(`B${sRow}:F${sRow}`);
    const secDesc = sheetSim.getCell(`B${sRow}`);
    secDesc.value = sec.desc;
    secDesc.font = font({ italic: true, size: 10, color: { argb: 'FF374151' } });
    sheetSim.getRow(sRow).height = 26;
    sRow++;

    for (const ex of sec.examples) {
      sheetSim.getCell(`B${sRow}`).value = ex[0];
      sheetSim.getCell(`C${sRow}`).value = ex[1];
      sheetSim.getCell(`D${sRow}`).value = ex[2];
      sheetSim.getCell(`E${sRow}`).value = ex[3];

      for (let c = 2; c <= 5; c++) {
        const colLetter = String.fromCharCode(64 + c);
        const cell = sheetSim.getCell(`${colLetter}${sRow}`);
        cell.font = font({ size: 10, bold: c === 2 || c === 3 });
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
      }
      sheetSim.getRow(sRow).height = 20;
      sRow++;
    }
    sRow += 2;
  }

  return workbook;
}

async function main() {
  const exportDir = path.resolve(process.cwd(), 'public', 'downloads');
  fs.mkdirSync(exportDir, { recursive: true });

  const wb = await generateFreightExcelWorkbook();

  // Salvar com ambos os nomes para garantir compatibilidade total
  const file1 = path.join(exportDir, 'Tabela_de_Fretes_Kantine_Gastronomia_Uberlandia.xlsx');
  const file2 = path.join(exportDir, 'Tabela_de_Fretes.xlsx');

  await wb.xlsx.writeFile(file1);
  await wb.xlsx.writeFile(file2);

  console.log('✅ Arquivos Excel gerados com sucesso!');
  console.log('1:', file1, fs.statSync(file1).size, 'bytes');
  console.log('2:', file2, fs.statSync(file2).size, 'bytes');
}

if (process.argv[1] && process.argv[1].includes('generate_freight_excel')) {
  main().catch(console.error);
}
