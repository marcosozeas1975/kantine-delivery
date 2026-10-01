export type DriverStatus = 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'EXCLUDED';

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

export type PixKeyType = 'CPF' | 'PHONE' | 'EMAIL' | 'RANDOM' | 'REQUIRES_UPDATE';

export interface Driver {
  id: number;
  telegram_user_id: string;
  telegram_chat_id: string;
  name: string;
  phone: string;
  vehicle_type: VehicleType;
  pix_key?: string | null;
  pix_key_type: PixKeyType;
  pix_key_value?: string | null;
  status: DriverStatus;
  // Exclusion fields & historical memory
  is_excluded?: boolean;
  excluded_at?: Date | null;
  exclusion_reason?: string | null;
  excluded_by?: string | null;
  previous_exclusion_reason?: string | null;
  exclusion_count?: number;
  // Blocked Reactivation Request fields
  reactivation_requested?: boolean;
  reactivation_requested_at?: Date | null;
  reactivation_reason?: string | null;
  // Excluded Reinclusion Request fields
  reinclusion_requested?: boolean;
  reinclusion_requested_at?: Date | null;
  reinclusion_reason?: string | null;
  created_at: Date;
  updated_at: Date;
}

export type DriverEventType =
  | 'DRIVER_REGISTERED'
  | 'DRIVER_APPROVED'
  | 'DRIVER_BLOCKED'
  | 'DRIVER_REACTIVATED'
  | 'DRIVER_PROFILE_UPDATED'
  | 'DRIVER_EXCLUDED'
  | 'REACTIVATION_REQUESTED'
  | 'REACTIVATION_REJECTED'
  | 'REINCLUSION_REQUESTED'
  | 'REINCLUSION_APPROVED'
  | 'REINCLUSION_REJECTED';

export interface DriverEvent {
  id: number;
  driver_id: number;
  event_type: DriverEventType;
  actor_type?: string | null;
  actor_id?: string | null;
  field_changed?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  details?: string | null;
  timestamp: Date;
}

export interface DriverInvitation {
  id: number;
  token: string;
  name: string | null;
  phone: string | null;
  vehicle_type: VehicleType | null;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  created_by: string | null;
  telegram_user_id: string | null;
  driver_id: number | null;
  created_at: Date;
  completed_at: Date | null;
}

// M1.2 — Controlled Referrals Domain Types
export type DriverReferralStatus =
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'INVITE_USED'
  | 'EXPIRED';

export interface DriverReferral {
  id: number;
  referred_by_driver_id: number;
  referred_name: string;
  referred_phone: string;
  status: DriverReferralStatus;
  invitation_token?: string | null;
  invitation_expires_at?: Date | null;
  invitation_used_at?: Date | null;
  invited_telegram_user_id?: string | null;
  resulting_driver_id?: number | null;
  reviewed_at?: Date | null;
  reviewed_by?: string | null;
  rejection_reason?: string | null;
  created_at: Date;
  updated_at: Date;
}

export type DriverReferralEventType =
  | 'DRIVER_REFERRAL_CREATED'
  | 'DRIVER_REFERRAL_APPROVED'
  | 'DRIVER_REFERRAL_REJECTED'
  | 'DRIVER_INVITE_CONSUMED'
  | 'DRIVER_REFERRAL_EXPIRED';

export interface DriverReferralEvent {
  id: number;
  referral_id: number;
  event_type: DriverReferralEventType;
  actor_type: 'DRIVER' | 'ADMIN' | 'SYSTEM';
  actor_id?: string | null;
  details?: string | null;
  timestamp: Date;
}

export interface DriverReferralWithDetails extends DriverReferral {
  referred_by_driver?: {
    id: number;
    name: string;
    status: DriverStatus;
    vehicle_type: VehicleType;
  } | null;
  resulting_driver?: {
    id: number;
    name: string;
    status: DriverStatus;
  } | null;
  invite_link?: string | null;
}

// M2/M3 — Delivery Domain Types
export type DeliveryStatus = 'DRAFT' | 'OFFERED' | 'ACCEPTED' | 'CANCELLED';
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
  accepted_driver_id: number | null;
  accepted_at: Date | null;
}

