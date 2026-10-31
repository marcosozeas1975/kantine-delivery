import { VehicleType, mapVehicleTypeToPricingCategory, parseDriverVehicleTypes } from './types.ts';

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
 *   canReceiveDeliveryOffers(driver) AND route accepts at least one of driver's vehicle types
 */
export function canReceiveRouteOffer(
  driver: { status: string; vehicle_type: string },
  route: { accepted_vehicle_types: VehicleType[] }
): boolean {
  if (!canReceiveDeliveryOffers(driver)) return false;
  if (!route.accepted_vehicle_types || route.accepted_vehicle_types.length === 0) return true;

  // Extract all vehicles registered for this driver (supports single or multi e.g. "CAR,MOTO")
  const driverVehicles = parseDriverVehicleTypes(driver.vehicle_type);
  if (driverVehicles.length === 0) return false;

  // If ANY of driver's vehicles is in route.accepted_vehicle_types, driver is eligible!
  for (const dv of driverVehicles) {
    if (route.accepted_vehicle_types.includes(dv)) return true;

    const dCat = mapVehicleTypeToPricingCategory(dv);
    const matchesCategory = route.accepted_vehicle_types.some((t) => {
      const rCat = mapVehicleTypeToPricingCategory(t);
      return rCat && rCat === dCat;
    });
    if (matchesCategory) return true;
  }

  return false;
}

