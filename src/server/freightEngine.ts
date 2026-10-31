/**
 * MOTOR DE FRETES & PRECIFICAÇÃO — KANTINE GASTRONOMIA
 * 
 * Módulo de Precificação, Roteirização, Cálculo de Remuneração e Administração de Fretes.
 * Regras estritas:
 * - 70 Bairros de Uberlândia para CARRO (R$ 18,00 / R$ 24,00 / R$ 30,00)
 * - Tabela de MOTO por raio geodésico Haversine (1 a 20 km: R$ 10,50 a R$ 31,00; >20km SOB CONSULTA)
 * - Condomínio Horizontal: +20% sobre tarifa-base antes do agrupamento
 * - Fator de Agrupamento: 70% por entrega para rotas com 2 ou mais paradas (1 entrega = 100%)
 * - Repasse: 90% Entregador / 10% Kantine (soma exata em centavos)
 * - Coletas: Kantine Matriz, Kantine Vinhedos e Coleta Alternativa
 * - Google Maps: link universal direto sem retorno à loja
 * - Mensagem WhatsApp formatada para proposta
 */

export interface GeoCoordinate {
  lat: number;
  lng: number;
}

export interface PickupLocationPreset {
  id?: number;
  name: string;
  address: string;
  neighborhood: string;
  coords: GeoCoordinate;
}

export const PICKUP_PRESETS: Record<string, PickupLocationPreset> = {
  MATRIZ: {
    name: 'Kantine Matriz',
    address: 'Av. Getúlio Vargas, 1846 — Uberlândia/MG',
    neighborhood: 'Daniel Fonseca',
    coords: { lat: -18.92211, lng: -48.28854 },
  },
  VINHEDOS: {
    name: 'Kantine Vinhedos',
    address: 'Rua José Elias, 71 — Uberlândia/MG',
    neighborhood: 'Karaíba',
    coords: { lat: -18.9542, lng: -48.2828 },
  },
};

// 70 Bairros Oficiais de Uberlândia com Coordenadas para Carro e Raio de Moto
export interface NeighborhoodPricingRecord {
  name: string;
  normalized: string;
  carFee: number;
  coords: GeoCoordinate;
}

