import {
  calculateHaversineDistanceKm,
  GeoCoordinate,
  findNeighborhoodRecord,
  UBERLANDIA_70_NEIGHBORHOODS,
} from './freightEngine.ts';
import { getAllMappedNeighborhoods } from '../shared/freightNeighborhoods.ts';

export interface GeocodedAddressSuggestion {
  id: string;
  formattedAddress: string;
  street: string;
  number?: string;
  neighborhood: string;
  city: string;
  state: string;
  coords: GeoCoordinate;
  distanceKm?: number;
  source: 'NOMINATIM' | 'LOCAL_INDEX' | 'VIACEP_LOCAL';
}

// Catálogo local de logradouros, avenidas e pontos de interesse de Uberlândia
const UBERLANDIA_LANDMARKS: Array<{
  name: string;
  street: string;
  neighborhood: string;
  coords: GeoCoordinate;
  isCondo?: boolean;
}> = [
  // Avenidas Principais
  { name: 'Avenida Afonso Pena', street: 'Avenida Afonso Pena', neighborhood: 'Centro', coords: { lat: -18.9186, lng: -48.2772 } },
  { name: 'Avenida Rondon Pacheco', street: 'Avenida Governador Rondon Pacheco', neighborhood: 'Tibery', coords: { lat: -18.9189, lng: -48.2612 } },
  { name: 'Avenida João Naves de Ávila', street: 'Avenida João Naves de Ávila', neighborhood: 'Santa Mônica', coords: { lat: -18.9245, lng: -48.2578 } },
  { name: 'Avenida Getúlio Vargas', street: 'Avenida Getúlio Vargas', neighborhood: 'Daniel Fonseca', coords: { lat: -18.9221, lng: -48.2885 } },
  { name: 'Avenida Floriano Peixoto', street: 'Avenida Floriano Peixoto', neighborhood: 'Brasil', coords: { lat: -18.9056, lng: -48.2778 } },
  { name: 'Avenida Anselmo Alves dos Santos', street: 'Avenida Anselmo Alves dos Santos', neighborhood: 'Santa Mônica', coords: { lat: -18.9123, lng: -48.2456 } },
  { name: 'Avenida Segismundo Pereira', street: 'Avenida Segismundo Pereira', neighborhood: 'Santa Mônica', coords: { lat: -18.9222, lng: -48.2389 } },
  { name: 'Avenida Nicomedes Alves dos Santos', street: 'Avenida Nicomedes Alves dos Santos', neighborhood: 'Morada da Colina', coords: { lat: -18.9502, lng: -48.2778 } },
  { name: 'Avenida dos Vinhedos', street: 'Avenida dos Vinhedos', neighborhood: 'Karaíba (Bairro Vinhedos)', coords: { lat: -18.9542, lng: -48.2828 } },
  { name: 'Avenida Belarmino Cotta Pacheco', street: 'Avenida Belarmino Cotta Pacheco', neighborhood: 'Santa Mônica', coords: { lat: -18.9189, lng: -48.2412 } },
  { name: 'Avenida Cesário Alvim', street: 'Avenida Cesário Alvim', neighborhood: 'Centro', coords: { lat: -18.9178, lng: -48.2756 } },
  { name: 'Avenida Cipriano Del Fávero', street: 'Avenida Cipriano Del Fávero', neighborhood: 'Centro', coords: { lat: -18.9212, lng: -48.2789 } },
  { name: 'Avenida Vasconcelos Costa', street: 'Avenida Vasconcelos Costa', neighborhood: 'Martins', coords: { lat: -18.9142, lng: -48.2872 } },
  { name: 'Avenida Fernando Vilela', street: 'Avenida Fernando Vilela', neighborhood: 'Martins', coords: { lat: -18.9165, lng: -48.2895 } },
  { name: 'Avenida Urumajó', street: 'Avenida Urumajó', neighborhood: 'Saraiva', coords: { lat: -18.9306, lng: -48.2667 } },
  { name: 'Avenida Geraldo Motta Batista', street: 'Avenida Geraldo Motta Batista', neighborhood: 'Daniel Fonseca', coords: { lat: -18.9256, lng: -48.2912 } },
  { name: 'Rua Santos Dumont', street: 'Rua Santos Dumont', neighborhood: 'Centro', coords: { lat: -18.9198, lng: -48.2765 } },
  { name: 'Rua Duque de Caxias', street: 'Rua Duque de Caxias', neighborhood: 'Centro', coords: { lat: -18.9225, lng: -48.2792 } },
  { name: 'Rua Tenente Virmondes', street: 'Rua Tenente Virmondes', neighborhood: 'Centro', coords: { lat: -18.9182, lng: -48.2785 } },
  { name: 'Rua Coronel Antônio Alves Pereira', street: 'Rua Coronel Antônio Alves Pereira', neighborhood: 'Centro', coords: { lat: -18.9205, lng: -48.2778 } },

  // Shoppings & Centros Comerciais
  { name: 'Center Shopping Uberlândia', street: 'Av. João Naves de Ávila, 1331', neighborhood: 'Tibery', coords: { lat: -18.9135, lng: -48.2628 } },
  { name: 'Uberlândia Shopping', street: 'Av. Paulo Gracindo, 15', neighborhood: 'Gávea', coords: { lat: -18.9615, lng: -48.2882 } },
  { name: 'Praça Tubal Vilela', street: 'Praça Tubal Vilela, S/N', neighborhood: 'Centro', coords: { lat: -18.9186, lng: -48.2772 } },
  { name: 'Parque do Sabiá', street: 'Rua Haia, S/N', neighborhood: 'Tibery', coords: { lat: -18.9095, lng: -48.2325 } },
  { name: 'Teatro Municipal Oscar Niemeyer', street: 'Av. Rondon Pacheco, 7070', neighborhood: 'Tibery', coords: { lat: -18.9189, lng: -48.2612 } },
  { name: 'Aeroporto de Uberlândia (Ten. Cel. Aviador César Bombonato)', street: 'Praça José Alves dos Santos, S/N', neighborhood: 'Aclimação', coords: { lat: -18.8825, lng: -48.2256 } },
  { name: 'Hospital de Clínicas da UFU (HCU)', street: 'Av. Pará, 1720', neighborhood: 'Umuarama', coords: { lat: -18.8944, lng: -48.2444 } },
  { name: 'Campus Santa Mônica UFU', street: 'Av. João Naves de Ávila, 2121', neighborhood: 'Santa Mônica', coords: { lat: -18.9189, lng: -48.2589 } },
  { name: 'Campus Umuarama UFU', street: 'Rua Ceará, S/N', neighborhood: 'Umuarama', coords: { lat: -18.8895, lng: -48.2485 } },

  // Condomínios Fechados Notáveis
  { name: 'Condomínio Cyrela Landscape', street: 'Av. Nicomedes Alves dos Santos, 5000', neighborhood: 'Gávea', coords: { lat: -18.9685, lng: -48.2912 }, isCondo: true },
  { name: 'Condomínio Bosque Karaíba', street: 'Rua das Samambaias, 100', neighborhood: 'Jardim Karaíba', coords: { lat: -18.9525, lng: -48.2865 }, isCondo: true },
  { name: 'Condomínio Residencial Paradiso', street: 'Av. dos Vinhedos, 1200', neighborhood: 'Karaíba (Bairro Vinhedos)', coords: { lat: -18.9565, lng: -48.2812 }, isCondo: true },
  { name: 'Condomínio Village Altamira', street: 'Rua Guaranis, 450', neighborhood: 'Tabajaras', coords: { lat: -18.9285, lng: -48.2845 }, isCondo: true },
  { name: 'Condomínio GSP Life Uberlândia', street: 'Av. Anselmo Alves dos Santos, 4000', neighborhood: 'Novo Mundo', coords: { lat: -18.9167, lng: -48.2222 }, isCondo: true },
  { name: 'Condomínio Granja Marileusa', street: 'Av. Floriano Peixoto, 5500', neighborhood: 'Granja Marileusa', coords: { lat: -18.8667, lng: -48.2278 }, isCondo: true },
];

