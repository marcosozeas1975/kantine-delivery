import {
  UBERLANDIA_70_NEIGHBORHOODS,
  MOTO_RADIUS_TARIFF_TABLE,
  CAR_RADIUS_TARIFF_TABLE,
  calculateHaversineDistanceKm,
  PICKUP_PRESETS,
} from './freightEngine.ts';

export interface ExtendedNeighborhood {
  id: number;
  name: string;
  zone: 'Central' | 'Sul' | 'Leste' | 'Oeste' | 'Norte' | 'Periurbana / Rural' | 'Distrito';
  isNew: boolean;
  carFee: number;
  coords: { lat: number; lng: number };
  referenceRationale: string;
}

// 40 Novos Bairros de Uberlândia mapeados para complementar os 70 originais
export const UBERLANDIA_ADDITIONAL_NEIGHBORHOODS: Omit<ExtendedNeighborhood, 'id' | 'isNew'>[] = [
  // --- ZONA CENTRAL / PERICENTRAL ---
  {
    name: 'Bom Jesus',
    zone: 'Central',
    carFee: 24.0,
    coords: { lat: -18.9095, lng: -48.2815 },
    referenceRationale: 'Bairro central tradicional contíguo a Martins, Brasil e Centro (mesma faixa de R$ 24,00).',
  },

  // --- ZONA SUL ---
  {
    name: 'Cidade Jardim',
    zone: 'Sul',
    carFee: 24.0,
    coords: { lat: -18.9405, lng: -48.2985 },
    referenceRationale: 'Área nobre contígua a Tubalina, Patrimônio e Copacabana (todos R$ 24,00).',
  },
  {
    name: 'Karaíba (Bairro Vinhedos)',
    zone: 'Sul',
    carFee: 24.0,
    coords: { lat: -18.9542, lng: -48.2828 },
    referenceRationale: 'Local da unidade Kantine Vinhedos. Vizinho direto a Morada da Colina e Jardim Karaíba.',
  },
  {
    name: 'Granada',
    zone: 'Sul',
    carFee: 24.0,
    coords: { lat: -18.9502, lng: -48.252 },
    referenceRationale: 'Bairro tradicional da Zona Sul situado entre Carajás, São Jorge e Santa Luzia.',
  },
  {
    name: 'Laranjeiras',
    zone: 'Sul',
    carFee: 24.0,
    coords: { lat: -18.9645, lng: -48.271 },
    referenceRationale: 'Zona Sul residencial entre Santa Luzia e Shopping Park, na mesma faixa e raio viário.',
  },
  {
    name: 'Jardim Sul',
    zone: 'Sul',
    carFee: 24.0,
    coords: { lat: -18.972, lng: -48.2915 },
    referenceRationale: 'Vetor de expansão sul de condomínios fechados, continuação direta da Gávea.',
  },
  {
    name: 'Pampulha',
    zone: 'Sul',
    carFee: 24.0,
    coords: { lat: -18.928, lng: -48.248 },
    referenceRationale: 'Bairro residencial e universitário (UFU Campus Educação Física), vizinho a Santa Mônica.',
  },
  {
    name: 'Gávea Sul / Paradiso',
    zone: 'Sul',
    carFee: 30.0,
    coords: { lat: -18.969, lng: -48.282 },
    referenceRationale: 'Loteamentos e condomínios ao sul da Gávea, na faixa de expansão periférica sul.',
  },
  {
    name: 'San Marino / Terra Branca',
    zone: 'Sul',
    carFee: 30.0,
    coords: { lat: -18.978, lng: -48.295 },
    referenceRationale: 'Setor sul adjacente a Shopping Park e Jardim Sul.',
  },
  {
    name: 'Chácaras Panorama',
    zone: 'Sul',
    carFee: 30.0,
    coords: { lat: -18.971, lng: -48.308 },
    referenceRationale: 'Extensão sudoeste de chácaras e condomínios, vizinho a Nova Uberlândia.',
  },
  {
    name: 'Chácaras Douradinho',
    zone: 'Periurbana / Rural',
    carFee: 40.0,
    coords: { lat: -18.989, lng: -48.335 },
    referenceRationale: 'Região de chácaras estruturadas ao sudoeste, acesso rodoviário/estrada vicinal.',
  },
  {
    name: 'Chácaras Rancho Alegre',
    zone: 'Periurbana / Rural',
    carFee: 40.0,
    coords: { lat: -18.978, lng: -48.225 },
    referenceRationale: 'Área de chácaras e sítios de eventos na saída sudeste além do São Jorge.',
  },

  // --- ZONA LESTE ---
  {
    name: 'Dom Almir',
    zone: 'Leste',
    carFee: 30.0,
    coords: { lat: -18.932, lng: -48.198 },
    referenceRationale: 'Grande polo residencial da Zona Leste, contíguo ao Morumbi e Residencial Integração (R$ 30,00).',
  },
  {
    name: 'São Francisco',
    zone: 'Leste',
    carFee: 30.0,
    coords: { lat: -18.937, lng: -48.192 },
    referenceRationale: 'Adjacente ao Dom Almir e Morumbi, mesma distância e malha viária de R$ 30,00.',
  },
  {
    name: 'Joana D\'Arc',
    zone: 'Leste',
    carFee: 30.0,
    coords: { lat: -18.925, lng: -48.195 },
    referenceRationale: 'Zona Leste contíguo ao Morumbi e Dom Almir.',
  },
  {
    name: 'Celebridade',
    zone: 'Leste',
    carFee: 30.0,
    coords: { lat: -18.934, lng: -48.188 },
    referenceRationale: 'Extensão residencial leste contígua a São Francisco e Dom Almir.',
  },
  {
    name: 'Prosperidade',
    zone: 'Leste',
    carFee: 30.0,
    coords: { lat: -18.939, lng: -48.186 },
    referenceRationale: 'Extensão leste adjacente a Dom Almir e Solidariedade.',
  },
  {
    name: 'Alvino Silva',
    zone: 'Leste',
    carFee: 30.0,
    coords: { lat: -18.931, lng: -48.185 },
    referenceRationale: 'Adjacente a Dom Almir e Morumbi.',
  },
  {
    name: 'Solidariedade',
    zone: 'Leste',
    carFee: 30.0,
    coords: { lat: -18.943, lng: -48.182 },
    referenceRationale: 'Loteamento residencial leste contíguo ao Dom Almir e Prosperidade.',
  },
  {
    name: 'Jardim Sucupira',
    zone: 'Leste',
    carFee: 30.0,
    coords: { lat: -18.919, lng: -48.228 },
    referenceRationale: 'Adjacente ao Segismundo Pereira e Santa Mônica.',
  },
  {
    name: 'Ipanema',
    zone: 'Leste',
    carFee: 30.0,
    coords: { lat: -18.898, lng: -48.218 },
    referenceRationale: 'Zona Leste/Norte, contíguo ao Aclimação e Granja Marileusa (ambos R$ 30,00).',
  },
  {
    name: 'Mansões Aeroporto',
    zone: 'Leste',
    carFee: 30.0,
    coords: { lat: -18.891, lng: -48.212 },
    referenceRationale: 'Área residencial próxima ao Aeroporto César Bombonato e Granja Marileusa.',
  },
  {
    name: 'Chácaras Camping Clube',
    zone: 'Periurbana / Rural',
    carFee: 45.0,
    coords: { lat: -18.912, lng: -48.165 },
    referenceRationale: 'Setor de chácaras e lazer na saída para Araxá (BR-452), ~13 km de raio.',
  },

  // --- ZONA OESTE ---
  {
    name: 'Chácaras Tubalina',
    zone: 'Oeste',
    carFee: 24.0,
    coords: { lat: -18.942, lng: -48.318 },
    referenceRationale: 'Continuação direta do bairro Tubalina e Jardim das Palmeiras.',
  },
  {
    name: 'Morada do Sol',
    zone: 'Oeste',
    carFee: 24.0,
    coords: { lat: -18.921, lng: -48.341 },
    referenceRationale: 'Situado entre Luizote de Freitas e Jardim Patrícia.',
  },
  {
    name: 'Santo Inácio',
    zone: 'Oeste',
    carFee: 24.0,
    coords: { lat: -18.918, lng: -48.349 },
    referenceRationale: 'Adjacente a Mansour e Luizote de Freitas.',
  },
  {
    name: 'Jardim Canaã',
    zone: 'Oeste',
    carFee: 24.0,
    coords: { lat: -18.928, lng: -48.352 },
    referenceRationale: 'Adjacente a Mansour e Planalto.',
  },
  {
    name: 'Jardim Célia',
    zone: 'Oeste',
    carFee: 30.0,
    coords: { lat: -18.918, lng: -48.368 },
    referenceRationale: 'Bairro em forte expansão a oeste de Planalto e Luizote, mesma faixa de Mansour/Tocantins.',
  },
  {
    name: 'Morada Nova',
    zone: 'Oeste',
    carFee: 35.0,
    coords: { lat: -18.915, lng: -48.389 },
    referenceRationale: 'Grande bairro residencial a oeste (>10.5 km da Matriz). Sugestão R$ 35,00 por quilometragem ampliada.',
  },
  {
    name: 'Residencial Pequis',
    zone: 'Oeste',
    carFee: 35.0,
    coords: { lat: -18.902, lng: -48.385 },
    referenceRationale: 'Bairro planejado na extremidade oeste além do Tocantins (~10.5 km da Matriz).',
  },
  {
    name: 'Monte Hebron',
    zone: 'Oeste',
    carFee: 38.0,
    coords: { lat: -18.895, lng: -48.398 },
    referenceRationale: 'Conjunto habitacional na divisa oeste além do Pequis (~12 km de raio).',
  },

  // --- ZONA NORTE ---
  {
    name: 'Cruzeiro do Sul',
    zone: 'Norte',
    carFee: 24.0,
    coords: { lat: -18.895, lng: -48.282 },
    referenceRationale: 'Bairro residencial na Zona Norte, ao lado de Presidente Roosevelt e Marta Helena.',
  },
  {
    name: 'Liberdade',
    zone: 'Norte',
    carFee: 24.0,
    coords: { lat: -18.892, lng: -48.301 },
    referenceRationale: 'Bairro residencial adjacente a Jardim Brasília e Dona Zulmira.',
  },
  {
    name: 'São Lucas',
    zone: 'Norte',
    carFee: 30.0,
    coords: { lat: -18.871, lng: -48.279 },
    referenceRationale: 'Adjacente aos bairros Minas Gerais e Distrito Industrial (ambos R$ 30,00).',
  },
  {
    name: 'Vale do Paranaíba',
    zone: 'Norte',
    carFee: 30.0,
    coords: { lat: -18.868, lng: -48.269 },
    referenceRationale: 'Zona Norte, vizinho a Maravilha e São José.',
  },
  {
    name: 'Distrito Industrial II',
    zone: 'Norte',
    carFee: 30.0,
    coords: { lat: -18.839, lng: -48.271 },
    referenceRationale: 'Expansão norte do Distrito Industrial.',
  },

  // --- DISTRITOS MUNICIPAIS (FORA DO PERÍMETRO URBANO) ---
  {
    name: 'Cruzeiro dos Peixotos (Distrito)',
    zone: 'Distrito',
    carFee: 60.0,
    coords: { lat: -18.775, lng: -48.375 },
    referenceRationale: 'Distrito municipal a noroeste via BR-365 (~18.5 km). Tarifa sugerida para atendimento rodoviário.',
  },
  {
    name: 'Martinésia (Distrito)',
    zone: 'Distrito',
    carFee: 75.0,
    coords: { lat: -18.725, lng: -48.225 },
    referenceRationale: 'Distrito municipal rural a norte via BR-050 (~23 km). Tarifa especial sob consulta.',
  },
  {
    name: 'Miraporanga (Distrito)',
    zone: 'Distrito',
    carFee: 80.0,
    coords: { lat: -19.067, lng: -48.45 },
    referenceRationale: 'Distrito municipal a sudoeste (~22 km). Tarifa especial sob consulta.',
  },
  {
    name: 'Tapuirama (Distrito)',
    zone: 'Distrito',
    carFee: 90.0,
    coords: { lat: -19.083, lng: -48.067 },
    referenceRationale: 'Distrito municipal a sudeste via BR-452 (~28.5 km). Tarifa especial sob consulta.',
  },
];