export function normalizeName(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 70 Registros da Seção 5 do Briefing
export const UBERLANDIA_70_NEIGHBORHOODS: NeighborhoodPricingRecord[] = [
  // --- FAIXA R$ 18,00 (4 bairros) ---
  { name: 'Daniel Fonseca', normalized: normalizeName('Daniel Fonseca'), carFee: 18.0, coords: { lat: -18.9228, lng: -48.2934 } },
  { name: 'Tabajaras', normalized: normalizeName('Tabajaras'), carFee: 18.0, coords: { lat: -18.9261, lng: -48.2831 } },
  { name: 'Martins', normalized: normalizeName('Martins'), carFee: 18.0, coords: { lat: -18.9142, lng: -48.2872 } },
  { name: 'Jaraguá', normalized: normalizeName('Jaraguá'), carFee: 18.0, coords: { lat: -18.9312, lng: -48.3039 } },

  // --- FAIXA R$ 24,00 (28 bairros) ---
  { name: 'Brasil', normalized: normalizeName('Brasil'), carFee: 24.0, coords: { lat: -18.9056, lng: -48.2778 } },
  { name: 'Carajás', normalized: normalizeName('Carajás'), carFee: 24.0, coords: { lat: -18.9483, lng: -48.2589 } },
  { name: 'Cazeca', normalized: normalizeName('Cazeca'), carFee: 24.0, coords: { lat: -18.9258, lng: -48.2711 } },
  { name: 'Centro', normalized: normalizeName('Centro'), carFee: 24.0, coords: { lat: -18.9186, lng: -48.2772 } },
  { name: 'Copacabana', normalized: normalizeName('Copacabana'), carFee: 24.0, coords: { lat: -18.9472, lng: -48.2961 } },
  { name: 'Dona Zulmira', normalized: normalizeName('Dona Zulmira'), carFee: 24.0, coords: { lat: -18.9056, lng: -48.32 } },
  { name: 'Fundinho', normalized: normalizeName('Fundinho'), carFee: 24.0, coords: { lat: -18.9222, lng: -48.2778 } },
  { name: 'Gávea', normalized: normalizeName('Gávea'), carFee: 24.0, coords: { lat: -18.9611, lng: -48.2889 } },
  { name: 'Grand Ville', normalized: normalizeName('Grand Ville'), carFee: 24.0, coords: { lat: -18.9189, lng: -48.2361 } },
  { name: 'Jardim Botânico', normalized: normalizeName('Jardim Botânico'), carFee: 24.0, coords: { lat: -18.9667, lng: -48.2556 } },
  { name: 'Jardim Karaíba', normalized: normalizeName('Jardim Karaíba'), carFee: 24.0, coords: { lat: -18.95, lng: -48.2889 } },
  { name: 'Jardim Patrícia', normalized: normalizeName('Jardim Patrícia'), carFee: 24.0, coords: { lat: -18.9111, lng: -48.3333 } },
  { name: 'Lagoinha', normalized: normalizeName('Lagoinha'), carFee: 24.0, coords: { lat: -18.9444, lng: -48.25 } },
  { name: 'Lídice', normalized: normalizeName('Lídice'), carFee: 24.0, coords: { lat: -18.9278, lng: -48.2722 } },
  { name: 'Luizote de Freitas', normalized: normalizeName('Luizote de Freitas'), carFee: 24.0, coords: { lat: -18.9111, lng: -48.3444 } },
  { name: 'Morada da Colina', normalized: normalizeName('Morada da Colina'), carFee: 24.0, coords: { lat: -18.95, lng: -48.2778 } },
  { name: 'Novo Mundo', normalized: normalizeName('Novo Mundo'), carFee: 24.0, coords: { lat: -18.9167, lng: -48.2222 } },
  { name: 'Nossa Senhora Aparecida', normalized: normalizeName('Nossa Senhora Aparecida'), carFee: 24.0, coords: { lat: -18.9111, lng: -48.2667 } },
  { name: 'Osvaldo Rezende', normalized: normalizeName('Osvaldo Rezende'), carFee: 24.0, coords: { lat: -18.9167, lng: -48.2944 } },
  { name: 'Patrimônio', normalized: normalizeName('Patrimônio'), carFee: 24.0, coords: { lat: -18.9389, lng: -48.2833 } },
  { name: 'Planalto', normalized: normalizeName('Planalto'), carFee: 24.0, coords: { lat: -18.9333, lng: -48.3333 } },
  { name: 'Presidente Roosevelt', normalized: normalizeName('Presidente Roosevelt'), carFee: 24.0, coords: { lat: -18.8889, lng: -48.2889 } },
  { name: 'Roosevelt', normalized: normalizeName('Roosevelt'), carFee: 24.0, coords: { lat: -18.8889, lng: -48.2889 } },
  { name: 'Santa Maria', normalized: normalizeName('Santa Maria'), carFee: 24.0, coords: { lat: -18.9333, lng: -48.2611 } },
  { name: 'Santa Mônica', normalized: normalizeName('Santa Mônica'), carFee: 24.0, coords: { lat: -18.9167, lng: -48.2444 } },
  { name: 'Saraiva', normalized: normalizeName('Saraiva'), carFee: 24.0, coords: { lat: -18.9306, lng: -48.2667 } },
  { name: 'Tibery', normalized: normalizeName('Tibery'), carFee: 24.0, coords: { lat: -18.9056, lng: -48.25 } },
  { name: 'Tubalina', normalized: normalizeName('Tubalina'), carFee: 24.0, coords: { lat: -18.9333, lng: -48.3056 } },
  { name: 'Vigilato Pereira', normalized: normalizeName('Vigilato Pereira'), carFee: 24.0, coords: { lat: -18.9389, lng: -48.2667 } },

  // --- FAIXA R$ 30,00 (38 bairros) ---
  { name: 'Aclimação', normalized: normalizeName('Aclimação'), carFee: 30.0, coords: { lat: -18.8944, lng: -48.2278 } },
  { name: 'Alto Umuarama', normalized: normalizeName('Alto Umuarama'), carFee: 30.0, coords: { lat: -18.8833, lng: -48.2444 } },
  { name: 'Alvorada', normalized: normalizeName('Alvorada'), carFee: 30.0, coords: { lat: -18.8889, lng: -48.3222 } },
  { name: 'Custódio Pereira', normalized: normalizeName('Custódio Pereira'), carFee: 30.0, coords: { lat: -18.8944, lng: -48.2556 } },
  { name: 'Distrito Industrial', normalized: normalizeName('Distrito Industrial'), carFee: 30.0, coords: { lat: -18.8556, lng: -48.2778 } },
  { name: 'Granja Marileusa', normalized: normalizeName('Granja Marileusa'), carFee: 30.0, coords: { lat: -18.8667, lng: -48.2278 } },
  { name: 'Guarani', normalized: normalizeName('Guarani'), carFee: 30.0, coords: { lat: -18.9444, lng: -48.3389 } },
  { name: 'Industrial', normalized: normalizeName('Industrial'), carFee: 30.0, coords: { lat: -18.8667, lng: -48.2889 } },
  { name: 'Jardim América', normalized: normalizeName('Jardim América'), carFee: 30.0, coords: { lat: -18.9389, lng: -48.2333 } },
  { name: 'Jardim Brasília', normalized: normalizeName('Jardim Brasília'), carFee: 30.0, coords: { lat: -18.8889, lng: -48.3056 } },
  { name: 'Jardim Brasília II', normalized: normalizeName('Jardim Brasília II'), carFee: 30.0, coords: { lat: -18.8833, lng: -48.3083 } },
  { name: 'Jardim das Acácias', normalized: normalizeName('Jardim das Acácias'), carFee: 30.0, coords: { lat: -18.9444, lng: -48.3278 } },
  { name: 'Jardim das Palmeiras', normalized: normalizeName('Jardim das Palmeiras'), carFee: 30.0, coords: { lat: -18.9444, lng: -48.3167 } },
  { name: 'Jardim Europa', normalized: normalizeName('Jardim Europa'), carFee: 30.0, coords: { lat: -18.9556, lng: -48.3111 } },
  { name: 'Jardim Holanda', normalized: normalizeName('Jardim Holanda'), carFee: 30.0, coords: { lat: -18.9556, lng: -48.3333 } },
  { name: 'Jardim Inconfidência', normalized: normalizeName('Jardim Inconfidência'), carFee: 30.0, coords: { lat: -18.9333, lng: -48.2444 } },
  { name: 'Mansour', normalized: normalizeName('Mansour'), carFee: 30.0, coords: { lat: -18.9167, lng: -48.3556 } },
  { name: 'Maravilha', normalized: normalizeName('Maravilha'), carFee: 30.0, coords: { lat: -18.8833, lng: -48.2722 } },
  { name: 'Marta Helena', normalized: normalizeName('Marta Helena'), carFee: 30.0, coords: { lat: -18.8944, lng: -48.2944 } },
  { name: 'Minas Gerais', normalized: normalizeName('Minas Gerais'), carFee: 30.0, coords: { lat: -18.8778, lng: -48.2833 } },
  { name: 'Morada dos Pássaros', normalized: normalizeName('Morada dos Pássaros'), carFee: 30.0, coords: { lat: -18.9222, lng: -48.2222 } },
  { name: 'Morumbi', normalized: normalizeName('Morumbi'), carFee: 30.0, coords: { lat: -18.9278, lng: -48.2111 } },
  { name: 'Nova Uberlândia', normalized: normalizeName('Nova Uberlândia'), carFee: 30.0, coords: { lat: -18.95, lng: -48.3056 } },
  { name: 'Nossa Senhora das Graças', normalized: normalizeName('Nossa Senhora das Graças'), carFee: 30.0, coords: { lat: -18.8833, lng: -48.2889 } },
  { name: 'Pacaembu', normalized: normalizeName('Pacaembu'), carFee: 30.0, coords: { lat: -18.8889, lng: -48.2611 } },
  { name: 'Portal do Vale', normalized: normalizeName('Portal do Vale'), carFee: 30.0, coords: { lat: -18.9111, lng: -48.2 } },
  { name: 'Residencial Integração', normalized: normalizeName('Residencial Integração'), carFee: 30.0, coords: { lat: -18.9389, lng: -48.2056 } },
  { name: 'Residencial Gramado', normalized: normalizeName('Residencial Gramado'), carFee: 30.0, coords: { lat: -18.9556, lng: -48.25 } },
  { name: 'Santa Luzia', normalized: normalizeName('Santa Luzia'), carFee: 30.0, coords: { lat: -18.9556, lng: -48.2667 } },
  { name: 'Santa Rosa', normalized: normalizeName('Santa Rosa'), carFee: 30.0, coords: { lat: -18.8778, lng: -48.3 } },
  { name: 'São Jorge', normalized: normalizeName('São Jorge'), carFee: 30.0, coords: { lat: -18.9556, lng: -48.2389 } },
  { name: 'São José', normalized: normalizeName('São José'), carFee: 30.0, coords: { lat: -18.8833, lng: -48.2667 } },
  { name: 'Segismundo Pereira', normalized: normalizeName('Segismundo Pereira'), carFee: 30.0, coords: { lat: -18.9222, lng: -48.2389 } },
  { name: 'Shopping Park', normalized: normalizeName('Shopping Park'), carFee: 30.0, coords: { lat: -18.9778, lng: -48.2778 } },
  { name: 'Taiaman', normalized: normalizeName('Taiaman'), carFee: 30.0, coords: { lat: -18.8944, lng: -48.3333 } },
  { name: 'Tocantins', normalized: normalizeName('Tocantins'), carFee: 30.0, coords: { lat: -18.9056, lng: -48.3556 } },
  { name: 'Umuarama', normalized: normalizeName('Umuarama'), carFee: 30.0, coords: { lat: -18.8944, lng: -48.2444 } },
];

// Tabela Oficial de Moto por Raio (1 km a 20 km)
export const MOTO_RADIUS_TARIFF_TABLE: Record<number, number> = {
  1: 10.5,
  2: 12.0,
  3: 13.0,
  4: 14.0,
  5: 15.5,
  6: 17.0,
  7: 18.0,
  8: 19.0,
  9: 20.0,
  10: 21.0,
  11: 22.0,
  12: 23.0,
  13: 24.0,
  14: 25.0,
  15: 26.0,
  16: 27.0,
  17: 28.0,
  18: 29.0,
  19: 30.0,
  20: 31.0,
};

// Tabela Oficial de Carro por Raio (1 km a 20 km) — Atualizada conforme nova tabela oficial (Preço Final da Entrega)
export const CAR_RADIUS_TARIFF_TABLE: Record<number, number> = {
  1: 20.0,
  2: 23.0,
  3: 25.0,
  4: 27.0,
  5: 29.0,
  6: 30.0,
  7: 31.0,
  8: 32.0,
  9: 33.0,
  10: 33.0,
  11: 38.0,
  12: 38.0,
  13: 38.0,
  14: 38.0,
  15: 38.0,
  16: 44.0,
  17: 44.0,
  18: 44.0,
  19: 44.0,
  20: 44.0,
};

// Faixas de exibição da Tabela de Carro por Raio (Preço Final da Entrega; Repasse do Motorista deduzido de 10% = 90%)
export const CAR_RADIUS_DISPLAY_TIERS: Array<{
  tier: string;
  rangeKm: string;
  minKm: number;
  maxKm: number;
  fee: number;
}> = [
  { tier: '1 km', rangeKm: 'Até 1,0 km', minKm: 0, maxKm: 1, fee: 20.0 },
  { tier: '2 km', rangeKm: '1,1 a 2,0 km', minKm: 1, maxKm: 2, fee: 23.0 },
  { tier: '3 km', rangeKm: '2,1 a 3,0 km', minKm: 2, maxKm: 3, fee: 25.0 },
  { tier: '4 km', rangeKm: '3,1 a 4,0 km', minKm: 3, maxKm: 4, fee: 27.0 },
  { tier: '5 km', rangeKm: '4,1 a 5,0 km', minKm: 4, maxKm: 5, fee: 29.0 },
  { tier: '6 km', rangeKm: '5,1 a 6,0 km', minKm: 5, maxKm: 6, fee: 30.0 },
  { tier: '7 km', rangeKm: '6,1 a 7,0 km', minKm: 6, maxKm: 7, fee: 31.0 },
  { tier: '8 km', rangeKm: '7,1 a 8,0 km', minKm: 7, maxKm: 8, fee: 32.0 },
  { tier: '9 km', rangeKm: '8,1 a 9,0 km', minKm: 8, maxKm: 9, fee: 33.0 },
  { tier: '10 km', rangeKm: '9,1 a 10,0 km', minKm: 9, maxKm: 10, fee: 33.0 },
  { tier: '10-15 km', rangeKm: '10,1 a 15,0 km', minKm: 10, maxKm: 15, fee: 38.0 },
  { tier: '15-20 km', rangeKm: '15,1 a 20,0 km', minKm: 15, maxKm: 20, fee: 44.0 },
];

// Parâmetros Globais Configuráveis
export interface FreightParameters {
  horizontalCondoMultiplier: number; // 0.20 (+20%)
  groupingFactor: number; // 0.70 (70% em 2+ entregas)
  driverShareRate: number; // 0.90 (90%)
  kantineShareRate: number; // 0.10 (10%)
  maxMotoRadiusKm: number; // 20 km
}

export const DEFAULT_FREIGHT_PARAMETERS: FreightParameters = {
  horizontalCondoMultiplier: 0.2,
  groupingFactor: 0.7,
  driverShareRate: 0.9,
  kantineShareRate: 0.1,
  maxMotoRadiusKm: 20,
};

/**
 * Cálculo geodésico de distância em linha reta via Haversine
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Raio da Terra em km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Busca de Bairro na Tabela Oficial dos 70 Registros
 */
export function findNeighborhoodRecord(name: string): NeighborhoodPricingRecord | null {
  if (!name) return null;
  const normalized = normalizeName(name);
  if (!normalized) return null;

  // Busca exata normalizada
  const exact = UBERLANDIA_70_NEIGHBORHOODS.find((n) => n.normalized === normalized);
  if (exact) return exact;

  // Busca por proximidade / contenção
  const partial = UBERLANDIA_70_NEIGHBORHOODS.find(
    (n) => n.normalized.includes(normalized) || normalized.includes(n.normalized)
  );
  return partial || null;
}

/**
 * Cálculo da Tarifa de Carro para um bairro
 */
export function getCarBaseTariff(neighborhoodName: string): {
  fee: number | null;
  found: boolean;
  neighborhood: string;
  coords?: GeoCoordinate;
} {
  const record = findNeighborhoodRecord(neighborhoodName);
  if (record) {
    return {
      fee: record.carFee,
      found: true,
      neighborhood: record.name,
      coords: record.coords,
    };
  }
  return {
    fee: null,
    found: false,
    neighborhood: neighborhoodName,
  };
}

/**
 * Cálculo da Tarifa de Moto por Raio Geodésico
 */
export function getMotoBaseTariff(
  pickupCoords: GeoCoordinate,
  dropoffCoords: GeoCoordinate
): {
  exactDistanceKm: number;
  roundedRadiusKm: number;
  fee: number | null;
  isConsultationRequired: boolean;
} {
  const dist = calculateHaversineDistanceKm(
    pickupCoords.lat,
    pickupCoords.lng,
    dropoffCoords.lat,
    dropoffCoords.lng
  );

  // Arredondar para o km inteiro superior (ex: 4,3 km -> 5 km)
  let roundedRadius = Math.ceil(dist);
  if (roundedRadius < 1) roundedRadius = 1;

  if (roundedRadius > 20) {
    return {
      exactDistanceKm: Math.round(dist * 100) / 100,
      roundedRadiusKm: roundedRadius,
      fee: null,
      isConsultationRequired: true,
    };
  }

  const fee = MOTO_RADIUS_TARIFF_TABLE[roundedRadius] || null;
  return {
    exactDistanceKm: Math.round(dist * 100) / 100,
    roundedRadiusKm: roundedRadius,
    fee,
    isConsultationRequired: false,
  };
}

/**
 * Cálculo da Tarifa de Carro por Raio Geodésico Haversine (1 a 20 km)
 * Atualizada conforme tabela oficial por distância (km):
 * - 1 km: R$ 18,00
 * - 2 km: R$ 22,00
 * - 3 km: R$ 24,00
 * - 4 km: R$ 26,00
 * - 5 km: R$ 28,00
 * - 6 km: R$ 29,00
 * - 7 a 10 km: R$ 30,00
 * - 10-15 km: R$ 35,00
 * - 15-20 km: R$ 40,00
 * - > 20 km: Sob consulta
 */
export function getCarBaseTariffByRadius(
  pickupCoords: GeoCoordinate,
  dropoffCoords: GeoCoordinate
): {
  exactDistanceKm: number;
  roundedRadiusKm: number;
  fee: number | null;
  tierLabel: string;
  isConsultationRequired: boolean;
} {
  const dist = calculateHaversineDistanceKm(
    pickupCoords.lat,
    pickupCoords.lng,
    dropoffCoords.lat,
    dropoffCoords.lng
  );

  let roundedRadius = Math.ceil(dist);
  if (roundedRadius < 1) roundedRadius = 1;

  if (roundedRadius > 20) {
    return {
      exactDistanceKm: Math.round(dist * 100) / 100,
      roundedRadiusKm: roundedRadius,
      fee: null,
      tierLabel: 'Acima de 20 km (> 20 km)',
      isConsultationRequired: true,
    };
  }

  let fee: number = 33.0;
  let tierLabel: string = `Até ${roundedRadius} km`;

  if (roundedRadius <= 10) {
    fee = CAR_RADIUS_TARIFF_TABLE[roundedRadius] || 33.0;
    tierLabel = `Até ${roundedRadius} km`;
  } else if (roundedRadius <= 15) {
    fee = 38.0;
    tierLabel = '10 a 15 km';
  } else {
    fee = 44.0;
    tierLabel = '15 a 20 km';
  }

  return {
    exactDistanceKm: Math.round(dist * 100) / 100,
    roundedRadiusKm: roundedRadius,
    fee,
    tierLabel,
    isConsultationRequired: false,
  };
}

export interface StopCalculationInput {
  id?: number;
  sequence: number;
  destination_address: string;
  destination_neighborhood: string;
  is_horizontal_condo: boolean;
  manual_base_fee?: number; // Para bairros desconhecidos ou raio > 20km
  dropoff_coords?: GeoCoordinate;
}

export interface StopCalculationResult {
  sequence: number;
  destination_address: string;
  destination_neighborhood: string;
  is_horizontal_condo: boolean;
  base_tariff: number;
  base_tariff_with_condo: number; // Tarifa ajustada com +20% se condomínio horizontal
  grouping_factor_applied: number; // 1.0 (se isolada) ou 0.7 (se agrupada)
  final_stop_tariff: number; // Tarifa operacional desta entrega
  distance_km?: number;
  rounded_radius_km?: number;
  requires_manual_confirmation: boolean;
  warning?: string;
}

export interface RoutePricingResult {
  vehicle_modality: 'CAR' | 'MOTO';
  origin_name: string;
  origin_address: string;
  origin_coords: GeoCoordinate;
  total_stops: number;
  stops: StopCalculationResult[];
  route_operational_total: number; // Soma de todas as paradas após agrupamento
  driver_remuneration: number; // 90% da rota
  kantine_administration: number; // 10% da rota
  is_grouped: boolean; // true se >= 2 paradas
  has_manual_pending: boolean;
  google_maps_url: string | null;
}

/**
 * Motor Central de Cálculo de Rota (Kantine Delivery)
 */
export function calculateRoutePricing(
  modality: 'CAR' | 'MOTO',
  origin: {
    name: string;
    address: string;
    coords?: GeoCoordinate;
  },
  stops: StopCalculationInput[],
  params: FreightParameters = DEFAULT_FREIGHT_PARAMETERS
): RoutePricingResult {
  // Coordenadas padrão da Matriz caso não fornecidas
  const originCoords: GeoCoordinate =
    origin.coords || PICKUP_PRESETS.MATRIZ.coords;

  const totalStops = stops.length;
  const isGrouped = totalStops >= 2;
  const groupingFactor = isGrouped ? params.groupingFactor : 1.0;

  let hasManualPending = false;
  const stopsResults: StopCalculationResult[] = [];

  for (const stop of stops) {
    let baseTariff = 0;
    let distanceKm: number | undefined;
    let roundedRadiusKm: number | undefined;
    let requiresManual = false;
    let warning: string | undefined;

    if (stop.manual_base_fee && stop.manual_base_fee > 0) {
      baseTariff = stop.manual_base_fee;
      warning = 'Tarifa base personalizada/manual informada pelo operador.';
    } else {
      // Ambas as modalidades (CARRO e MOTO) agora calculam por RAIO GEODÉSICO (distância)!
      let dropCoords = stop.dropoff_coords;
      if (!dropCoords) {
        const found = findNeighborhoodRecord(stop.destination_neighborhood);
        if (found) dropCoords = found.coords;
      }

      if (dropCoords) {
        if (modality === 'CAR') {
          // CARRO: Tabela Oficial por Raio (1 a 20 km)
          const carInfo = getCarBaseTariffByRadius(originCoords, dropCoords);
          distanceKm = carInfo.exactDistanceKm;
          roundedRadiusKm = carInfo.roundedRadiusKm;

          if (carInfo.isConsultationRequired || carInfo.fee === null) {
            if (stop.manual_base_fee && stop.manual_base_fee > 0) {
              baseTariff = stop.manual_base_fee;
              warning = `Raio superior a 20 km (${carInfo.exactDistanceKm} km). Valor sob consulta confirmado.`;
            } else {
              baseTariff = 44.0;
              requiresManual = true;
              hasManualPending = true;
              warning = `Distância de Carro (${carInfo.exactDistanceKm} km) excede raio máximo de 20 km: SOB CONSULTA.`;
            }
          } else {
            baseTariff = carInfo.fee;
          }
        } else {
          // MOTO: Tabela Oficial por Raio (1 a 20 km)
          const motoInfo = getMotoBaseTariff(originCoords, dropCoords);
          distanceKm = motoInfo.exactDistanceKm;
          roundedRadiusKm = motoInfo.roundedRadiusKm;

          if (motoInfo.isConsultationRequired || motoInfo.fee === null) {
            if (stop.manual_base_fee && stop.manual_base_fee > 0) {
              baseTariff = stop.manual_base_fee;
              warning = `Raio superior a 20 km (${motoInfo.exactDistanceKm} km). Valor sob consulta confirmado.`;
            } else {
              baseTariff = 31.0;
              requiresManual = true;
              hasManualPending = true;
              warning = `Distância (${motoInfo.exactDistanceKm} km) excede raio máximo de 20 km: SOB CONSULTA.`;
            }
          } else {
            baseTariff = motoInfo.fee;
          }
        }
      } else if (stop.manual_base_fee && stop.manual_base_fee > 0) {
        baseTariff = stop.manual_base_fee;
        warning = 'Coordenadas não disponíveis. Tarifa manual informada.';
      } else {
        baseTariff = modality === 'CAR' ? 29.0 : 15.5; // Raio de 5 km padrão (R$ 29,00) caso coordenadas não identificadas
        requiresManual = true;
        hasManualPending = true;
        warning = 'Coordenadas do destino não identificadas para cálculo de raio. Confirmação necessária.';
      }
    }

    // Aplicação do Condomínio Horizontal (+20% na tarifa-base ANTES do agrupamento)
    // REGRA KANTINE: Aplicado EXCLUSIVAMENTE para modalidade CARRO (negociação prévia).
    // Entregas de MOTO não possuem acréscimo de condomínio (mantêm a tarifa padrão por raio).
    let baseTariffWithCondo = baseTariff;
    const isCondoApplied = Boolean(stop.is_horizontal_condo && modality === 'CAR');
    if (isCondoApplied) {
      baseTariffWithCondo = Math.round(baseTariff * (1 + params.horizontalCondoMultiplier) * 100) / 100;
    }

    // Aplicação do Fator de Agrupamento (70% em cada entrega se 2+ paradas)
    const finalStopTariff = Math.round(baseTariffWithCondo * groupingFactor * 100) / 100;

    stopsResults.push({
      sequence: stop.sequence,
      destination_address: stop.destination_address,
      destination_neighborhood: stop.destination_neighborhood,
      is_horizontal_condo: isCondoApplied,
      base_tariff: baseTariff,
      base_tariff_with_condo: baseTariffWithCondo,
      grouping_factor_applied: groupingFactor,
      final_stop_tariff: finalStopTariff,
      distance_km: distanceKm,
      rounded_radius_km: roundedRadiusKm,
      requires_manual_confirmation: requiresManual,
      warning,
    });
  }

  // Soma operacional da rota
  const routeOperationalTotal =
    Math.round(stopsResults.reduce((acc, s) => acc + s.final_stop_tariff, 0) * 100) / 100;

  // Repasse do Entregador (90%) e Kantine (10%) com precisão estrita em centavos
  const driverRemuneration = Math.round(routeOperationalTotal * params.driverShareRate * 100) / 100;
  const kantineAdministration = Math.round((routeOperationalTotal - driverRemuneration) * 100) / 100;

  // Geração do Link do Google Maps
  const googleMapsUrl = buildGoogleMapsRouteUrl(origin.address, stops);

  return {
    vehicle_modality: modality,
    origin_name: origin.name,
    origin_address: origin.address,
    origin_coords: originCoords,
    total_stops: totalStops,
    stops: stopsResults,
    route_operational_total: routeOperationalTotal,
    driver_remuneration: driverRemuneration,
    kantine_administration: kantineAdministration,
    is_grouped: isGrouped,
    has_manual_pending: hasManualPending,
    google_maps_url: googleMapsUrl,
  };
}

/**
 * Construtor de Link Universal do Google Maps (Coleta -> Paradas -> Destino)
 * Respeita a ordem exata sem retorno à loja.
 */
export function buildGoogleMapsRouteUrl(
  originAddress: string,
  stops: Array<{ destination_address: string; sequence?: number }>
): string | null {
  if (!originAddress || !stops || stops.length === 0) return null;

  const validStops = stops
    .filter((s) => s.destination_address && s.destination_address.trim().length > 0)
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

  if (validStops.length === 0) return null;

  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('origin', originAddress.trim());
  url.searchParams.set('travelmode', 'driving');

  if (validStops.length === 1) {
    url.searchParams.set('destination', validStops[0].destination_address.trim());
  } else {
    const waypoints = validStops.slice(0, validStops.length - 1);
    const lastStop = validStops[validStops.length - 1];

    url.searchParams.set(
      'waypoints',
      waypoints.map((w) => w.destination_address.trim()).join('|')
    );
    url.searchParams.set('destination', lastStop.destination_address.trim());
  }

  return url.toString();
}

/**
 * Gerador de Mensagem Padronizada para WhatsApp (Seção 13 do Briefing)
 */
export function generateWhatsAppProposalMessage(data: {
  modality: 'CAR' | 'MOTO';
  originNameOrAddress: string;
  stops: Array<{ destination_address: string; destination_neighborhood?: string }>;
  driverFee: number;
  googleMapsUrl?: string | null;
  observations?: string;
}): string {
  const modalityLabel = data.modality === 'MOTO' ? 'Moto' : 'Carro';
  const feeFormatted = data.driverFee.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  const stopsListText = data.stops
    .map(
      (s, idx) =>
        `${idx + 1}. ${s.destination_address}${
          s.destination_neighborhood ? ` — ${s.destination_neighborhood}` : ''
        }`
    )
    .join('\n');

  const mapsText = data.googleMapsUrl || 'Link gerado na confirmação';
  const obsText = data.observations?.trim() ? data.observations.trim() : 'Nenhuma';

  return `KANTINE — PROPOSTA DE ENTREGA

Modalidade: ${modalityLabel}

Coleta: ${data.originNameOrAddress}

Entregas: ${data.stops.length}

Paradas:
${stopsListText}

Valor proposto ao entregador: ${feeFormatted}

Google Maps: ${mapsText}

Observações: ${obsText}

Aceita realizar esta rota?`;
}
