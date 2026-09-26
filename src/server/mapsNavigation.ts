/**
 * M4.3 — Navegação Google Maps
 * 
 * Regras Operacionais e de Privacidade:
 * - Utilizar exclusivamente Google Maps URLs (https://www.google.com/maps/dir/?api=1).
 * - Sem APIs pagas, sem geocoding, sem tracking GPS, sem recálculos automáticos.
 * - Modo de transporte: 'driving' para todos os veículos nesta versão.
 * - Limite do link geral: Máximo de 4 ENTREGAS (origem + até 3 waypoints + destino final).
 * - Rotas com mais de 4 entregas: NÃO gerar link geral; disponibilizar navegação individual por parada.
 * - Preservação estrita de `sequence` (nunca alterar ordem).
 * - Links de paradas e coleta: destino apenas (sem origin exigido), permitindo ao Maps usar a localização atual do motorista.
 */

import { Route, RouteStop } from './types.ts';

export interface NavigationStop {
  id?: number;
  sequence: number;
  destination_address: string;
  status?: string;
}

export interface RouteNavigationLinks {
  generalRouteUrl: string | null;
  pickupUrl: string | null;
  stopUrls: Array<{
    stopId?: number;
    sequence: number;
    url: string | null;
  }>;
  maxStopsExceeded: boolean;
  message?: string;
}

/**
 * Constrói URL de destino direto no Google Maps (ex: Coleta ou Parada individual).
 * Padrão: https://www.google.com/maps/dir/?api=1&destination=...&travelmode=driving
 */
export function buildGoogleMapsDestinationUrl(
  destination: string,
  travelmode: string = 'driving'
): string | null {
  if (!destination || typeof destination !== 'string' || destination.trim().length === 0) {
    return null;
  }

  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('destination', destination.trim());
  url.searchParams.set('travelmode', travelmode);

  return url.toString();
}

/**
 * Constrói URL de rota completa no Google Maps para até 4 entregas.
 * Respeita rigorosamente a `sequence` das paradas.
 * Se houver mais de 4 paradas, retorna null (conforme Seção 8 e 9 do M4.3).
 */
export function buildGoogleMapsDirectionsUrl(
  origin: string,
  stops: NavigationStop[],
  travelmode: string = 'driving'
): string | null {
  if (!origin || typeof origin !== 'string' || origin.trim().length === 0) {
    return null;
  }

  if (!Array.isArray(stops) || stops.length === 0) {
    return null;
  }

  // Seção 8 & 9: Limite operacional de no máximo 4 entregas para link geral
  if (stops.length > 4) {
    return null;
  }

  // Ordenar rigorosamente pela sequência ascendente
  const sortedStops = [...stops].sort((a, b) => a.sequence - b.sequence);

  // Validar se todas as paradas possuem endereço
  for (const s of sortedStops) {
    if (!s.destination_address || typeof s.destination_address !== 'string' || s.destination_address.trim().length === 0) {
      console.warn(`[Google Maps] Falha ao construir rota geral: parada seq ${s.sequence} sem endereço válido.`);
      return null;
    }
  }

  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('origin', origin.trim());

  if (sortedStops.length === 1) {
    // 1 entrega: origin -> destination
    url.searchParams.set('destination', sortedStops[0].destination_address.trim());
  } else {
    // Múltiplas entregas (2 a 4): origin -> waypoints -> destination
    const intermediateStops = sortedStops.slice(0, sortedStops.length - 1);
    const finalStop = sortedStops[sortedStops.length - 1];

    const waypointsStr = intermediateStops
      .map((s) => s.destination_address.trim())
      .join('|');

    url.searchParams.set('waypoints', waypointsStr);
    url.searchParams.set('destination', finalStop.destination_address.trim());
  }

  url.searchParams.set('travelmode', travelmode);

  return url.toString();
}

/**
 * Gera deterministicamente os links de navegação para uma rota a partir de seus snapshots persistidos.
 */
export function generateRouteNavigationLinks(
  route: Route | { pickup_address?: string | null; stops?: RouteStop[] | NavigationStop[] | null }
): RouteNavigationLinks {
  const pickupAddress = route.pickup_address?.trim() || '';
  const stops = (route.stops || []).map((s) => ({
    id: 'id' in s ? s.id : undefined,
    sequence: s.sequence,
    destination_address: s.destination_address,
    status: 'status' in s ? s.status : undefined,
  }));

  // Ordenar por sequência
  stops.sort((a, b) => a.sequence - b.sequence);

  const pickupUrl = pickupAddress ? buildGoogleMapsDestinationUrl(pickupAddress) : null;
  const maxStopsExceeded = stops.length > 4;

  let generalRouteUrl: string | null = null;
  let message: string | undefined = undefined;

  if (maxStopsExceeded) {
    generalRouteUrl = null;
    message = 'Esta rota possui várias entregas. Utilize a navegação disponível em cada parada.';
  } else if (stops.length > 0 && pickupAddress) {
    generalRouteUrl = buildGoogleMapsDirectionsUrl(pickupAddress, stops);
  }

  const stopUrls = stops.map((s) => ({
    stopId: s.id,
    sequence: s.sequence,
    url: s.destination_address ? buildGoogleMapsDestinationUrl(s.destination_address) : null,
  }));

  return {
    generalRouteUrl,
    pickupUrl,
    stopUrls,
    maxStopsExceeded,
    message,
  };
}