export function getZoneForOriginalNeighborhood(name: string): ExtendedNeighborhood['zone'] {
  const central = ['Daniel Fonseca', 'Tabajaras', 'Martins', 'Fundinho', 'Centro', 'Cazeca', 'Lídice', 'Osvaldo Rezende', 'Nossa Senhora Aparecida', 'Brasil'];
  const sul = ['Carajás', 'Copacabana', 'Gávea', 'Jardim Botânico', 'Jardim Karaíba', 'Lagoinha', 'Morada da Colina', 'Patrimônio', 'Santa Maria', 'Saraiva', 'Tubalina', 'Vigilato Pereira', 'Guarani', 'Jardim das Acácias', 'Jardim das Palmeiras', 'Jardim Europa', 'Jardim Holanda', 'Jardim Inconfidência', 'Nova Uberlândia', 'Residencial Gramado', 'Santa Luzia', 'São Jorge', 'Shopping Park'];
  const leste = ['Grand Ville', 'Novo Mundo', 'Santa Mônica', 'Tibery', 'Aclimação', 'Alto Umuarama', 'Alvorada', 'Custódio Pereira', 'Granja Marileusa', 'Jardim América', 'Morada dos Pássaros', 'Morumbi', 'Portal do Vale', 'Residencial Integração', 'Segismundo Pereira', 'Umuarama'];
  const norte = ['Presidente Roosevelt', 'Roosevelt', 'Distrito Industrial', 'Industrial', 'Jardim Brasília', 'Jardim Brasília II', 'Maravilha', 'Marta Helena', 'Minas Gerais', 'Nossa Senhora das Graças', 'Pacaembu', 'Santa Rosa', 'São José'];
  const oeste = ['Jaraguá', 'Dona Zulmira', 'Jardim Patrícia', 'Luizote de Freitas', 'Planalto', 'Mansour', 'Taiaman', 'Tocantins'];

  if (central.includes(name)) return 'Central';
  if (sul.includes(name)) return 'Sul';
  if (leste.includes(name)) return 'Leste';
  if (norte.includes(name)) return 'Norte';
  if (oeste.includes(name)) return 'Oeste';
  return 'Central';
}