// Cache em memória para evitar chamadas redundantes a Nominatim
const geocodeCache = new Map<string, { timestamp: number; data: GeocodedAddressSuggestion[] }>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hora

/**
 * Encontra o bairro oficial de Uberlândia mais próximo geograficamente pelas coordenadas
 */
export function findClosestNeighborhood(coords: GeoCoordinate): string {
  const all = getAllMappedNeighborhoods();
  let closest = all[0];
  let minDistance = calculateHaversineDistanceKm(coords.lat, coords.lng, closest.coords.lat, closest.coords.lng);

  for (let i = 1; i < all.length; i++) {
    const d = calculateHaversineDistanceKm(coords.lat, coords.lng, all[i].coords.lat, all[i].coords.lng);
    if (d < minDistance) {
      minDistance = d;
      closest = all[i];
    }
  }
  return closest.name;
}

/**
 * Normaliza e busca bairro correspondente nos 110 mapeados
 */
export function matchNeighborhood(rawText: string, fallbackCoords?: GeoCoordinate): string {
  if (!rawText || !rawText.trim()) {
    return fallbackCoords ? findClosestNeighborhood(fallbackCoords) : 'Centro';
  }
  const clean = rawText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  const all = getAllMappedNeighborhoods();
  for (const n of all) {
    const norm = n.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (clean === norm || clean.includes(norm) || norm.includes(clean)) {
      return n.name;
    }
  }

  // Fallback nos 70 originais
  const rec = findNeighborhoodRecord(rawText);
  if (rec) return rec.name;

  if (fallbackCoords) {
    return findClosestNeighborhood(fallbackCoords);
  }

  return rawText.trim();
}

