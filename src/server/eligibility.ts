import { VehicleType, mapVehicleTypeToPricingCategory } from './types.ts';

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
 *   canReceiveDeliveryOffers(driver) AND route accepts driver vehicle type
 */
export function canReceiveRouteOffer(
  driver: { status: string; vehicle_type: VehicleType },
  route: { accepted_vehicle_types: VehicleType[] }
): boolean {
  if (!canReceiveDeliveryOffers(driver)) return false;
  if (!route.accepted_vehicle_types || route.accepted_vehicle_types.length === 0) return true;

  if (route.accepted_vehicle_types.includes(driver.vehicle_type)) return true;

  const dCat = mapVehicleTypeToPricingCategory(driver.vehicle_type);
  return route.accepted_vehicle_types.some((t) => {
    const rCat = mapVehicleTypeToPricingCategory(t);
    return rCat && rCat === dCat;
  });
}
