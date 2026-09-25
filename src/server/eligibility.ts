import { VehicleType } from './types.ts';

/**
 * V1 Eligibility Rule for Kantine Delivery:
 * A driver is eligible to receive delivery offers if and only if status is ACTIVE.
 */
export function canReceiveDeliveryOffers(driver: { status: string }): boolean {
  return driver.status === 'ACTIVE';
}

/**
 * M2.1 Eligibility Rule for Kantine Multi-Stop Routes:
 * canReceiveRouteOffer(driver, route) =
 *   canReceiveDeliveryOffers(driver) AND route.accepted_vehicle_types.includes(driver.vehicle_type)
 */
export function canReceiveRouteOffer(
  driver: { status: string; vehicle_type: VehicleType },
  route: { accepted_vehicle_types: VehicleType[] }
): boolean {
  return canReceiveDeliveryOffers(driver) && route.accepted_vehicle_types.includes(driver.vehicle_type);
}
