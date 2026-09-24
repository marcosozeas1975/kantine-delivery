/**
 * V1 Eligibility Rule for Kantine Delivery:
 * A driver is eligible to receive delivery offers if and only if status is ACTIVE.
 */
export function canReceiveDeliveryOffers(driver: { status: string }): boolean {
  return driver.status === 'ACTIVE';
}