export interface DeliveryOfferDispatch {
  id: number;
  delivery_id: number;
  driver_id: number;
  telegram_chat_id: string;
  telegram_message_id?: string | null;
  status: DispatchStatus;
  sent_at: Date;
  error_code: string | null;
}

export type DeliveryEventType =
  | 'DELIVERY_CREATED'
  | 'DELIVERY_OFFERED'
  | 'DELIVERY_ACCEPTED'
  | 'DELIVERY_CANCELLED';

export interface DeliveryEvent {
  id: number;
  delivery_id: number;
  event_type: DeliveryEventType;
  timestamp: Date;
  actor: string | null;
}

export interface AcceptDeliveryResult {
  status: 'WON' | 'ALREADY_WON' | 'LOST' | 'REJECTED';
  delivery?: Delivery;
  error?: string;
  message: string;
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

// M2.1 — Routes & Pickup Locations Domain Types
export type PickupType = 'REGISTERED' | 'AD_HOC';

export interface PickupLocation {
  id: number;
  name: string;
  address: string;
  neighborhood?: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export type RouteStatus =
  | 'DRAFT'
  | 'OFFERED'
  | 'ACCEPTED'
  | 'ARRIVED_PICKUP'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'COMPLETED'
  | 'CANCELLED';

export type RouteStopStatus = 'PENDING' | 'DELIVERED' | 'INCIDENT' | 'CANCELLED';
export type ProofType = 'PIN' | 'PHOTO';
export type IncidentType =
  | 'CLIENTE_AUSENTE'
  | 'ENDERECO_NAO_LOCALIZADO'
  | 'CLIENTE_RECUSOU'
  | 'OUTRO';

export interface RouteStop {
  id: number;
  route_id: number;
  sequence: number;
  destination_address: string;
  destination_neighborhood: string;
  cargo_description: string;
  delivery_mode: DeliveryMode;
  observations: string | null;
  desired_deadline: string | null;
  status: RouteStopStatus;
  pin_code?: string | null;
  delivered_at?: Date | null;
  proof_type?: ProofType | null;
  proof_reference?: string | null;
  incident_type?: IncidentType | string | null;
  incident_note?: string | null;
  incident_at?: Date | null;
  incident_resolution_status?: 'OPEN' | 'RESOLVED' | null;
  resolution_type?:
    | 'RETURN_TO_ORIGIN'
    | 'DELIVERED_LATER'
    | 'DELIVERED_TO_ALTERNATIVE_LOCATION'
    | 'CUSTOMER_PICKUP'
    | 'DISCARDED'
    | 'OTHER'
    | null;
  resolution_note?: string | null;
  resolved_at?: Date | null;
  resolved_by?: string | null;
  // M4.2 Fields
  modality_code?: string;
  neighborhood_id?: number | null;
  pricing_vehicle_category?: PricingVehicleCategory | null;
  customer_freight?: number | null;
  net_delivery_base?: number | null;
  management_amount?: number | null;
  created_at: Date;
  completed_at: Date | null;
}

export type PricingVehicleCategory = 'CAR' | 'MOTO' | 'MOTO_WITH_BAG';

export interface PricingVehicleCategoryOption {
  category: PricingVehicleCategory;
  label: string;
  emoji: string;
}

export const PRICING_VEHICLE_CATEGORIES: PricingVehicleCategoryOption[] = [
  { category: 'CAR', label: 'CARRO', emoji: '🚗' },
  { category: 'MOTO', label: 'MOTO', emoji: '🏍️' },
  { category: 'MOTO_WITH_BAG', label: 'MOTO COM BAG', emoji: '🎒' },
];

export function mapVehicleTypeToPricingCategory(type: VehicleType | string): PricingVehicleCategory | null {
  switch (type) {
    case 'CAR_HATCH':
    case 'CAR_SEDAN':
    case 'CAR_SW':
      return 'CAR';
    case 'MOTO_WITHOUT_BAG':
      return 'MOTO';
    case 'MOTO_WITH_BAG':
      return 'MOTO_WITH_BAG';
    default:
      return null;
  }
}

export function normalizeNeighborhoodName(name: string): string {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export interface DeliveryModality {
  id: number;
  name: string;
  code: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Neighborhood {
  id: number;
  name: string;
  normalized_name: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface FreightPrice {
  id: number;
  neighborhood_id: number;
  modality_code: string;
  vehicle_category: PricingVehicleCategory;
  price: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
  neighborhood_name?: string;
}

export interface DeliveryConfiguration {
  logistics_management_rate: number; // e.g. 0.10
  default_route_discount_percent: number; // e.g. 0.20
}

export type IncidentResolutionStatus = 'OPEN' | 'RESOLVED';

export type IncidentResolutionType =
  | 'RETURN_TO_ORIGIN'
  | 'DELIVERED_LATER'
  | 'DELIVERED_TO_ALTERNATIVE_LOCATION'
  | 'CUSTOMER_PICKUP'
  | 'DISCARDED'
  | 'OTHER';

export const INCIDENT_RESOLUTION_OPTIONS: {
  type: IncidentResolutionType;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    type: 'RETURN_TO_ORIGIN',
    label: 'Devolver à Origem (Kantine Matriz)',
    description: 'A mercadoria retorna para a loja/origem com o motorista.',
    icon: '↩️',
  },
  {
    type: 'DELIVERED_LATER',
    label: 'Entregar Mais Tarde (Reagendamento)',
    description: 'Nova tentativa agendada para outro horário ou turno.',
    icon: '🕒',
  },
  {
    type: 'DELIVERED_TO_ALTERNATIVE_LOCATION',
    label: 'Entregar em Local Alternativo',
    description: 'Entregue na portaria, vizinho ou endereço próximo autorizado.',
    icon: '📍',
  },
  {
    type: 'CUSTOMER_PICKUP',
    label: 'Retirada pelo Cliente na Loja',
    description: 'Cliente avisado e irá retirar diretamente na confeitaria.',
    icon: '🏬',
  },
  {
    type: 'DISCARDED',
    label: 'Descarte / Avaria',
    description: 'Produto danificado ou perecível sem condições de reaproveitamento.',
    icon: '🗑️',
  },
  {
    type: 'OTHER',
    label: 'Outro',
    description: 'Outra resolução operacional negociada diretamente com o cliente.',
    icon: '📝',
  },
];

export type PaymentStatus = 'PENDING' | 'PAID';

export interface Route {
  id: number;
  pickup_type: PickupType;
  pickup_location_id: number | null;
  pickup_name: string;
  pickup_address: string;
  pickup_neighborhood_snapshot?: string | null;
  final_deadline: string;
  total_fee: string;
  accepted_vehicle_types: VehicleType[];
  status: RouteStatus;
  accepted_driver_id: number | null;
  accepted_at: Date | null;
  arrived_pickup_at?: Date | null;
  picked_up_at?: Date | null;
  started_at?: Date | null;
  completed_at?: Date | null;
  payment_status: PaymentStatus;
  paid_at?: Date | null;
  paid_by?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  payment_note?: string | null;
  // M4.2 Pricing Fields
  customer_freight_total?: number | null;
  management_rate_snapshot?: number | null;
  management_amount_total?: number | null;
  route_base_amount?: number | null;
  route_discount_percent_snapshot?: number | null;
  suggested_driver_fee?: number | null;
  final_driver_fee?: number | null;
  override_reason?: string | null;
  // M4.4 Versionamento e Edição Controlada
  route_version: number;
  driver_acknowledged_version: number;
  change_pending_driver_approval: boolean;
  pending_material_change?: string | null;
  created_at: Date;
  offered_at: Date | null;
  stops?: RouteStop[];
}

export type RouteChangeType = 'OPERATIONAL' | 'MATERIAL' | 'DRAFT_EDIT' | 'OFFERED_REOFFER';
export type DriverApprovalStatus = 'NOT_REQUIRED' | 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface RouteUpdateRecord {
  id: number;
  route_id: number;
  old_version: number;
  new_version: number;
  change_type: RouteChangeType;
  changed_fields: string[];
  diff_summary: string;
  previous_snapshot: any;
  new_snapshot?: any;
  pending_proposal?: any;
  actor: string;
  driver_approval_status: DriverApprovalStatus;
  driver_decision_at?: Date | null;
  driver_acknowledged_at?: Date | null;
  created_at: Date;
}

export interface EditRouteDTO {
  expected_version: number;
  pickup_type?: PickupType;
  pickup_location_id?: number | null;
  pickup_name?: string;
  pickup_address?: string;
  pickup_neighborhood?: string;
  pickup_neighborhood_snapshot?: string;
  final_deadline?: string;
  total_fee?: string;
  accepted_vehicle_types?: VehicleType[];
  final_driver_fee?: number | string | null;
  override_reason?: string | null;
  stops?: Array<{
    id?: number;
    destination_address: string;
    destination_neighborhood: string;
    cargo_description: string;
    delivery_mode?: DeliveryMode;
    observations?: string;
    desired_deadline?: string;
    sequence?: number;
    modality_code?: string;
    neighborhood_id?: number;
    pricing_vehicle_category?: PricingVehicleCategory;
    customer_freight?: number | string;
  }>;
}

export interface RouteEditAnalysis {
  change_type: RouteChangeType;
  is_material: boolean;
  changed_fields: string[];
  diff_summary: string;
  diff_items: Array<{
    field: string;
    label: string;
    old_value: any;
    new_value: any;
  }>;
}

export interface RouteOfferDispatch {
  id: number;
  route_id: number;
  driver_id: number;
  telegram_chat_id: string;
  telegram_message_id?: string | null;
  status: DispatchStatus;
  sent_at: Date;
  error_code: string | null;
}

export type RouteEventType =
  | 'ROUTE_CREATED'
  | 'ROUTE_OFFERED'
  | 'ROUTE_ACCEPTED'
  | 'ROUTE_ARRIVED_PICKUP'
  | 'ROUTE_PICKED_UP'
  | 'ROUTE_STARTED'
  | 'STOP_DELIVERED'
  | 'STOP_INCIDENT'
  | 'STOP_INCIDENT_RESOLVED'
  | 'ROUTE_PAYMENT_REGISTERED'
  | 'ROUTE_COMPLETED'
  | 'ROUTE_CANCELLED'
  | 'ROUTE_STOP_CREATED'
  | 'ROUTE_STOP_REORDERED'
  | 'ROUTE_UPDATED'
  | 'ROUTE_CHANGE_ACCEPTED'
  | 'ROUTE_CHANGE_REJECTED'
  | 'ROUTE_CHANGE_ACKNOWLEDGED';

export interface RouteEvent {
  id: number;
  route_id: number;
  event_type: RouteEventType;
  timestamp: Date;
  actor: string | null;
  details?: string | null;
}

export interface CreateRouteStopDTO {
  destination_address: string;
  destination_neighborhood: string;
  cargo_description: string;
  delivery_mode?: DeliveryMode;
  observations?: string;
  desired_deadline?: string;
  modality_code?: string;
  neighborhood_id?: number;
  pricing_vehicle_category?: PricingVehicleCategory;
  customer_freight?: number | string;
  net_delivery_base?: number | string;
  management_amount?: number | string;
}

export interface CreateRouteDTO {
  pickup_type: PickupType;
  pickup_location_id?: number;
  pickup_name?: string;
  pickup_address?: string;
  pickup_neighborhood?: string;
  pickup_neighborhood_snapshot?: string;
  final_deadline: string;
  total_fee: string;
  accepted_vehicle_types: VehicleType[];
  stops: CreateRouteStopDTO[];
  customer_freight_total?: number | string;
  management_rate_snapshot?: number;
  management_amount_total?: number | string;
  route_base_amount?: number | string;
  route_discount_percent_snapshot?: number;
  suggested_driver_fee?: number | string;
  final_driver_fee?: number | string;
  override_reason?: string;
}

export interface AcceptRouteResult {
  status: 'WON' | 'ALREADY_WON' | 'LOST' | 'REJECTED';
  route?: Route;
  error?: string;
  message: string;
}