/**
 * Extrai número predial digitado pelo usuário (ex: "Afonso Pena, 450", "Antônio de Oliveira Costa - 201")
 */
function extractHouseNumber(query: string): string | undefined {
  const match = query.match(/(?:^|\s|,|-|\/|n[º°.]?\s*)(\d{1,5})(?:[a-zA-Z]|\b)/i);
  return match ? match[1] : undefined;
}

/**
 * Remove prefixos comuns de logradouros para maximizar acertos no OpenStreetMap e no índice
 */
function stripStreetPrefix(input: string): string {
  return input
    .replace(/^(rua|r\.|av\.|avenida|av|alameda|al\.|travessa|trv\.|praça|praca|estrada|rodovia)\s+/i, '')
    .trim();
}

/**
 * Extrai apenas o nome do logradouro sem número ou hífens para busca cadastral (ViaCEP / Correios)
 */
function extractStreetName(input: string): string {
  const normalizedSeparators = input.replace(/\s*-\s*(\d+)/, ', $1');
  const stripped = stripStreetPrefix(normalizedSeparators);
  return stripped
    .replace(/[-,\s]*\b\d{1,5}\b.*$/, '')
    .replace(/[,-]$/, '')
    .trim();
}

/**
 * Consulta logradouro na base dos Correios / ViaCEP para Uberlândia
 */
async function queryViaCepStreet(streetName: string): Promise<Array<{ street: string; neighborhood: string; cep: string }>> {
  try {
    const clean = streetName.trim();
    if (clean.length < 3) return [];
    const url = `https://viacep.com.br/ws/MG/Uberlandia/${encodeURIComponent(clean)}/json/`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data)) {
        return data
          .filter((item: any) => item.logradouro && item.bairro)
          .map((item: any) => ({
            street: item.logradouro,
            neighborhood: item.bairro,
            cep: item.cep,
          }));
      }
    }
  } catch (err) {
    // silencioso
  }
  return [];
}

/**
 * Busca sugestões de endereço via OpenStreetMap Nominatim e índice local
 */
