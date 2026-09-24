export type DriverStatus = 'PENDING' | 'ACTIVE' | 'BLOCKED';

export type VehicleType =
  | 'CAR_HATCH'
  | 'CAR_SEDAN'
  | 'CAR_SW'
  | 'MOTO_WITH_BAG'
  | 'MOTO_WITHOUT_BAG'
  | 'OTHER';

export interface VehicleOption {
  canonical: VehicleType;
  label: string;
  emoji: string;
  buttonText: string;
}

export const VEHICLE_OPTIONS: VehicleOption[] = [
  { canonical: 'CAR_HATCH', label: 'CARRO HATCH', emoji: '🚗', buttonText: '🚗 CARRO HATCH' },
  { canonical: 'CAR_SEDAN', label: 'CARRO SEDAN', emoji: '🚘', buttonText: '🚘 CARRO SEDAN' },
  { canonical: 'CAR_SW', label: 'CARRO SW', emoji: '🚙', buttonText: '🚙 CARRO SW' },
  { canonical: 'MOTO_WITH_BAG', label: 'MOTO COM BAG', emoji: '🏍️', buttonText: '🏍️ MOTO COM BAG' },
  { canonical: 'MOTO_WITHOUT_BAG', label: 'MOTO SEM BAG', emoji: '🏍️', buttonText: '🏍️ MOTO SEM BAG' },
  { canonical: 'OTHER', label: 'OUTRO', emoji: '🚚', buttonText: '🚚 OUTRO' },
];

export function getVehicleTypeLabel(type: string): string {
  const match = VEHICLE_OPTIONS.find((v) => v.canonical === type);
  return match ? match.label : type;
}

export function parseVehicleInput(input: string): VehicleType | null {
  if (!input) return null;
  const trimmed = input.trim();

  // 1. Direct canonical match (e.g. CAR_HATCH)
  const byCanonical = VEHICLE_OPTIONS.find((v) => v.canonical === trimmed);
  if (byCanonical) return byCanonical.canonical;

  // 2. Callback query prefix (e.g. veh_CAR_HATCH)
  if (trimmed.startsWith('veh_')) {
    const raw = trimmed.replace('veh_', '');
    const byCb = VEHICLE_OPTIONS.find((v) => v.canonical === raw);
    if (byCb) return byCb.canonical;
  }

  // 3. Exact buttonText match (e.g. "🚗 CARRO HATCH")
  const byButton = VEHICLE_OPTIONS.find(
    (v) => v.buttonText.toLowerCase() === trimmed.toLowerCase()
  );
  if (byButton) return byButton.canonical;

  // 4. Cleaned label match (e.g. "CARRO HATCH", "MOTO COM BAG")
  const byLabel = VEHICLE_OPTIONS.find(
    (v) => v.label.toLowerCase() === trimmed.toLowerCase()
  );
  if (byLabel) return byLabel.canonical;

  // Any other text (e.g. "carro", "moto", "sedan", "qualquer coisa") returns null
  return null;
}

export interface Driver {
  id: number;
  telegram_user_id: string;
  telegram_chat_id: string;
  name: string;
  phone: string;
  vehicle_type: VehicleType;
  pix_key: string;
  status: DriverStatus;
  created_at: Date;
  updated_at: Date;
}

export type DriverEventType =
  | 'DRIVER_REGISTERED'
  | 'DRIVER_APPROVED'
  | 'DRIVER_BLOCKED'
  | 'DRIVER_REACTIVATED';

export interface DriverEvent {
  id: number;
  driver_id: number;
  event_type: DriverEventType;
  timestamp: Date;
}

// M2 — Delivery Domain Types
export type DeliveryStatus = 'DRAFT' | 'OFFERED' | 'CANCELLED';
export type DeliveryMode = 'IN_PERSON' | 'NO_CONTACT';
export type DispatchStatus = 'SENT' | 'FAILED';

export interface Delivery {
  id: number;
  pickup_location: string;
  destination_address: string;
  destination_neighborhood: string;
  cargo_description: string;
  delivery_fee: string;
  delivery_mode: DeliveryMode;
  observations: string | null;
  status: DeliveryStatus;
  created_at: Date;
  offered_at: Date | null;
}

export interface DeliveryOfferDispatch {
  id: number;
  delivery_id: number;
  driver_id: number;
  telegram_chat_id: string;
  status: DispatchStatus;
  sent_at: Date;
  error_code: string | null;
}

export type DeliveryEventType =
  | 'DELIVERY_CREATED'
  | 'DELIVERY_OFFERED'
  | 'DELIVERY_CANCELLED';

export interface DeliveryEvent {
  id: number;
  delivery_id: number;
  event_type: DeliveryEventType;
  timestamp: Date;
  actor: string | null;
}

export interface CreateDeliveryDTO {
  pickup_location?: string;
  destination_address: string;
  destination_neighborhood: string;
  cargo_description: string;
  delivery_fee: string;
  delivery_mode?: DeliveryMode;
  observations?: string;
}