export function getAllMappedNeighborhoods(): ExtendedNeighborhood[] {
  const list: ExtendedNeighborhood[] = [];
  let id = 1;

  // 1. Inserir os 70 originais
  for (const n of UBERLANDIA_70_NEIGHBORHOODS) {
    list.push({
      id: id++,
      name: n.name,
      zone: getZoneForOriginalNeighborhood(n.name),
      isNew: false,
      carFee: n.carFee,
      coords: n.coords,
      referenceRationale: 'Bairro homologado na tabela oficial de 70 bairros Kantine.',
    });
  }

  // 2. Inserir os 40 novos bairros complementares
  for (const n of UBERLANDIA_ADDITIONAL_NEIGHBORHOODS) {
    list.push({
      id: id++,
      name: n.name,
      zone: n.zone,
      isNew: true,
      carFee: n.carFee,
      coords: n.coords,
      referenceRationale: n.referenceRationale,
    });
  }

  // Ordenar alfabeticamente
  return list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function resolveMotoTariff(distKm: number): { roundedKm: number; fee: number | null; label: string } {
  const rounded = Math.max(1, Math.ceil(distKm));
  if (rounded <= 20) {
    return { roundedKm: rounded, fee: MOTO_RADIUS_TARIFF_TABLE[rounded], label: `Raio ${rounded} km` };
  }
  return { roundedKm: rounded, fee: null, label: 'Acima de 20 km (Sob Consulta)' };
}

export function resolveCarTariff(distKm: number): { roundedKm: number; fee: number | null; label: string } {
  const rounded = Math.max(1, Math.ceil(distKm));
  if (rounded <= 10) {
    return { roundedKm: rounded, fee: CAR_RADIUS_TARIFF_TABLE[rounded], label: `Raio ${rounded} km` };
  } else if (rounded <= 15) {
    return { roundedKm: rounded, fee: 38.0, label: 'Raio 10-15 km' };
  } else if (rounded <= 20) {
    return { roundedKm: rounded, fee: 44.0, label: 'Raio 15-20 km' };
  }
  return { roundedKm: rounded, fee: null, label: 'Acima de 20 km (Sob Consulta)' };
}