export async function searchAddressSuggestions(
  query: string,
  originCoords?: GeoCoordinate
): Promise<GeocodedAddressSuggestion[]> {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) return [];

  const cacheKey = cleanQuery.toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const results: GeocodedAddressSuggestion[] = [];
  const typedNumber = extractHouseNumber(cleanQuery);
  const coreQuery = stripStreetPrefix(cleanQuery);

  // 1. Busca no índice local de Uberlândia
  const normQuery = cleanQuery.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normCore = coreQuery.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const localMatches = UBERLANDIA_LANDMARKS.filter((l) => {
    const lNorm = l.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const sNorm = l.street.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const bNorm = l.neighborhood.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return (
      lNorm.includes(normQuery) ||
      sNorm.includes(normQuery) ||
      bNorm.includes(normQuery) ||
      lNorm.includes(normCore) ||
      sNorm.includes(normCore)
    );
  });

  for (const match of localMatches.slice(0, 3)) {
    const finalStreet = typedNumber && !match.street.match(/\d+/)
      ? `${match.street}, ${typedNumber}`
      : match.street;

    const dist = originCoords
      ? Math.round(calculateHaversineDistanceKm(originCoords.lat, originCoords.lng, match.coords.lat, match.coords.lng) * 100) / 100
      : undefined;

    results.push({
      id: `local-${match.name}-${typedNumber || '0'}`,
      formattedAddress: finalStreet,
      street: match.street,
      number: typedNumber,
      neighborhood: match.neighborhood,
      city: 'Uberlândia',
      state: 'MG',
      coords: match.coords,
      distanceKm: dist,
      source: 'LOCAL_INDEX',
    });
  }

  // 2. Busca externa no OpenStreetMap Nominatim restrita a Uberlândia/MG
  // Tenta com cleanQuery e, se tiver prefixo (ex: "Rua Afonso Pena"), tenta também com coreQuery ("Afonso Pena")
  const queriesToTry = [cleanQuery];
  if (coreQuery !== cleanQuery && coreQuery.length >= 3) {
    queriesToTry.push(coreQuery);
  }

  for (const qToSearch of queriesToTry) {
    if (results.length >= 4) break;

    try {
      const queryParam = qToSearch.toLowerCase().includes('uberlandia') || qToSearch.toLowerCase().includes('uberlândia')
        ? qToSearch
        : `${qToSearch}, Uberlândia, MG, Brasil`;

      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(queryParam)}&format=json&addressdetails=1&limit=4&countrycodes=br&viewbox=-48.42,-18.78,-48.15,-19.05`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'KantineDeliveryApp/1.0 (logistica@kantine.com.br)',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const data: any[] = await resp.json();
        for (const item of data) {
          const addr = item.address || {};
          const road = addr.road || addr.pedestrian || addr.street || addr.commercial || item.name || '';
          const houseNumber = addr.house_number || typedNumber || '';
          const rawSuburb = addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district || '';

          const lat = parseFloat(item.lat);
          const lon = parseFloat(item.lon);

          if (!isNaN(lat) && !isNaN(lon) && road) {
            // Se o Nominatim deu suburb reconhecível, usa ele; se não, usa a proximidade geográfica exata
            const matchedSuburb = matchNeighborhood(rawSuburb, { lat, lng: lon });

            const finalAddress = houseNumber ? `${road}, ${houseNumber}` : road;
            const dist = originCoords
              ? Math.round(calculateHaversineDistanceKm(originCoords.lat, originCoords.lng, lat, lon) * 100) / 100
              : undefined;

            const isDuplicate = results.some(
              (r) =>
                r.street.toLowerCase() === road.toLowerCase() &&
                r.neighborhood.toLowerCase() === matchedSuburb.toLowerCase()
            );

            if (!isDuplicate) {
              results.push({
                id: `nom-${item.place_id || Math.random()}`,
                formattedAddress: finalAddress,
                street: road,
                number: houseNumber || undefined,
                neighborhood: matchedSuburb,
                city: 'Uberlândia',
                state: 'MG',
                coords: { lat, lng: lon },
                distanceKm: dist,
                source: 'NOMINATIM',
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Geocoding] Nominatim query error:', (err as any)?.message || err);
    }
  }

  // 3. Fallback cadastral oficial ViaCEP (Base dos Correios de Uberlândia)
  // Resolve ruas residenciais não cadastradas no OpenStreetMap (ex: "Rua Antônio de Oliveira Costa - 201" -> Taiaman)
  if (results.length === 0) {
    const streetOnly = extractStreetName(cleanQuery);
    if (streetOnly.length >= 3) {
      const viacepResults = await queryViaCepStreet(streetOnly);
      for (const item of viacepResults) {
        const matchedSuburb = matchNeighborhood(item.neighborhood);
        const allNeighborhoods = getAllMappedNeighborhoods();
        const foundN = allNeighborhoods.find(
          (n) => n.name.toLowerCase() === matchedSuburb.toLowerCase()
        ) || allNeighborhoods[0];

        const finalAddress = typedNumber ? `${item.street}, ${typedNumber}` : item.street;
        const dist = originCoords
          ? Math.round(calculateHaversineDistanceKm(originCoords.lat, originCoords.lng, foundN.coords.lat, foundN.coords.lng) * 100) / 100
          : undefined;

        results.push({
          id: `viacep-${item.cep || item.street}`,
          formattedAddress: finalAddress,
          street: item.street,
          number: typedNumber,
          neighborhood: matchedSuburb,
          city: 'Uberlândia',
          state: 'MG',
          coords: foundN.coords,
          distanceKm: dist,
          source: 'VIACEP_LOCAL',
        });
      }
    }
  }

  // 4. Fallback se a busca for pelo nome direto de um bairro (ex: "Granada", "Pampulha")
  if (results.length === 0) {
    const allNeighborhoods = getAllMappedNeighborhoods();
    const matchedNeighborhoods = allNeighborhoods.filter((n) =>
      n.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(normCore)
    );

    for (const n of matchedNeighborhoods.slice(0, 3)) {
      const dist = originCoords
        ? Math.round(calculateHaversineDistanceKm(originCoords.lat, originCoords.lng, n.coords.lat, n.coords.lng) * 100) / 100
        : undefined;

      results.push({
        id: `bairro-${n.name}`,
        formattedAddress: `Bairro ${n.name}`,
        street: `Bairro ${n.name}`,
        neighborhood: n.name,
        city: 'Uberlândia',
        state: 'MG',
        coords: n.coords,
        distanceKm: dist,
        source: 'LOCAL_INDEX',
      });
    }
  }

  // Ordenar por relevância
  results.sort((a, b) => {
    if (a.number && !b.number) return -1;
    if (!a.number && b.number) return 1;
    return (a.distanceKm || 999) - (b.distanceKm || 999);
  });

  const finalResults = results.slice(0, 6);
  geocodeCache.set(cacheKey, { timestamp: Date.now(), data: finalResults });
  return finalResults;
}
