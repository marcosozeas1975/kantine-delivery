import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ShieldCheck,
  Bike,
  Car,
  Truck,
  CheckCircle,
  Ban,
  RotateCcw,
  RefreshCw,
  Clock,
  History,
  Send,
  AlertCircle,
  LogIn,
  LogOut,
  Key,
  Package,
  Users,
  Plus,
  XCircle,
  MapPin,
  FileText,
  DollarSign,
  AlertTriangle,
  Pencil,
  ChevronUp,
  ChevronDown,
  Trash2,
  Check,
  Navigation,
  Store,
  Layers,
  Calendar,
  UserPlus,
  QrCode,
  Share2,
  Copy,
  ExternalLink,
  MessageSquare,
  Download,
  Camera,
  Image as ImageIcon,
  UserCheck,
  ShieldAlert,
  Settings,
  Sliders,
  Tag,
  Percent,
  BellRing,
  Zap,
  Calculator,
  Phone,
} from 'lucide-react';
import QRCode from 'qrcode';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import {
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import { RouteEditModal } from './components/RouteEditModal.tsx';
import { RouteUpdatesHistory } from './components/RouteUpdatesHistory.tsx';
import { KantineLogo } from './components/KantineLogo.tsx';
import { FreightEngineSettings } from './components/FreightEngineSettings.tsx';
import {
  calculateRoutePricing,
  generateWhatsAppProposalMessage,
  UBERLANDIA_70_NEIGHBORHOODS,
  PICKUP_PRESETS,
  DEFAULT_FREIGHT_PARAMETERS,
} from './shared/freightEngine.ts';
import { getAllMappedNeighborhoods } from './shared/freightNeighborhoods.ts';
import { AddressAutocompleteInput, GeocodedAddressSuggestion } from './components/AddressAutocompleteInput.tsx';
import { extractCustomerData, calculateDriverFee } from './shared/customerUtils.ts';

// Types for Driver (M1 & M1.1 & Lifecycle)
type DriverStatus = 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'EXCLUDED';
type VehicleType =
  | 'CAR'
  | 'MOTO'
  | 'MOTO_WITH_BAG'
  // Backward compatibility
  | 'CAR_HATCH'
  | 'CAR_SEDAN'
  | 'CAR_SW'
  | 'MOTO_WITHOUT_BAG'
  | 'OTHER';

const VEHICLE_OPTIONS: { type: VehicleType; label: string; icon: string }[] = [
  { type: 'CAR', label: 'Carro', icon: '🚗' },
  { type: 'MOTO', label: 'Moto', icon: '🏍️' },
  { type: 'MOTO_WITH_BAG', label: 'Moto com Bag', icon: '🎒' },
];

const VEHICLE_DISPLAY: Record<string, { label: string; icon: string }> = {
  CAR: { label: 'Carro', icon: '🚗' },
  MOTO: { label: 'Moto', icon: '🏍️' },
  MOTO_WITH_BAG: { label: 'Moto com Bag', icon: '🎒' },
  // Backward compatibility for existing DB rows
  CAR_HATCH: { label: 'Carro', icon: '🚗' },
  CAR_SEDAN: { label: 'Carro', icon: '🚗' },
  CAR_SW: { label: 'Carro', icon: '🚗' },
  MOTO_WITHOUT_BAG: { label: 'Moto', icon: '🏍️' },
  OTHER: { label: 'Carro', icon: '🚗' },
};

const renderCompactVehicleBadges = (types: VehicleType[]) => {
  if (!types || types.length === 0) {
    return <span className="text-neutral-400 text-[11px]">—</span>;
  }

  const canonicalTypes = Array.from(
    new Set(
      types.map((t) => {
        if (['CAR_HATCH', 'CAR_SEDAN', 'CAR_SW', 'OTHER', 'CAR'].includes(t)) return 'CAR';
        if (['MOTO_WITHOUT_BAG', 'MOTO'].includes(t)) return 'MOTO';
        if (['MOTO_WITH_BAG'].includes(t)) return 'MOTO_WITH_BAG';
        return t;
      })
    )
  ) as VehicleType[];

  if (canonicalTypes.length >= 3) {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-800 rounded border border-blue-200 whitespace-nowrap" title="Todos os veículos aceitos: Carro, Moto e Moto com Bag">
        🚗🏍️🎒 Todos os Veículos (3)
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {canonicalTypes.map((t) => (
        <span
          key={t}
          className="text-[10px] font-semibold px-1.5 py-0.5 bg-neutral-100 text-neutral-700 rounded border border-neutral-200 whitespace-nowrap"
        >
          {VEHICLE_DISPLAY[t]?.icon || '🚗'} {VEHICLE_DISPLAY[t]?.label || t}
        </span>
      ))}
    </div>
  );
};

const parseDriverVehicleTypes = (input: any): VehicleType[] => {
  if (!input) return [];
  if (Array.isArray(input)) {
    const list: VehicleType[] = [];
    for (const item of input) {
      const parsed = parseDriverVehicleTypes(item);
      for (const p of parsed) {
        if (!list.includes(p)) list.push(p);
      }
    }
    return list;
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const arr = JSON.parse(trimmed);
        if (Array.isArray(arr)) return parseDriverVehicleTypes(arr);
      } catch {}
    }
    const lower = trimmed.toLowerCase();
    if (
      lower.includes('todos') ||
      lower.includes('todas') ||
      lower.includes('os tres') ||
      lower.includes('as tres') ||
      lower.includes('os 3') ||
      lower.includes('as 3')
    ) {
      return ['CAR', 'MOTO', 'MOTO_WITH_BAG'];
    }
    const tokens = trimmed.split(/[,;/+&]|\s+e\s+|\s+ou\s+/i).map((t) => t.trim()).filter(Boolean);
    const result: VehicleType[] = [];
    for (const tok of tokens) {
      const u = tok.toUpperCase();
      if (u === 'CAR' || u === 'CARRO' || ['CAR_HATCH', 'CAR_SEDAN', 'CAR_SW', 'OTHER'].includes(u)) {
        if (!result.includes('CAR')) result.push('CAR');
      } else if (u === 'MOTO_WITH_BAG' || u === 'MOTO_COM_BAG' || tok.toLowerCase().includes('bag')) {
        if (!result.includes('MOTO_WITH_BAG')) result.push('MOTO_WITH_BAG');
      } else if (u === 'MOTO' || u === 'MOTO_WITHOUT_BAG' || tok.toLowerCase().includes('moto')) {
        if (!result.includes('MOTO')) result.push('MOTO');
      }
    }
    if (result.length > 0) return result;
    if (lower.includes('carro') || lower.includes('car')) return ['CAR'];
    if (lower.includes('bag')) return ['MOTO_WITH_BAG'];
    if (lower.includes('moto')) return ['MOTO'];
  }
  return [];
};

const getVehicleTypeLabel = (type: string | null | undefined): string => {
  if (!type) return 'Não informado';
  const types = parseDriverVehicleTypes(type);
  if (types.length === 0) return type;
  const labels = types.map((t) => VEHICLE_DISPLAY[t]?.label || t);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} e ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
};

const renderDriverVehicleBadges = (type: string | null | undefined) => {
  if (!type) return <span className="text-neutral-400 text-xs">—</span>;
  const types = parseDriverVehicleTypes(type);
  if (types.length === 0) return <span className="text-neutral-600 text-xs">{type}</span>;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {types.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 bg-neutral-100 text-neutral-800 rounded-md border border-neutral-200 whitespace-nowrap"
        >
          <span>{VEHICLE_DISPLAY[t]?.icon || '🚗'}</span>
          <span>{VEHICLE_DISPLAY[t]?.label || t}</span>
        </span>
      ))}
    </div>
  );
};

const isDriverCompatibleWithRoute = (driverVehicleStr: string, acceptedVehicles: VehicleType[]) => {
  if (!acceptedVehicles || acceptedVehicles.length === 0) return true;
  const driverVehs = parseDriverVehicleTypes(driverVehicleStr);
  if (driverVehs.length === 0) return false;
  return driverVehs.some((dv) => {
    if (acceptedVehicles.includes(dv)) return true;
    const isCar = ['CAR', 'CAR_HATCH', 'CAR_SEDAN', 'CAR_SW', 'OTHER'].includes(dv);
    const isMoto = ['MOTO', 'MOTO_WITH_BAG', 'MOTO_WITHOUT_BAG'].includes(dv);
    if (isCar && acceptedVehicles.some((av) => ['CAR', 'CAR_HATCH', 'CAR_SEDAN', 'CAR_SW', 'OTHER'].includes(av))) return true;
    if (isMoto && acceptedVehicles.some((av) => ['MOTO', 'MOTO_WITH_BAG', 'MOTO_WITHOUT_BAG'].includes(av))) return true;
    return false;
  });
};

interface Driver {
  id: number;
  telegram_user_id: string;
  telegram_chat_id: string;
  name: string;
  phone: string;
  vehicle_type: string;
  pix_key?: string;
  pix_key_type?: string;
  pix_key_value?: string;
  status: DriverStatus;
  // Exclusion fields & historical memory
  is_excluded?: boolean;
  excluded_at?: string | null;
  exclusion_reason?: string | null;
  excluded_by?: string | null;
  previous_exclusion_reason?: string | null;
  exclusion_count?: number;
  // Blocked Reactivation Request fields
  reactivation_requested?: boolean;
  reactivation_requested_at?: string | null;
  reactivation_reason?: string | null;
  // Excluded Reinclusion Request fields
  reinclusion_requested?: boolean;
  reinclusion_requested_at?: string | null;
  reinclusion_reason?: string | null;
  created_at: string;
  updated_at: string;
}

interface DriverEvent {
  id: number;
  driver_id: number;
  event_type: string;
  actor_type?: string;
  actor_id?: string;
  field_changed?: string;
  old_value?: string;
  new_value?: string;
  details?: any;
  timestamp: string;
}

// Driver Invitations (Convite ao motorista)
interface DriverInvitation {
  id: number;
  token: string;
  name: string | null;
  phone: string | null;
  vehicle_type: VehicleType | null;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  created_by: string | null;
  telegram_user_id: string | null;
  driver_id: number | null;
  created_at: string;
  completed_at: string | null;
}

// Driver Referrals (M1.2 Rede Fechada de Indicação de Motoristas)
type DriverReferralStatus =
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'INVITE_USED'
  | 'EXPIRED';

interface DriverReferralItem {
  id: number;
  referred_by_driver_id: number;
  referred_name: string;
  referred_phone: string;
  status: DriverReferralStatus;
  invitation_token?: string | null;
  invitation_expires_at?: string | null;
  invitation_used_at?: string | null;
  invited_telegram_user_id?: string | null;
  resulting_driver_id?: number | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  rejection_reason?: string | null;
  created_at: string;
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

// Types for Pickup Locations (M2.1 Seção 12)
interface PickupLocation {
  id: number;
  name: string;
  address: string;
  neighborhood?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// Types for Multi-Stop Routes (M2.1 & M4)
type RouteStatus =
  | 'DRAFT'
  | 'OFFERED'
  | 'ACCEPTED'
  | 'ARRIVED_PICKUP'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'COMPLETED'
  | 'CANCELLED';

type RouteStopStatus = 'PENDING' | 'DELIVERED' | 'INCIDENT' | 'CANCELLED';
type DeliveryMode = 'IN_PERSON' | 'NO_CONTACT';
type IncidentResolutionStatus = 'OPEN' | 'RESOLVED';
type IncidentResolutionType =
  | 'RETURN_TO_ORIGIN'
  | 'DELIVERED_LATER'
  | 'DELIVERED_TO_ALTERNATIVE_LOCATION'
  | 'CUSTOMER_PICKUP'
  | 'DISCARDED'
  | 'CANCELLATION'
  | 'OTHER';

const INCIDENT_RESOLUTION_OPTIONS: {
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
    type: 'CANCELLATION',
    label: 'Corrida Cancelada / Tratativa Administrativa',
    description: 'Cancelamento operacional tratado com cliente/motorista.',
    icon: '❌',
  },
  {
    type: 'OTHER',
    label: 'Outro',
    description: 'Outra resolução operacional negociada diretamente com o cliente.',
    icon: '📝',
  },
];

interface RouteStop {
  id: number;
  route_id: number;
  sequence: number;
  destination_address: string;
  destination_neighborhood: string;
  cargo_description: string;
  delivery_mode: DeliveryMode;
  pin_code?: string | null;
  delivered_at?: string | null;
  proof_type?: 'PIN' | 'PHOTO' | null;
  proof_reference?: string | null;
  incident_type?: string | null;
  incident_note?: string | null;
  incident_at?: string | null;
  incident_resolution_status?: IncidentResolutionStatus | null;
  resolution_type?: IncidentResolutionType | null;
  resolution_note?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  compensation_amount?: number | string | null;
  // M4.2 Fields
  modality_code?: string;
  neighborhood_id?: number | null;
  pricing_vehicle_category?: PricingVehicleCategory | null;
  customer_freight?: number | null;
  net_delivery_base?: number | null;
  management_amount?: number | null;
  observations: string | null;
  desired_deadline: string | null;
  status: RouteStopStatus;
  created_at: string;
  completed_at: string | null;
}

export type PricingVehicleCategory = 'CAR' | 'MOTO' | 'MOTO_WITH_BAG';

export interface DeliveryModality {
  id: number;
  name: string;
  code: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Neighborhood {
  id: number;
  name: string;
  normalized_name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FreightPrice {
  id: number;
  neighborhood_id: number;
  modality_code: string;
  vehicle_category: PricingVehicleCategory;
  price: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  neighborhood_name?: string;
}

export interface DeliveryConfiguration {
  logistics_management_rate: number;
  default_route_discount_percent: number;
}

/** Data/hora no horário de Brasília, ex.: "17/11 15:00". */
function fmtScheduleBRT(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
}

interface Route {
  id: number;
  // Agendamento (route_schedules): data/hora de entrega e publicação programada da oferta
  scheduled_for?: string | null;
  publish_at?: string | null;
  publish_error?: string | null;
  pickup_type: 'REGISTERED' | 'AD_HOC';
  pickup_location_id: number | null;
  pickup_name: string;
  pickup_address: string;
  pickup_neighborhood_snapshot?: string | null;
  final_deadline: string;
  total_fee: string;
  accepted_vehicle_types: VehicleType[];
  status: RouteStatus;
  accepted_driver_id: number | null;
  accepted_driver?: Driver | null;
  accepted_at: string | null;
  arrived_pickup_at?: string | null;
  picked_up_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  payment_status: 'PENDING' | 'PAID';
  paid_at?: string | null;
  paid_by?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  payment_note?: string | null;
  // M4.2 Financial Fields
  customer_freight_total?: number | null;
  management_rate_snapshot?: number | null;
  management_amount_total?: number | null;
  route_base_amount?: number | null;
  route_discount_percent_snapshot?: number | null;
  suggested_driver_fee?: number | null;
  final_driver_fee?: number | null;
  override_reason?: string | null;
  // M4.4 Versioning & Edit Control
  route_version?: number;
  driver_acknowledged_version?: number;
  change_pending_driver_approval?: boolean;
  pending_material_change?: string | null;
  created_at: string;
  offered_at: string | null;
  stops?: RouteStop[];
}

interface OperationalIncidentItem {
  stop: RouteStop;
  route: Route;
  driver: Driver | null;
}

interface PaymentsDataResponse {
  summary: {
    totalPendingAmount: number;
    totalPaidAmount: number;
    pendingRoutesCount: number;
    paidRoutesCount: number;
    totalCompletedRoutesCount: number;
  };
  driversSummary: {
    driver: Driver;
    pendingAmount: number;
    pendingRoutesCount: number;
    paidAmount: number;
    paidRoutesCount: number;
  }[];
  routes: {
    route: Route;
    driver: Driver | null;
  }[];
}

interface ReferralVehicleAuditItem {
  driver_id: number;
  driver_name: string;
  driver_phone: string;
  vehicle_type: VehicleType;
  driver_status: string;
  driver_created_at: string;
  referral_id: number;
  referred_name: string;
  referred_phone: string;
  referred_by_driver_id: number;
  indicator_name: string | null;
  indicator_vehicle_type: string | null;
  is_potentially_affected: boolean;
  audit_note: string;
}

interface RouteDispatch {
  id: number;
  route_id: number;
  driver_id: number;
  telegram_chat_id: string;
  telegram_message_id?: string | null;
  status: 'SENT' | 'FAILED';
  sent_at: string;
  error_code: string | null;
}

interface RouteEvent {
  id: number;
  route_id: number;
  event_type: string;
  timestamp: string;
  actor: string | null;
  details?: string | null;
}

interface RouteDetails {
  route: Route;
  driver?: Driver | null;
  dispatches: RouteDispatch[];
  events: RouteEvent[];
  stats: { sent: number; failed: number };
}

interface TelegramStatus {
  configured: boolean;
  polling: boolean;
  botUsername: string | null;
  activeSessions: number;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  // Chave administrativa digitada manualmente (opcional). A antiga chave padrão não vale mais e é apagada.
  const readStoredAdminKey = () => {
    try {
      const k = localStorage.getItem('kantine_admin_key') || '';
      if (k === 'kantine-admin-secure-key-' + '2026') { localStorage.removeItem('kantine_admin_key'); return ''; }
      return k;
    } catch { return ''; }
  };
  const [adminKey, setAdminKey] = useState<string>(readStoredAdminKey);
  const [useAdminKey, setUseAdminKey] = useState<boolean>(() => !!readStoredAdminKey());
  const [authReady, setAuthReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  // Main navigation tab
  const [activeTab, setActiveTab] = useState<
    'ROUTES' | 'LOCATIONS' | 'DRIVERS' | 'REFERRALS' | 'INCIDENTS' | 'PAYMENTS' | 'SETTINGS'
  >('ROUTES');

  // M4.2 Configurações de Entrega, Modalidades, Bairros & Tabela de Fretes
  const [settingsSubTab, setSettingsSubTab] = useState<'MODALITIES' | 'NEIGHBORHOODS' | 'PRICING_TABLE' | 'CONFIG'>('MODALITIES');
  const [modalitiesList, setModalitiesList] = useState<DeliveryModality[]>([]);
  const [loadingModalities, setLoadingModalities] = useState<boolean>(false);
  const [newModalityName, setNewModalityName] = useState<string>('');
  const [newModalityCode, setNewModalityCode] = useState<string>('');
  const [savingModality, setSavingModality] = useState<boolean>(false);

  const [neighborhoodsList, setNeighborhoodsList] = useState<Neighborhood[]>([]);
  const [loadingNeighborhoods, setLoadingNeighborhoods] = useState<boolean>(false);
  const [newNeighborhoodName, setNewNeighborhoodName] = useState<string>('');
  const [savingNeighborhood, setSavingNeighborhood] = useState<boolean>(false);

  const [freightPricesList, setFreightPricesList] = useState<FreightPrice[]>([]);
  const [loadingFreightPrices, setLoadingFreightPrices] = useState<boolean>(false);
  const [priceNeighborhoodFilter, setPriceNeighborhoodFilter] = useState<string>('ALL');
  const [priceModalityFilter, setPriceModalityFilter] = useState<string>('ALL');
  const [priceVehicleCategoryFilter, setPriceVehicleCategoryFilter] = useState<string>('ALL');

  const [showPriceModal, setShowPriceModal] = useState<boolean>(false);
  const [priceFormNeighborhoodId, setPriceFormNeighborhoodId] = useState<number>(0);
  const [priceFormModalityCode, setPriceFormModalityCode] = useState<string>('BOLO');
  const [priceFormVehicleCategory, setPriceFormVehicleCategory] = useState<PricingVehicleCategory>('CAR');
  const [priceFormAmount, setPriceFormAmount] = useState<string>('');
  const [savingPrice, setSavingPrice] = useState<boolean>(false);

  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfiguration | null>(null);
  const [loadingDeliveryConfig, setLoadingDeliveryConfig] = useState<boolean>(false);
  const [configManagementRateInput, setConfigManagementRateInput] = useState<string>('10');
  const [configRouteDiscountInput, setConfigRouteDiscountInput] = useState<string>('20');
  const [savingConfig, setSavingConfig] = useState<boolean>(false);

  // M4.1 Parte B: Incidentes Operacionais (⚠️ PENDÊNCIAS)
  const [incidentsList, setIncidentsList] = useState<OperationalIncidentItem[]>([]);
  const [incidentResolutionFilter, setIncidentResolutionFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('OPEN');
  const [loadingIncidents, setLoadingIncidents] = useState<boolean>(false);
  const [incidentSearch, setIncidentSearch] = useState<string>('');
  const [resolvingStop, setResolvingStop] = useState<OperationalIncidentItem | null>(null);
  const [selectedResolutionType, setSelectedResolutionType] = useState<IncidentResolutionType>('RETURN_TO_ORIGIN');
  const [resolutionNoteInput, setResolutionNoteInput] = useState<string>('');
  const [resolutionCompensationInput, setResolutionCompensationInput] = useState<string>('');
  const [submittingResolution, setSubmittingResolution] = useState<boolean>(false);

  // M4.1 Parte C: Gestão de Pagamentos das Rotas (💰 PAGAMENTOS)
  const [paymentsData, setPaymentsData] = useState<PaymentsDataResponse | null>(null);

  // Integração Takeat (Delivery Próprio & Motor de Fretes)
  const [pendingTakeatCount, setPendingTakeatCount] = useState<number>(0);
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'PENDING' | 'PAID'>('ALL');
  const [selectedDriverFilter, setSelectedDriverFilter] = useState<number | null>(null);
  const [paymentSearch, setPaymentSearch] = useState<string>('');
  const [loadingPayments, setLoadingPayments] = useState<boolean>(false);
  const [payingRoute, setPayingRoute] = useState<{ route: Route; driver: Driver | null } | null>(null);
  const [paymentMethodInput, setPaymentMethodInput] = useState<string>('PIX');
  const [paymentReferenceInput, setPaymentReferenceInput] = useState<string>('');
  const [paymentNoteInput, setPaymentNoteInput] = useState<string>('');
  const [submittingPayment, setSubmittingPayment] = useState<boolean>(false);
  const [submittingMpPayout, setSubmittingMpPayout] = useState<boolean>(false);
  const [mpPayoutFeedback, setMpPayoutFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [finalizingRouteId, setFinalizingRouteId] = useState<number | null>(null);

  // Destaques e Ações Imediatas (Alertas Pulsantes)
  const [pendingApprovalDriversCount, setPendingApprovalDriversCount] = useState<number>(0);
  const [openIncidentsCount, setOpenIncidentsCount] = useState<number>(0);

  // M4.1 Parte A: Auditoria de Veículos dos Indicados
  const [vehicleAuditList, setVehicleAuditList] = useState<ReferralVehicleAuditItem[]>([]);
  const [loadingVehicleAudit, setLoadingVehicleAudit] = useState<boolean>(false);
  const [showVehicleAuditModal, setShowVehicleAuditModal] = useState<boolean>(false);
  const [correctingVehicleDriver, setCorrectingVehicleDriver] = useState<ReferralVehicleAuditItem | null>(null);
  const [newVehicleTypeInput, setNewVehicleTypeInput] = useState<VehicleType>('CAR');
  const [savingVehicleCorrection, setSavingVehicleCorrection] = useState<boolean>(false);

  // Referrals State (M1.2 Rede Fechada de Indicação)
  const [referralsList, setReferralsList] = useState<DriverReferralItem[]>([]);
  const [referralFilter, setReferralFilter] = useState<'ALL' | DriverReferralStatus>('ALL');
  const [loadingReferrals, setLoadingReferrals] = useState<boolean>(false);
  const [referralSearch, setReferralSearch] = useState<string>('');
  const [actionLoadingReferralId, setActionLoadingReferralId] = useState<number | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState<boolean>(false);
  const [rejectingReferralId, setRejectingReferralId] = useState<number | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState<string>('');

  // Drivers State (M1 & M1.1 & Lifecycle)
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverFilter, setDriverFilter] = useState<
    'ALL' | DriverStatus | 'REACTIVATION_REQUESTED' | 'REINCLUSION_REQUESTED'
  >('ALL');
  const [loadingDrivers, setLoadingDrivers] = useState<boolean>(true);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [driverEvents, setDriverEvents] = useState<DriverEvent[]>([]);
  const [loadingDriverEvents, setLoadingDriverEvents] = useState<boolean>(false);

  // Exclusion & Decision Modal States
  const [excludingDriver, setExcludingDriver] = useState<Driver | null>(null);
  const [exclusionReasonInput, setExclusionReasonInput] = useState<string>('');
  const [submittingExclusion, setSubmittingExclusion] = useState<boolean>(false);

  const [decisionDriver, setDecisionDriver] = useState<Driver | null>(null);
  const [decisionType, setDecisionType] = useState<
    'REJECT_REACTIVATION' | 'APPROVE_REINCLUSION' | 'REJECT_REINCLUSION' | null
  >(null);
  const [decisionReasonInput, setDecisionReasonInput] = useState<string>('');
  const [decisionTargetStatus, setDecisionTargetStatus] = useState<'ACTIVE' | 'PENDING'>('ACTIVE');
  const [submittingDecision, setSubmittingDecision] = useState<boolean>(false);

  // Driver Editing State (M1.1)
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [editFormData, setEditFormData] = useState<{
    name: string;
    phone: string;
    vehicle_type: string;
    vehicle_types: VehicleType[];
    pix_key_type: 'CPF' | 'PHONE' | 'EMAIL' | 'RANDOM';
    pix_key_value: string;
  }>({
    name: '',
    phone: '',
    vehicle_type: 'CAR',
    vehicle_types: ['CAR'],
    pix_key_type: 'CPF',
    pix_key_value: '',
  });
  const [savingDriverEdit, setSavingDriverEdit] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Driver Invitation State
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [inviteModalTab, setInviteModalTab] = useState<'QUICK' | 'DIRECT' | 'HISTORY'>('QUICK');
  const [invitationsList, setInvitationsList] = useState<DriverInvitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState<boolean>(false);
  const [defaultInviteLink, setDefaultInviteLink] = useState<string>('');
  const [inviteFormData, setInviteFormData] = useState<{
    name: string;
    phone: string;
    vehicle_type: string;
    vehicle_types: VehicleType[];
  }>({
    name: '',
    phone: '',
    vehicle_type: 'CAR',
    vehicle_types: ['CAR'],
  });
  const [generatingInvite, setGeneratingInvite] = useState<boolean>(false);
  const [generatedInvite, setGeneratedInvite] = useState<{
    invitation: DriverInvitation;
    inviteLink: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [showResetSystemModal, setShowResetSystemModal] = useState<boolean>(false);
  const [resettingSystem, setResettingSystem] = useState<boolean>(false);

  const handleResetSystemHistory = async () => {
    setResettingSystem(true);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/system/reset-drivers-history', {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        setSuccessMessage(data.message || 'Todos os motoristas e históricos foram limpos com sucesso!');
        setShowResetSystemModal(false);
        await fetchDrivers();
        await fetchInvitations();
        await fetchRoutes();
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || 'Falha ao resetar motoristas e histórico');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao conectar ao servidor');
    } finally {
      setResettingSystem(false);
    }
  };

  // Pickup Locations State (M2.1 Seção 12)
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [loadingLocations, setLoadingLocations] = useState<boolean>(false);
  const [showLocationModal, setShowLocationModal] = useState<boolean>(false);
  const [editingLocation, setEditingLocation] = useState<PickupLocation | null>(null);
  const [locationFormData, setLocationFormData] = useState<{
    name: string;
    address: string;
    neighborhood: string;
    active: boolean;
  }>({
    name: '',
    address: '',
    neighborhood: '',
    active: true,
  });
  const [savingLocation, setSavingLocation] = useState<boolean>(false);

  // Routes State (M2.1)
  const [routesList, setRoutesList] = useState<Route[]>([]);
  const [allRoutesList, setAllRoutesList] = useState<Route[]>([]);
  const [routeFilter, setRouteFilter] = useState<'ALL' | RouteStatus>('ALL');
  const [loadingRoutes, setLoadingRoutes] = useState<boolean>(true);
  const [showCreateRouteModal, setShowCreateRouteModal] = useState<boolean>(false);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [selectedRouteDetails, setSelectedRouteDetails] = useState<RouteDetails | null>(null);
  const [loadingRouteDetails, setLoadingRouteDetails] = useState<boolean>(false);

  // Cancellation Modal State
  const [routeToCancel, setRouteToCancel] = useState<Route | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState<string>('');
  const [cancelCompensationInput, setCancelCompensationInput] = useState<string>('');
  const [cancelResolutionType, setCancelResolutionType] = useState<IncidentResolutionType | 'OPEN'>('OPEN');

  // M4.4 Route Edit State
  const [editingRouteId, setEditingRouteId] = useState<number | null>(null);

  // Pre-Publish Summary Modal State (Seção 25)
  const [routeToPublish, setRouteToPublish] = useState<Route | null>(null);

  // Route Simulation Acceptance State
  const [simulatingDriverId, setSimulatingDriverId] = useState<number | null>(null);
  const [simulatingAcceptance, setSimulatingAcceptance] = useState<boolean>(false);

  // M4 Operational State
  const [operationalLoading, setOperationalLoading] = useState<boolean>(false);
  const [selectedStopForPin, setSelectedStopForPin] = useState<RouteStop | null>(null);
  const [pinInput, setPinInput] = useState<string>('');
  const [selectedStopForPhoto, setSelectedStopForPhoto] = useState<RouteStop | null>(null);
  const [photoRefInput, setPhotoRefInput] = useState<string>('');
  const [selectedStopForIncident, setSelectedStopForIncident] = useState<RouteStop | null>(null);
  const [incidentTypeInput, setIncidentTypeInput] = useState<string>('CLIENTE_AUSENTE');
  const [incidentNoteInput, setIncidentNoteInput] = useState<string>('');
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState<boolean>(false);

  // Synchronized state refs to prevent stale closures during background polling and async handlers
  const driverFilterRef = useRef(driverFilter);
  driverFilterRef.current = driverFilter;

  const routeFilterRef = useRef(routeFilter);
  routeFilterRef.current = routeFilter;

  const referralFilterRef = useRef(referralFilter);
  referralFilterRef.current = referralFilter;

  const incidentResolutionFilterRef = useRef(incidentResolutionFilter);
  incidentResolutionFilterRef.current = incidentResolutionFilter;

  const paymentFilterRef = useRef(paymentFilter);
  paymentFilterRef.current = paymentFilter;

  const selectedDriverFilterRef = useRef(selectedDriverFilter);
  selectedDriverFilterRef.current = selectedDriverFilter;

  const incidentSearchRef = useRef(incidentSearch);
  incidentSearchRef.current = incidentSearch;

  const referralSearchRef = useRef(referralSearch);
  referralSearchRef.current = referralSearch;

  const paymentSearchRef = useRef(paymentSearch);
  paymentSearchRef.current = paymentSearch;

  // ==============================================================
  // DESTAQUES E AÇÕES IMEDIATAS (Alertas Pulsantes para o Atendente)
  // ==============================================================
  const pendingReferralsCount = referralsList.filter(
    (r) => r.status === 'PENDING_REVIEW'
  ).length;

  const pendingPaymentsCount = paymentsData?.summary.pendingRoutesCount || 0;

  // Pendências em aberto: apenas ocorrências operacionais não resolvidas (evita falso alerta quando todas estão resolvidas)
  const totalPendenciasCount = openIncidentsCount;

  // Contagem dinâmica de rotas por status e rotas em fluxo operacional
  // Status em fluxo ativo: corridas em andamento ou que requerem ação/monitoramento contínuo
  const FLUX_STATUSES: RouteStatus[] = [
    'OFFERED',
    'ACCEPTED',
    'ARRIVED_PICKUP',
    'PICKED_UP',
    'IN_TRANSIT',
  ];

  const routeStatusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: 0,
      DRAFT: 0,
      OFFERED: 0,
      ACCEPTED: 0,
      ARRIVED_PICKUP: 0,
      PICKED_UP: 0,
      IN_TRANSIT: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };

    const sourceRoutes = allRoutesList.length > 0 ? allRoutesList : routesList;
    counts.ALL = sourceRoutes.length;

    for (const r of sourceRoutes) {
      if (r.status && counts[r.status] !== undefined) {
        counts[r.status] = (counts[r.status] || 0) + 1;
      }
    }
    return counts;
  }, [allRoutesList, routesList]);

  // Total de corridas em fluxo operacional no momento
  const inFluxRoutesCount = useMemo(() => {
    return (
      (routeStatusCounts['OFFERED'] || 0) +
      (routeStatusCounts['ACCEPTED'] || 0) +
      (routeStatusCounts['ARRIVED_PICKUP'] || 0) +
      (routeStatusCounts['PICKED_UP'] || 0) +
      (routeStatusCounts['IN_TRANSIT'] || 0)
    );
  }, [routeStatusCounts]);

  // Rascunhos aguardando revisão (os que já têm oferta agendada contam à parte)
  const scheduledRoutesCount = useMemo(
    () => (allRoutesList.length > 0 ? allRoutesList : routesList).filter((r) => r.status === 'DRAFT' && r.publish_at).length,
    [allRoutesList, routesList]
  );
  const draftRoutesCount = Math.max(0, (routeStatusCounts['DRAFT'] || 0) - scheduledRoutesCount);

  const hasCriticalAlerts =
    pendingApprovalDriversCount > 0 ||
    pendingReferralsCount > 0 ||
    totalPendenciasCount > 0 ||
    pendingPaymentsCount > 0 ||
    pendingTakeatCount > 0 ||
    inFluxRoutesCount > 0 ||
    draftRoutesCount > 0;

  // New Route Form State (Motor de Fretes Kantine)
  interface FormStop {
    destination_address: string;
    destination_neighborhood: string;
    neighborhood_id?: number | null;
    modality_code: string;
    pricing_vehicle_category: PricingVehicleCategory;
    customer_freight: string;
    suggested_price?: number;
    cargo_description: string;
    delivery_mode: DeliveryMode;
    desired_deadline: string;
    observations: string;
    is_horizontal_condo: boolean;
    dropoff_coords?: { lat: number; lng: number };
  }

  const [newRoute, setNewRoute] = useState<{
    modality: 'CAR' | 'MOTO';
    pickup_type: 'REGISTERED' | 'AD_HOC';
    pickup_location_id: number;
    pickup_name: string;
    pickup_address: string;
    pickup_neighborhood: string;
    final_deadline: string;
    total_fee: string;
    override_driver_fee: string;
    override_reason: string;
    accepted_vehicle_types: VehicleType[];
    stops: FormStop[];
  }>({
    modality: 'MOTO',
    pickup_type: 'REGISTERED',
    pickup_location_id: 1,
    pickup_name: '',
    pickup_address: '',
    pickup_neighborhood: '',
    final_deadline: '50 min',
    total_fee: '15,50',
    override_driver_fee: '',
    override_reason: '',
    accepted_vehicle_types: [
      'MOTO',
      'MOTO_WITH_BAG',
    ],
    stops: [
      {
        destination_address: '',
        destination_neighborhood: 'Centro',
        neighborhood_id: null,
        modality_code: 'CONVENCIONAL',
        pricing_vehicle_category: 'MOTO',
        customer_freight: '',
        cargo_description: 'Encomenda Kantine',
        delivery_mode: 'IN_PERSON',
        desired_deadline: '',
        observations: '',
        is_horizontal_condo: false,
      },
    ],
  });
  const [submittingRouteDraft, setSubmittingRouteDraft] = useState<boolean>(false);

  // Telegram bot state & config modal
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [showBotModal, setShowBotModal] = useState<boolean>(false);
  const [tokenInput, setTokenInput] = useState<string>('');
  const [tokenSaving, setTokenSaving] = useState<boolean>(false);

  // Alerts
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Auth observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const getAuthHeaders = async (): Promise<HeadersInit> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Login Google tem prioridade; a chave administrativa só vai se digitada (sem chave padrão embutida)
    if (currentUser) {
      const token = await currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
      return headers;
    }

    if (useAdminKey && adminKey.trim()) {
      headers['x-admin-key'] = adminKey.trim();
    }
    return headers;
  };

  // Confere se a conta logada tem acesso ao painel (e-mail autorizado no servidor)
  useEffect(() => {
    if (!authReady) return;
    if (!currentUser && !(useAdminKey && adminKey.trim())) { setAccessError(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/takeat/pending-count', { headers: await getAuthHeaders() });
        if (cancelled) return;
        if (res.status === 401 || res.status === 403 || res.status === 503) {
          const body = await res.json().catch(() => ({}));
          setAccessError(body.message || 'Acesso não autorizado ao painel.');
        } else {
          setAccessError(null);
        }
      } catch { /* rede: não bloqueia */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, currentUser, useAdminKey, adminKey]);

  const safeFetchJson = async <T,>(url: string, init?: RequestInit): Promise<T | null> => {
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        return null;
      }
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return null;
      }
      return (await res.json()) as T;
    } catch {
      return null;
    }
  };

  const fetchTakeatPendingCount = async (silent: boolean = false) => {
    try {
      const headers = await getAuthHeaders();
      const data = await safeFetchJson<{ count?: number }>('/api/admin/takeat/pending-count', { headers });
      if (data && typeof data.count !== 'undefined') {
        setPendingTakeatCount(Number(data.count || 0));
      }
    } catch (err: any) {
      if (!silent) console.warn('[fetchTakeatPendingCount error]', err?.message);
    }
  };

  const fetchDrivers = async (overrideFilter?: any, isBackground = false) => {
    const filterToUse = overrideFilter !== undefined ? overrideFilter : driverFilterRef.current;
    if (!isBackground) setLoadingDrivers(true);
    try {
      const headers = await getAuthHeaders();
      const allData = await safeFetchJson<Driver[]>('/api/admin/drivers', { headers });

      if (allData && Array.isArray(allData)) {
        const pendingCount = allData.filter(
          (d) => d.status === 'PENDING' || d.reactivation_requested || d.reinclusion_requested
        ).length;
        setPendingApprovalDriversCount(pendingCount);

        let data = allData;
        if (
          filterToUse === 'PENDING' ||
          filterToUse === 'ACTIVE' ||
          filterToUse === 'BLOCKED' ||
          filterToUse === 'EXCLUDED'
        ) {
          data = allData.filter((d) => d.status === filterToUse);
        } else if (filterToUse === 'REACTIVATION_REQUESTED') {
          data = allData.filter((d) => d.reactivation_requested);
        } else if (filterToUse === 'REINCLUSION_REQUESTED') {
          data = allData.filter((d) => d.reinclusion_requested);
        }
        setDrivers(data);
      }
    } catch (err: any) {
      console.warn('Error fetching drivers', err);
    } finally {
      if (!isBackground) setLoadingDrivers(false);
    }
  };

  const fetchPickupLocations = async () => {
    setLoadingLocations(true);
    try {
      const headers = await getAuthHeaders();
      const data = await safeFetchJson<PickupLocation[]>('/api/admin/pickup-locations', { headers });
      if (data && Array.isArray(data)) {
        setPickupLocations(data);
        if (data.length > 0 && !newRoute.pickup_location_id) {
          setNewRoute((prev) => ({ ...prev, pickup_location_id: data[0].id }));
        }
      }
    } catch (err: any) {
      console.warn('Error fetching pickup locations', err);
    } finally {
      setLoadingLocations(false);
    }
  };

  const fetchRoutes = async (targetFilter?: 'ALL' | RouteStatus, isBackground = false) => {
    const activeF = targetFilter !== undefined ? targetFilter : routeFilterRef.current;
    if (!isBackground) setLoadingRoutes(true);
    try {
      const headers = await getAuthHeaders();
      // Sempre que filtrado por 'ALL', atualizamos allRoutesList diretamente
      // Se filtrado por status específico, também buscamos a visão global de todas as rotas em background se allRoutesList estiver vazio
      const url =
        activeF === 'ALL'
          ? '/api/admin/routes'
          : `/api/admin/routes?status=${activeF}`;
      const data = await safeFetchJson<Route[]>(url, { headers });

      if (data && Array.isArray(data)) {
        setRoutesList(data);
        if (activeF === 'ALL') {
          setAllRoutesList(data);
        }
      }

      // Se estamos em um filtro específico, garantimos que allRoutesList continue atualizado em background para os contadores e destaques pulsantes
      if (activeF !== 'ALL') {
        safeFetchJson<Route[]>('/api/admin/routes', { headers })
          .then((allData) => {
            if (allData && Array.isArray(allData)) {
              setAllRoutesList(allData);
            }
          })
          .catch(() => {});
      }
    } catch (err: any) {
      console.warn('Error fetching routes', err);
    } finally {
      if (!isBackground) setLoadingRoutes(false);
    }
  };

  const handleSelectRouteFilter = (filter: 'ALL' | RouteStatus) => {
    setRouteFilter(filter);
    fetchRoutes(filter);
  };

  const handleQuickUpdateVehicleType = async (routeId: number, vehicles: VehicleType[]) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/routes/${routeId}/vehicle-types`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ accepted_vehicle_types: vehicles }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao atualizar veículos da rota');
      }
      const data = await res.json();
      setSuccessMessage(`✅ Veículos da Rota #${routeId} atualizados com sucesso!`);
      await fetchRoutes();
      if (selectedRouteDetails?.route.id === routeId) {
        openRouteDetails(routeId);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const fetchTelegramStatus = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/telegram/status', { headers });
      if (res.ok) {
        const data = await res.json();
        setTelegramStatus(data);
      }
    } catch (e) {
      // ignore
    }
  };

  const fetchInvitations = async () => {
    setLoadingInvitations(true);
    try {
      const headers = await getAuthHeaders();
      const data = await safeFetchJson<{ invitations?: DriverInvitation[]; defaultInviteLink?: string }>(
        '/api/admin/driver-invitations',
        { headers }
      );
      if (data) {
        setInvitationsList(data.invitations || []);
        if (data.defaultInviteLink) {
          setDefaultInviteLink(data.defaultInviteLink);
        }
      }
    } catch (err: any) {
      console.warn('Error fetching driver invitations', err);
    } finally {
      setLoadingInvitations(false);
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneratingInvite(true);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/driver-invitations', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: inviteFormData.name.trim() || undefined,
          phone: inviteFormData.phone.trim() || undefined,
          vehicle_type: inviteFormData.vehicle_type,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao gerar convite');
      }

      const data = await res.json();
      setGeneratedInvite({
        invitation: data.invitation,
        inviteLink: data.inviteLink,
      });
      setSuccessMessage('Convite gerado com sucesso!');
      await fetchInvitations();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao gerar convite.');
    } finally {
      setGeneratingInvite(false);
    }
  };

  const handleCancelInvite = async (id: number) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/driver-invitations/${id}/cancel`, {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        setSuccessMessage('Convite cancelado.');
        await fetchInvitations();
      }
    } catch (err) {
      // ignore
    }
  };

  const handleConvertToDriver = async (invitationId: number) => {
    setActionLoadingId(invitationId);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/driver-invitations/${invitationId}/convert`, {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        setSuccessMessage('Convite convertido em cadastro pendente com sucesso! Motorista disponível na fila de aprovação.');
        await fetchDrivers();
        await fetchInvitations();
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || 'Falha ao converter convite em cadastro');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao converter convite em cadastro');
    } finally {
      setActionLoadingId(null);
    }
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    } catch (err) {
      console.warn('Clipboard write failed', err);
    }
  };

  const handleOpenCustomerWhatsApp = (stop: {
    id?: number;
    sequence?: number;
    pin_code?: string | null;
    destination_address?: string | null;
    destination_neighborhood?: string | null;
    cargo_description?: string | null;
    observations?: string | null;
  }) => {
    const pin = (stop.pin_code || '').trim();
    if (!pin) return;

    // Localizar dados e número de WhatsApp do cliente nos campos da parada
    const customerInfo = extractCustomerData(stop);
    let cleanPhone = '';
    if (customerInfo.rawDigits) {
      cleanPhone = customerInfo.rawDigits.startsWith('55')
        ? customerInfo.rawDigits
        : `55${customerInfo.rawDigits}`;
    }

    const saudacao = customerInfo.name ? `Olá, *${customerInfo.name}*! Tudo bem?` : `Olá! Tudo bem?`;
    const message =
      `${saudacao} Passando para avisar que o seu pedido da *Kantine Gastronomia* já saiu para coleta com nosso entregador parceiro! 🛵📦\n\n` +
      `Por favor, faça a gentileza de informar o código abaixo para o motorista no ato da entrega:\n\n` +
      `🔑 *Código do Cliente:* ${pin}\n\n` +
      `Assim garantimos que seu pedido seja entregue com total rapidez e segurança.\n\n` +
      `Muito obrigado!\n*Kantine Gastronomia*`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodedMessage}`
      : `https://api.whatsapp.com/send?text=${encodedMessage}`;

    const link = document.createElement('a');
    link.href = whatsappUrl;
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    copyToClipboard(pin, `pin_whatsapp_${stop.id}`);
  };

  useEffect(() => {
    if (selectedRouteDetails) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setSelectedRouteDetails(null);
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = prevOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [selectedRouteDetails]);

  useEffect(() => {
    const link =
      generatedInvite?.inviteLink ||
      defaultInviteLink ||
      (telegramStatus?.botUsername
        ? `https://t.me/${telegramStatus.botUsername}?start=cadastro`
        : 'https://t.me/KantineEntregasbot?start=cadastro');

    if (link) {
      QRCode.toDataURL(link, {
        width: 240,
        margin: 2,
        color: { dark: '#09090b', light: '#ffffff' },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('Error creating QR code', err));
    }
  }, [generatedInvite, defaultInviteLink, telegramStatus?.botUsername]);

  // Referrals API Handlers (M1.2)
  const fetchReferrals = async (overrideFilter?: any, isBackground = false) => {
    const filterToUse = overrideFilter !== undefined ? overrideFilter : referralFilterRef.current;
    if (!isBackground) setLoadingReferrals(true);
    try {
      const headers = await getAuthHeaders();
      let url = '/api/admin/referrals';
      const params = new URLSearchParams();
      if (filterToUse !== 'ALL') params.set('status', filterToUse);
      if (referralSearchRef.current) params.set('search', referralSearchRef.current);
      if (params.toString()) url += `?${params.toString()}`;

      const data = await safeFetchJson<DriverReferralItem[]>(url, { headers });
      if (data && Array.isArray(data)) {
        setReferralsList(data);
      }
    } catch (err: any) {
      console.warn('Failed to fetch referrals', err);
    } finally {
      if (!isBackground) setLoadingReferrals(false);
    }
  };

  const handleApproveReferral = async (id: number) => {
    setActionLoadingReferralId(id);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/referrals/${id}/approve`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao aprovar indicação');
      setSuccessMessage('✅ Indicação aprovada! Convite seguro gerado e enviado ao motorista indicador.');
      await fetchReferrals();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setActionLoadingReferralId(null);
    }
  };

  const handleOpenRejectModal = (id: number) => {
    setRejectingReferralId(id);
    setRejectionReasonInput('');
    setRejectModalOpen(true);
  };

  const handleConfirmRejectReferral = async () => {
    if (!rejectingReferralId) return;
    setActionLoadingReferralId(rejectingReferralId);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/referrals/${rejectingReferralId}/reject`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: rejectionReasonInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao recusar indicação');
      setSuccessMessage('Indicação recusada com sucesso.');
      setRejectModalOpen(false);
      setRejectingReferralId(null);
      await fetchReferrals();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setActionLoadingReferralId(null);
    }
  };

  // ==========================================
  // M4.1 PARTE B: Incidentes Operacionais (⚠️ PENDÊNCIAS) Handlers
  // ==========================================
  const fetchIncidents = async (overrideFilter?: 'ALL' | 'OPEN' | 'RESOLVED', isBackground = false) => {
    const filterToUse = overrideFilter !== undefined ? overrideFilter : incidentResolutionFilterRef.current;
    if (!isBackground) setLoadingIncidents(true);
    try {
      const headers = await getAuthHeaders();

      // Always query open incidents count to know active pendências
      try {
        const openData = await safeFetchJson<OperationalIncidentItem[]>('/api/admin/incidents?resolution_status=OPEN', { headers });
        if (openData && Array.isArray(openData)) {
          setOpenIncidentsCount(openData.length);
        }
      } catch (e) {
        // ignore
      }

      let url = '/api/admin/incidents';
      const params = new URLSearchParams();
      if (filterToUse !== 'ALL') params.set('resolution_status', filterToUse);
      if (incidentSearchRef.current) params.set('search', incidentSearchRef.current);
      if (params.toString()) url += `?${params.toString()}`;

      const data = await safeFetchJson<OperationalIncidentItem[]>(url, { headers });
      if (data && Array.isArray(data)) {
        setIncidentsList(data);
      }
    } catch (err: any) {
      console.warn('Failed to fetch incidents', err);
    } finally {
      if (!isBackground) setLoadingIncidents(false);
    }
  };

  const handleOpenResolveIncidentModal = (item: OperationalIncidentItem) => {
    setResolvingStop(item);
    setSelectedResolutionType(
      item.stop.resolution_type ||
        (item.stop.incident_type === 'CORRIDA_CANCELADA' ? 'CANCELLATION' : 'RETURN_TO_ORIGIN')
    );
    setResolutionNoteInput(item.stop.resolution_note || '');
    if (item.stop.compensation_amount !== undefined && item.stop.compensation_amount !== null) {
      setResolutionCompensationInput(String(item.stop.compensation_amount));
    } else if (item.route.status === 'CANCELLED' && item.route.accepted_driver_id) {
      setResolutionCompensationInput(String(item.route.total_fee || ''));
    } else {
      setResolutionCompensationInput('');
    }
  };

  const handleConfirmResolveIncident = async () => {
    if (!resolvingStop) return;
    setSubmittingResolution(true);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const compAmount =
        resolutionCompensationInput.trim() !== ''
          ? parseFloat(resolutionCompensationInput.replace(',', '.'))
          : undefined;
      const res = await fetch(`/api/admin/stops/${resolvingStop.stop.id}/resolve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          resolution_type: selectedResolutionType,
          resolution_note: resolutionNoteInput,
          compensation_amount: !isNaN(compAmount as number) ? compAmount : undefined,
          adjust_route_fee: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao resolver incidente');
      setSuccessMessage('✅ Incidente resolvido com sucesso! A destinação da encomenda e os valores financeiros foram atualizados.');
      setResolvingStop(null);
      await fetchIncidents();
      await fetchRoutes();
      await fetchPayments();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmittingResolution(false);
    }
  };

  // Finalizar rota após tratamento e liberar para pagamento PIX
  const handleFinalizeRoute = async (routeId: number) => {
    if (
      !window.confirm(
        `Deseja finalizar a Rota #${routeId} e liberar para pagamento PIX?\n\nO motorista receberá a notificação de finalização e a rota entrará na fila do financeiro para repasse.`
      )
    ) {
      return;
    }
    setFinalizingRouteId(routeId);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/routes/${routeId}/finalize`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao finalizar rota');
      setSuccessMessage(
        `✅ Rota #${routeId} finalizada e liberada para pagamento PIX! O motorista foi notificado via Telegram.`
      );
      await fetchRoutes();
      await fetchPayments();
      await fetchIncidents();
      if (selectedRouteDetails?.route.id === routeId) {
        await openRouteDetails(routeId);
      }
    } catch (err: any) {
      setErrorMessage(`Erro ao finalizar rota: ${err.message}`);
    } finally {
      setFinalizingRouteId(null);
    }
  };

  // ==========================================
  // M4.1 PARTE C: Gestão de Pagamentos das Rotas (💰 PAGAMENTOS) Handlers
  // ==========================================
  const fetchPayments = async (overrideFilter?: any, isBackground = false) => {
    const filterToUse = overrideFilter !== undefined ? overrideFilter : paymentFilterRef.current;
    const driverFilterVal = selectedDriverFilterRef.current;
    if (!isBackground) setLoadingPayments(true);
    try {
      const headers = await getAuthHeaders();
      let url = '/api/admin/payments';
      const params = new URLSearchParams();
      if (filterToUse !== 'ALL') params.set('payment_status', filterToUse);
      if (driverFilterVal) params.set('driver_id', String(driverFilterVal));
      if (paymentSearchRef.current) params.set('search', paymentSearchRef.current);
      if (params.toString()) url += `?${params.toString()}`;

      const data = await safeFetchJson<PaymentsDataResponse>(url, { headers });
      if (data) {
        setPaymentsData(data);
      }
    } catch (err: any) {
      console.warn('Failed to fetch payments data', err);
    } finally {
      if (!isBackground) setLoadingPayments(false);
    }
  };

  const handleOpenPayRouteModal = (route: Route, driver: Driver | null) => {
    setPayingRoute({ route, driver });
    setPaymentMethodInput('PIX');
    setPaymentReferenceInput('');
    setPaymentNoteInput('');
  };

  const handleConfirmPayRoute = async () => {
    if (!payingRoute) return;
    setSubmittingPayment(true);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/routes/${payingRoute.route.id}/pay`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          payment_method: paymentMethodInput,
          payment_reference: paymentReferenceInput,
          payment_note: paymentNoteInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao registrar pagamento da rota');
      setSuccessMessage(`✅ Pagamento da Rota #${payingRoute.route.id} registrado com sucesso!`);
      setPayingRoute(null);
      await fetchPayments();
      await fetchRoutes();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handlePayWithMercadoPago = async () => {
    if (!payingRoute) return;
    setSubmittingMpPayout(true);
    setMpPayoutFeedback(null);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/routes/${payingRoute.route.id}/pay-mercadopago`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao processar repasse Pix via Mercado Pago');
      }
      setSuccessMessage(`✅ Repasse Pix via Mercado Pago enviado com sucesso! ID: ${data.payoutId || 'OK'}`);
      setPayingRoute(null);
      await fetchPayments();
      await fetchRoutes();
    } catch (err: any) {
      setMpPayoutFeedback({ type: 'error', message: err.message });
      setErrorMessage(err.message);
    } finally {
      setSubmittingMpPayout(false);
    }
  };

  // ==========================================
  // M4.1 PARTE A: Auditoria de Veículos dos Indicados Handlers
  // ==========================================
  const fetchVehicleAudit = async () => {
    setLoadingVehicleAudit(true);
    try {
      const headers = await getAuthHeaders();
      const data = await safeFetchJson<ReferralVehicleAuditItem[]>('/api/admin/drivers/referral-vehicle-audit', { headers });
      if (data && Array.isArray(data)) {
        setVehicleAuditList(data);
      }
    } catch (err: any) {
      console.warn('Failed to fetch vehicle audit', err);
    } finally {
      setLoadingVehicleAudit(false);
    }
  };

  const handleOpenCorrectVehicleModal = (item: ReferralVehicleAuditItem) => {
    setCorrectingVehicleDriver(item);
    setNewVehicleTypeInput(item.vehicle_type);
  };

  const handleSaveVehicleCorrection = async () => {
    if (!correctingVehicleDriver) return;
    setSavingVehicleCorrection(true);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/drivers/${correctingVehicleDriver.driver_id}/profile`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          vehicle_type: newVehicleTypeInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao atualizar veículo');
      setSuccessMessage(
        `✅ Veículo do motorista #${correctingVehicleDriver.driver_id} (${correctingVehicleDriver.driver_name}) corrigido para ${VEHICLE_DISPLAY[newVehicleTypeInput]?.label || newVehicleTypeInput}.`
      );
      setCorrectingVehicleDriver(null);
      await fetchVehicleAudit();
      await fetchDrivers();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSavingVehicleCorrection(false);
    }
  };

  // Só busca dados depois que o login (Google ou chave) estiver pronto: evita chamadas sem credencial (401)
  const canLoad = authReady && !accessError && (!!currentUser || (useAdminKey && !!adminKey.trim()));

  // Carga inicial e quando as credenciais/usuário mudarem
  useEffect(() => {
    if (!canLoad) return;
    fetchDrivers();
    fetchPickupLocations();
    fetchRoutes();
    fetchTelegramStatus();
    fetchInvitations();
    fetchReferrals();
    fetchIncidents();
    fetchPayments();
    fetchVehicleAudit();
    fetchTakeatPendingCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLoad, currentUser, useAdminKey, adminKey]);

  // Efeitos dedicados para cada filtro (evita disparar todas as requisições desnecessariamente)
  useEffect(() => {
    if (!canLoad) return;
    fetchDrivers(driverFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...[driverFilter], canLoad]);

  useEffect(() => {
    if (!canLoad) return;
    fetchRoutes(routeFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...[routeFilter], canLoad]);

  useEffect(() => {
    if (!canLoad) return;
    fetchReferrals(referralFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...[referralFilter], canLoad]);

  useEffect(() => {
    if (!canLoad) return;
    fetchIncidents(incidentResolutionFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...[incidentResolutionFilter], canLoad]);

  useEffect(() => {
    if (!canLoad) return;
    fetchPayments(paymentFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentFilter, selectedDriverFilter, canLoad]);

  // Polling em tempo real (12s) silencioso para atualizar as 4 situações críticas em segundo plano
  // Recriado quando o login muda, para usar sempre as credenciais atuais
  useEffect(() => {
    if (!canLoad) return;
    const timer = setInterval(() => {
      fetchDrivers(undefined, true);
      fetchReferrals(undefined, true);
      fetchIncidents(undefined, true);
      fetchPayments(undefined, true);
      fetchRoutes(undefined, true);
      fetchTakeatPendingCount(true);
    }, 12000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLoad, currentUser, useAdminKey, adminKey]);

  // Driver Actions (M1 & M1.1)
  const handleApproveDriver = async (driverId: number) => {
    setActionLoadingId(driverId);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/drivers/${driverId}/approve`, {
        method: 'POST',
        headers,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao aprovar motorista');
      }

      await fetchDrivers();
      if (selectedDriver?.id === driverId) {
        openDriverDetails(driverId);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleBlockDriver = async (driverId: number) => {
    setActionLoadingId(driverId);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/drivers/${driverId}/block`, {
        method: 'POST',
        headers,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao bloquear motorista');
      }

      await fetchDrivers();
      if (selectedDriver?.id === driverId) {
        openDriverDetails(driverId);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReactivateDriver = async (driverId: number) => {
    setActionLoadingId(driverId);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/drivers/${driverId}/reactivate`, {
        method: 'POST',
        headers,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao reativar motorista');
      }

      await fetchDrivers();
      if (selectedDriver?.id === driverId) {
        openDriverDetails(driverId);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleExcludeDriver = async () => {
    if (!excludingDriver) return;
    if (!exclusionReasonInput.trim() || exclusionReasonInput.trim().length < 3) {
      setErrorMessage('Por favor, informe o motivo da exclusão (mínimo 3 caracteres).');
      return;
    }
    setSubmittingExclusion(true);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/drivers/${excludingDriver.id}/exclude`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: exclusionReasonInput.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao excluir motorista');
      }

      const excludedId = excludingDriver.id;
      setExcludingDriver(null);
      setExclusionReasonInput('');
      await fetchDrivers();
      if (selectedDriver?.id === excludedId) {
        openDriverDetails(excludedId);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmittingExclusion(false);
    }
  };

  const handleDecisionSubmit = async () => {
    if (!decisionDriver || !decisionType) return;
    setSubmittingDecision(true);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      let url = '';
      let body: any = {};

      if (decisionType === 'REJECT_REACTIVATION') {
        url = `/api/admin/drivers/${decisionDriver.id}/reject-reactivation`;
        body = { reason: decisionReasonInput.trim() };
      } else if (decisionType === 'APPROVE_REINCLUSION') {
        url = `/api/admin/drivers/${decisionDriver.id}/reinclusion/approve`;
        body = { targetStatus: decisionTargetStatus, notes: decisionReasonInput.trim() };
      } else if (decisionType === 'REJECT_REINCLUSION') {
        url = `/api/admin/drivers/${decisionDriver.id}/reinclusion/reject`;
        body = { reason: decisionReasonInput.trim() };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao processar decisão');
      }

      const dId = decisionDriver.id;
      setDecisionDriver(null);
      setDecisionType(null);
      setDecisionReasonInput('');
      await fetchDrivers();
      if (selectedDriver?.id === dId) {
        openDriverDetails(dId);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmittingDecision(false);
    }
  };

  const handleReinviteExcludedDriver = (driver: Driver) => {
    const vTypes = parseDriverVehicleTypes(driver.vehicle_type);
    setInviteFormData({
      name: driver.name,
      phone: driver.phone,
      vehicle_type: driver.vehicle_type || 'CAR',
      vehicle_types: vTypes.length > 0 ? vTypes : ['CAR'],
    });
    setGeneratedInvite(null);
    setInviteModalTab('DIRECT');
    setShowInviteModal(true);
  };

  const openDriverDetails = async (driverId: number) => {
    setLoadingDriverEvents(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/drivers/${driverId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSelectedDriver(data.driver);
        setDriverEvents(data.events || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDriverEvents(false);
    }
  };

  const openEditDriverModal = (driver: Driver) => {
    setEditingDriver(driver);
    setEditError(null);
    const isRequiresUpdate =
      driver.pix_key_type === 'REQUIRES_UPDATE' || !driver.pix_key_type;
    const validPixType =
      driver.pix_key_type && ['CPF', 'PHONE', 'EMAIL', 'RANDOM'].includes(driver.pix_key_type)
        ? (driver.pix_key_type as any)
        : 'CPF';
    const parsedVehs = parseDriverVehicleTypes(driver.vehicle_type);
    const initialTypes = parsedVehs.length > 0 ? parsedVehs : ['CAR' as VehicleType];
    setEditFormData({
      name: driver.name,
      phone: driver.phone,
      vehicle_type: initialTypes.join(','),
      vehicle_types: initialTypes,
      pix_key_type: validPixType,
      pix_key_value: isRequiresUpdate ? '' : (driver.pix_key_value || driver.pix_key || ''),
    });
  };

  const handleSaveDriverEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDriver) return;

    setSavingDriverEdit(true);
    setEditError(null);
    try {
      const headers = await getAuthHeaders();
      const payload: any = {};

      if (editFormData.name.trim() !== editingDriver.name) {
        payload.name = editFormData.name.trim();
      }
      if (editFormData.phone.trim() !== editingDriver.phone) {
        payload.phone = editFormData.phone.trim();
      }
      if (editFormData.vehicle_type !== editingDriver.vehicle_type) {
        payload.vehicle_type = editFormData.vehicle_type;
      }

      const isRequiresUpdate =
        editingDriver.pix_key_type === 'REQUIRES_UPDATE' || !editingDriver.pix_key_type;

      if (isRequiresUpdate) {
        if (editFormData.pix_key_value.trim().length > 0) {
          payload.pix = {
            pix_key_type: editFormData.pix_key_type,
            pix_key_value: editFormData.pix_key_value.trim(),
          };
        }
      } else {
        const currentPixVal = editingDriver.pix_key_value || editingDriver.pix_key || '';
        if (
          editFormData.pix_key_type !== editingDriver.pix_key_type ||
          editFormData.pix_key_value.trim() !== currentPixVal
        ) {
          payload.pix = {
            pix_key_type: editFormData.pix_key_type,
            pix_key_value: editFormData.pix_key_value.trim(),
          };
        }
      }

      const res = await fetch(`/api/admin/drivers/${editingDriver.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Falha ao atualizar motorista');
      }

      setEditingDriver(null);
      setSuccessMessage('Cadastro do motorista atualizado com sucesso!');
      await fetchDrivers();
      if (selectedDriver?.id === editingDriver.id) {
        openDriverDetails(editingDriver.id);
      }
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setSavingDriverEdit(false);
    }
  };

  // ==========================================
  // Pickup Location Actions (M2.1 Seção 12)
  // ==========================================
  const handleOpenNewLocationModal = () => {
    setEditingLocation(null);
    setLocationFormData({ name: '', address: '', neighborhood: '', active: true });
    setShowLocationModal(true);
  };

  const handleOpenEditLocationModal = (loc: PickupLocation) => {
    setEditingLocation(loc);
    setLocationFormData({
      name: loc.name,
      address: loc.address,
      neighborhood: loc.neighborhood || '',
      active: loc.active,
    });
    setShowLocationModal(true);
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLocation(true);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      let res;
      if (editingLocation) {
        res = await fetch(`/api/admin/pickup-locations/${editingLocation.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(locationFormData),
        });
      } else {
        res = await fetch('/api/admin/pickup-locations', {
          method: 'POST',
          headers,
          body: JSON.stringify(locationFormData),
        });
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao salvar ponto de coleta');
      }

      setShowLocationModal(false);
      setSuccessMessage('Ponto de coleta salvo com sucesso!');
      await fetchPickupLocations();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSavingLocation(false);
    }
  };

  const handleToggleLocationActive = async (loc: PickupLocation) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/pickup-locations/${loc.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ active: !loc.active }),
      });
      if (!res.ok) throw new Error('Falha ao alterar status');
      await fetchPickupLocations();
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // ==========================================
  // Multi-Stop Route Actions (M2.1 Seção 23 - 35)
  // ==========================================
  const handleAddStop = () => {
    setNewRoute((prev) => ({
      ...prev,
      stops: [
        ...prev.stops,
        {
          destination_address: '',
          destination_neighborhood: '',
          neighborhood_id: null,
          modality_code: modalitiesList[0]?.code || 'CONVENCIONAL',
          pricing_vehicle_category: 'CAR',
          customer_freight: '',
          suggested_price: undefined,
          cargo_description: '',
          delivery_mode: 'IN_PERSON',
          desired_deadline: '',
          observations: '',
          is_horizontal_condo: false,
        },
      ],
    }));
  };

  const handleRemoveStop = (index: number) => {
    if (newRoute.stops.length <= 1) return;
    setNewRoute((prev) => ({
      ...prev,
      stops: prev.stops.filter((_, idx) => idx !== index),
    }));
  };

  const handleMoveStop = (index: number, direction: 'UP' | 'DOWN') => {
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newRoute.stops.length) return;

    const newStops = [...newRoute.stops];
    const temp = newStops[index];
    newStops[index] = newStops[targetIndex];
    newStops[targetIndex] = temp;

    setNewRoute((prev) => ({ ...prev, stops: newStops }));
  };

  const handleUpdateStopField = (index: number, field: keyof FormStop, value: any) => {
    setNewRoute((prev) => {
      const stops = [...prev.stops];
      stops[index] = { ...stops[index], [field]: value };
      return { ...prev, stops };
    });
  };

  const handleToggleVehicleType = (type: VehicleType) => {
    setNewRoute((prev) => {
      const exists = prev.accepted_vehicle_types.includes(type);
      if (exists) {
        if (prev.accepted_vehicle_types.length <= 1) {
          return prev; // Require at least one option
        }
        return {
          ...prev,
          accepted_vehicle_types: prev.accepted_vehicle_types.filter((v) => v !== type),
        };
      } else {
        return {
          ...prev,
          accepted_vehicle_types: [...prev.accepted_vehicle_types, type],
        };
      }
    });
  };

  const handleCreateRouteDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingRouteDraft(true);
    setErrorMessage(null);

    try {
      const headers = await getAuthHeaders();

      // Payload validation
      if (newRoute.stops.length === 0) {
        throw new Error('A rota deve conter pelo menos uma parada de entrega.');
      }
      for (let i = 0; i < newRoute.stops.length; i++) {
        const s = newRoute.stops[i];
        if (!s.destination_address.trim() || !s.destination_neighborhood.trim() || !s.cargo_description.trim()) {
          throw new Error(`Preencha todos os campos obrigatórios da Parada #${i + 1}.`);
        }
      }

      const payload = {
        pickup_type: newRoute.pickup_type,
        pickup_location_id:
          newRoute.pickup_type === 'REGISTERED' ? newRoute.pickup_location_id : undefined,
        pickup_name:
          newRoute.pickup_type === 'AD_HOC' ? newRoute.pickup_name : undefined,
        pickup_address:
          newRoute.pickup_type === 'AD_HOC' ? newRoute.pickup_address : undefined,
        pickup_neighborhood:
          newRoute.pickup_type === 'AD_HOC' ? newRoute.pickup_neighborhood.trim() : undefined,
        final_deadline: newRoute.final_deadline.trim(),
        total_fee: newRoute.total_fee.trim(),
        accepted_vehicle_types: newRoute.accepted_vehicle_types,
        stops: newRoute.stops.map((s) => ({
          destination_address: s.destination_address.trim(),
          destination_neighborhood: s.destination_neighborhood.trim(),
          cargo_description: s.cargo_description.trim(),
          delivery_mode: s.delivery_mode,
          desired_deadline: s.desired_deadline.trim() || undefined,
          observations: s.observations.trim() || undefined,
          is_horizontal_condo: s.is_horizontal_condo,
        })),
      };

      const res = await fetch('/api/admin/routes', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao salvar rascunho da rota.');
      }

      setShowCreateRouteModal(false);
      setSuccessMessage('Rascunho de rota criado com sucesso!');
      await fetchRoutes();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmittingRouteDraft(false);
    }
  };

  // Open pre-publish summary modal (Seção 25)
  const openPublishSummary = (route: Route) => {
    setRouteToPublish(route);
  };

  // Publish route to telegram drivers
  const handleConfirmPublishRoute = async () => {
    if (!routeToPublish) return;
    const routeId = routeToPublish.id;

    setPublishingId(routeId);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/routes/${routeId}/publish`, {
        method: 'POST',
        headers,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.code === 'NO_ELIGIBLE_DRIVERS') {
          throw new Error(data.message || 'Nenhum motorista ativo com veículo compatível disponível.');
        }
        throw new Error(data.error || 'Falha ao publicar rota.');
      }

      setRouteToPublish(null);
      setSuccessMessage(
        `Rota #${routeId} publicada! Enviada para ${data.stats?.sent || 0} motorista(s) compatível(is).`
      );
      await fetchRoutes();
      if (selectedRouteDetails?.route.id === routeId) {
        openRouteDetails(routeId);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setPublishingId(null);
    }
  };

  // ---------------- Agendamento de corridas ----------------
  const [scheduleTarget, setScheduleTarget] = useState<Route | null>(null);
  const [scheduleInput, setScheduleInput] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const OFFER_LEAD_MIN = 90;

  /** ISO → "datetime-local" no horário de Brasília (AAAA-MM-DDTHH:MM). */
  const toLocalInput = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
    return d.toISOString().slice(0, 16);
  };

  const openScheduleModal = (route: Route) => {
    setScheduleTarget(route);
    setScheduleError(null);
    setScheduleInput(toLocalInput(route.scheduled_for));
  };

  const handleConfirmSchedule = async () => {
    if (!scheduleTarget) return;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduleInput)) { setScheduleError('Informe a data e a hora da entrega.'); return; }
    setScheduleSaving(true);
    setScheduleError(null);
    setErrorMessage(null);
    try {
      const scheduled_for = new Date(`${scheduleInput}:00-03:00`).toISOString();
      const res = await fetch(`/api/admin/routes/${scheduleTarget.id}/schedule`, {
        method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ scheduled_for }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || 'Falha ao agendar a oferta.');
      setSuccessMessage(
        data.publishedNow
          ? `Rota #${scheduleTarget.id}: o horário da oferta já tinha chegado, então ela foi publicada agora.`
          : `Rota #${scheduleTarget.id}: oferta agendada para ${fmtScheduleBRT(data.schedule?.publish_at)} (entrega ${fmtScheduleBRT(data.schedule?.scheduled_for)}).`
      );
      setScheduleTarget(null);
      await fetchRoutes();
    } catch (err: any) {
      setScheduleError(err.message); // mostra o motivo dentro da janela
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleUnschedule = async (route: Route) => {
    if (!confirm(`Desfazer a oferta agendada da rota #${route.id}? Ela volta a ser um rascunho comum (a data de entrega é mantida).`)) return;
    try {
      const res = await fetch(`/api/admin/routes/${route.id}/unschedule`, { method: 'POST', headers: await getAuthHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || 'Falha ao desagendar.');
      setSuccessMessage(`Rota #${route.id}: oferta desagendada.`);
      await fetchRoutes();
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Exclusão definitiva: só rascunhos ou canceladas que nunca tiveram entregador
  const canDeleteRoute = (route: Route) =>
    (route.status === 'DRAFT' || route.status === 'CANCELLED') && !route.accepted_driver_id;

  const handleDeleteRoute = async (route: Route) => {
    if (!confirm(`Excluir DE VEZ a rota #${route.id}? Ela some da lista e do histórico. Não dá para desfazer.`)) return;
    setCancellingId(route.id);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/admin/routes/${route.id}`, { method: 'DELETE', headers: await getAuthHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || 'Falha ao excluir rota.');
      setSuccessMessage(`Rota #${route.id} excluída.`);
      await fetchRoutes();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setCancellingId(null);
    }
  };

  const openCancelModal = (route: Route) => {
    setRouteToCancel(route);
    setCancelReasonInput('');
    setCancelCompensationInput('');
    setCancelResolutionType('OPEN');
  };

  const handleConfirmCancelRoute = async () => {
    if (!routeToCancel) return;
    const routeId = routeToCancel.id;
    setCancellingId(routeId);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const compAmount =
        cancelCompensationInput.trim() !== ''
          ? parseFloat(cancelCompensationInput.replace(',', '.'))
          : undefined;
      const res = await fetch(`/api/admin/routes/${routeId}/cancel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          reason: cancelReasonInput.trim() || undefined,
          compensation_amount: !isNaN(compAmount as number) ? compAmount : undefined,
          resolution_type: cancelResolutionType !== 'OPEN' ? cancelResolutionType : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao cancelar rota.');
      }

      setSuccessMessage(
        `✅ Rota #${routeId} cancelada com sucesso! A corrida foi encaminhada para as Pendências Operacionais para acompanhamento e registro da solução.`
      );
      setRouteToCancel(null);
      setCancelReasonInput('');
      setCancelCompensationInput('');
      setCancelResolutionType('OPEN');
      await fetchRoutes();
      await fetchIncidents();
      await fetchPayments();
      if (selectedRouteDetails?.route.id === routeId) {
        openRouteDetails(routeId);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setCancellingId(null);
    }
  };

  const openRouteDetails = async (routeId: number) => {
    setLoadingRouteDetails(true);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/routes/${routeId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSelectedRouteDetails(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMessage(errData.error || `Erro ao carregar detalhes da rota #${routeId}`);
      }
    } catch (e: any) {
      console.error(e);
      setErrorMessage(e?.message || 'Erro ao carregar detalhes da rota');
    } finally {
      setLoadingRouteDetails(false);
    }
  };

  // Simulate route acceptance by a specific driver (for admin verification)
  const handleSimulateAcceptRoute = async (routeId: number, driverId: number) => {
    setSimulatingAcceptance(true);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/routes/${routeId}/accept`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ driver_id: driverId }),
      });

      const data = await res.json();
      if (res.status === 200) {
        setSuccessMessage(`✅ Rota #${routeId} aceita com sucesso pelo motorista!`);
      } else if (res.status === 409) {
        setErrorMessage(`❌ Conflito de Aceite: ${data.message || 'Esta rota já foi aceita por outro motorista.'}`);
      } else {
        setErrorMessage(`⚠️ Não foi possível aceitar: ${data.message || data.error}`);
      }

      await fetchRoutes();
      openRouteDetails(routeId);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSimulatingAcceptance(false);
    }
  };

  // ==========================================
  // M4 Operational Handlers (Loja & Simulação)
  // ==========================================
  const handleArrivedPickup = async (routeId: number) => {
    setOperationalLoading(true);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/routes/${routeId}/arrived-pickup`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao registrar chegada na coleta');
      setSuccessMessage('📍 Chegada na coleta registrada com sucesso!');
      await fetchRoutes();
      openRouteDetails(routeId);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setOperationalLoading(false);
    }
  };

  const handlePickedUp = async (routeId: number) => {
    setOperationalLoading(true);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/routes/${routeId}/picked-up`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao confirmar pedidos coletados');
      setSuccessMessage('📦 Pedidos coletados com sucesso!');
      await fetchRoutes();
      openRouteDetails(routeId);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setOperationalLoading(false);
    }
  };

  const handleStartRoute = async (routeId: number) => {
    setOperationalLoading(true);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/routes/${routeId}/start`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao iniciar rota');
      setSuccessMessage('🛵 Rota iniciada! Motorista em deslocamento.');
      await fetchRoutes();
      openRouteDetails(routeId);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setOperationalLoading(false);
    }
  };

  const handleDeliverStopPin = async (stopId: number, pin: string) => {
    setOperationalLoading(true);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/routes/stops/${stopId}/deliver-pin`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'PIN incorreto ou falha na entrega');
      }
      setSelectedStopForPin(null);
      setPinInput('');
      setSuccessMessage(`✅ Parada #${data.stop.sequence} entregue com sucesso via PIN!`);
      if (data.routeCompleted) {
        setSuccessMessage(`🏁 Rota concluída com sucesso! Todas as paradas foram finalizadas.`);
      }
      await fetchRoutes();
      if (selectedRouteDetails) {
        openRouteDetails(selectedRouteDetails.route.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setOperationalLoading(false);
    }
  };

  const handleDeliverStopPhoto = async (stopId: number, proofReference: string) => {
    setOperationalLoading(true);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/routes/stops/${stopId}/deliver-photo`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ proof_reference: proofReference }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Falha na entrega por foto');
      }
      setSelectedStopForPhoto(null);
      setPhotoRefInput('');
      setSuccessMessage(`✅ Parada #${data.stop.sequence} entregue com sucesso via Comprovante Fotográfico!`);
      if (data.routeCompleted) {
        setSuccessMessage(`🏁 Rota concluída com sucesso! Todas as paradas foram finalizadas.`);
      }
      await fetchRoutes();
      if (selectedRouteDetails) {
        openRouteDetails(selectedRouteDetails.route.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setOperationalLoading(false);
    }
  };

  const handleReportIncident = async (stopId: number, incidentType: string, note?: string) => {
    setOperationalLoading(true);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/routes/stops/${stopId}/incident`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ incident_type: incidentType, incident_note: note }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Falha ao registrar incidente');
      }
      setSelectedStopForIncident(null);
      setIncidentNoteInput('');
      setSuccessMessage(`⚠️ Incidente registrado para Parada #${data.stop.sequence}!`);
      if (data.routeCompleted) {
        setSuccessMessage(`🏁 Rota encerrada! Todas as paradas atingiram estado terminal.`);
      }
      await fetchRoutes();
      if (selectedRouteDetails) {
        openRouteDetails(selectedRouteDetails.route.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setOperationalLoading(false);
    }
  };

  const handleViewProofPhoto = async (proofReference: string) => {
    setLoadingPhoto(true);
    setViewingPhotoUrl(null);
    try {
      if (proofReference.startsWith('http://') || proofReference.startsWith('https://')) {
        setViewingPhotoUrl(proofReference);
      } else {
        const res = await fetch(`/api/telegram/file-url/${encodeURIComponent(proofReference)}`, { headers: await getAuthHeaders() });
        const data = await res.json();
        if (data.url) {
          setViewingPhotoUrl(data.url);
        } else {
          setViewingPhotoUrl(`https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=800&auto=format&fit=crop&q=80`);
        }
      }
    } catch (e) {
      setViewingPhotoUrl(`https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=800&auto=format&fit=crop&q=80`);
    } finally {
      setLoadingPhoto(false);
    }
  };

  // Bot Token Configuration
  const handleConfigureBotToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setTokenSaving(true);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/telegram/configure', {
        method: 'POST',
        headers,
        body: JSON.stringify({ token: tokenInput }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao salvar token');
      }

      setShowBotModal(false);
      setTokenInput('');
      setSuccessMessage('Bot do Telegram configurado e conectado com sucesso!');
      await fetchTelegramStatus();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setTokenSaving(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleAuthProvider);
      setSuccessMessage('Autenticado com sucesso!');
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha na autenticação');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setSuccessMessage('Sessão encerrada.');
  };

  // Tela de acesso: o painel só abre com login Google autorizado (ou chave administrativa configurada)
  if (!authReady) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-neutral-500">Carregando…</div>;
  }
  if ((!currentUser && !(useAdminKey && adminKey.trim())) || accessError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 font-sans">
        <div className="w-full max-w-sm bg-white border border-neutral-200 rounded-2xl shadow-sm p-6 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-xl border border-neutral-200 p-1.5"><KantineLogo className="w-full h-full object-contain" /></div>
          <div>
            <h1 className="text-lg font-black text-neutral-900">Kantine Delivery</h1>
            <p className="text-xs text-neutral-500">Painel administrativo de rotas e motoristas</p>
          </div>
          {accessError && <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{accessError}</p>}
          {currentUser ? (
            <button onClick={handleLogout} className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm font-semibold hover:bg-neutral-50">
              Sair e entrar com outra conta
            </button>
          ) : (
            <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-semibold">
              <LogIn className="w-4 h-4" /> Entrar com Google
            </button>
          )}
          {!currentUser && useAdminKey && accessError && (
            <button
              onClick={() => { try { localStorage.removeItem('kantine_admin_key'); } catch {} setAdminKey(''); setUseAdminKey(false); setAccessError(null); }}
              className="text-xs text-neutral-500 underline"
            >
              Esquecer a chave administrativa salva
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-neutral-900 pb-16 font-sans">
      {/* ============================================================== */}
      {/* HEADER                                                         */}
      {/* ============================================================== */}
      <header className="border-b border-neutral-200/80 bg-white/90 backdrop-blur sticky top-0 z-30 shadow-xs">
        <div className="w-full max-w-[1780px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white border border-neutral-200/90 flex items-center justify-center p-1 shadow-sm shadow-neutral-900/5 hover:border-neutral-300 transition-all shrink-0">
              <KantineLogo className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-neutral-950">
                  Kantine Delivery
                </h1>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                  M2.1 Multi-Paradas
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 font-medium">
                Uberlândia • Painel Administrativo de Rotas e Motoristas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Telegram Bot status badge */}
            <button
              onClick={() => setShowBotModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all bg-white hover:bg-neutral-50 shadow-xs"
            >
              <Send className="w-3.5 h-3.5 text-blue-500" />
              <span>
                Bot Telegram:{' '}
                {telegramStatus?.polling ? (
                  <span className="text-emerald-700 font-bold">● Ativo (@{telegramStatus.botUsername})</span>
                ) : telegramStatus?.configured ? (
                  <span className="text-amber-700 font-bold">● Parado</span>
                ) : (
                  <span className="text-rose-700 font-bold">Não Configurado</span>
                )}
              </span>
            </button>

            {/* Auth status */}
            {currentUser ? (
              <div className="flex items-center gap-2 pl-2 border-l border-neutral-200">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-semibold text-neutral-800">{currentUser.displayName || currentUser.email}</p>
                  <p className="text-[10px] text-neutral-500">Administrador</p>
                </div>
                <button
                  onClick={handleLogout}
                  title="Sair"
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleGoogleLogin}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold transition-colors shadow-xs"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Entrar (Google)</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="w-full max-w-[1780px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-1.5 border-t border-neutral-100/80 pt-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setActiveTab('ROUTES')}
            className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'ROUTES'
                ? 'border-orange-600 text-orange-600'
                : inFluxRoutesCount > 0 || draftRoutesCount > 0
                ? 'border-amber-500 text-amber-700 bg-amber-50/50'
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <Layers className={`w-3.5 h-3.5 ${inFluxRoutesCount > 0 || draftRoutesCount > 0 ? 'text-amber-600 animate-pulse' : ''}`} />
            <span>Rotas de Entrega</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-200 text-neutral-700 font-bold">
              {allRoutesList.length > 0 ? allRoutesList.length : routesList.length}
            </span>
            {inFluxRoutesCount > 0 && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white animate-pulse ring-2 ring-amber-300 shadow-xs"
                title={`${inFluxRoutesCount} corrida(s) ativa(s) em fluxo operacional`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                <span>{inFluxRoutesCount} em fluxo</span>
              </span>
            )}
            {draftRoutesCount > 0 && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white animate-pulse ring-2 ring-amber-300 shadow-xs"
                title={`${draftRoutesCount} rota(s) em rascunho aguardando revisão e publicação`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                <span>{draftRoutesCount} {draftRoutesCount === 1 ? 'rascunho' : 'rascunhos'}</span>
              </span>
            )}
            {scheduledRoutesCount > 0 && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-600 text-white shadow-xs"
                title={`${scheduledRoutesCount} corrida(s) com oferta agendada (publicação automática)`}
              >
                <span>⏰ {scheduledRoutesCount} {scheduledRoutesCount === 1 ? 'agendada' : 'agendadas'}</span>
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('LOCATIONS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'LOCATIONS'
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Pontos de Coleta</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-200 text-neutral-700 font-bold">
              {pickupLocations.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('DRIVERS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'DRIVERS'
                ? 'border-orange-600 text-orange-600'
                : pendingApprovalDriversCount > 0
                ? 'border-amber-500 text-amber-700 bg-amber-50/50'
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Motoristas</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-200 text-neutral-700 font-bold">
              {drivers.length}
            </span>
            {pendingApprovalDriversCount > 0 && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white animate-pulse ring-2 ring-amber-300 shadow-xs"
                title={`${pendingApprovalDriversCount} motorista(s) aguardando aprovação`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                <span>{pendingApprovalDriversCount} pendente(s)</span>
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('REFERRALS');
              fetchReferrals();
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'REFERRALS'
                ? 'border-orange-600 text-orange-600'
                : pendingReferralsCount > 0
                ? 'border-orange-500 text-orange-700 bg-orange-50/50'
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Indicações (M1.2)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-200 text-neutral-700 font-bold">
              {referralsList.length}
            </span>
            {pendingReferralsCount > 0 && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-600 text-white animate-pulse ring-2 ring-orange-300 shadow-xs"
                title={`${pendingReferralsCount} motorista(s) indicado(s) aguardando análise`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                <span>{pendingReferralsCount} indicado(s)</span>
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('INCIDENTS');
              fetchIncidents();
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'INCIDENTS'
                ? 'border-orange-600 text-orange-600'
                : totalPendenciasCount > 0
                ? 'border-rose-500 text-rose-700 bg-rose-50/50'
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>Pendências (M4.1)</span>
            {totalPendenciasCount > 0 ? (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white animate-pulse ring-2 ring-rose-300 shadow-xs"
                title={`${totalPendenciasCount} pendência(s) em aberto`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                <span>{totalPendenciasCount} aberta(s)</span>
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-200 text-neutral-700 font-bold">
                0
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('PAYMENTS');
              fetchPayments();
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'PAYMENTS'
                ? 'border-orange-600 text-orange-600'
                : pendingPaymentsCount > 0
                ? 'border-amber-500 text-amber-700 bg-amber-50/50'
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
            <span>Pagamentos (M4.1)</span>
            {pendingPaymentsCount > 0 ? (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white animate-pulse ring-2 ring-amber-300 shadow-xs"
                title={`${pendingPaymentsCount} rota(s) aguardando pagamento PIX`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                <span>{pendingPaymentsCount} a pagar</span>
              </span>
            ) : null}
          </button>

          <button
            onClick={() => setActiveTab('SETTINGS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'SETTINGS'
                ? 'border-orange-600 text-orange-600'
                : pendingTakeatCount > 0
                ? 'border-red-500 text-red-700 bg-red-50/90 animate-pulse ring-2 ring-red-400 ring-offset-1 font-black shadow-xs'
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <Calculator className={`w-3.5 h-3.5 ${pendingTakeatCount > 0 ? 'text-red-600' : 'text-orange-600'}`} />
            <span>Motor de Fretes</span>
            {pendingTakeatCount > 0 ? (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-black bg-red-600 text-white animate-bounce ring-2 ring-red-300 shadow-xs"
                title={`${pendingTakeatCount} pedido(s) Takeat aguardando entregador`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                <span>{pendingTakeatCount} Takeat!</span>
              </span>
            ) : null}
          </button>
        </div>
      </header>

      {/* Alerta Destacado: Pedidos Takeat Aguardando Entregador */}
      {pendingTakeatCount > 0 && activeTab !== 'SETTINGS' && (
        <div className="w-full max-w-[1780px] mx-auto px-4 sm:px-6 lg:px-8 mt-3">
          <div
            onClick={() => setActiveTab('SETTINGS')}
            className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-red-600 via-orange-600 to-amber-600 text-white shadow-md cursor-pointer hover:opacity-95 transition-all animate-pulse"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">🛵</span>
              <div>
                <p className="text-xs font-black tracking-wide uppercase">
                  {pendingTakeatCount === 1
                    ? '1 Pedido Takeat Aceito Aguardando Entregador!'
                    : `${pendingTakeatCount} Pedidos Takeat Aceitos Aguardando Entregador!`}
                </p>
                <p className="text-[11px] text-white/90">
                  Clique aqui para abrir no Motor de Fretes, calcular o frete da Kantine e despachar para os motoboys.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold bg-white text-red-700 px-3 py-1 rounded-lg shadow-sm whitespace-nowrap">
              Despachar no Motor de Fretes &rarr;
            </span>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* GLOBAL TOAST ALERTS                                            */}
      {/* ============================================================== */}
      {errorMessage && (
        <div className="w-full max-w-[1780px] mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold shadow-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-800 font-bold ml-2">
              ✕
            </button>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="w-full max-w-[1780px] mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-800 font-bold ml-2">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 1: ROTAS MULTI-ENTREGA (M2.1)                              */}
      {/* ============================================================== */}
      {activeTab === 'ROUTES' && (
        <main id="main-content" className="w-full max-w-[1780px] mx-auto px-4 sm:px-6 lg:px-8 mt-5 space-y-5">
          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/80 backdrop-blur p-4 rounded-2xl border border-neutral-200 shadow-xs">
            <div>
              <h2 className="text-base font-bold text-neutral-950 flex items-center gap-2">
                <span>Gestão de Rotas Multi-Entrega</span>
                <span className="text-[11px] font-medium text-neutral-500">
                  (Uma rota contém 1..N paradas e um único valor de frete)
                </span>
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {(
                  [
                    { key: 'ALL', label: 'Todas as Rotas', icon: '📋' },
                    { key: 'DRAFT', label: 'Rascunhos', icon: '📝' },
                    { key: 'OFFERED', label: 'Em Oferta', icon: '🚀', isFlux: true },
                    { key: 'ACCEPTED', label: 'Aceitas', icon: '✅', isFlux: true },
                    { key: 'ARRIVED_PICKUP', label: 'Na Coleta', icon: '📍', isFlux: true },
                    { key: 'PICKED_UP', label: 'Coletadas', icon: '📦', isFlux: true },
                    { key: 'IN_TRANSIT', label: 'Em Rota', icon: '🛵/🚗', isFlux: true },
                    { key: 'COMPLETED', label: 'Concluídas', icon: '🏁' },
                    { key: 'CANCELLED', label: 'Canceladas', icon: '❌' },
                  ] as const
                ).map((f) => {
                  const count = routeStatusCounts[f.key] || 0;
                  const isFlux = (f as any).isFlux && count > 0;
                  const isSelected = routeFilter === f.key;
                  const isDraftAlert = f.key === 'DRAFT' && count > 0;

                  return (
                    <button
                      key={f.key}
                      onClick={() => handleSelectRouteFilter(f.key as any)}
                      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? isFlux
                            ? 'bg-amber-600 text-white font-bold shadow-sm ring-2 ring-amber-400 animate-pulse'
                            : 'bg-neutral-900 text-white shadow-xs'
                          : isFlux
                          ? 'bg-amber-100 text-amber-950 border-2 border-amber-400 font-bold animate-pulse ring-2 ring-amber-300 shadow-xs hover:bg-amber-200'
                          : isDraftAlert
                          ? 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
                          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                      }`}
                      title={
                        isFlux
                          ? `${count} corrida(s) em fluxo ativo neste status`
                          : `${count} corrida(s) com status ${f.label}`
                      }
                    >
                      <span>{f.icon}</span>
                      <span>{f.label}</span>

                      {/* Contador e destaque piscante para status em fluxo ativo */}
                      {isFlux ? (
                        <span className="inline-flex items-center gap-1 ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white ring-1 ring-amber-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                          <span>{count} em fluxo</span>
                        </span>
                      ) : count > 0 ? (
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : 'bg-neutral-200/90 text-neutral-700'
                          }`}
                        >
                          {count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                onClick={() => fetchRoutes()}
                className="p-2.5 rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-700 transition-colors shadow-xs"
                title="Atualizar lista"
              >
                <RefreshCw className={`w-4 h-4 ${loadingRoutes ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowCreateRouteModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-600/20 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Rota</span>
              </button>
            </div>
          </div>

          {/* Routes Table */}
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50/90 border-b border-neutral-200 text-neutral-600 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-3 py-3 whitespace-nowrap w-[110px] min-w-[100px]">ID / Status</th>
                    <th className="px-3 py-3 min-w-[140px] max-w-[200px]">Ponto de Coleta</th>
                    <th className="px-3 py-3 min-w-[220px]">Paradas & Código do Cliente</th>
                    <th className="px-3 py-3 whitespace-nowrap w-[100px] min-w-[95px]">Prazo Final</th>
                    <th className="px-3 py-3 whitespace-nowrap w-[100px] min-w-[95px]">Frete Total</th>
                    <th className="px-3 py-3 whitespace-nowrap w-[140px] min-w-[135px]">Frete Motorista</th>
                    <th className="px-3 py-3 whitespace-nowrap w-[135px] min-w-[125px]">Veículos Aceitos</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap sticky right-0 bg-neutral-50/95 backdrop-blur-xs z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] border-l border-neutral-200/80 w-[180px] min-w-[170px]">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {loadingRoutes ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-neutral-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-neutral-400" />
                        Carregando rotas...
                      </td>
                    </tr>
                  ) : routesList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-neutral-400">
                        Nenhuma rota encontrada para este filtro.
                      </td>
                    </tr>
                  ) : (
                    routesList.map((route) => {
                      const stopsCount = route.stops?.length || 1;
                      const stopsSummary = route.stops
                        ? route.stops.map((s) => s.destination_neighborhood).join(' → ')
                        : '1 parada';

                      const driverAllocated =
                        route.accepted_driver ||
                        drivers.find((d) => d.id === route.accepted_driver_id);

                      const isCarTransit =
                        driverAllocated?.vehicle_type === 'CAR' ||
                        (route.accepted_vehicle_types?.length === 1 && route.accepted_vehicle_types[0] === 'CAR') ||
                        (route.accepted_vehicle_types?.includes('CAR') && !route.accepted_vehicle_types?.includes('MOTO'));

                      const hasRouteIssue =
                        route.stops?.some(
                          (s) => (s.status === 'INCIDENT' || s.incident_type) && s.incident_resolution_status !== 'RESOLVED'
                        );
                      const hasPendingPayment =
                        route.status === 'COMPLETED' && (!route.payment_status || route.payment_status === 'PENDING');

                      const parsedMaterialChange = (() => {
                        if (!route.pending_material_change) return null;
                        try {
                          return typeof route.pending_material_change === 'string'
                            ? JSON.parse(route.pending_material_change)
                            : route.pending_material_change;
                        } catch {
                          return null;
                        }
                      })();
                      const isProposalRejected = parsedMaterialChange?.status === 'REJECTED';
                      const isProposalPending = route.change_pending_driver_approval || parsedMaterialChange?.status === 'PENDING';

                      return (
                        <tr
                          key={route.id}
                          className={`group transition-colors ${
                            isProposalRejected
                              ? 'bg-amber-50/70 hover:bg-amber-100/70 border-l-4 border-l-amber-500 ring-1 ring-amber-400/80'
                              : hasRouteIssue
                              ? 'bg-rose-50/60 hover:bg-rose-100/60 border-l-4 border-l-rose-500 ring-1 ring-rose-300/60'
                              : hasPendingPayment
                              ? 'bg-amber-50/60 hover:bg-amber-100/60 border-l-4 border-l-amber-500 ring-1 ring-amber-300/60'
                              : 'hover:bg-neutral-50/60'
                          }`}
                        >
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="font-mono font-bold text-sm text-neutral-900">
                              #{route.id}
                            </div>
                            <div className="mt-1 space-y-1">
                              {isProposalRejected && (
                                <div>
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-600 text-white animate-pulse ring-2 ring-amber-300 shadow-xs cursor-pointer"
                                    onClick={() => setEditingRouteId(route.id)}
                                    title="O motorista recusou a proposta anterior. As alterações foram salvas para ajuste."
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                                    ⚠️ PROPOSTA RECUSADA
                                  </span>
                                </div>
                              )}
                              {isProposalPending && (
                                <div>
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white animate-pulse ring-2 ring-blue-300 shadow-xs"
                                    title="Proposta enviada ao motorista via Telegram. Aguardando aprovação."
                                  >
                                    <Clock className="w-3 h-3 text-white" />
                                    EM APROVAÇÃO
                                  </span>
                                </div>
                              )}
                              {hasRouteIssue && (
                                <div>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white animate-pulse ring-2 ring-rose-300 shadow-xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                                    ⚠️ PENDÊNCIA
                                  </span>
                                </div>
                              )}
                              {hasPendingPayment && (
                                <div>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white animate-pulse ring-2 ring-amber-300 shadow-xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                                    💰 REPASSE PENDENTE
                                  </span>
                                </div>
                              )}
                               {route.status === 'DRAFT' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  📝 RASCUNHO
                                </span>
                              )}
                              {route.status === 'OFFERED' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white animate-pulse ring-2 ring-blue-300 shadow-xs">
                                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                                  🚀 EM OFERTA
                                </span>
                              )}
                              {route.status === 'ACCEPTED' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-600 text-white animate-pulse ring-2 ring-purple-300 shadow-xs">
                                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                                  ✅ ACEITA
                                </span>
                              )}
                              {route.status === 'ARRIVED_PICKUP' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white animate-pulse ring-2 ring-indigo-300 shadow-xs">
                                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                                  📍 NA COLETA
                                </span>
                              )}
                              {route.status === 'PICKED_UP' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-600 text-white animate-pulse ring-2 ring-amber-300 shadow-xs">
                                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                                  📦 COLETADA
                                </span>
                              )}
                              {route.status === 'IN_TRANSIT' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white animate-pulse ring-2 ring-blue-300 shadow-xs">
                                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                                  {isCarTransit ? '🚗 EM ROTA' : '🛵 EM ROTA'}
                                </span>
                              )}
                              {route.status === 'COMPLETED' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  🏁 CONCLUÍDA
                                </span>
                              )}
                              {route.status === 'CANCELLED' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-600 border border-neutral-200">
                                  CANCELADA
                                </span>
                              )}

                              {/* Motorista Alocado com a Corrida na Linha */}
                              {driverAllocated && (
                                <div className="text-[10px] text-neutral-600 font-semibold flex items-center gap-1">
                                  <span className="text-neutral-400">Motorista:</span>
                                  <strong className="text-neutral-900">{driverAllocated.name}</strong>
                                  <span className="text-neutral-500">({driverAllocated.vehicle_type === 'CAR' ? '🚗' : '🏍️'})</span>
                                </div>
                              )}
                            </div>
                          </td>

                          <td className="px-3 py-3 max-w-[200px]">
                            <div className="font-bold text-neutral-900 flex items-center gap-1.5 flex-wrap">
                              <MapPin className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                              <span className="truncate">{route.pickup_name}</span>
                              {route.pickup_neighborhood_snapshot ? (
                                <span className="text-[10px] font-semibold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200 shrink-0">
                                  {route.pickup_neighborhood_snapshot}
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 shrink-0" title="Bairro ausente">
                                  Sem bairro
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-neutral-500 truncate mt-0.5">
                              {route.pickup_address}
                            </div>
                          </td>

                          {/* Paradas & Código do Cliente (Visível Diretamente) */}
                          <td className="px-3 py-3 min-w-[220px]">
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <div className="flex items-center gap-1 font-bold text-neutral-900">
                                <Package className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                                <span>{stopsCount} {stopsCount === 1 ? 'Parada' : 'Paradas'}</span>
                              </div>
                            </div>

                            <div className="space-y-1">
                              {route.stops && route.stops.length > 0 ? (
                                route.stops.map((stop, sIdx) => {
                                  const customerInfo = extractCustomerData(stop);
                                  return (
                                    <div
                                      key={stop.id || sIdx}
                                      className="p-1.5 rounded-lg bg-neutral-50 border border-neutral-200/90 text-xs flex items-center justify-between gap-2"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="font-semibold text-neutral-900 text-[11px] truncate flex items-center gap-1">
                                          <span className="font-mono text-[9px] text-neutral-400">#{sIdx + 1}</span>
                                          <span className="truncate">{stop.destination_neighborhood || stop.destination_address}</span>
                                        </div>

                                        {/* Dados do Cliente: Nome e Telefone Visíveis em Todos os Status */}
                                        {(customerInfo.name || customerInfo.phone) && (
                                          <div className="text-[10px] text-neutral-700 flex items-center gap-1.5 truncate mt-0.5">
                                            {customerInfo.name && (
                                              <span className="font-bold text-neutral-900 truncate flex items-center gap-0.5">
                                                <UserCheck className="w-3 h-3 text-orange-600 shrink-0" />
                                                <span className="truncate">{customerInfo.name}</span>
                                              </span>
                                            )}
                                            {customerInfo.phone && (
                                              <a
                                                href={`https://wa.me/55${customerInfo.rawDigits || customerInfo.phone.replace(/\D/g, '')}`}
                                                target="_blank"
                                                rel="noreferrer noopener"
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-flex items-center gap-0.5 text-emerald-700 hover:text-emerald-800 font-semibold bg-emerald-50 px-1 rounded hover:bg-emerald-100 transition-colors shrink-0"
                                                title="Abrir WhatsApp com cliente"
                                              >
                                                <Phone className="w-2.5 h-2.5 shrink-0 text-emerald-600" />
                                                <span>{customerInfo.phone}</span>
                                              </a>
                                            )}
                                          </div>
                                        )}

                                        <div className="text-[10px] text-neutral-500 truncate max-w-[150px]">
                                          {stop.cargo_description}
                                        </div>
                                      </div>

                                      {/* Código do Cliente / PIN em Destaque */}
                                      {stop.delivery_mode === 'IN_PERSON' ? (
                                        <div className="shrink-0 text-right">
                                          <span className="text-[9px] text-neutral-400 block font-medium">Cód. Cliente</span>
                                          <button
                                            type="button"
                                            onClick={() => stop.pin_code && copyToClipboard(stop.pin_code, `pin_${stop.id}`)}
                                            onDoubleClick={(e) => {
                                              e.stopPropagation();
                                              handleOpenCustomerWhatsApp(stop);
                                            }}
                                            className="inline-flex items-center gap-1 font-mono font-bold text-xs bg-amber-100 hover:bg-amber-200 text-amber-950 px-2 py-0.5 rounded border border-amber-300 shadow-2xs transition-colors cursor-pointer select-none"
                                            title="Clique simples: Copiar PIN | Clique duplo: Enviar mensagem amigável no WhatsApp para o cliente"
                                          >
                                            <span>🔑</span>
                                            <strong>{stop.pin_code || '—'}</strong>
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="shrink-0 text-right">
                                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-200 text-[10px]">
                                            📷 Foto
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="text-[11px] text-neutral-500 font-medium truncate">
                                  {stopsSummary}
                                </div>
                              )}
                            </div>
                          </td>

                          <td className="px-3 py-3 font-semibold text-neutral-800 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-neutral-400" />
                              <span>{route.final_deadline}</span>
                            </div>
                            {route.scheduled_for && !/^Entregar às/.test(route.final_deadline || '') && (
                              <div className="text-[10px] font-semibold text-neutral-600 mt-0.5">
                                📅 Entrega {fmtScheduleBRT(route.scheduled_for)}
                              </div>
                            )}
                            {route.status === 'DRAFT' && route.publish_at && (
                              <div className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                                ⏰ Oferta automática {fmtScheduleBRT(route.publish_at)}
                              </div>
                            )}
                            {route.status === 'DRAFT' && route.publish_error && (
                              <div className="text-[10px] font-semibold text-red-700 mt-0.5 whitespace-normal max-w-[220px]" title={route.publish_error}>
                                Oferta não publicada: {route.publish_error === 'NO_ACTIVE_DRIVERS_AVAILABLE' ? 'nenhum motorista ativo compatível (nova tentativa em 5 min)' : route.publish_error}
                              </div>
                            )}
                          </td>

                          <td className="px-3 py-3 whitespace-nowrap w-[100px] min-w-[95px]">
                            <span className="font-bold text-sm text-neutral-800 font-mono">
                              R$ {route.total_fee}
                            </span>
                          </td>

                          {/* Frete Motorista (Líquido a Receber) */}
                          <td className="px-3 py-3 whitespace-nowrap w-[140px] min-w-[135px]">
                            {(() => {
                              const driverFee = calculateDriverFee(route);
                              return (
                                <span className="inline-flex items-center gap-1 font-mono font-bold text-xs sm:text-sm text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 whitespace-nowrap shadow-2xs">
                                  <span>🛵</span>
                                  <span>R$ {driverFee.toFixed(2).replace('.', ',')}</span>
                                </span>
                              );
                            })()}
                          </td>

                          {/* Veículos Aceitos & Alteração Rápida em Rascunho */}
                          <td className="px-3 py-3 whitespace-nowrap w-[140px]">
                            <div className="space-y-1.5">
                              <div>{renderCompactVehicleBadges(route.accepted_vehicle_types)}</div>

                              {/* Alteração rápida do veículo quando em Rascunho */}
                              {route.status === 'DRAFT' && (
                                <div className="flex items-center gap-1 pt-0.5">
                                  <span className="text-[9px] text-neutral-400 font-semibold">Mudar:</span>
                                  <button
                                    type="button"
                                    onClick={() => handleQuickUpdateVehicleType(route.id, ['CAR'])}
                                    title="Alterar para Apenas Carro"
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors ${
                                      route.accepted_vehicle_types?.length === 1 && route.accepted_vehicle_types[0] === 'CAR'
                                        ? 'bg-orange-600 text-white border-orange-600'
                                        : 'bg-white hover:bg-neutral-100 text-neutral-700 border-neutral-300'
                                    }`}
                                  >
                                    🚗 Carro
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleQuickUpdateVehicleType(route.id, ['MOTO', 'MOTO_WITH_BAG'])}
                                    title="Alterar para Apenas Moto"
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors ${
                                      !route.accepted_vehicle_types?.includes('CAR') && route.accepted_vehicle_types?.includes('MOTO')
                                        ? 'bg-orange-600 text-white border-orange-600'
                                        : 'bg-white hover:bg-neutral-100 text-neutral-700 border-neutral-300'
                                    }`}
                                  >
                                    🏍️ Moto
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleQuickUpdateVehicleType(route.id, ['CAR', 'MOTO', 'MOTO_WITH_BAG'])}
                                    title="Alterar para Todos os Veículos"
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors ${
                                      route.accepted_vehicle_types?.includes('CAR') && route.accepted_vehicle_types?.includes('MOTO')
                                        ? 'bg-orange-600 text-white border-orange-600'
                                        : 'bg-white hover:bg-neutral-100 text-neutral-700 border-neutral-300'
                                    }`}
                                  >
                                    🌐 Todos
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>

                          <td className="px-3 py-3 text-right whitespace-nowrap sticky right-0 bg-white group-hover:bg-neutral-50/95 transition-colors z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] border-l border-neutral-200/80 w-[180px] min-w-[170px]">
                            <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                              <button
                                onClick={() => openRouteDetails(route.id)}
                                className="px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-100 text-neutral-700 text-[11px] font-bold transition-colors whitespace-nowrap shadow-2xs"
                              >
                                Detalhes
                              </button>

                              {/* M4.4: Botão Editar / Reajustar Proposta (A1) */}
                              {isProposalRejected ? (
                                <button
                                  onClick={() => setEditingRouteId(route.id)}
                                  className="px-2.5 py-1.5 rounded-lg border-2 border-amber-500 bg-amber-50 hover:bg-amber-100 text-amber-950 text-[11px] font-black transition-colors flex items-center gap-1 whitespace-nowrap shadow-xs animate-pulse ring-2 ring-amber-300 cursor-pointer"
                                  title="Motorista recusou a proposta anterior. Clique para reajustar o frete/paradas e reenviar a proposta."
                                >
                                  <Pencil className="w-3 h-3 text-amber-700" />
                                  <span>Reajustar Proposta</span>
                                </button>
                              ) : ['DRAFT', 'OFFERED', 'ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT'].includes(route.status) ? (
                                <button
                                  onClick={() => setEditingRouteId(route.id)}
                                  className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-bold transition-colors flex items-center gap-1 whitespace-nowrap shadow-2xs"
                                  title="Editar rota (M4.4)"
                                >
                                  <Pencil className="w-3 h-3 text-amber-700" />
                                  <span>Editar</span>
                                </button>
                              ) : (
                                <button
                                  disabled
                                  className="px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-neutral-100 text-neutral-400 text-[11px] font-semibold cursor-not-allowed flex items-center gap-1 whitespace-nowrap"
                                  title={
                                    route.status === 'COMPLETED'
                                      ? 'Rotas concluídas não podem ser alteradas (M4.4 Seção 21)'
                                      : 'Rotas canceladas não podem ser alteradas (M4.4 Seção 22)'
                                  }
                                >
                                  <Pencil className="w-3 h-3 opacity-40" />
                                  <span>Editar</span>
                                </button>
                              )}

                              {route.status === 'DRAFT' && (
                                <button
                                  onClick={() => openPublishSummary(route)}
                                  disabled={publishingId === route.id}
                                  className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-bold shadow-xs transition-colors flex items-center gap-1 whitespace-nowrap"
                                >
                                  <Send className="w-3 h-3" />
                                  <span>Publicar</span>
                                </button>
                              )}

                              {route.status === 'DRAFT' && !route.publish_at && (
                                <button
                                  type="button"
                                  onClick={() => openScheduleModal(route)}
                                  className="px-2.5 py-1.5 rounded-lg border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800 text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer"
                                  title="Programar a publicação da oferta para antes do horário de entrega"
                                >
                                  ⏰ Agendar oferta
                                </button>
                              )}

                              {route.status === 'DRAFT' && route.publish_at && (
                                <button
                                  type="button"
                                  onClick={() => handleUnschedule(route)}
                                  className="px-2.5 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-700 text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer"
                                  title="Desfazer a oferta agendada (volta a ser rascunho comum)"
                                >
                                  Desagendar
                                </button>
                              )}

                              {route.status !== 'CANCELLED' && (
                                <button
                                  type="button"
                                  onClick={() => openCancelModal(route)}
                                  disabled={cancellingId === route.id}
                                  className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer"
                                  title="Cancelar corrida em qualquer status e encaminhar para Pendências Operacionais"
                                >
                                  {cancellingId === route.id ? 'Cancelando...' : 'Cancelar'}
                                </button>
                              )}

                              {canDeleteRoute(route) && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRoute(route)}
                                  disabled={cancellingId === route.id}
                                  className="px-2.5 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-700 text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer"
                                  title="Excluir de vez (só rascunhos ou canceladas sem entregador)"
                                >
                                  Excluir
                                </button>
                              )}

                              {route.status !== 'COMPLETED' &&
                                route.status !== 'CANCELLED' &&
                                (hasRouteIssue ||
                                  route.stops?.every(
                                    (s) => s.status === 'DELIVERED' || s.status === 'INCIDENT'
                                  )) && (
                                  <button
                                    type="button"
                                    onClick={() => handleFinalizeRoute(route.id)}
                                    disabled={finalizingRouteId === route.id}
                                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-xs transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer"
                                    title="Finalizar corrida tratada e liberar para pagamento PIX"
                                  >
                                    <CheckCircle className="w-3 h-3" />
                                    <span>
                                      {finalizingRouteId === route.id
                                        ? '...'
                                        : 'Finalizar e Pagar'}
                                    </span>
                                  </button>
                                )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}

      {/* ============================================================== */}
      {/* TAB 2: PONTOS DE COLETA (M2.1 Seção 12)                        */}
      {/* ============================================================== */}
      {activeTab === 'LOCATIONS' && (
        <main id="main-content" className="w-full max-w-[1780px] mx-auto px-4 sm:px-6 lg:px-8 mt-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/80 backdrop-blur p-4 rounded-2xl border border-neutral-200 shadow-xs">
            <div>
              <h2 className="text-base font-bold text-neutral-950 flex items-center gap-2">
                <span>Cadastro de Pontos de Coleta (Lojas e Centros)</span>
              </h2>
              <p className="text-xs text-neutral-500 font-medium mt-0.5">
                Gerencie os locais pré-cadastrados para retirada de pedidos da Kantine.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchPickupLocations}
                className="p-2.5 rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-700 transition-colors shadow-xs"
                title="Atualizar lista"
              >
                <RefreshCw className={`w-4 h-4 ${loadingLocations ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleOpenNewLocationModal}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-600/20 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Ponto de Coleta</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50/80 border-b border-neutral-200 text-neutral-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Nome do Ponto</th>
                  <th className="px-4 py-3">Bairro</th>
                  <th className="px-4 py-3">Endereço Completo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loadingLocations ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-neutral-400">
                      Carregando pontos de coleta...
                    </td>
                  </tr>
                ) : pickupLocations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-neutral-400">
                      Nenhum ponto de coleta cadastrado.
                    </td>
                  </tr>
                ) : (
                  pickupLocations.map((loc) => (
                    <tr key={loc.id} className="hover:bg-neutral-50/50 transition-colors">
                      <td className="px-4 py-3.5 font-mono font-bold text-neutral-900">
                        #{loc.id}
                      </td>
                      <td className="px-4 py-3.5 font-bold text-neutral-900 flex items-center gap-2">
                        <Store className="w-4 h-4 text-orange-600" />
                        <span>{loc.name}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        {loc.neighborhood?.trim() ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-neutral-100 text-neutral-800 border border-neutral-200">
                            {loc.neighborhood}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200" title="Bairro ausente - exigido para publicar rotas">
                            ⚠️ Bairro Pendente
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-neutral-700 font-medium">
                        {loc.address}
                      </td>
                      <td className="px-4 py-3.5">
                        {loc.active ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            ATIVO
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-500 border border-neutral-200">
                            INATIVO
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleLocationActive(loc)}
                            className="px-2.5 py-1 rounded-lg border border-neutral-200 text-[11px] font-semibold hover:bg-neutral-100"
                          >
                            {loc.active ? 'Desativar' : 'Ativar'}
                          </button>
                          <button
                            onClick={() => handleOpenEditLocationModal(loc)}
                            className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-[11px] font-semibold"
                          >
                            Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </main>
      )}

      {/* ============================================================== */}
      {/* TAB 3: MOTORISTAS (M1 & M1.1)                                  */}
      {/* ============================================================== */}
      {activeTab === 'DRIVERS' && (
        <main id="main-content" className="w-full max-w-[1780px] mx-auto px-4 sm:px-6 lg:px-8 mt-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/80 backdrop-blur p-4 rounded-2xl border border-neutral-200 shadow-xs">
            <div>
              <h2 className="text-base font-bold text-neutral-950 flex items-center gap-2">
                <span>Motoristas Cadastrados (Telegram & App)</span>
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {(
                  [
                    { key: 'ALL', label: 'Todos' },
                    {
                      key: 'PENDING',
                      label:
                        pendingApprovalDriversCount > 0
                          ? `⏳ Aguardando Aprovação (${pendingApprovalDriversCount})`
                          : '⏳ Aguardando Aprovação',
                      isAlert: pendingApprovalDriversCount > 0,
                    },
                    { key: 'ACTIVE', label: '✅ Ativos' },
                    { key: 'BLOCKED', label: '🚫 Bloqueados' },
                    { key: 'EXCLUDED', label: '📁 Excluídos (Processo Zerado)' },
                    { key: 'REACTIVATION_REQUESTED', label: '🔄 Pedidos Reativação' },
                  ] as const
                ).map((item: any) => (
                  <button
                    key={item.key}
                    onClick={() => {
                      setDriverFilter(item.key as any);
                      fetchDrivers(item.key as any);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      driverFilter === item.key
                        ? item.isAlert
                          ? 'bg-amber-600 text-white font-bold shadow-sm ring-2 ring-amber-400 animate-pulse'
                          : 'bg-neutral-900 text-white shadow-xs'
                        : item.isAlert
                        ? 'bg-amber-100 text-amber-900 border-2 border-amber-400 font-bold animate-pulse ring-2 ring-amber-300'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                onClick={() => fetchDrivers()}
                className="p-2.5 rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-700 transition-colors shadow-xs"
                title="Atualizar lista"
              >
                <RefreshCw className={`w-4 h-4 ${loadingDrivers ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowResetSystemModal(true)}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-700 font-bold text-xs transition-colors shadow-2xs cursor-pointer"
                title="Limpar motoristas e histórico para reiniciar sem erros"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpar Histórico</span>
              </button>
              <button
                onClick={() => {
                  setShowInviteModal(true);
                  fetchInvitations();
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-600/20 transition-all cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Convidar Motorista</span>
              </button>
            </div>
          </div>

          {/* Quick Invite Highlight Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-orange-500/5 border border-orange-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <span>Convidar motorista para concluir cadastro no Telegram</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Ativo
                  </span>
                </h3>
                <p className="text-[11px] text-neutral-600 mt-0.5">
                  Envie o convite diretamente para o WhatsApp do motorista ou exiba o QR Code no balcão da loja para ele iniciar no bot em segundos.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setShowInviteModal(true);
                  setInviteModalTab('QUICK');
                  fetchInvitations();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 font-bold text-xs transition-colors shadow-2xs"
              >
                <QrCode className="w-3.5 h-3.5 text-neutral-600" />
                <span>Ver QR Code & Link</span>
              </button>
              <button
                onClick={() => {
                  setShowInviteModal(true);
                  setInviteModalTab('DIRECT');
                  fetchInvitations();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs transition-colors shadow-2xs"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Convidar por WhatsApp</span>
              </button>
            </div>
          </div>

          {/* Pending Invitations Alert Card */}
          {invitationsList.filter((i) => i.status === 'PENDING').length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-300/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs font-bold text-sm">
                  ✉️
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-amber-950 flex items-center gap-2">
                    <span>
                      {invitationsList.filter((i) => i.status === 'PENDING').length} Convite(s) emitido(s) aguardando cadastro no Telegram
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300">
                      Aguardando
                    </span>
                  </h3>
                  <p className="text-[11px] text-amber-900/80 mt-0.5 font-medium">
                    {invitationsList
                      .filter((i) => i.status === 'PENDING')
                      .map((i) => `${i.name || 'Convidado'} (${i.phone || 's/ tel'})`)
                      .join(' • ')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setShowInviteModal(true);
                    setInviteModalTab('HISTORY');
                    fetchInvitations();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer"
                >
                  <span>Gerenciar Convites / Pré-Cadastrar</span>
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50/80 border-b border-neutral-200 text-neutral-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">ID / Nome</th>
                  <th className="px-4 py-3">Telefone</th>
                  <th className="px-4 py-3">Veículo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Chave Pix</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loadingDrivers ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-neutral-400">
                      Carregando motoristas...
                    </td>
                  </tr>
                ) : drivers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-neutral-400">
                      Nenhum motorista encontrado.
                    </td>
                  </tr>
                ) : (
                  drivers.map((driver) => {
                    const isDriverExcluded = driver.status === 'EXCLUDED' || driver.is_excluded;
                    const isPendingApproval =
                      driver.status === 'PENDING' ||
                      driver.reactivation_requested ||
                      driver.reinclusion_requested;

                    return (
                      <tr
                        key={driver.id}
                        className={`transition-colors ${
                          isPendingApproval
                            ? 'bg-amber-50/80 hover:bg-amber-100/70 border-l-4 border-l-amber-500 ring-1 ring-amber-300/80'
                            : 'hover:bg-neutral-50/50'
                        }`}
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-neutral-900">{driver.name}</span>
                            {driver.previous_exclusion_reason && !isDriverExcluded && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300"
                                title={`Memória Histórica: Motorista já foi excluído anteriormente pelo motivo: "${driver.previous_exclusion_reason}"`}
                              >
                                <AlertTriangle className="w-2.5 h-2.5 text-amber-700" />
                                <span>Já foi excluído</span>
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-neutral-500 font-mono">
                            ID: #{driver.id} • Telegram: @{driver.telegram_user_id || 'N/D'}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-medium text-neutral-700">
                          {driver.phone}
                        </td>
                        <td className="px-4 py-3.5">
                          {renderDriverVehicleBadges(driver.vehicle_type)}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="space-y-1">
                            {driver.status === 'ACTIVE' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                ATIVO
                              </span>
                            )}
                            {driver.status === 'PENDING' && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500 text-white shadow-xs animate-pulse ring-2 ring-amber-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                                AGUARDANDO APROVAÇÃO
                              </span>
                            )}
                            {driver.status === 'BLOCKED' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                BLOQUEADO
                              </span>
                            )}
                            {isDriverExcluded && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-900 text-neutral-100 border border-neutral-700">
                                🚫 EXCLUÍDO
                              </span>
                            )}

                            {driver.reactivation_requested && (
                              <div>
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-900 border border-orange-300 animate-pulse cursor-pointer"
                                  title={`Solicitação de reativação: "${driver.reactivation_reason}"`}
                                  onClick={() => openDriverDetails(driver.id)}
                                >
                                  🔄 Pediu Reativação
                                </span>
                              </div>
                            )}

                            {driver.reinclusion_requested && (
                              <div>
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-900 border border-purple-300 animate-pulse cursor-pointer"
                                  title={`Solicitação de reinclusão: "${driver.reinclusion_reason}"`}
                                  onClick={() => openDriverDetails(driver.id)}
                                >
                                  📝 Pediu Reinclusão
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-neutral-700">
                          {driver.pix_key_type === 'REQUIRES_UPDATE' ? (
                            <span className="text-amber-700 font-semibold text-[11px]">
                              ⚠️ Requer atualização
                            </span>
                          ) : driver.pix_key_value || driver.pix_key ? (
                            <div className="text-[11px] font-mono">
                              <span className="text-neutral-400 mr-1">{driver.pix_key_type || 'PIX'}:</span>
                              <span>{driver.pix_key_value || driver.pix_key}</span>
                            </div>
                          ) : (
                            <span className="text-neutral-400">Não informado</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              onClick={() => openDriverDetails(driver.id)}
                              className="px-2.5 py-1 rounded-lg border border-neutral-200 text-[11px] font-semibold hover:bg-neutral-100"
                            >
                              Auditoria
                            </button>

                            {!isDriverExcluded && (
                              <button
                                onClick={() => openEditDriverModal(driver)}
                                className="px-2.5 py-1 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-[11px] font-semibold"
                              >
                                Editar
                              </button>
                            )}

                            {driver.status === 'PENDING' && (
                              <button
                                onClick={() => handleApproveDriver(driver.id)}
                                disabled={actionLoadingId === driver.id}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer animate-pulse ring-2 ring-emerald-400 shadow-sm flex items-center gap-1"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Aprovar</span>
                              </button>
                            )}

                            {driver.status === 'ACTIVE' && (
                              <button
                                onClick={() => handleBlockDriver(driver.id)}
                                disabled={actionLoadingId === driver.id}
                                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold cursor-pointer"
                              >
                                Bloquear
                              </button>
                            )}

                            {driver.status === 'BLOCKED' && (
                              <>
                                <button
                                  onClick={() => handleReactivateDriver(driver.id)}
                                  disabled={actionLoadingId === driver.id}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
                                  title="Reativar motorista para ativo"
                                >
                                  Reativar
                                </button>
                                {driver.reactivation_requested && (
                                  <button
                                    onClick={() => {
                                      setDecisionDriver(driver);
                                      setDecisionType('REJECT_REACTIVATION');
                                      setDecisionReasonInput('');
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 text-[11px] font-semibold cursor-pointer"
                                    title="Recusar pedido de reativação"
                                  >
                                    Recusar Pedido
                                  </button>
                                )}
                              </>
                            )}

                            {isDriverExcluded ? (
                              <button
                                onClick={() => handleReinviteExcludedDriver(driver)}
                                className="px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer shadow-xs"
                                title="Gerar novo convite para o motorista reiniciar o cadastro com dados atualizados (processo zerado)"
                              >
                                <span>✉️ Gerar Novo Convite</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setExcludingDriver(driver);
                                  setExclusionReasonInput('');
                                }}
                                className="px-2 py-1 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 text-[11px] font-semibold cursor-pointer"
                                title="Excluir/desativar cadastro do motorista"
                              >
                                Excluir
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </main>
      )}

      {/* ============================================================== */}
      {/* TAB 4: INDICAÇÕES DE MOTORISTAS (M1.2)                         */}
      {/* ============================================================== */}
      {activeTab === 'REFERRALS' && (
        <main id="main-content" className="w-full max-w-[1780px] mx-auto px-4 sm:px-6 lg:px-8 mt-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/80 backdrop-blur p-4 rounded-2xl border border-neutral-200 shadow-xs">
            <div>
              <h2 className="text-base font-bold text-neutral-950 flex items-center gap-2">
                <span>Indicações de Motoristas (Rede Fechada M1.2)</span>
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {(
                  [
                    { key: 'ALL', label: 'Todas' },
                    {
                      key: 'PENDING_REVIEW',
                      label:
                        pendingReferralsCount > 0
                          ? `⏳ Em Análise (${pendingReferralsCount})`
                          : '⏳ Em Análise',
                      isAlert: pendingReferralsCount > 0,
                    },
                    { key: 'APPROVED', label: '✅ Aprovadas' },
                    { key: 'INVITE_USED', label: '📲 Cadastro Realizado' },
                    { key: 'REJECTED', label: '🚫 Não Aprovadas' },
                    { key: 'EXPIRED', label: '⌛ Expiradas' },
                  ] as const
                ).map((f: any) => (
                  <button
                    key={f.key}
                    onClick={() => {
                      setReferralFilter(f.key as any);
                      fetchReferrals(f.key as any);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      referralFilter === f.key
                        ? f.isAlert
                          ? 'bg-orange-600 text-white font-bold shadow-sm ring-2 ring-orange-400 animate-pulse'
                          : 'bg-neutral-900 text-white shadow-xs'
                        : f.isAlert
                        ? 'bg-orange-100 text-orange-950 border-2 border-orange-400 font-bold animate-pulse ring-2 ring-orange-300'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <input
                type="text"
                placeholder="Buscar por indicado ou indicador..."
                value={referralSearch}
                onChange={(e) => setReferralSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') fetchReferrals();
                }}
                className="px-3 py-2 text-xs border border-neutral-300 rounded-xl bg-white w-48 sm:w-64"
              />
              <button
                onClick={() => fetchReferrals()}
                className="p-2.5 rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-700 transition-colors shadow-xs"
                title="Atualizar lista"
              >
                <RefreshCw className={`w-4 h-4 ${loadingReferrals ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => {
                  setShowVehicleAuditModal(true);
                  fetchVehicleAudit();
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs transition-colors shadow-xs shrink-0"
                title="Auditoria de veículos dos indicados (M4.1)"
              >
                <Car className="w-3.5 h-3.5 text-amber-400" />
                <span>Auditoria de Veículos</span>
                {vehicleAuditList.some((v) => v.is_potentially_affected) && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Há motoristas com CAR_SEDAN para conferir"></span>
                )}
              </button>
            </div>
          </div>

          {/* Info Banner about M1.2 Two-Stage Decision */}
          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs text-blue-900 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Regra de Rede Fechada:</strong> A aprovação da indicação autoriza o indicado a realizar seu cadastro via convite exclusivo (válido por 7 dias). Após o indicado submeter os dados no Telegram, o cadastro é criado como <strong>PENDENTE</strong> e necessita de aprovação final na aba de Motoristas para operar rotas.
            </div>
          </div>

          {/* Referrals Table */}
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50/80 border-b border-neutral-200 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Indicado</th>
                  <th className="px-4 py-3">Motorista Indicador</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Convite / Resultado</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loadingReferrals ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                      Carregando indicações...
                    </td>
                  </tr>
                ) : referralsList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                      Nenhuma indicação encontrada.
                    </td>
                  </tr>
                ) : (
                  referralsList.map((ref) => {
                    const isPending = ref.status === 'PENDING_REVIEW';
                    return (
                      <tr
                        key={ref.id}
                        className={`transition-colors ${
                          isPending
                            ? 'bg-orange-50/80 hover:bg-orange-100/70 border-l-4 border-l-orange-500 ring-1 ring-orange-300/80'
                            : 'hover:bg-neutral-50/50'
                        }`}
                      >
                        <td className="px-4 py-3 font-semibold text-neutral-900">
                          <div>{ref.referred_name}</div>
                          <div className="text-[11px] font-mono text-neutral-500 font-normal">
                            {ref.referred_phone}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          {ref.referred_by_driver ? (
                            <div className="space-y-0.5">
                              <div className="font-semibold text-neutral-900 flex items-center gap-1.5">
                                <span>{ref.referred_by_driver.name}</span>
                                <span
                                  className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                    ref.referred_by_driver.status === 'ACTIVE'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-neutral-100 text-neutral-600'
                                  }`}
                                >
                                  {ref.referred_by_driver.status}
                                </span>
                              </div>
                              <div className="text-[11px] text-neutral-500 mt-0.5">
                                {renderDriverVehicleBadges(ref.referred_by_driver.vehicle_type)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-neutral-400">Motorista #{ref.referred_by_driver_id}</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-neutral-500 text-[11px]">
                          {new Date(ref.created_at).toLocaleString('pt-BR')}
                        </td>

                        <td className="px-4 py-3">
                          {ref.status === 'PENDING_REVIEW' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-orange-600 text-white shadow-xs animate-pulse ring-2 ring-orange-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                              MOTORISTA INDICADO — EM ANÁLISE
                            </span>
                          ) : (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                ref.status === 'APPROVED'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : ref.status === 'INVITE_USED'
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                  : ref.status === 'REJECTED'
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                              }`}
                            >
                              {ref.status === 'APPROVED' && 'APROVADA — CONVITE ATIVO'}
                              {ref.status === 'INVITE_USED' && 'CADASTRO REALIZADO'}
                              {ref.status === 'REJECTED' && 'NÃO APROVADA'}
                              {ref.status === 'EXPIRED' && 'CONVITE EXPIRADO'}
                            </span>
                          )}
                          {ref.rejection_reason && (
                            <div className="text-[10px] text-rose-600 mt-0.5 italic">
                              Motivo: {ref.rejection_reason}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-[11px]">
                          {ref.status === 'APPROVED' && ref.invite_link && (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(ref.invite_link!, `ref_${ref.id}`)}
                                  className="px-2 py-0.5 rounded border border-neutral-300 hover:bg-neutral-100 text-[10px] font-semibold text-neutral-700 flex items-center gap-1"
                                >
                                  <Copy className="w-3 h-3" />
                                  <span>{copiedKey === `ref_${ref.id}` ? 'Copiado!' : 'Copiar Link'}</span>
                                </button>
                              </div>
                              {ref.invitation_expires_at && (
                                <div className="text-[10px] text-neutral-500">
                                  Expira em: {new Date(ref.invitation_expires_at).toLocaleDateString('pt-BR')}
                                </div>
                              )}
                            </div>
                          )}

                          {ref.status === 'INVITE_USED' && (
                            <div>
                              {ref.resulting_driver ? (
                                <span className="font-semibold text-neutral-900">
                                  Motorista: {ref.resulting_driver.name} ({ref.resulting_driver.status})
                                </span>
                              ) : (
                                <span className="text-neutral-500">Convite consumido no Telegram</span>
                              )}
                            </div>
                          )}

                          {ref.status === 'PENDING_REVIEW' && (
                            <span className="text-neutral-400 text-[10px]">Aguardando decisão da Kantine</span>
                          )}

                          {ref.status === 'REJECTED' && (
                            <span className="text-neutral-400 text-[10px]">Sem convite</span>
                          )}

                          {ref.status === 'EXPIRED' && (
                            <span className="text-neutral-400 text-[10px]">Prazo de 7 dias esgotado</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          {ref.status === 'PENDING_REVIEW' && (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleApproveReferral(ref.id)}
                                disabled={actionLoadingReferralId === ref.id}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-sm transition-colors flex items-center gap-1 animate-pulse ring-2 ring-emerald-400 cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Aprovar</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenRejectModal(ref.id)}
                                disabled={actionLoadingReferralId === ref.id}
                                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] transition-colors"
                              >
                                Recusar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </main>
      )}

      {/* ============================================================== */}
      {/* TAB 5: PENDÊNCIAS OPERACIONAIS (M4.1 PARTE B)                  */}
      {/* ============================================================== */}
      {activeTab === 'INCIDENTS' && (
        <main id="main-content" className="w-full max-w-[1780px] mx-auto px-4 sm:px-6 lg:px-8 mt-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/80 backdrop-blur p-4 rounded-2xl border border-neutral-200 shadow-xs">
            <div>
              <h2 className="text-base font-bold text-neutral-950 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span>Pendências Operacionais & Destinação de Encomendas</span>
              </h2>
              <p className="text-xs text-neutral-500 mt-1">
                Gestão da destinação física de encomendas com falha ou incidentes na rota (Bolo/Doces retidos com motorista)
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {(
                  [
                    { key: 'ALL', label: 'Todas as Ocorrências' },
                    {
                      key: 'OPEN',
                      label:
                        openIncidentsCount > 0
                          ? `🔴 Não Resolvidas (${openIncidentsCount})`
                          : '🔴 Não Resolvidas',
                      isAlert: openIncidentsCount > 0,
                    },
                    { key: 'RESOLVED', label: '🟢 Resolvidas' },
                  ] as const
                ).map((f: any) => (
                  <button
                    key={f.key}
                    onClick={() => {
                      setIncidentResolutionFilter(f.key as any);
                      fetchIncidents(f.key as any);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      incidentResolutionFilter === f.key
                        ? f.isAlert
                          ? 'bg-rose-600 text-white font-bold shadow-sm ring-2 ring-rose-400 animate-pulse'
                          : 'bg-neutral-900 text-white shadow-xs'
                        : f.isAlert
                        ? 'bg-rose-100 text-rose-950 border-2 border-rose-400 font-bold animate-pulse ring-2 ring-rose-300'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <input
                type="text"
                placeholder="Buscar por cliente, bairro, carga..."
                value={incidentSearch}
                onChange={(e) => setIncidentSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') fetchIncidents();
                }}
                className="px-3 py-2 text-xs border border-neutral-300 rounded-xl bg-white w-48 sm:w-64"
              />
              <button
                onClick={() => fetchIncidents()}
                className="p-2.5 rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-700 transition-colors shadow-xs"
                title="Atualizar lista"
              >
                <RefreshCw className={`w-4 h-4 ${loadingIncidents ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Incidents Table */}
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50/80 border-b border-neutral-200 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Rota / Parada</th>
                  <th className="px-4 py-3">Motorista</th>
                  <th className="px-4 py-3">Destino & Carga</th>
                  <th className="px-4 py-3">Motivo da Falha</th>
                  <th className="px-4 py-3">Status de Resolução</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loadingIncidents ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-neutral-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-neutral-400" />
                      Carregando incidentes operacionais...
                    </td>
                  </tr>
                ) : incidentsList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-neutral-400">
                      <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                      Nenhuma pendência operacional encontrada para este filtro.
                    </td>
                  </tr>
                ) : (
                  incidentsList.map((item) => {
                    const isResolved = item.stop.incident_resolution_status === 'RESOLVED';
                    const resOption = INCIDENT_RESOLUTION_OPTIONS.find((o) => o.type === item.stop.resolution_type);

                    return (
                      <tr
                        key={item.stop.id}
                        className={`transition-colors ${
                          !isResolved
                            ? 'bg-rose-50/80 hover:bg-rose-100/70 border-l-4 border-l-rose-500 ring-1 ring-rose-300/80'
                            : 'hover:bg-neutral-50/60'
                        }`}
                      >
                        <td className="px-4 py-3 font-semibold text-neutral-900">
                          <div className="font-mono text-sm text-neutral-950 font-bold flex items-center gap-1.5">
                            <span>Rota #{item.route.id}</span>
                            {item.route.status === 'CANCELLED' && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                CANCELADA
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-neutral-500 font-normal">
                            Parada #{item.stop.sequence}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          {item.driver ? (
                            <div>
                              <div className="font-semibold text-neutral-900 flex items-center gap-1.5">
                                <span>{item.driver.name}</span>
                              </div>
                              <div className="text-[11px] text-neutral-500 font-mono">
                                {item.driver.phone}
                              </div>
                            </div>
                          ) : (
                            <span className="text-neutral-400">Sem motorista</span>
                          )}
                        </td>

                        <td className="px-4 py-3 max-w-xs">
                          <div className="font-bold text-neutral-900">
                            {item.stop.cargo_description}
                          </div>
                          <div className="text-[11px] text-neutral-600 truncate">
                            {item.stop.destination_address}
                          </div>
                          <div className="text-[10px] text-neutral-400 font-medium">
                            {item.stop.destination_neighborhood}
                          </div>
                        </td>

                        <td className="px-4 py-3 max-w-xs">
                          <div className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded text-[11px] border border-rose-200">
                            <span>{item.stop.incident_type || 'INCIDENTE'}</span>
                          </div>
                          {item.stop.incident_note && (
                            <div className="text-[11px] text-neutral-600 mt-1 italic leading-snug">
                              "{item.stop.incident_note}"
                            </div>
                          )}
                          <div className="text-[10px] text-neutral-400 mt-0.5">
                            Ocorrido: {item.stop.incident_at ? new Date(item.stop.incident_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          {isResolved ? (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <span>🟢</span>
                                <span>RESOLVIDO</span>
                              </span>
                              <div className="mt-1 font-semibold text-neutral-900 text-xs flex items-center gap-1">
                                <span>{resOption?.icon}</span>
                                <span>{resOption?.label || item.stop.resolution_type}</span>
                              </div>
                              {item.stop.compensation_amount != null && (
                                <div className="mt-1 text-[11px] font-mono font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 inline-block">
                                  💰 Repasse: R$ {parseFloat(String(item.stop.compensation_amount)).toFixed(2)}
                                </div>
                              )}
                              {item.stop.resolution_note && (
                                <div className="text-[11px] text-neutral-600 italic mt-0.5">
                                  "{item.stop.resolution_note}"
                                </div>
                              )}
                              <div className="text-[10px] text-neutral-400 mt-0.5">
                                Por {item.stop.resolved_by || 'Admin'} em {item.stop.resolved_at ? new Date(item.stop.resolved_at).toLocaleString('pt-BR') : '-'}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-600 text-white shadow-xs animate-pulse ring-2 ring-rose-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                                PENDÊNCIA ABERTA
                              </span>
                              <div className="text-[11px] text-rose-700 font-bold mt-1">
                                {item.route.status === 'CANCELLED'
                                  ? '⚠️ Corrida cancelada: definir destinação e repasse'
                                  : '⚠️ Encomenda retida aguardando resolução'}
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {(() => {
                              let isRejected = false;
                              if (item.route.pending_material_change) {
                                try {
                                  const parsed =
                                    typeof item.route.pending_material_change === 'string'
                                      ? JSON.parse(item.route.pending_material_change)
                                      : item.route.pending_material_change;
                                  if (parsed?.status === 'REJECTED') isRejected = true;
                                } catch {}
                              }
                              if (!isRejected) return null;
                              return (
                                <button
                                  type="button"
                                  onClick={() => setEditingRouteId(item.route.id)}
                                  className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer animate-pulse ring-2 ring-amber-300"
                                  title="O motorista recusou a proposta anterior. Clique para reajustar o frete/paradas e reenviar a proposta."
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  <span>Reajustar Proposta</span>
                                </button>
                              );
                            })()}

                            {item.route.status !== 'CANCELLED' && (
                              <button
                                type="button"
                                onClick={() => openCancelModal(item.route)}
                                disabled={cancellingId === item.route.id}
                                className="px-2.5 py-1.5 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs shadow-xs transition-colors cursor-pointer"
                                title="Cancelar corrida em qualquer status"
                              >
                                Cancelar Corrida
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleOpenResolveIncidentModal(item)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-xs ${
                                isResolved
                                  ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                                  : 'bg-orange-600 hover:bg-orange-700 text-white animate-pulse ring-2 ring-orange-400 flex items-center gap-1 cursor-pointer'
                              }`}
                            >
                              {!isResolved && <AlertTriangle className="w-3.5 h-3.5" />}
                              <span>{isResolved ? 'Alterar Resolução' : 'Resolver & Valor'}</span>
                            </button>

                            {item.route.status === 'CANCELLED' && item.route.accepted_driver_id && (
                              item.route.payment_status === 'PAID' ? (
                                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-xs border border-emerald-200">
                                  ✅ Repasse Pago
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveTab('PAYMENTS');
                                    setPaymentFilter('PENDING');
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer"
                                  title="Ir para a aba de Pagamentos para repassar o valor ao motorista"
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                  <span>Pagar Repasse (R$ {item.route.total_fee})</span>
                                </button>
                              )
                            )}

                            {item.route.status !== 'COMPLETED' && item.route.status !== 'CANCELLED' && (
                              <button
                                type="button"
                                onClick={() => handleFinalizeRoute(item.route.id)}
                                disabled={finalizingRouteId === item.route.id}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer"
                                title="Finalizar corrida tratada e liberar para pagamento PIX"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>
                                  {finalizingRouteId === item.route.id
                                    ? 'Finalizando...'
                                    : 'Finalizar e Pagar'}
                                </span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </main>
      )}

      {/* ============================================================== */}
      {/* TAB 6: GESTÃO DE PAGAMENTOS (M4.1 PARTE C)                     */}
      {/* ============================================================== */}
      {activeTab === 'PAYMENTS' && (
        <main id="main-content" className="w-full max-w-[1780px] mx-auto px-4 sm:px-6 lg:px-8 mt-5 space-y-5">
          {/* Header & KPI Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              className={`p-4 rounded-2xl transition-all ${
                pendingPaymentsCount > 0
                  ? 'bg-amber-500/15 border-2 border-amber-400 ring-2 ring-amber-400/80 shadow-md animate-pulse'
                  : 'bg-white border border-amber-200 shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">A Pagar (Pendente)</span>
                <span className="p-1.5 rounded-lg bg-amber-100 text-amber-800 font-bold">🟡</span>
              </div>
              <div className="text-2xl font-bold text-neutral-950 mt-2 font-mono">
                R$ {paymentsData ? paymentsData.summary.totalPendingAmount.toFixed(2).replace('.', ',') : '0,00'}
              </div>
              <div className="text-[11px] text-amber-800 font-bold mt-1">
                {paymentsData?.summary.pendingRoutesCount || 0} rotas aguardando repasse imediato
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-emerald-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Total Repassado</span>
                <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 font-bold">🟢</span>
              </div>
              <div className="text-2xl font-bold text-neutral-950 mt-2 font-mono">
                R$ {paymentsData ? paymentsData.summary.totalPaidAmount.toFixed(2).replace('.', ',') : '0,00'}
              </div>
              <div className="text-[11px] text-emerald-700 font-semibold mt-1">
                {paymentsData?.summary.paidRoutesCount || 0} rotas pagas com sucesso
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-neutral-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Rotas Concluídas</span>
                <span className="p-1.5 rounded-lg bg-neutral-50 text-neutral-600 font-bold">📦</span>
              </div>
              <div className="text-2xl font-bold text-neutral-950 mt-2 font-mono">
                {paymentsData?.summary.totalCompletedRoutesCount || 0}
              </div>
              <div className="text-[11px] text-neutral-500 font-medium mt-1">
                Total histórico de entregas finalizadas
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-neutral-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Motoristas Ativos</span>
                <span className="p-1.5 rounded-lg bg-neutral-50 text-neutral-600 font-bold">👥</span>
              </div>
              <div className="text-2xl font-bold text-neutral-950 mt-2 font-mono">
                {paymentsData?.driversSummary.length || 0}
              </div>
              <div className="text-[11px] text-neutral-500 font-medium mt-1">
                Com saldo a receber ou repasses efetuados
              </div>
            </div>
          </div>

          {/* Directory of Drivers with Pending Payouts & Pix Keys */}
          {paymentsData && paymentsData.driversSummary.filter((d) => d.pendingAmount > 0).length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-neutral-950 flex items-center gap-2">
                  <span>💰 Saldos por Motorista & Chaves Pix para Repasse</span>
                </h3>
                <span className="text-xs text-neutral-400">Faça o Pix no seu app bancário e registre o comprovante</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {paymentsData.driversSummary
                  .filter((d) => d.pendingAmount > 0)
                  .map((item) => {
                    const pixKey = item.driver.pix_key_value || item.driver.pix_key || '';
                    return (
                      <div
                        key={item.driver.id}
                        className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/40 space-y-2 text-xs"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-bold text-neutral-900 text-sm">{item.driver.name}</div>
                            <div className="text-neutral-500 font-mono text-[11px]">{item.driver.phone}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold text-sm text-amber-900">
                              R$ {item.pendingAmount.toFixed(2).replace('.', ',')}
                            </div>
                            <div className="text-[10px] text-neutral-500">{item.pendingRoutesCount} rota(s) pendente(s)</div>
                          </div>
                        </div>

                        {/* Pix Key with Copy Button */}
                        <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between gap-2">
                          <div className="truncate">
                            <span className="text-[10px] uppercase font-bold text-amber-800 bg-amber-200/60 px-1.5 py-0.5 rounded mr-1">
                              {item.driver.pix_key_type || 'PIX'}
                            </span>
                            <span className="font-mono text-neutral-800 font-semibold select-all">
                              {pixKey || 'Não cadastrada'}
                            </span>
                          </div>
                          {pixKey && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(pixKey, `pix_${item.driver.id}`)}
                              className="px-2 py-1 rounded-md bg-white hover:bg-neutral-100 border border-neutral-200 text-neutral-700 font-bold text-[10px] flex items-center gap-1 transition-colors shrink-0 shadow-xs"
                              title="Copiar Chave Pix"
                            >
                              <Copy className="w-3 h-3" />
                              <span>{copiedKey === `pix_${item.driver.id}` ? 'Copiado!' : 'Copiar'}</span>
                            </button>
                          )}
                        </div>

                        <div className="pt-1 flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => setSelectedDriverFilter(selectedDriverFilter === item.driver.id ? null : item.driver.id)}
                            className="text-[11px] font-bold text-orange-600 hover:text-orange-700 underline"
                          >
                            {selectedDriverFilter === item.driver.id ? 'Limpar filtro' : 'Ver rotas deste motorista'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Routes Payment Table */}
          <div className="bg-white/80 backdrop-blur p-4 rounded-2xl border border-neutral-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { key: 'ALL', label: 'Todas as Rotas Concluídas' },
                    {
                      key: 'PENDING',
                      label:
                        pendingPaymentsCount > 0
                          ? `🟡 Pendentes de Repasse (${pendingPaymentsCount})`
                          : '🟡 Pendentes de Repasse',
                      isAlert: pendingPaymentsCount > 0,
                    },
                    { key: 'PAID', label: '🟢 Repassadas (Pagas)' },
                  ] as const
                ).map((f: any) => (
                  <button
                    key={f.key}
                    onClick={() => {
                      setPaymentFilter(f.key as any);
                      fetchPayments(f.key as any);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      paymentFilter === f.key
                        ? f.isAlert
                          ? 'bg-amber-600 text-white font-bold shadow-sm ring-2 ring-amber-400 animate-pulse'
                          : 'bg-neutral-900 text-white shadow-xs'
                        : f.isAlert
                        ? 'bg-amber-100 text-amber-950 border-2 border-amber-400 font-bold animate-pulse ring-2 ring-amber-300'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}

                {selectedDriverFilter && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-100 text-orange-800 text-xs font-semibold">
                    <span>Motorista filtrado</span>
                    <button onClick={() => setSelectedDriverFilter(null)} className="font-bold text-orange-900 ml-1">✕</button>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <input
                  type="text"
                  placeholder="Buscar por rota, motorista, pix..."
                  value={paymentSearch}
                  onChange={(e) => setPaymentSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') fetchPayments();
                  }}
                  className="px-3 py-2 text-xs border border-neutral-300 rounded-xl bg-white w-48 sm:w-64"
                />
                <button
                  onClick={() => fetchPayments()}
                  className="p-2.5 rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-700 transition-colors shadow-xs"
                  title="Atualizar lista"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingPayments ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50/80 border-b border-neutral-200 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="px-4 py-3">Rota Concluída</th>
                    <th className="px-4 py-3">Motorista Vencedor</th>
                    <th className="px-4 py-3">Chave Pix</th>
                    <th className="px-4 py-3">Repasse Motorista</th>
                    <th className="px-4 py-3">Status de Pagamento</th>
                    <th className="px-4 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {loadingPayments ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-neutral-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-neutral-400" />
                        Carregando rotas para pagamento...
                      </td>
                    </tr>
                  ) : !paymentsData || paymentsData.routes.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-neutral-400">
                        Nenhuma rota concluída encontrada para este filtro.
                      </td>
                    </tr>
                  ) : (
                    paymentsData.routes.map(({ route, driver }) => {
                      const isPaid = route.payment_status === 'PAID';
                      const pixKey = driver?.pix_key_value || driver?.pix_key || '';

                      return (
                        <tr
                          key={route.id}
                          className={`transition-colors ${
                            !isPaid
                              ? 'bg-amber-50/80 hover:bg-amber-100/70 border-l-4 border-l-amber-500 ring-1 ring-amber-300/80'
                              : 'hover:bg-neutral-50/60'
                          }`}
                        >
                          <td className="px-4 py-3 font-semibold text-neutral-900">
                            <div className="font-mono text-sm text-neutral-950 font-bold">
                              Rota #{route.id}
                            </div>
                            <div className="text-[11px] text-neutral-500 font-normal">
                              {route.pickup_name}
                            </div>
                            <div className="text-[10px] text-neutral-400">
                              Concluída em {route.completed_at ? new Date(route.completed_at).toLocaleString('pt-BR') : '-'}
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            {driver ? (
                              <div>
                                <div className="font-semibold text-neutral-900">
                                  {driver.name}
                                </div>
                                <div className="text-[11px] text-neutral-500 font-mono">
                                  {driver.phone}
                                </div>
                              </div>
                            ) : (
                              <span className="text-neutral-400">Motorista #{route.accepted_driver_id}</span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            {pixKey ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] uppercase font-bold text-neutral-600 bg-neutral-100 px-1 py-0.2 rounded">
                                    {driver?.pix_key_type || 'PIX'}
                                  </span>
                                  <span className="font-mono text-neutral-800 text-[11px] select-all">
                                    {pixKey}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(pixKey, `pix_r_${route.id}`)}
                                  className="text-[10px] text-orange-600 hover:text-orange-700 font-semibold flex items-center gap-1"
                                >
                                  <Copy className="w-2.5 h-2.5" />
                                  <span>{copiedKey === `pix_r_${route.id}` ? 'Copiado!' : 'Copiar Chave'}</span>
                                </button>
                              </div>
                            ) : (
                              <span className="text-neutral-400 text-[11px]">Chave Pix não cadastrada</span>
                            )}
                          </td>

                          <td className="px-4 py-3 font-mono">
                            {(() => {
                              const driverFee = calculateDriverFee(route);
                              return (
                                <div>
                                  <span className="font-bold text-sm text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-flex items-center gap-1">
                                    <span>🛵</span>
                                    <span>R$ {driverFee.toFixed(2).replace('.', ',')}</span>
                                  </span>
                                  <div className="text-[10px] text-neutral-500 font-normal mt-0.5">
                                    Frete Total: R$ {route.total_fee}
                                  </div>
                                </div>
                              );
                            })()}
                          </td>

                          <td className="px-4 py-3">
                            {isPaid ? (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  <span>🟢</span>
                                  <span>PAGO VIA {route.payment_method || 'PIX'}</span>
                                </span>
                                <div className="text-[10px] text-neutral-500 mt-1">
                                  Pago em {route.paid_at ? new Date(route.paid_at).toLocaleString('pt-BR') : '-'}
                                </div>
                                {route.payment_reference && (
                                  <div className="text-[10px] text-neutral-600 font-mono">
                                    Ref: {route.payment_reference}
                                  </div>
                                )}
                                {route.payment_note && (
                                  <div className="text-[10px] text-neutral-500 italic">
                                    Obs: {route.payment_note}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500 text-white shadow-xs animate-pulse ring-2 ring-amber-300">
                                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                                  AGUARDANDO PAGAMENTO PIX
                                </span>
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3 text-right">
                            {isPaid ? (
                              <span className="text-neutral-400 text-xs font-semibold">Repassado ✓</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenPayRouteModal(route, driver)}
                                className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer animate-pulse ring-2 ring-emerald-400 flex items-center gap-1 ml-auto"
                              >
                                <DollarSign className="w-3.5 h-3.5" />
                                <span>Registrar Pagamento</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}

      {/* ============================================================== */}
      {/* TAB 7: MOTOR DE FRETES & PRECIFICAÇÃO OFICIAL                  */}
      {/* ============================================================== */}
      {activeTab === 'SETTINGS' && (
        <main id="main-content" className="w-full max-w-[1780px] mx-auto px-4 sm:px-6 lg:px-8 mt-5 space-y-5">
          <FreightEngineSettings
            getAuthHeaders={getAuthHeaders}
            setSuccessMessage={setSuccessMessage}
            setErrorMessage={setErrorMessage}
            pickupLocations={pickupLocations}
            onRouteDraftCreated={async () => {
              setActiveTab('ROUTES');
              await fetchRoutes();
            }}
            onLoadIntoRouteForm={(draft) => {
              setNewRoute({
                modality: draft.modality,
                pickup_type: draft.pickup_type,
                pickup_location_id: draft.pickup_location_id,
                pickup_name: draft.pickup_name,
                pickup_address: draft.pickup_address,
                pickup_neighborhood: draft.pickup_neighborhood,
                final_deadline: draft.final_deadline,
                total_fee: draft.total_fee,
                override_driver_fee: '',
                override_reason: '',
                accepted_vehicle_types: draft.accepted_vehicle_types,
                stops: draft.stops.map((s) => ({
                  destination_address: s.destination_address,
                  destination_neighborhood: s.destination_neighborhood,
                  neighborhood_id: null,
                  modality_code: 'CONVENCIONAL',
                  pricing_vehicle_category: draft.modality === 'CAR' ? 'CAR' : 'MOTO',
                  customer_freight: '',
                  cargo_description: s.cargo_description,
                  delivery_mode: s.delivery_mode,
                  desired_deadline: s.desired_deadline,
                  observations: s.observations,
                  is_horizontal_condo: s.is_horizontal_condo,
                })),
              });
              setActiveTab('ROUTES');
              setShowCreateRouteModal(true);
            }}
            onNavigateToRoutes={() => setActiveTab('ROUTES')}
            pendingTakeatCount={pendingTakeatCount}
            onRefreshPendingTakeatCount={() => fetchTakeatPendingCount(true)}
          />
        </main>
      )}

      {/* ============================================================== */}
      {/* MODAL: RESOLVER INCIDENTE OPERACIONAL (M4.1 PARTE B)           */}
      {/* ============================================================== */}
      {resolvingStop && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-neutral-200 my-8 space-y-4 text-xs">
            <div className="flex items-start justify-between border-b border-neutral-200 pb-3">
              <div>
                <h3 className="font-bold text-neutral-900 text-base flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  <span>Resolução do Incidente — Parada #{resolvingStop.stop.sequence}</span>
                </h3>
                <p className="text-neutral-500 text-xs mt-0.5">
                  Rota #{resolvingStop.route.id} • Motorista: {resolvingStop.driver?.name || 'Não identificado'}
                </p>
              </div>
              <button
                onClick={() => setResolvingStop(null)}
                className="text-neutral-400 hover:text-neutral-700 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Informações da Entrega que Falhou */}
            <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-1.5">
              <div><strong>Carga:</strong> {resolvingStop.stop.cargo_description}</div>
              <div><strong>Endereço:</strong> {resolvingStop.stop.destination_address}, {resolvingStop.stop.destination_neighborhood}</div>
              <div className="text-rose-700"><strong>Motivo registrado:</strong> {resolvingStop.stop.incident_type} {resolvingStop.stop.incident_note ? `("${resolvingStop.stop.incident_note}")` : ''}</div>
            </div>

            {/* Seleção Obrigatória do Destino da Encomenda */}
            <div>
              <label className="block font-bold text-neutral-800 text-xs mb-2">
                Destinação da Encomenda (Escolha uma opção): *
              </label>
              <div className="grid grid-cols-1 gap-2">
                {INCIDENT_RESOLUTION_OPTIONS.map((opt) => (
                  <label
                    key={opt.type}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      selectedResolutionType === opt.type
                        ? 'border-orange-600 bg-orange-50/50 shadow-xs ring-1 ring-orange-600'
                        : 'border-neutral-200 bg-white hover:bg-neutral-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="resolution_type"
                      value={opt.type}
                      checked={selectedResolutionType === opt.type}
                      onChange={() => setSelectedResolutionType(opt.type)}
                      className="mt-0.5 text-orange-600 focus:ring-orange-500"
                    />
                    <div>
                      <div className="font-bold text-neutral-900 text-xs flex items-center gap-1.5">
                        <span>{opt.icon}</span>
                        <span>{opt.label}</span>
                      </div>
                      <div className="text-[11px] text-neutral-500 mt-0.5">{opt.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Acordo Financeiro / Repasse ao Motorista */}
            {resolvingStop.route.accepted_driver_id ? (
              <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-amber-950">
                    💰 Acordo Financeiro / Repasse ao Motorista (R$):
                  </label>
                  <span className="text-[11px] font-mono font-bold text-amber-900">
                    Original: R$ {resolvingStop.route.total_fee}
                  </span>
                </div>
                <p className="text-[11px] text-amber-900/80 leading-snug">
                  Informe o valor acordado para pagar ao motorista ({resolvingStop.driver?.name || `#${resolvingStop.route.accepted_driver_id}`}) por esta ocorrência ou cancelamento (ex: taxa de deslocamento ou frete integral). Caso nenhum valor seja devido, selecione R$ 0,00.
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setResolutionCompensationInput('0.00')}
                    className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 text-[11px] font-semibold cursor-pointer"
                  >
                    R$ 0,00 (Isento)
                  </button>
                  <button
                    type="button"
                    onClick={() => setResolutionCompensationInput('10.00')}
                    className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 text-[11px] font-semibold cursor-pointer"
                  >
                    R$ 10,00 (Deslocamento)
                  </button>
                  <button
                    type="button"
                    onClick={() => setResolutionCompensationInput('15.00')}
                    className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 text-[11px] font-semibold cursor-pointer"
                  >
                    R$ 15,00
                  </button>
                  <button
                    type="button"
                    onClick={() => setResolutionCompensationInput(resolvingStop.route.total_fee || '0.00')}
                    className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 text-[11px] font-semibold cursor-pointer"
                  >
                    R$ {resolvingStop.route.total_fee} (Total)
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-bold text-amber-950 font-mono">R$</span>
                  <input
                    type="text"
                    value={resolutionCompensationInput}
                    onChange={(e) => setResolutionCompensationInput(e.target.value)}
                    placeholder="0.00"
                    className="w-32 px-3 py-1.5 text-xs font-mono font-bold border border-amber-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-amber-800 font-medium">
                    {resolutionCompensationInput === '0.00' || resolutionCompensationInput === '0'
                      ? 'Corrida isenta de repasse financeiro'
                      : resolutionCompensationInput
                      ? `Será atualizado para R$ ${resolutionCompensationInput} na fila de pagamentos`
                      : 'Deixe em branco para manter frete atual'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-[11px] text-neutral-500">
                ℹ️ Esta corrida não possui motorista vinculado (cancelada antes do aceite), portanto não há repasse financeiro necessário.
              </div>
            )}

            {/* Nota Operacional / Instruções */}
            <div>
              <label className="block font-bold text-neutral-800 text-xs mb-1">
                Observações Operacionais / Instruções da Loja:
              </label>
              <textarea
                rows={3}
                placeholder="Ex: Motorista avisado para retornar à Kantine Matriz com o bolo até as 19h... Solução tratada com cliente."
                value={resolutionNoteInput}
                onChange={(e) => setResolutionNoteInput(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs focus:ring-1 focus:ring-orange-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setResolvingStop(null)}
                className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmResolveIncident}
                disabled={submittingResolution}
                className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold shadow-xs transition-colors"
              >
                {submittingResolution ? 'Gravando...' : 'Confirmar Resolução'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: REGISTRAR PAGAMENTO DE ROTA (M4.1 PARTE C)              */}
      {/* ============================================================== */}
      {payingRoute && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-neutral-200 my-8 space-y-4 text-xs">
            <div className="flex items-start justify-between border-b border-neutral-200 pb-3">
              <div>
                <h3 className="font-bold text-neutral-900 text-base flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                  <span>Registrar Pagamento da Rota #{payingRoute.route.id}</span>
                </h3>
                <p className="text-neutral-500 text-xs mt-0.5">
                  Confirmar repasse operacional de corrida concluída
                </p>
              </div>
              <button
                onClick={() => setPayingRoute(null)}
                className="text-neutral-400 hover:text-neutral-700 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Informações Financeiras e Pix */}
            <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2.5">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-neutral-700 block text-xs font-semibold">Valor a Transferir (Frete Motorista):</span>
                  <span className="text-[10px] text-neutral-500">Frete Total: R$ {payingRoute.route.total_fee} (descontado 10% da loja)</span>
                </div>
                <span className="font-mono text-lg font-black text-emerald-900 bg-emerald-100/90 px-2.5 py-1 rounded-lg border border-emerald-300">
                  R$ {calculateDriverFee(payingRoute.route).toFixed(2).replace('.', ',')}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-600">Motorista:</span>
                <span className="font-bold text-neutral-900">{payingRoute.driver?.name || `#${payingRoute.route.accepted_driver_id}`}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-600">Tipo da Chave:</span>
                <span className="font-bold uppercase text-neutral-900">{payingRoute.driver?.pix_key_type || 'PIX'}</span>
              </div>
              <div className="pt-2 border-t border-emerald-200/80 flex items-center justify-between gap-2">
                <div className="truncate">
                  <div className="text-[10px] text-neutral-500">Chave Pix:</div>
                  <div className="font-mono font-bold text-neutral-900 select-all">
                    {payingRoute.driver?.pix_key_value || payingRoute.driver?.pix_key || 'Não cadastrada'}
                  </div>
                </div>
                {(payingRoute.driver?.pix_key_value || payingRoute.driver?.pix_key) && (
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(
                        payingRoute.driver?.pix_key_value || payingRoute.driver?.pix_key || '',
                        'modal_pay_pix'
                      )
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-neutral-100 border border-neutral-300 text-neutral-800 font-bold text-xs flex items-center gap-1 shrink-0 shadow-xs"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedKey === 'modal_pay_pix' ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Repasse Automatizado via Mercado Pago */}
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-sky-900 text-xs">
                  <Zap className="w-4 h-4 text-sky-600" />
                  <span>Repasse Automático via Mercado Pago</span>
                </div>
                <span className="text-[10px] bg-sky-200 text-sky-800 font-black px-2 py-0.5 rounded-full uppercase">
                  Pix Direto
                </span>
              </div>
              <p className="text-[11px] text-sky-800/90 leading-tight">
                Transfere automaticamente <strong>R$ {calculateDriverFee(payingRoute.route).toFixed(2).replace('.', ',')}</strong> do saldo da sua conta Mercado Pago para a chave Pix do motorista.
              </p>

              {mpPayoutFeedback && (
                <div className={`p-2.5 rounded-lg text-[11px] leading-relaxed ${
                  mpPayoutFeedback.type === 'error'
                    ? 'bg-rose-100/90 text-rose-800 border border-rose-300'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                }`}>
                  {mpPayoutFeedback.message}
                </div>
              )}

              <button
                type="button"
                onClick={handlePayWithMercadoPago}
                disabled={submittingMpPayout || !(payingRoute.driver?.pix_key_value || payingRoute.driver?.pix_key)}
                className="w-full py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-black text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submittingMpPayout ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processando Pix no Mercado Pago...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    <span>⚡ Pagar via Pix Mercado Pago (R$ {calculateDriverFee(payingRoute.route).toFixed(2).replace('.', ',')})</span>
                  </>
                )}
              </button>
            </div>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-neutral-200"></div>
              <span className="flex-shrink mx-2 text-[10px] text-neutral-400 font-bold uppercase tracking-wider">ou registro manual com comprovante</span>
              <div className="flex-grow border-t border-neutral-200"></div>
            </div>

            {/* Código de Comprovante / Autenticação Bancária */}
            <div>
              <label className="block font-bold text-neutral-800 text-xs mb-1">
                Código de Autenticação / Comprovante Bancário:
              </label>
              <input
                type="text"
                placeholder="Ex: E0041696820260924143000..."
                value={paymentReferenceInput}
                onChange={(e) => setPaymentReferenceInput(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-mono focus:ring-1 focus:ring-emerald-600 focus:outline-none"
              />
              <span className="text-[10px] text-neutral-400 mt-1 block">
                Opcional, mas recomendado para conciliação bancária.
              </span>
            </div>

            {/* Observações */}
            <div>
              <label className="block font-bold text-neutral-800 text-xs mb-1">
                Observações do Pagamento (opcional):
              </label>
              <input
                type="text"
                placeholder="Ex: Pago via app Santander / Repasse de rotas da tarde"
                value={paymentNoteInput}
                onChange={(e) => setPaymentNoteInput(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs focus:ring-1 focus:ring-emerald-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setPayingRoute(null)}
                className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmPayRoute}
                disabled={submittingPayment}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs transition-colors"
              >
                {submittingPayment ? 'Registrando...' : 'Confirmar Pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: AUDITORIA DE VEÍCULOS DOS INDICADOS (M4.1 PARTE A)      */}
      {/* ============================================================== */}
      {showVehicleAuditModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-xl border border-neutral-200 my-8 space-y-4 text-xs">
            <div className="flex items-start justify-between border-b border-neutral-200 pb-3">
              <div>
                <h3 className="font-bold text-neutral-900 text-base flex items-center gap-2">
                  <Car className="w-5 h-5 text-amber-500" />
                  <span>Auditoria de Veículos dos Indicados (M4.1 Parte A)</span>
                </h3>
                <p className="text-neutral-500 text-xs mt-0.5">
                  Conferência de veículos atribuídos a motoristas provenientes de indicação
                </p>
              </div>
              <button
                onClick={() => setShowVehicleAuditModal(false)}
                className="text-neutral-400 hover:text-neutral-700 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 leading-relaxed">
              <strong>Contexto M4.1:</strong> Durante os testes do fluxo de indicação, foi identificado que novos motoristas poderiam ter recebido <code>CAR_SEDAN</code> por fallback/default sem escolha explícita. A indicação solicita apenas nome e telefone; a escolha do veículo pertence exclusivamente ao motorista no cadastro. Esta lista apresenta todos os motoristas cadastrados via indicação para conferência e correção explícita se necessário.
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="px-4 py-3">Motorista Indicado</th>
                    <th className="px-4 py-3">Indicado Por</th>
                    <th className="px-4 py-3">Veículo Atual</th>
                    <th className="px-4 py-3">Status de Auditoria</th>
                    <th className="px-4 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {loadingVehicleAudit ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-neutral-400" />
                        Carregando auditoria de veículos...
                      </td>
                    </tr>
                  ) : vehicleAuditList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                        Nenhum motorista concluído a partir de indicação ainda.
                      </td>
                    </tr>
                  ) : (
                    vehicleAuditList.map((item) => (
                      <tr key={item.referral_id} className="hover:bg-neutral-50/60">
                        <td className="px-4 py-3 font-semibold text-neutral-900">
                          <div>{item.driver_name}</div>
                          <div className="text-[11px] text-neutral-500 font-mono font-normal">
                            {item.driver_phone} • #{item.driver_id}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="font-semibold text-neutral-800">
                            {item.indicator_name || `Motorista #${item.referred_by_driver_id}`}
                          </div>
                          {item.indicator_vehicle_type && (
                            <div className="text-[11px] text-neutral-500 mt-0.5">
                              {renderDriverVehicleBadges(item.indicator_vehicle_type)}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {renderDriverVehicleBadges(item.vehicle_type)}
                        </td>

                        <td className="px-4 py-3">
                          {item.is_potentially_affected ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              <span>⚠️</span>
                              <span>CAR_SEDAN (Verificar se houve escolha explícita)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <span>✓</span>
                              <span>Veículo compatível</span>
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenCorrectVehicleModal(item)}
                            className="px-3 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs shadow-xs transition-colors"
                          >
                            Corrigir Veículo
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setShowVehicleAuditModal(false)}
                className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: CORRIGIR VEÍCULO DE MOTORISTA (M4.1 PARTE A)            */}
      {/* ============================================================== */}
      {correctingVehicleDriver && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl border border-neutral-200 space-y-4 text-xs">
            <div className="flex items-start justify-between border-b border-neutral-200 pb-2">
              <h3 className="font-bold text-neutral-900 text-sm">Corrigir Veículo do Motorista</h3>
              <button
                onClick={() => setCorrectingVehicleDriver(null)}
                className="text-neutral-400 hover:text-neutral-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div>
              <p className="text-neutral-600">
                Selecione o veículo real de <strong>{correctingVehicleDriver.driver_name}</strong>:
              </p>
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">
                Tipo de Veículo:
              </label>
              <select
                value={newVehicleTypeInput}
                onChange={(e) => setNewVehicleTypeInput(e.target.value as VehicleType)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs bg-white font-medium"
              >
                {VEHICLE_OPTIONS.map((opt) => (
                  <option key={opt.type} value={opt.type}>
                    {opt.icon} {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setCorrectingVehicleDriver(null)}
                className="px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveVehicleCorrection}
                disabled={savingVehicleCorrection}
                className="px-3.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold"
              >
                {savingVehicleCorrection ? 'Salvando...' : 'Salvar Alteração'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RECUSAR INDICAÇÃO (M1.2 Seção 14) */}
      {rejectModalOpen && rejectingReferralId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl border border-neutral-200 space-y-4 text-xs">
            <div className="flex items-start justify-between border-b border-neutral-200 pb-2">
              <h3 className="font-bold text-neutral-900 text-sm">Recusar Indicação</h3>
              <button
                onClick={() => setRejectModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 font-bold"
              >
                ✕
              </button>
            </div>
            <p className="text-neutral-600 leading-relaxed">
              Tem certeza que deseja recusar esta indicação? O indicado não receberá convite para cadastro.
            </p>
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">
                Motivo da recusa (opcional):
              </label>
              <input
                type="text"
                placeholder="Ex: Frota de veículos completa no momento"
                value={rejectionReasonInput}
                onChange={(e) => setRejectionReasonInput(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmRejectReferral}
                disabled={actionLoadingReferralId === rejectingReferralId}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold"
              >
                {actionLoadingReferralId === rejectingReferralId ? 'Recusando...' : 'Confirmar Recusa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: NOVA ROTA MULTI-ENTREGA (M2.1 Seção 23)                 */}
      {/* ============================================================== */}
      {showCreateRouteModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl border border-neutral-200 my-8">
            <div className="flex items-start justify-between pb-3 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-orange-600" />
                <h3 className="text-base font-bold text-neutral-950">
                  Criar Nova Rota Multi-Entrega
                </h3>
              </div>
              <button
                onClick={() => setShowCreateRouteModal(false)}
                className="text-neutral-400 hover:text-neutral-700 text-xl font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRouteDraft} className="pt-4 space-y-6">
              {/* Coleta (Seção 13, 14, 15) */}
              <div className="p-4 rounded-xl bg-neutral-50/70 border border-neutral-200 space-y-3">
                <label className="block text-xs font-bold text-neutral-900 uppercase tracking-wider">
                  📍 Local de Coleta / Retirada
                </label>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="pickup_type"
                      checked={newRoute.pickup_type === 'REGISTERED'}
                      onChange={() => setNewRoute({ ...newRoute, pickup_type: 'REGISTERED' })}
                      className="accent-orange-600"
                    />
                    <span>Local Cadastrado</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="pickup_type"
                      checked={newRoute.pickup_type === 'AD_HOC'}
                      onChange={() => setNewRoute({ ...newRoute, pickup_type: 'AD_HOC' })}
                      className="accent-orange-600"
                    />
                    <span>Local Avulso (Não recorrente)</span>
                  </label>
                </div>

                {newRoute.pickup_type === 'REGISTERED' ? (
                  <div className="space-y-2">
                    <select
                      value={newRoute.pickup_location_id}
                      onChange={(e) => setNewRoute({ ...newRoute, pickup_location_id: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white focus:ring-2 focus:ring-orange-500 font-semibold"
                    >
                      {pickupLocations.filter((l) => l.active).map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name} {loc.neighborhood?.trim() ? `[Bairro: ${loc.neighborhood}]` : '[⚠️ Bairro Pendente]'} — {loc.address}
                        </option>
                      ))}
                    </select>
                    {(() => {
                      const selected = pickupLocations.find((l) => l.id === newRoute.pickup_location_id);
                      if (selected && !selected.neighborhood?.trim()) {
                        return (
                          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 font-medium">
                            ⚠️ <strong>Atenção:</strong> Este ponto de coleta não possui bairro cadastrado. A publicação da rota no Telegram exigirá a complementação do bairro no cadastro do ponto.
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 mb-1">Nome do Local *</label>
                      <input
                        type="text"
                        placeholder="Ex: Evento Center"
                        value={newRoute.pickup_name}
                        onChange={(e) => setNewRoute({ ...newRoute, pickup_name: e.target.value })}
                        className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 mb-1">Bairro da Coleta *</label>
                      <input
                        type="text"
                        placeholder="Ex: Centro"
                        value={newRoute.pickup_neighborhood}
                        onChange={(e) => setNewRoute({ ...newRoute, pickup_neighborhood: e.target.value })}
                        className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white font-semibold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 mb-1">Endereço Completo *</label>
                      <input
                        type="text"
                        placeholder="Ex: Av. Rondon Pacheco, 500"
                        value={newRoute.pickup_address}
                        onChange={(e) => setNewRoute({ ...newRoute, pickup_address: e.target.value })}
                        className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
                        required
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Prazos, Valor e Veículos (Seção 7, 17, 18) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-800 mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-orange-600" />
                    <span>Duração Máxima Desejada / Prazo (Obrigatório)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 50 min ou 18:00"
                    value={newRoute.final_deadline}
                    onChange={(e) => setNewRoute({ ...newRoute, final_deadline: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:ring-2 focus:ring-orange-500 font-semibold"
                    required
                  />
                  <p className="text-[10px] text-neutral-500 mt-1">
                    Defina em minutos (ex: <strong>50 min</strong>) para calcular o prazo exato no aceite, ou um horário fixo.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-800 mb-1 flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Valor Total do Frete (R$)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 35,00"
                    value={newRoute.total_fee}
                    onChange={(e) => setNewRoute({ ...newRoute, total_fee: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:ring-2 focus:ring-orange-500 font-semibold"
                    required
                  />
                  <p className="text-[10px] text-neutral-500 mt-1 flex items-center justify-between">
                    <span>Frete cobrado do cliente/operação.</span>
                    {(() => {
                      const totalNum = parseFloat(newRoute.total_fee.replace(',', '.')) || 0;
                      const driverFee = Math.round(totalNum * 0.90 * 100) / 100;
                      return (
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-mono text-[11px]">
                          🛵 Repasse Motorista: R$ {driverFee.toFixed(2).replace('.', ',')}
                        </span>
                      );
                    })()}
                  </p>
                </div>
              </div>

              {/* Veículos Aceitos (Seção 18) */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-2">
                  <label className="block text-xs font-bold text-neutral-800">
                    🚗 Veículos Aceitáveis para esta Rota
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setNewRoute((prev) => ({ ...prev, modality: 'MOTO', accepted_vehicle_types: ['MOTO', 'MOTO_WITH_BAG'] }))}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors cursor-pointer ${
                        newRoute.modality === 'MOTO'
                          ? 'border-orange-600 bg-orange-600 text-white shadow-2xs'
                          : 'border-neutral-200 bg-white hover:bg-neutral-100 text-neutral-700'
                      }`}
                    >
                      🏍️ Moto (Raio Geodésico)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewRoute((prev) => ({ ...prev, modality: 'CAR', accepted_vehicle_types: ['CAR'] }))}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors cursor-pointer ${
                        newRoute.modality === 'CAR'
                          ? 'border-orange-600 bg-orange-600 text-white shadow-2xs'
                          : 'border-neutral-200 bg-white hover:bg-neutral-100 text-neutral-700'
                      }`}
                    >
                      🚗 Carro (70 Bairros)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewRoute((prev) => ({ ...prev, accepted_vehicle_types: ['CAR', 'MOTO', 'MOTO_WITH_BAG'] }))}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors ${
                        newRoute.accepted_vehicle_types.includes('CAR') && newRoute.accepted_vehicle_types.includes('MOTO')
                          ? 'border-orange-600 bg-orange-600 text-white shadow-2xs'
                          : 'border-neutral-200 bg-white hover:bg-neutral-100 text-neutral-700'
                      }`}
                    >
                      🌐 Todos
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {VEHICLE_OPTIONS.map((opt) => {
                    const checked = newRoute.accepted_vehicle_types.includes(opt.type);
                    return (
                      <label
                        key={opt.type}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                          checked
                            ? 'border-orange-500 bg-orange-50/70 text-neutral-900 font-bold shadow-2xs ring-1 ring-orange-500/20'
                            : 'border-neutral-200 bg-white text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleVehicleType(opt.type)}
                          className="accent-orange-600 rounded"
                        />
                        <span className="text-base">{opt.icon}</span>
                        <span className="truncate">{opt.label}</span>
                      </label>
                    );
                  })}
                </div>

                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-neutral-500">
                    Motoristas ativos compatíveis:{' '}
                    <strong className="text-neutral-800">
                      {drivers.filter((d) => d.status === 'ACTIVE' && isDriverCompatibleWithRoute(d.vehicle_type, newRoute.accepted_vehicle_types)).length}
                    </strong>
                    {' '}({drivers.filter((d) => d.status === 'ACTIVE' && isDriverCompatibleWithRoute(d.vehicle_type, newRoute.accepted_vehicle_types)).map(d => `${d.name} [${getVehicleTypeLabel(d.vehicle_type)}]`).join(', ') || 'Nenhum motorista ativo para este veículo'})
                  </span>
                </div>
              </div>

              {/* Paradas de Entrega (Seção 6, 8, 10) */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-orange-600" />
                    <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                      Paradas da Rota ({newRoute.stops.length})
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddStop}
                    className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Adicionar Parada</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {newRoute.stops.map((stop, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/40 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-orange-600 text-white flex items-center justify-center text-[10px]">
                            {idx + 1}
                          </span>
                          <span>Parada #{idx + 1}</span>
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoveStop(idx, 'UP')}
                            disabled={idx === 0}
                            title="Subir ordem"
                            className="p-1 rounded hover:bg-neutral-200 disabled:opacity-30 text-neutral-700"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveStop(idx, 'DOWN')}
                            disabled={idx === newRoute.stops.length - 1}
                            title="Descer ordem"
                            className="p-1 rounded hover:bg-neutral-200 disabled:opacity-30 text-neutral-700"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                          {newRoute.stops.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveStop(idx)}
                              title="Remover parada"
                              className="p-1 rounded hover:bg-rose-100 text-rose-600 ml-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <AddressAutocompleteInput
                            value={stop.destination_address}
                            onChange={(val) => handleUpdateStopField(idx, 'destination_address', val)}
                            onSelectSuggestion={(s: GeocodedAddressSuggestion) => {
                              setNewRoute((prev) => {
                                const stops = [...prev.stops];
                                stops[idx] = {
                                  ...stops[idx],
                                  destination_address: s.formattedAddress,
                                  destination_neighborhood: s.neighborhood,
                                  dropoff_coords: s.coords,
                                };
                                return { ...prev, stops };
                              });
                            }}
                            placeholder="Endereço (digite para autocompletar...)"
                            isConfirmed={Boolean(stop.dropoff_coords)}
                            required
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            list="uberlandia-bairros-list"
                            placeholder="Bairro (ex: Centro, Tibery)"
                            value={stop.destination_neighborhood}
                            onChange={(e) => {
                              const newN = e.target.value;
                              const found = getAllMappedNeighborhoods().find((n) => n.name.toLowerCase() === newN.toLowerCase());
                              setNewRoute((prev) => {
                                const stops = [...prev.stops];
                                stops[idx] = {
                                  ...stops[idx],
                                  destination_neighborhood: newN,
                                  dropoff_coords: found ? found.coords : stops[idx].dropoff_coords,
                                };
                                return { ...prev, stops };
                              });
                            }}
                            className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div className="sm:col-span-1">
                          <input
                            type="text"
                            placeholder="Carga (ex: 2x Bolos, Doces)"
                            value={stop.cargo_description}
                            onChange={(e) => handleUpdateStopField(idx, 'cargo_description', e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
                            required
                          />
                        </div>
                        <div className="sm:col-span-1">
                          <select
                            value={stop.delivery_mode}
                            onChange={(e) => handleUpdateStopField(idx, 'delivery_mode', e.target.value)}
                            className="w-full px-2.5 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
                          >
                            <option value="IN_PERSON">Presencial</option>
                            <option value="NO_CONTACT">Sem Contato</option>
                          </select>
                        </div>
                        <div className="sm:col-span-1">
                          <input
                            type="text"
                            placeholder="Prazo desejável (opcional)"
                            value={stop.desired_deadline}
                            onChange={(e) => handleUpdateStopField(idx, 'desired_deadline', e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
                          />
                        </div>
                      </div>

                      <div>
                        <input
                          type="text"
                          placeholder="Observações operacionais (opcional)"
                          value={stop.observations}
                          onChange={(e) => handleUpdateStopField(idx, 'observations', e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
                        />
                      </div>

                      {/* Seção 7: Condomínio Horizontal (+20% na tarifa base) - Exclusivo para CARRO */}
                      {newRoute.modality === 'CAR' ? (
                        <div className="pt-2 border-t border-neutral-200/70 flex items-center justify-between">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={stop.is_horizontal_condo}
                              onChange={(e) => handleUpdateStopField(idx, 'is_horizontal_condo', e.target.checked)}
                              className="w-4 h-4 accent-orange-600 rounded"
                            />
                            <span className="font-bold text-neutral-800 text-[11px] flex items-center gap-1.5">
                              <span>🏡 Condomínio Horizontal</span>
                              <span className="text-[10px] text-orange-600 font-extrabold bg-orange-100 px-1.5 py-0.5 rounded-full">
                                +20% na tarifa base (Carro)
                              </span>
                            </span>
                          </label>
                          <span className="text-[10px] text-neutral-400 font-semibold">
                            {stop.is_horizontal_condo ? 'Acréscimo de 20% Ativo' : 'Tarifa Normal'}
                          </span>
                        </div>
                      ) : (
                        <div className="pt-2 border-t border-neutral-200/50 flex items-center justify-between text-[11px] text-neutral-400">
                          <span className="flex items-center gap-1.5 text-[11px]">
                            <span>🏍️ Moto: Sem adicional de condomínio</span>
                          </span>
                          <span className="text-[10px] text-neutral-400 font-mono">Tarifa por raio</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Datalist com os Bairros Mapeados de Uberlândia */}
                <datalist id="uberlandia-bairros-list">
                  {getAllMappedNeighborhoods().map((n) => (
                    <option key={n.name} value={n.name} />
                  ))}
                </datalist>

                {/* Painel Dinâmico de Precificação em Tempo Real */}
                {(() => {
                  const originInfo = (() => {
                    if (newRoute.pickup_type === 'REGISTERED') {
                      const loc = pickupLocations.find((l) => l.id === newRoute.pickup_location_id);
                      if (loc?.name.toLowerCase().includes('vinhedos')) return PICKUP_PRESETS.VINHEDOS;
                      return {
                        name: loc?.name || 'Kantine Matriz',
                        address: loc?.address || PICKUP_PRESETS.MATRIZ.address,
                        neighborhood: loc?.neighborhood || PICKUP_PRESETS.MATRIZ.neighborhood,
                        coords: loc?.name.toLowerCase().includes('vinhedos')
                          ? PICKUP_PRESETS.VINHEDOS.coords
                          : PICKUP_PRESETS.MATRIZ.coords,
                      };
                    }
                    return {
                      name: newRoute.pickup_name || 'Coleta Alternativa',
                      address: newRoute.pickup_address || 'Uberlândia - MG',
                      neighborhood: newRoute.pickup_neighborhood || '',
                      coords: PICKUP_PRESETS.MATRIZ.coords,
                    };
                  })();

                  const pricing = calculateRoutePricing(
                    newRoute.modality,
                    originInfo,
                    newRoute.stops.map((s, idx) => ({
                      sequence: idx + 1,
                      destination_address: s.destination_address,
                      destination_neighborhood: s.destination_neighborhood,
                      is_horizontal_condo: s.is_horizontal_condo,
                      dropoff_coords: s.dropoff_coords,
                    }))
                  );

                  const whatsAppProposal = generateWhatsAppProposalMessage({
                    modality: newRoute.modality,
                    originNameOrAddress: originInfo.name + ' (' + originInfo.address + ')',
                    stops: newRoute.stops,
                    driverFee: pricing.driver_remuneration,
                    googleMapsUrl: pricing.google_maps_url,
                    observations: 'Entrega Kantine Gastronomia',
                  });

                  return (
                    <div className="p-4 rounded-2xl bg-neutral-900 text-white space-y-3 shadow-md border border-neutral-800">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800 pb-2">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-emerald-400" />
                          <h5 className="text-xs font-black uppercase tracking-wider text-orange-400">
                            Cálculo Automático do Motor de Fretes
                          </h5>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300">
                            {pricing.is_grouped ? '⚡ 70% Fator Agrupamento (2+ paradas)' : '⚡ 100% Tarifa Individual'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setNewRoute((prev) => ({
                                ...prev,
                                total_fee: pricing.route_operational_total.toFixed(2).replace('.', ','),
                              }));
                            }}
                            className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 text-white transition-colors cursor-pointer"
                            title="Atualizar o campo de frete total com o valor calculado pelo motor"
                          >
                            Aplicar R$ {pricing.route_operational_total.toFixed(2).replace('.', ',')}
                          </button>
                        </div>
                      </div>

                      {/* Valores: Total, Entregador e Kantine */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                        <div className="bg-neutral-800/80 p-2.5 rounded-xl border border-neutral-700/80">
                          <span className="text-[10px] text-neutral-400 block font-semibold">Total Operacional da Rota</span>
                          <span className="text-base font-black text-orange-400 font-mono">
                            R$ {pricing.route_operational_total.toFixed(2)}
                          </span>
                        </div>

                        <div className="bg-neutral-800/80 p-2.5 rounded-xl border border-neutral-700/80">
                          <span className="text-[10px] text-neutral-400 block font-semibold">🛵 Entregador (90%)</span>
                          <span className="text-base font-black text-emerald-400 font-mono">
                            R$ {pricing.driver_remuneration.toFixed(2)}
                          </span>
                        </div>

                        <div className="bg-neutral-800/80 p-2.5 rounded-xl border border-neutral-700/80">
                          <span className="text-[10px] text-neutral-400 block font-semibold">🏢 Gestão Kantine (10%)</span>
                          <span className="text-base font-black text-amber-400 font-mono">
                            R$ {pricing.kantine_administration.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Ações Rápidas: WhatsApp e Maps */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-neutral-800 text-xs">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(whatsAppProposal, 'create_route_whatsapp')}
                            className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Copy className="w-3 h-3 text-orange-400" />
                            <span>{copiedKey === 'create_route_whatsapp' ? 'Proposta Copiada!' : 'Copiar Proposta WhatsApp'}</span>
                          </button>

                          <a
                            href={`https://wa.me/?text=${encodeURIComponent(whatsAppProposal)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Send className="w-3 h-3" />
                            <span>Enviar WhatsApp</span>
                          </a>
                        </div>

                        {pricing.google_maps_url && (
                          <a
                            href={pricing.google_maps_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Ver Rota no Google Maps</span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="pt-3 border-t border-neutral-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateRouteModal(false)}
                  className="px-4 py-2 font-semibold text-xs rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingRouteDraft}
                  className="px-5 py-2 font-bold text-xs rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{submittingRouteDraft ? 'Salvando...' : 'Salvar Rascunho da Rota'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: RESUMO ANTES DA PUBLICAÇÃO (M2.1 Seção 25)              */}
      {/* ============================================================== */}
      {routeToPublish && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-neutral-200 space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-orange-600" />
                <h3 className="text-base font-bold text-neutral-950">
                  Resumo Antes da Publicação
                </h3>
              </div>
              <button
                onClick={() => setRouteToPublish(null)}
                className="text-neutral-400 hover:text-neutral-700 text-xl font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="p-4 rounded-xl bg-orange-50/60 border border-orange-200 space-y-3 text-xs">
              <div className="flex justify-between items-center border-b border-orange-200/60 pb-2 flex-wrap gap-2">
                <span className="font-bold text-sm text-neutral-950 font-mono">
                  ROTA #{routeToPublish.id}
                </span>
                <div className="flex items-center gap-2.5">
                  <span className="font-semibold text-xs text-neutral-600">
                    Frete Total: <strong className="text-neutral-900">R$ {routeToPublish.total_fee}</strong>
                  </span>
                  <span className="font-bold text-xs text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded border border-emerald-300 inline-flex items-center gap-1">
                    <span>🛵</span>
                    <span>Frete Motorista: R$ {calculateDriverFee(routeToPublish).toFixed(2).replace('.', ',')}</span>
                  </span>
                </div>
              </div>

              <div>
                <span className="font-bold text-neutral-700 block">📍 Local de Coleta:</span>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <span className="text-neutral-900 font-semibold">{routeToPublish.pickup_name}</span>
                  {routeToPublish.pickup_neighborhood_snapshot ? (
                    <span className="text-[11px] font-bold text-orange-700 bg-orange-100/80 px-2 py-0.5 rounded border border-orange-200">
                      Bairro: {routeToPublish.pickup_neighborhood_snapshot}
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                      ⚠️ Bairro ausente (Bloqueia publicação)
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-neutral-500 block mt-0.5">{routeToPublish.pickup_address}</span>
                {!routeToPublish.pickup_neighborhood_snapshot && (
                  <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2 mt-1.5 font-medium">
                    ⚠️ Esta rota não possui o bairro de retirada configurado. Complete o cadastro do ponto ou informe o bairro antes de publicar no Telegram.
                  </p>
                )}
              </div>

              <div>
                <span className="font-bold text-neutral-700 block">
                  📦 {routeToPublish.stops?.length || 1} ENTREGA(S) NA SEQUÊNCIA:
                </span>
                <div className="space-y-1.5 mt-1">
                  {routeToPublish.stops?.map((s, idx) => {
                    const customerInfo = extractCustomerData(s);
                    return (
                    <div key={s.id || idx} className="flex items-start gap-2 bg-white p-2 rounded border border-neutral-200/80">
                      <span className="font-bold text-orange-600">{idx + 1} —</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-bold text-neutral-900">{s.destination_neighborhood}</span>
                          {(customerInfo.name || customerInfo.phone) && (
                            <span className="text-[10px] text-neutral-600 flex items-center gap-1.5 font-medium bg-neutral-100 px-1.5 py-0.5 rounded">
                              {customerInfo.name && (
                                <span className="font-bold text-neutral-800 flex items-center gap-0.5">
                                  <UserCheck className="w-2.5 h-2.5 text-orange-600" />
                                  <span>{customerInfo.name}</span>
                                </span>
                              )}
                              {customerInfo.phone && (
                                <span className="text-emerald-700 flex items-center gap-0.5 font-semibold">
                                  <Phone className="w-2.5 h-2.5 text-emerald-600" />
                                  <span>{customerInfo.phone}</span>
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        <span className="text-neutral-500 text-[11px] block">{s.cargo_description}</span>
                        {s.desired_deadline && (
                          <span className="text-amber-700 font-semibold text-[10px] block">
                            ⏱️ Desejável: {s.desired_deadline}
                          </span>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-1 border-t border-orange-200/60 flex justify-between items-center text-xs">
                <div>
                  <span className="font-bold text-neutral-700 block">🏁 Prazo Final da Rota:</span>
                  <span className="font-mono font-bold text-neutral-900">{routeToPublish.final_deadline}</span>
                </div>
              </div>

              <div>
                <span className="font-bold text-neutral-700 block mb-1">🚗 Veículos Aceitos:</span>
                <div className="flex flex-wrap gap-1">
                  {routeToPublish.accepted_vehicle_types.map((v) => (
                    <span key={v} className="px-2 py-0.5 rounded bg-white border border-neutral-200 text-[10px] font-semibold text-neutral-800">
                      {VEHICLE_DISPLAY[v]?.icon} {VEHICLE_DISPLAY[v]?.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Ao confirmar, a oferta será disparada exclusivamente para motoristas ativos que possuem veículos compatíveis. Endereços residenciais completos permanecem ocultos até o aceite.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setRouteToPublish(null)}
                className="px-4 py-2 font-semibold text-xs rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 transition-colors"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmPublishRoute}
                disabled={publishingId === routeToPublish.id}
                className="px-5 py-2 font-bold text-xs rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-md shadow-orange-600/20 transition-all flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{publishingId === routeToPublish.id ? 'Publicando...' : 'PUBLICAR ROTA'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: DETALHES DA ROTA & EXECUÇÃO OPERACIONAL (M4 / M2.1 / M3) */}
      {/* ============================================================== */}
      {selectedRouteDetails && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6">
          <div className="bg-white rounded-2xl max-w-4xl w-full h-[92vh] max-h-[92vh] flex flex-col shadow-2xl border border-neutral-200 overflow-hidden">
            {/* Header Fixo no Topo: 100% visível, nunca corta */}
            <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/95 shrink-0 z-20">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-orange-100 border border-orange-200 text-orange-600 flex items-center justify-center shrink-0 shadow-2xs">
                  <Layers className="w-5 h-5 text-orange-600" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-neutral-950">
                      Rota #{selectedRouteDetails.route.id}
                    </h3>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      selectedRouteDetails.route.status === 'COMPLETED'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : selectedRouteDetails.route.status === 'IN_TRANSIT'
                        ? 'bg-blue-100 text-blue-800 border border-blue-200'
                        : selectedRouteDetails.route.status === 'PICKED_UP'
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : selectedRouteDetails.route.status === 'ARRIVED_PICKUP'
                        ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                        : selectedRouteDetails.route.status === 'ACCEPTED'
                        ? 'bg-purple-100 text-purple-800 border border-purple-200'
                        : 'bg-neutral-100 text-neutral-800 border border-neutral-200'
                    }`}>
                      {selectedRouteDetails.route.status}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 truncate">
                    {selectedRouteDetails.route.accepted_driver_id ? (
                      <span>
                        Motorista Alocado:{' '}
                        <strong>
                          {selectedRouteDetails.driver?.name ||
                            selectedRouteDetails.route.accepted_driver?.name ||
                            drivers.find((d) => d.id === selectedRouteDetails.route.accepted_driver_id)?.name ||
                            `#${selectedRouteDetails.route.accepted_driver_id}`}
                        </strong>
                        {' '}(
                        {selectedRouteDetails.driver?.vehicle_type === 'CAR' ||
                        selectedRouteDetails.route.accepted_driver?.vehicle_type === 'CAR' ||
                        drivers.find((d) => d.id === selectedRouteDetails.route.accepted_driver_id)?.vehicle_type === 'CAR'
                          ? '🚗 Carro'
                          : '🏍️ Moto'}
                        )
                      </span>
                    ) : (
                      'Nenhum motorista alocado no momento'
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {(() => {
                  let isRejected = false;
                  if (selectedRouteDetails.route.pending_material_change) {
                    try {
                      const parsed =
                        typeof selectedRouteDetails.route.pending_material_change === 'string'
                          ? JSON.parse(selectedRouteDetails.route.pending_material_change)
                          : selectedRouteDetails.route.pending_material_change;
                      if (parsed?.status === 'REJECTED') isRejected = true;
                    } catch {}
                  }

                  if (isRejected) {
                    return (
                      <button
                        onClick={() => setEditingRouteId(selectedRouteDetails.route.id)}
                        className="px-3 py-1.5 rounded-lg border-2 border-amber-500 bg-amber-50 hover:bg-amber-100 text-amber-950 text-xs font-black transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer animate-pulse ring-2 ring-amber-300"
                        title="Motorista recusou a proposta anterior. Clique para reajustar o frete/paradas e reenviar."
                      >
                        <Pencil className="w-3.5 h-3.5 text-amber-700" />
                        <span>Reajustar Proposta</span>
                      </button>
                    );
                  }

                  if (['DRAFT', 'OFFERED', 'ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT'].includes(selectedRouteDetails.route.status)) {
                    return (
                      <button
                        onClick={() => setEditingRouteId(selectedRouteDetails.route.id)}
                        className="px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        title="Editar rota (M4.4)"
                      >
                        <Pencil className="w-3.5 h-3.5 text-amber-700" />
                        <span>Editar Rota</span>
                      </button>
                    );
                  }

                  return (
                    <span
                      className="px-2.5 py-1 rounded-md text-[10px] font-medium bg-neutral-100 text-neutral-500 border border-neutral-200"
                      title={
                        selectedRouteDetails.route.status === 'COMPLETED'
                          ? 'Rotas concluídas não podem ser alteradas (M4.4 Seção 21)'
                          : 'Rotas canceladas não podem ser alteradas (M4.4 Seção 22)'
                      }
                    >
                      Edição bloqueada ({selectedRouteDetails.route.status})
                    </span>
                  );
                })()}
                <button
                  onClick={() => setSelectedRouteDetails(null)}
                  className="w-8 h-8 rounded-lg bg-neutral-200/80 hover:bg-neutral-300 text-neutral-600 hover:text-neutral-900 flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
                  title="Fechar (Esc)"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Corpo Rolável com Scrollbar Interna Própria */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
              {/* Card Destaque: Proposta de Alteração Recusada pelo Motorista (Pronta para Reajuste) */}
              {(() => {
                let rejectedChange: any = null;
                if (selectedRouteDetails.route.pending_material_change) {
                  try {
                    const parsed =
                      typeof selectedRouteDetails.route.pending_material_change === 'string'
                        ? JSON.parse(selectedRouteDetails.route.pending_material_change)
                        : selectedRouteDetails.route.pending_material_change;
                    if (parsed?.status === 'REJECTED') {
                      rejectedChange = parsed;
                    }
                  } catch {}
                }
                if (!rejectedChange) return null;

                return (
                  <div className="p-4.5 rounded-2xl bg-amber-50 border-2 border-amber-400 text-amber-950 shadow-sm space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-200 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
                          <AlertTriangle className="w-5 h-5 text-amber-700" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-extrabold text-sm text-amber-950">
                              PROPOSTA DE ALTERAÇÃO RECUSADA PELO MOTORISTA
                            </h4>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300">
                              Pronta para Reajuste
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-amber-800 leading-relaxed">
                            O motorista não aceitou a proposta anterior. As alterações feitas (novas paradas, novos endereços e frete proposto) <strong>foram mantidas intactas</strong> no sistema.
                            Como o motorista já está com os pedidos coletados em trânsito, você pode <strong>reajustar o valor do frete</strong> ou as condições e enviar uma nova proposta para o motorista aceitar.
                          </p>
                          {rejectedChange.diff_summary && (
                            <div className="mt-2 p-2 rounded-lg bg-white/80 border border-amber-200 text-[11px] font-mono text-amber-900 whitespace-pre-line">
                              {rejectedChange.diff_summary}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex sm:flex-col items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditingRouteId(selectedRouteDetails.route.id)}
                          className="w-full px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer animate-pulse ring-2 ring-amber-400"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Ajustar Proposta e Reenviar</span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (confirm('Deseja descartar as alterações da proposta recusada e manter a rota original?')) {
                              try {
                                const headers = await getAuthHeaders();
                                await fetch(`/api/admin/routes/${selectedRouteDetails.route.id}/discard-rejected-proposal`, {
                                  method: 'POST',
                                  headers,
                                });
                                await fetchRoutes();
                                await openRouteDetails(selectedRouteDetails.route.id);
                                setSuccessMessage('Proposta recusada descartada com sucesso.');
                              } catch (e: any) {
                                setErrorMessage(e.message);
                              }
                            }
                          }}
                          className="w-full px-3 py-1.5 rounded-xl border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-600 font-semibold text-[11px] transition-colors cursor-pointer"
                        >
                          Descartar Alteração
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Card Destaque: Dados Completos do Motorista Alocado (M4) */}
              {(() => {
                const allocatedDriver =
                  selectedRouteDetails.driver ||
                  selectedRouteDetails.route.accepted_driver ||
                  drivers.find((d) => d.id === selectedRouteDetails.route.accepted_driver_id);

                const isCar = allocatedDriver?.vehicle_type === 'CAR';

                if (!allocatedDriver && !selectedRouteDetails.route.accepted_driver_id) {
                  return (
                    <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-neutral-200 text-neutral-600 flex items-center justify-center font-bold text-xs">
                          ?
                        </div>
                        <div>
                          <span className="font-bold text-neutral-900 block">
                            Nenhum motorista alocado ainda
                          </span>
                          <span className="text-[11px] text-neutral-500">
                            {selectedRouteDetails.route.status === 'DRAFT'
                              ? 'Rota em rascunho. Publique para liberar aos motoristas no Telegram.'
                              : selectedRouteDetails.route.status === 'OFFERED'
                              ? 'Oferta aberta no Telegram aguardando o primeiro motorista aceitar.'
                              : 'Nenhum motorista parceiro vinculado.'}
                          </span>
                        </div>
                      </div>
                      {selectedRouteDetails.route.status === 'OFFERED' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                          AGUARDANDO ACEITE
                        </span>
                      )}
                    </div>
                  );
                }

                return (
                  <div className="p-4 rounded-2xl bg-neutral-900 text-white shadow-md border border-neutral-800 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
                        {allocatedDriver?.name ? allocatedDriver.name.charAt(0).toUpperCase() : 'M'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-sm text-white">
                            {allocatedDriver?.name || `Motorista #${selectedRouteDetails.route.accepted_driver_id}`}
                          </h4>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            selectedRouteDetails.route.status === 'ARRIVED_PICKUP'
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                              : selectedRouteDetails.route.status === 'ACCEPTED'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                              : selectedRouteDetails.route.status === 'PICKED_UP'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : selectedRouteDetails.route.status === 'IN_TRANSIT'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          }`}>
                            {selectedRouteDetails.route.status === 'ARRIVED_PICKUP'
                              ? '📍 NA COLETA'
                              : selectedRouteDetails.route.status === 'ACCEPTED'
                              ? '✅ CORRIDA ACEITA'
                              : selectedRouteDetails.route.status === 'PICKED_UP'
                              ? '📦 PEDIDOS COLETADOS'
                              : selectedRouteDetails.route.status === 'IN_TRANSIT'
                              ? `${isCar ? '🚗' : '🛵'} EM DESLOCAMENTO`
                              : 'MOTORISTA CONFIRMADO'}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400 mt-0.5">
                          Cadastro Ativo no Telegram • Aceitou a corrida às{' '}
                          {selectedRouteDetails.route.accepted_at
                            ? new Date(selectedRouteDetails.route.accepted_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                            : '—'}
                        </p>
                      </div>
                    </div>

                    {allocatedDriver?.phone && (
                      <div className="flex items-center gap-2">
                        <a
                          href={`https://wa.me/55${allocatedDriver.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                            `Olá ${allocatedDriver.name}! Informações sobre a Rota #${selectedRouteDetails.route.id} da Kantine Delivery.`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors shrink-0"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </a>
                        <a
                          href={`tel:${allocatedDriver.phone.replace(/\D/g, '')}`}
                          className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs border border-neutral-700 transition-colors"
                        >
                          Ligar
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                    <div>
                      <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">Telefone</span>
                      <span className="font-semibold text-neutral-100">{allocatedDriver?.phone || 'Não informado'}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">Veículo do Motorista</span>
                      <span className="font-semibold text-neutral-100 flex items-center gap-1">
                        {isCar ? '🚗 Carro' : allocatedDriver?.vehicle_type === 'MOTO_WITH_BAG' ? '🎒 Moto com Bag' : '🏍️ Moto'}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">Chave PIX Repasse</span>
                      <span className="font-mono text-neutral-100 truncate block" title={allocatedDriver?.pix_key || allocatedDriver?.pix_key_value || ''}>
                        {allocatedDriver?.pix_key || allocatedDriver?.pix_key_value || 'Pendente'}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">Telegram ID</span>
                      <span className="font-mono text-neutral-300">
                        {allocatedDriver?.telegram_user_id || allocatedDriver?.telegram_chat_id ? `#${allocatedDriver.telegram_user_id || allocatedDriver.telegram_chat_id}` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Stepper / Timeline Operacional (M4 Seção 26) */}
            <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200/80">
              <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
                Linha do Tempo da Operação (M4)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className={`p-2 rounded-lg border ${
                  selectedRouteDetails.route.arrived_pickup_at
                    ? 'bg-white border-emerald-200'
                    : 'bg-neutral-100/50 border-neutral-200 text-neutral-400'
                }`}>
                  <span className="block font-semibold">1. Chegada Coleta</span>
                  <span className="text-[11px] font-mono">
                    {selectedRouteDetails.route.arrived_pickup_at
                      ? `✓ ${new Date(selectedRouteDetails.route.arrived_pickup_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                      : 'Pendente'}
                  </span>
                </div>

                <div className={`p-2 rounded-lg border ${
                  selectedRouteDetails.route.picked_up_at
                    ? 'bg-white border-emerald-200'
                    : 'bg-neutral-100/50 border-neutral-200 text-neutral-400'
                }`}>
                  <span className="block font-semibold">2. Pedidos Coletados</span>
                  <span className="text-[11px] font-mono">
                    {selectedRouteDetails.route.picked_up_at
                      ? `✓ ${new Date(selectedRouteDetails.route.picked_up_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                      : 'Pendente'}
                  </span>
                </div>

                <div className={`p-2 rounded-lg border ${
                  selectedRouteDetails.route.started_at
                    ? 'bg-white border-emerald-200'
                    : 'bg-neutral-100/50 border-neutral-200 text-neutral-400'
                }`}>
                  <span className="block font-semibold">3. Início Deslocamento</span>
                  <span className="text-[11px] font-mono">
                    {selectedRouteDetails.route.started_at
                      ? `✓ ${new Date(selectedRouteDetails.route.started_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                      : 'Pendente'}
                  </span>
                </div>

                <div className={`p-2 rounded-lg border ${
                  selectedRouteDetails.route.completed_at
                    ? 'bg-white border-emerald-200'
                    : 'bg-neutral-100/50 border-neutral-200 text-neutral-400'
                }`}>
                  <span className="block font-semibold">4. Rota Concluída</span>
                  <span className="text-[11px] font-mono">
                    {selectedRouteDetails.route.completed_at
                      ? `✓ ${new Date(selectedRouteDetails.route.completed_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                      : 'Em andamento'}
                  </span>
                </div>
              </div>
            </div>

            {/* General Info */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-neutral-50 text-xs">
              <div>
                <span className="text-neutral-500 block">Local de Coleta</span>
                <span className="font-bold text-neutral-900 block">{selectedRouteDetails.route.pickup_name}</span>
                {selectedRouteDetails.route.pickup_neighborhood_snapshot && (
                  <span className="text-[11px] font-semibold text-orange-700 block">
                    Bairro: {selectedRouteDetails.route.pickup_neighborhood_snapshot}
                  </span>
                )}
                <span className="text-[11px] text-neutral-500 truncate block">{selectedRouteDetails.route.pickup_address}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Prazo Final da Rota</span>
                <span className="font-bold text-neutral-900 block font-mono">{selectedRouteDetails.route.final_deadline}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Frete Total da Rota</span>
                <span className="font-bold text-neutral-900 text-sm block font-mono">R$ {selectedRouteDetails.route.total_fee}</span>
                <span className="text-[10px] text-amber-700 font-semibold block mt-0.5">
                  🏢 Retenção Loja (10%): R$ {((parseFloat(String(selectedRouteDetails.route.total_fee).replace(',', '.')) || 0) * 0.10).toFixed(2).replace('.', ',')}
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block">Frete Motorista</span>
                {(() => {
                  const driverFee = calculateDriverFee(selectedRouteDetails.route);
                  return (
                    <div>
                      <span className="font-bold text-emerald-800 text-sm font-mono inline-flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <span>🛵</span>
                        <span>R$ {driverFee.toFixed(2).replace('.', ',')}</span>
                      </span>
                      <span className="text-[10px] text-emerald-700 font-semibold block mt-0.5">
                        Valor líquido a receber
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Ações: WhatsApp Proposta & Google Maps */}
            {(() => {
              const fee = parseFloat(String(selectedRouteDetails.route.total_fee).replace(',', '.')) || 0;
              const driverFee = Math.round(fee * 0.90 * 100) / 100;
              const modality = (selectedRouteDetails.route.accepted_vehicle_types?.length === 1 && selectedRouteDetails.route.accepted_vehicle_types[0] === 'CAR') ? 'CAR' : 'MOTO';
              const whatsAppText = generateWhatsAppProposalMessage({
                modality,
                originNameOrAddress: selectedRouteDetails.route.pickup_name + ' (' + selectedRouteDetails.route.pickup_address + ')',
                stops: selectedRouteDetails.route.stops || [],
                driverFee,
                googleMapsUrl: (selectedRouteDetails.route.stops && selectedRouteDetails.route.stops.length > 0)
                  ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(selectedRouteDetails.route.pickup_address)}&travelmode=driving${
                      selectedRouteDetails.route.stops.length === 1
                        ? `&destination=${encodeURIComponent(selectedRouteDetails.route.stops[0].destination_address)}`
                        : `&waypoints=${encodeURIComponent(selectedRouteDetails.route.stops.slice(0, -1).map(s => s.destination_address).join('|'))}&destination=${encodeURIComponent(selectedRouteDetails.route.stops[selectedRouteDetails.route.stops.length - 1].destination_address)}`
                    }`
                  : null,
                observations: 'Entrega Kantine Gastronomia',
              });

              return (
                <div className="p-3 rounded-xl bg-orange-50/70 border border-orange-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-orange-950 flex items-center gap-1">
                      <Send className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Proposta para WhatsApp:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(whatsAppText, `wa_detail_${selectedRouteDetails.route.id}`)}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-orange-100 border border-orange-200 text-orange-800 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Copy className="w-3 h-3 text-orange-600" />
                      <span>{copiedKey === `wa_detail_${selectedRouteDetails.route.id}` ? 'Copiado!' : 'Copiar Texto Proposta'}</span>
                    </button>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(whatsAppText)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                    >
                      <Send className="w-3 h-3" />
                      <span>Enviar no WhatsApp</span>
                    </a>
                  </div>

                  {selectedRouteDetails.route.stops && selectedRouteDetails.route.stops.length > 0 && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(selectedRouteDetails.route.pickup_address)}&travelmode=driving${
                        selectedRouteDetails.route.stops.length === 1
                          ? `&destination=${encodeURIComponent(selectedRouteDetails.route.stops[0].destination_address)}`
                          : `&waypoints=${encodeURIComponent(selectedRouteDetails.route.stops.slice(0, -1).map(s => s.destination_address).join('|'))}&destination=${encodeURIComponent(selectedRouteDetails.route.stops[selectedRouteDetails.route.stops.length - 1].destination_address)}`
                      }`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3 text-blue-600" />
                      <span>Abrir Rota Completa no Google Maps</span>
                    </a>
                  )}
                </div>
              );
            })()}

            {/* Ações Operacionais da Rota (M4 Seção 8, 9, 10) */}
            {selectedRouteDetails.route.status === 'ACCEPTED' && (
              <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <strong className="text-indigo-950 block">Etapa: Aguardando Motorista Chegar na Coleta</strong>
                  <span className="text-indigo-700 text-[11px]">
                    O motorista venceu o aceite e está a caminho do ponto de coleta.
                  </span>
                </div>
                <button
                  onClick={() => handleArrivedPickup(selectedRouteDetails.route.id)}
                  disabled={operationalLoading}
                  className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-colors shrink-0 flex items-center gap-1.5"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{operationalLoading ? 'Registrando...' : '📍 Cheguei para Coleta'}</span>
                </button>
              </div>
            )}

            {selectedRouteDetails.route.status === 'ARRIVED_PICKUP' && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <strong className="text-amber-950 block">Etapa: Motorista na Loja para Retirada</strong>
                  <span className="text-amber-700 text-[11px]">
                    Separe e confira os pacotes de todas as {selectedRouteDetails.route.stops?.length || 0} paradas antes de liberar a rota.
                  </span>
                </div>
                <button
                  onClick={() => handlePickedUp(selectedRouteDetails.route.id)}
                  disabled={operationalLoading}
                  className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition-colors shrink-0 flex items-center gap-1.5"
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>{operationalLoading ? 'Confirmando...' : '📦 Pedidos Coletados'}</span>
                </button>
              </div>
            )}

            {selectedRouteDetails.route.status === 'PICKED_UP' && (
              <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <strong className="text-blue-950 block">Etapa: Carga Pronta para Deslocamento</strong>
                  <span className="text-blue-700 text-[11px]">
                    Todos os pedidos foram coletados. O motorista pode iniciar o percurso.
                  </span>
                </div>
                <button
                  onClick={() => handleStartRoute(selectedRouteDetails.route.id)}
                  disabled={operationalLoading}
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors shrink-0 flex items-center gap-1.5"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>
                    {operationalLoading
                      ? 'Iniciando...'
                      : (selectedRouteDetails.driver?.vehicle_type === 'CAR' ||
                         selectedRouteDetails.route.accepted_driver?.vehicle_type === 'CAR' ||
                         (selectedRouteDetails.route.accepted_vehicle_types?.length === 1 && selectedRouteDetails.route.accepted_vehicle_types[0] === 'CAR'))
                      ? '🚗 Iniciar Rota'
                      : '🛵 Iniciar Rota'}
                  </span>
                </button>
              </div>
            )}

            {/* Tratamento de Incidentes & Finalizar e Pagar (M4.1) */}
            {selectedRouteDetails.route.status !== 'COMPLETED' &&
              selectedRouteDetails.route.status !== 'CANCELLED' && (
                <div
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-all ${
                    selectedRouteDetails.route.stops?.some(
                      (s) => s.status === 'INCIDENT' || !!s.incident_type
                    )
                      ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-300'
                      : 'bg-emerald-50 border-emerald-200'
                  }`}
                >
                  <div>
                    <div className="font-bold flex items-center gap-1.5 text-sm text-neutral-900">
                      {selectedRouteDetails.route.stops?.some(
                        (s) => s.status === 'INCIDENT' || !!s.incident_type
                      ) ? (
                        <>
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span className="text-amber-950 font-black">
                            Tratamento de Ocorrência & Finalização
                          </span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="text-emerald-950 font-black">
                            Finalização da Rota & Pagamento PIX
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-[11px] text-neutral-600 mt-1 leading-relaxed">
                      {selectedRouteDetails.route.stops?.some(
                        (s) => s.status === 'INCIDENT' || !!s.incident_type
                      )
                        ? 'Esta corrida possui incidente(s) reportado(s). Não prometemos pagamento imediato: a pendência deve ser tratada e resolvida primeiro via WhatsApp (34 9 9678 7881). Após o alinhamento, clique no botão ao lado para finalizar e liberar para pagamento PIX.'
                        : 'Todas as entregas foram processadas. Clique no botão ao lado para finalizar a rota e enviá-la para o financeiro efetuar o pagamento PIX.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleFinalizeRoute(selectedRouteDetails.route.id)}
                    disabled={finalizingRouteId === selectedRouteDetails.route.id}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md shadow-emerald-600/30 flex items-center justify-center gap-2 shrink-0 cursor-pointer transition-all animate-pulse ring-2 ring-emerald-400"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>
                      {finalizingRouteId === selectedRouteDetails.route.id
                        ? 'Finalizando...'
                        : '💰 Finalizar e Pagar'}
                    </span>
                  </button>
                </div>
              )}

            {/* Paradas & Comprovantes (M4 Seção 26 & 27) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                  Paradas & Comprovantes ({selectedRouteDetails.route.stops?.length || 0})
                </h4>
                <span className="text-[11px] text-neutral-500">
                  {selectedRouteDetails.route.stops?.filter((s) => s.status === 'DELIVERED').length || 0} entregues
                  {' • '}
                  {selectedRouteDetails.route.stops?.filter((s) => s.status === 'INCIDENT').length || 0} com incidente
                  {' • '}
                  {selectedRouteDetails.route.stops?.filter((s) => s.status === 'PENDING').length || 0} pendentes
                </span>
              </div>

              <div className="border border-neutral-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 border-b border-neutral-200 text-[10px] text-neutral-500 font-bold uppercase">
                    <tr>
                      <th className="px-3 py-2">Seq</th>
                      <th className="px-3 py-2">Destino / Bairro</th>
                      <th className="px-3 py-2">Cliente / Contato</th>
                      <th className="px-3 py-2">Carga</th>
                      <th className="px-3 py-2">Modalidade</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Comprovante / PIN</th>
                      <th className="px-3 py-2 text-right">Ações Operacionais</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {selectedRouteDetails.route.stops?.map((stop) => {
                      const customerInfo = extractCustomerData(stop);
                      return (
                      <tr key={stop.id} className="hover:bg-neutral-50/50">
                        <td className="px-3 py-2.5 font-mono font-bold">{stop.sequence}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-neutral-900">{stop.destination_address}</div>
                          <div className="text-[10px] text-neutral-500">{stop.destination_neighborhood}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          {customerInfo.name || customerInfo.phone ? (
                            <div className="space-y-0.5">
                              {customerInfo.name && (
                                <div className="font-bold text-neutral-900 flex items-center gap-1">
                                  <UserCheck className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                                  <span>{customerInfo.name}</span>
                                </div>
                              )}
                              {customerInfo.phone && (
                                <a
                                  href={`https://wa.me/55${customerInfo.rawDigits || customerInfo.phone.replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded transition-colors"
                                  title="Abrir WhatsApp do cliente"
                                >
                                  <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                                  <span>{customerInfo.phone}</span>
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="text-neutral-400 italic text-[11px]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-neutral-800">{stop.cargo_description}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            stop.delivery_mode === 'NO_CONTACT'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {stop.delivery_mode === 'NO_CONTACT' ? 'Sem Contato (Foto)' : 'Presencial (PIN)'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {stop.status === 'DELIVERED' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                              ✓ ENTREGUE
                            </span>
                          )}
                          {stop.status === 'INCIDENT' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                              ⚠ INCIDENTE
                            </span>
                          )}
                          {stop.status === 'PENDING' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200">
                              PENDENTE
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {stop.status === 'DELIVERED' && stop.proof_type === 'PIN' && (
                            <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              PIN VALIDADO ✓
                            </span>
                          )}
                          {stop.status === 'DELIVERED' && stop.proof_type === 'PHOTO' && (
                            <button
                              type="button"
                              onClick={() => stop.proof_reference && handleViewProofPhoto(stop.proof_reference)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                            >
                              <ImageIcon className="w-3 h-3" />
                              <span>Ver Foto</span>
                            </button>
                          )}
                          {stop.status === 'INCIDENT' && (
                            <span className="text-[10px] font-bold text-rose-700">
                              {stop.incident_type?.replace(/_/g, ' ')}
                              {stop.incident_note && <span className="block font-normal text-[9px] text-neutral-500">"{stop.incident_note}"</span>}
                            </span>
                          )}
                          {stop.status === 'PENDING' && stop.delivery_mode === 'IN_PERSON' && (
                            <div className="flex items-center gap-1.5 text-xs flex-wrap">
                              <span className="text-neutral-500 text-[10px]">Cód. Cliente:</span>
                              <strong
                                onClick={() => stop.pin_code && copyToClipboard(stop.pin_code!, `dtl_pin_${stop.id}`)}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenCustomerWhatsApp(stop);
                                }}
                                className="font-mono bg-amber-100 hover:bg-amber-200 text-amber-950 px-2 py-0.5 rounded border border-amber-300 font-bold cursor-pointer select-none transition-colors"
                                title="Clique simples: Copiar PIN | Clique duplo: Enviar mensagem no WhatsApp para o cliente"
                              >
                                {stop.pin_code || '—'}
                              </strong>
                              {stop.pin_code && (
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(stop.pin_code!, `dtl_pin_${stop.id}`)}
                                  className="text-[9px] px-1.5 py-0.5 rounded border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-600 font-semibold"
                                  title="Copiar PIN"
                                >
                                  {copiedKey === `dtl_pin_${stop.id}` ? '✓ Copiado' : 'Copiar'}
                                </button>
                              )}
                              {stop.pin_code && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenCustomerWhatsApp(stop)}
                                  className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-colors cursor-pointer shadow-2xs"
                                  title="Enviar mensagem amigável no WhatsApp informando que saiu para coleta e solicitando o código ao cliente"
                                >
                                  <Send className="w-2.5 h-2.5" />
                                  <span>WhatsApp</span>
                                </button>
                              )}
                            </div>
                          )}
                          {stop.status === 'PENDING' && stop.delivery_mode === 'NO_CONTACT' && (
                            <span className="text-[10px] text-neutral-500 italic">Foto obrigatória</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {stop.status === 'PENDING' && (
                            <div className="flex items-center justify-end gap-1.5">
                              {stop.delivery_mode === 'IN_PERSON' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedStopForPin(stop);
                                    setPinInput('');
                                  }}
                                  className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-[10px]"
                                >
                                  Validar PIN
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedStopForPhoto(stop);
                                    setPhotoRefInput('');
                                  }}
                                  className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-[10px] flex items-center gap-1"
                                >
                                  <Camera className="w-3 h-3" />
                                  <span>Enviar Foto</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedStopForIncident(stop);
                                  setIncidentTypeInput('CLIENTE_AUSENTE');
                                  setIncidentNoteInput('');
                                }}
                                className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[10px] border border-rose-200"
                              >
                                Incidente
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paradas Adicionais da Proposta Recusada (Preservadas para Ajuste) */}
              {(() => {
                let extraStops: any[] = [];
                if (selectedRouteDetails.route.pending_material_change) {
                  try {
                    const parsed =
                      typeof selectedRouteDetails.route.pending_material_change === 'string'
                        ? JSON.parse(selectedRouteDetails.route.pending_material_change)
                        : selectedRouteDetails.route.pending_material_change;
                    if (parsed?.status === 'REJECTED' && Array.isArray(parsed?.proposal?.stops)) {
                      const existingIds = new Set(selectedRouteDetails.route.stops?.map((s) => s.id) || []);
                      extraStops = parsed.proposal.stops.filter((s: any) => !s.id || !existingIds.has(s.id));
                    }
                  } catch {}
                }
                if (extraStops.length === 0) return null;

                return (
                  <div className="mt-3 p-3.5 rounded-xl bg-amber-50/80 border border-dashed border-amber-300 text-xs space-y-2">
                    <div className="font-bold text-amber-950 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Package className="w-4 h-4 text-amber-600" />
                        <span>Paradas Adicionais da Proposta Recusada (Preservadas no Sistema):</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingRouteId(selectedRouteDetails.route.id)}
                        className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] shadow-xs cursor-pointer flex items-center gap-1"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Ajustar no Formulário</span>
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {extraStops.map((es, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-[11px] text-amber-900 bg-white/80 p-2 px-3 rounded-lg border border-amber-200"
                        >
                          <div>
                            <strong>Parada #{es.sequence || (selectedRouteDetails.route.stops?.length || 0) + idx + 1}:</strong>{' '}
                            {es.destination_address}{es.destination_neighborhood ? ` (${es.destination_neighborhood})` : ''} —{' '}
                            <span className="italic">{es.cargo_description}</span>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 shrink-0">
                            Pronta para Reajuste
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Simulation / Acceptance Tool (M3 / M2.1 testing) */}
            {selectedRouteDetails.route.status === 'OFFERED' && (
              <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-700" />
                  <span className="font-bold text-blue-900">Simulação / Teste de Aceite Atômico (M3)</span>
                </div>
                <p className="text-blue-800 text-[11px]">
                  Teste a aceitação concorrente ou verificação de veículo escolhendo um dos motoristas ativos abaixo:
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {drivers
                    .filter((d) => d.status === 'ACTIVE')
                    .map((drv) => (
                      <button
                        key={drv.id}
                        onClick={() => handleSimulateAcceptRoute(selectedRouteDetails.route.id, drv.id)}
                        disabled={simulatingAcceptance}
                        className="px-2.5 py-1.5 rounded bg-white hover:bg-blue-100 border border-blue-300 text-blue-950 font-bold text-[11px] shadow-xs flex items-center gap-1"
                      >
                        <span>{VEHICLE_DISPLAY[drv.vehicle_type]?.icon}</span>
                        <span>{drv.name} ({drv.vehicle_type})</span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Dispatches */}
            {(selectedRouteDetails.dispatches || []).length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider mb-2">
                  Dispatches no Telegram ({(selectedRouteDetails.dispatches || []).length})
                </h4>
                <div className="border border-neutral-200 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-50 border-b border-neutral-200 text-[10px] text-neutral-500 font-bold uppercase">
                      <tr>
                        <th className="px-3 py-2">Motorista ID</th>
                        <th className="px-3 py-2">Chat ID</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Data/Hora</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {(selectedRouteDetails.dispatches || []).map((disp) => (
                        <tr key={disp.id}>
                          <td className="px-3 py-1.5 font-mono">#{disp.driver_id}</td>
                          <td className="px-3 py-1.5 font-mono">{disp.telegram_chat_id}</td>
                          <td className="px-3 py-1.5">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              disp.status === 'SENT' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {disp.status}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-neutral-500 text-[10px]">
                            {new Date(disp.sent_at).toLocaleString('pt-BR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* M4.4: Histórico de Alterações e Versões da Rota (A6) */}
            <div className="pt-2 border-t border-neutral-200">
              <RouteUpdatesHistory
                routeId={selectedRouteDetails.route.id}
                getAuthHeaders={getAuthHeaders}
              />
            </div>

            {/* Audit Events */}
            <div>
              <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider mb-2">
                Trilha de Auditoria (Eventos)
              </h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {(selectedRouteDetails.events || []).map((evt) => (
                  <div key={evt.id} className="p-2 rounded-lg bg-neutral-50 border border-neutral-200/80 text-[11px] flex justify-between items-center">
                    <div>
                      <span className="font-bold text-neutral-900">{evt.event_type}</span>
                      {evt.actor && <span className="text-neutral-500 ml-1.5">por {evt.actor}</span>}
                      {evt.details && <span className="text-neutral-600 block text-[10px]">{evt.details}</span>}
                    </div>
                    <span className="text-[10px] font-mono text-neutral-400">
                      {new Date(evt.timestamp).toLocaleString('pt-BR')}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            </div>

            {/* Footer Fixo no Rodapé: sempre acessível */}
            <div className="px-5 py-3 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-neutral-500 font-medium">
                {selectedRouteDetails.route.stops?.length || 0} paradas • Rota #{selectedRouteDetails.route.id}
              </span>
              <div className="flex items-center gap-2">
                {selectedRouteDetails.route.status !== 'CANCELLED' && (
                  <button
                    type="button"
                    onClick={() => openCancelModal(selectedRouteDetails.route)}
                    disabled={cancellingId === selectedRouteDetails.route.id}
                    className="px-3.5 py-2 font-bold text-xs rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors cursor-pointer shadow-xs"
                    title="Cancelar esta corrida e encaminhar para Pendências"
                  >
                    {cancellingId === selectedRouteDetails.route.id ? 'Cancelando...' : 'Cancelar Rota'}
                  </button>
                )}
                <button
                  onClick={() => setSelectedRouteDetails(null)}
                  className="px-4 py-2 font-bold text-xs rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white transition-colors cursor-pointer shadow-xs"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: EDIÇÃO CONTROLADA E VERSIONAMENTO DE ROTA (M4.4)        */}
      {/* ============================================================== */}
      <RouteEditModal
        routeId={editingRouteId}
        isOpen={editingRouteId !== null}
        onClose={() => setEditingRouteId(null)}
        onSuccess={async (updatedRoute) => {
          setSuccessMessage(
            `✅ Rota #${updatedRoute.id} atualizada com sucesso para a versão v${updatedRoute.route_version}!`
          );
          await fetchRoutes();
          if (selectedRouteDetails?.route.id === updatedRoute.id) {
            openRouteDetails(updatedRoute.id);
          }
        }}
        getAuthHeaders={getAuthHeaders}
        locations={pickupLocations}
      />

      {/* ============================================================== */}
      {/* SUBMODAL: VALIDAR PIN DA PARADA (M4)                           */}
      {/* ============================================================== */}
      {selectedStopForPin && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-neutral-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
              <h4 className="text-sm font-bold text-neutral-950">
                Validar PIN da Entrega (Parada #{selectedStopForPin.sequence})
              </h4>
              <button
                onClick={() => setSelectedStopForPin(null)}
                className="text-neutral-400 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>

            <div className="text-xs space-y-1">
              <div className="text-neutral-600">
                <strong>Destino:</strong> {selectedStopForPin.destination_address}
              </div>
              <div className="text-neutral-600">
                <strong>PIN Correto Gerado:</strong> <span className="font-mono font-bold bg-neutral-100 px-1.5 py-0.5 rounded">{selectedStopForPin.pin_code}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                PIN de 4 dígitos informado pelo cliente:
              </label>
              <input
                type="text"
                maxLength={4}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="Ex: 1234"
                className="w-full px-3 py-2 text-center text-lg font-mono font-bold border border-neutral-300 rounded-lg tracking-widest focus:ring-2 focus:ring-neutral-900"
                autoFocus
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedStopForPin(null)}
                className="px-3 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleDeliverStopPin(selectedStopForPin.id, pinInput)}
                disabled={pinInput.length !== 4 || operationalLoading}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50"
              >
                {operationalLoading ? 'Validando...' : 'Confirmar Entrega'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUBMODAL: COMPROVANTE FOTOGRÁFICO DA PARADA (M4)               */}
      {/* ============================================================== */}
      {selectedStopForPhoto && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-neutral-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
              <h4 className="text-sm font-bold text-neutral-950 flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-neutral-700" />
                <span>Foto de Comprovante (#{selectedStopForPhoto.sequence})</span>
              </h4>
              <button
                onClick={() => setSelectedStopForPhoto(null)}
                className="text-neutral-400 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-neutral-600 space-y-1">
              <div><strong>Destino:</strong> {selectedStopForPhoto.destination_address}</div>
              <p className="text-[11px] text-neutral-500">
                Para entregas Sem Contato (NO_CONTACT), informe o link ou ID da foto onde o pedido foi deixado:
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Referência / URL da Imagem:
              </label>
              <input
                type="text"
                value={photoRefInput}
                onChange={(e) => setPhotoRefInput(e.target.value)}
                placeholder="Ex: https://... ou file_id"
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900"
                autoFocus
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedStopForPhoto(null)}
                className="px-3 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleDeliverStopPhoto(selectedStopForPhoto.id, photoRefInput || 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=800&auto=format&fit=crop&q=80')}
                disabled={operationalLoading}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50"
              >
                {operationalLoading ? 'Salvando...' : 'Concluir Entrega'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUBMODAL: REGISTRAR INCIDENTE NA PARADA (M4)                   */}
      {/* ============================================================== */}
      {selectedStopForIncident && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-neutral-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
              <h4 className="text-sm font-bold text-rose-600 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>Registrar Problema (Parada #{selectedStopForIncident.sequence})</span>
              </h4>
              <button
                onClick={() => setSelectedStopForIncident(null)}
                className="text-neutral-400 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-neutral-600 space-y-1">
              <div><strong>Destino:</strong> {selectedStopForIncident.destination_address}</div>
              <p className="text-[11px] text-neutral-500">
                Registrar um incidente marca a parada em estado terminal sem travar as demais entregas da rota.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Motivo do Problema:
              </label>
              <select
                value={incidentTypeInput}
                onChange={(e) => setIncidentTypeInput(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white focus:ring-2 focus:ring-rose-500 font-semibold"
              >
                <option value="CLIENTE_AUSENTE">CLIENTE AUSENTE</option>
                <option value="ENDERECO_NAO_LOCALIZADO">ENDEREÇO NÃO LOCALIZADO</option>
                <option value="CLIENTE_RECUSOU">CLIENTE RECUSOU</option>
                <option value="OUTRO">OUTRO</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Observações / Descrição (Opcional):
              </label>
              <input
                type="text"
                value={incidentNoteInput}
                onChange={(e) => setIncidentNoteInput(e.target.value)}
                placeholder="Ex: Interfone não atende após 3 tentativas"
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedStopForIncident(null)}
                className="px-3 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleReportIncident(selectedStopForIncident.id, incidentTypeInput, incidentNoteInput)}
                disabled={operationalLoading}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50"
              >
                {operationalLoading ? 'Registrando...' : 'Confirmar Problema'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: CANCELAMENTO OPERACIONAL DE ROTA                        */}
      {/* ============================================================== */}
      {scheduleTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !scheduleSaving && setScheduleTarget(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-black text-neutral-900">⏰ Agendar oferta · Rota #{scheduleTarget.id}</h3>
            <label className="block text-xs font-semibold text-neutral-700">
              Data e hora da entrega
              <input
                type="datetime-local"
                value={scheduleInput}
                onChange={(e) => setScheduleInput(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </label>
            <p className="text-xs text-neutral-600">
              {/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduleInput)
                ? `A oferta será publicada automaticamente para os entregadores em ${fmtScheduleBRT(new Date(new Date(`${scheduleInput}:00-03:00`).getTime() - OFFER_LEAD_MIN * 60000).toISOString())} (${OFFER_LEAD_MIN} min antes da entrega).`
                : `A oferta é publicada automaticamente ${OFFER_LEAD_MIN} min antes do horário de entrega.`}
            </p>
            {scheduleError && (
              <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 break-words">
                Não foi possível agendar: {scheduleError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setScheduleTarget(null)} disabled={scheduleSaving}
                className="px-3 py-2 rounded-lg border border-neutral-300 text-xs font-semibold hover:bg-neutral-50">Voltar</button>
              <button type="button" onClick={handleConfirmSchedule} disabled={scheduleSaving}
                className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold">
                {scheduleSaving ? 'Agendando…' : 'Agendar oferta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {routeToCancel && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-neutral-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
              <h4 className="text-base font-bold text-rose-600 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <span>Cancelar Corrida #{routeToCancel.id}</span>
              </h4>
              <button
                onClick={() => setRouteToCancel(null)}
                className="text-neutral-400 hover:text-neutral-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5 text-xs text-amber-950">
              <div className="flex items-center justify-between">
                <span><strong>Status Atual:</strong> {routeToCancel.status}</span>
                <span className="font-mono font-bold">Frete: R$ {routeToCancel.total_fee}</span>
              </div>
              <div><strong>Coleta:</strong> {routeToCancel.pickup_name}</div>
              {routeToCancel.accepted_driver_id && (
                <div className="text-blue-900 font-semibold">
                  🛵 Motorista vinculado: #{routeToCancel.accepted_driver_id} (será notificado via Telegram)
                </div>
              )}
            </div>

            <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-xs text-neutral-600 leading-relaxed">
              <p className="font-bold text-neutral-800 mb-1">
                ⚠️ Encaminhamento automático para Pendências:
              </p>
              <p>
                Ao cancelar, esta rota sairá do fluxo ativo e será encaminhada imediatamente para a aba <strong>Pendências (M4.1)</strong> para você registrar a solução (ex: devolução à loja, descarte, cancelamento do pedido) e registrar repasses ou ressarcimentos devidos se necessário.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Motivo / Justificativa do Cancelamento:
              </label>
              <textarea
                rows={3}
                value={cancelReasonInput}
                onChange={(e) => setCancelReasonInput(e.target.value)}
                placeholder="Ex: Cliente desistiu do pedido, loja fechou antes da retirada, endereço incorreto..."
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none"
                autoFocus
              />
            </div>

            {routeToCancel.accepted_driver_id && (
              <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-neutral-800">
                    💰 Acordo Financeiro / Repasse ao Motorista (Opcional):
                  </label>
                  <span className="text-[10px] text-neutral-500">Frete original: R$ {routeToCancel.total_fee}</span>
                </div>
                <p className="text-[11px] text-neutral-500 leading-snug">
                  Se você já combinou uma taxa de deslocamento ou cancelamento com o motoboy, informe o valor abaixo. Você também pode deixar em branco e definir depois na aba <strong>Pendências</strong>.
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCancelCompensationInput('0.00')}
                    className="px-2 py-1 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-700 text-[11px] font-semibold"
                  >
                    R$ 0,00 (Sem repasse)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancelCompensationInput('10.00')}
                    className="px-2 py-1 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-700 text-[11px] font-semibold"
                  >
                    R$ 10,00
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancelCompensationInput('15.00')}
                    className="px-2 py-1 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-700 text-[11px] font-semibold"
                  >
                    R$ 15,00
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancelCompensationInput(routeToCancel.total_fee || '0.00')}
                    className="px-2 py-1 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-700 text-[11px] font-semibold"
                  >
                    R$ {routeToCancel.total_fee} (Integral)
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-bold text-neutral-600 font-mono">R$</span>
                  <input
                    type="text"
                    value={cancelCompensationInput}
                    onChange={(e) => setCancelCompensationInput(e.target.value)}
                    placeholder="0.00"
                    className="w-32 px-3 py-1.5 text-xs font-mono font-bold border border-neutral-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setRouteToCancel(null)}
                className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold transition-colors cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelRoute}
                disabled={cancellingId === routeToCancel.id}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {cancellingId === routeToCancel.id ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Cancelando...</span>
                  </>
                ) : (
                  <>
                    <Ban className="w-3.5 h-3.5" />
                    <span>Confirmar Cancelamento</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUBMODAL: VISUALIZADOR DE FOTO DE COMPROVANTE (M4)             */}
      {/* ============================================================== */}
      {viewingPhotoUrl && (
        <div className="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-neutral-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
              <h4 className="text-sm font-bold text-neutral-950 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-blue-600" />
                <span>Comprovante de Entrega Fotográfico</span>
              </h4>
              <button
                onClick={() => setViewingPhotoUrl(null)}
                className="text-neutral-400 hover:text-neutral-700 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl overflow-hidden bg-neutral-100 flex items-center justify-center max-h-96">
              <img
                src={viewingPhotoUrl}
                alt="Comprovante de entrega"
                className="w-full h-auto object-contain max-h-96"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingPhotoUrl(null)}
                className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: PONTO DE COLETA (NOVO / EDITAR)                          */}
      {/* ============================================================== */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-neutral-200">
            <div className="flex items-start justify-between pb-3 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <Store className="w-5 h-5 text-orange-600" />
                <h3 className="text-base font-bold text-neutral-950">
                  {editingLocation ? 'Editar Ponto de Coleta' : 'Novo Ponto de Coleta'}
                </h3>
              </div>
              <button
                onClick={() => setShowLocationModal(false)}
                className="text-neutral-400 hover:text-neutral-700 text-xl font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveLocation} className="pt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Nome do Local
                </label>
                <input
                  type="text"
                  placeholder="Ex: Kantine Matriz ou Kantine Vinhedos"
                  value={locationFormData.name}
                  onChange={(e) => setLocationFormData({ ...locationFormData, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Endereço Completo
                </label>
                <input
                  type="text"
                  placeholder="Ex: Rua Tiradentes, 500 - Fundinho - Uberlândia"
                  value={locationFormData.address}
                  onChange={(e) => setLocationFormData({ ...locationFormData, address: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Bairro da Coleta (Obrigatório para rotas)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Centro ou Fundinho"
                  value={locationFormData.neighborhood}
                  onChange={(e) => setLocationFormData({ ...locationFormData, neighborhood: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:ring-2 focus:ring-orange-500 font-semibold"
                />
                <p className="text-[10px] text-neutral-500 mt-1">
                  Este bairro é enviado na oferta ao motorista no Telegram antes do aceite da rota.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="loc_active"
                  checked={locationFormData.active}
                  onChange={(e) => setLocationFormData({ ...locationFormData, active: e.target.checked })}
                  className="accent-orange-600 rounded"
                />
                <label htmlFor="loc_active" className="font-semibold text-neutral-700 cursor-pointer">
                  Ponto de coleta ativo para novas rotas
                </label>
              </div>

              <div className="pt-3 border-t border-neutral-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowLocationModal(false)}
                  className="px-4 py-2 font-semibold rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingLocation}
                  className="px-4 py-2 font-bold rounded-lg bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {savingLocation ? 'Salvando...' : 'Salvar Ponto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: AUDITORIA DO MOTORISTA (M1 & M1.1)                       */}
      {/* ============================================================== */}
      {selectedDriver && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-neutral-200 space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-neutral-700" />
                <h3 className="text-base font-bold text-neutral-950">
                  Auditoria: {selectedDriver.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDriver(null)}
                className="text-neutral-400 hover:text-neutral-700 text-xl font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-50 text-xs space-y-1">
              <div><strong>Status Atual:</strong> {selectedDriver.status}</div>
              <div className="flex items-center gap-1.5 flex-wrap"><strong>Veículo(s):</strong> {renderDriverVehicleBadges(selectedDriver.vehicle_type)}</div>
              <div><strong>Telefone:</strong> {selectedDriver.phone}</div>
              <div><strong>Chave Pix:</strong> {selectedDriver.pix_key_value || selectedDriver.pix_key || 'Não informada'}</div>
            </div>

            {/* Memória Histórica de Exclusão */}
            {(selectedDriver.previous_exclusion_reason || selectedDriver.is_excluded || (selectedDriver.exclusion_count && selectedDriver.exclusion_count > 0)) && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-950">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>MEMÓRIA HISTÓRICA: MOTORISTA JÁ FOI EXCLUÍDO ANTERIORMENTE</span>
                </div>
                <div className="text-amber-900 text-[11px] space-y-1 bg-white/70 p-2.5 rounded-lg border border-amber-200">
                  <div>
                    <strong>Total de vezes excluído:</strong> {selectedDriver.exclusion_count || 1}x
                  </div>
                  <div>
                    <strong>Motivo do Desligamento:</strong>{' '}
                    <span className="font-semibold text-neutral-900">
                      {selectedDriver.exclusion_reason || selectedDriver.previous_exclusion_reason || 'Desativação administrativa'}
                    </span>
                  </div>
                  {selectedDriver.excluded_at && (
                    <div className="text-[10px] text-amber-800">
                      <strong>Data da Exclusão:</strong> {new Date(selectedDriver.excluded_at).toLocaleString('pt-BR')}
                    </div>
                  )}
                  {selectedDriver.excluded_by && (
                    <div className="text-[10px] text-amber-800">
                      <strong>Registrado por:</strong> {selectedDriver.excluded_by}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Pedido de Reativação Pendente */}
            {selectedDriver.reactivation_requested && (
              <div className="p-4 rounded-xl bg-orange-50 border border-orange-300 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-orange-950">
                  <RefreshCw className="w-4 h-4 text-orange-600 shrink-0 animate-spin" />
                  <span>SOLICITAÇÃO DE REATIVAÇÃO ENVIADA PELO MOTORISTA</span>
                </div>
                <div className="bg-white/80 p-2.5 rounded-lg border border-orange-200 text-orange-950 text-[11px] space-y-1">
                  <div>
                    <strong>Justificativa do Motorista:</strong> &ldquo;{selectedDriver.reactivation_reason}&rdquo;
                  </div>
                  {selectedDriver.reactivation_requested_at && (
                    <div className="text-[10px] text-orange-700">
                      Enviada em: {new Date(selectedDriver.reactivation_requested_at).toLocaleString('pt-BR')}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => handleReactivateDriver(selectedDriver.id)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                  >
                    Aprovar Reativação
                  </button>
                  <button
                    onClick={() => {
                      setDecisionDriver(selectedDriver);
                      setDecisionType('REJECT_REACTIVATION');
                      setDecisionReasonInput('');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-xs"
                  >
                    Recusar Reativação
                  </button>
                </div>
              </div>
            )}

            {/* Informações de Motorista Excluído & Reinclusão via Novo Convite */}
            {(selectedDriver.is_excluded || selectedDriver.status === 'EXCLUDED') && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-950">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>CADASTRO DESATIVADO / EXCLUÍDO (PROCESSO ZERADO)</span>
                </div>
                <p className="text-amber-900 text-[11px] leading-relaxed">
                  Motoristas excluídos têm o processo zerado. Só podem retornar através de um <strong>novo convite</strong> e <strong>nova aprovação</strong>, pois podem ter mudado de veículo, telefone ou chave PIX.
                </p>
                <div className="pt-1">
                  <button
                    onClick={() => {
                      const d = selectedDriver;
                      setSelectedDriver(null);
                      handleReinviteExcludedDriver(d);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-xs cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Gerar Novo Convite para Reinclusão</span>
                  </button>
                </div>
              </div>
            )}

            <div>
              <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider mb-2">
                Eventos e Histórico Completo
              </h4>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {loadingDriverEvents ? (
                  <p className="text-xs text-neutral-400">Carregando...</p>
                ) : driverEvents.length === 0 ? (
                  <p className="text-xs text-neutral-400">Nenhum evento registrado.</p>
                ) : (
                  driverEvents.map((e) => (
                    <div key={e.id} className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200 text-xs space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-neutral-900">{e.event_type}</span>
                        <span className="text-[10px] font-mono text-neutral-400">
                          {new Date(e.timestamp).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      {e.actor_type && (
                        <div className="text-[10px] text-neutral-500">
                          Agente: {e.actor_type} {e.actor_id ? `(${e.actor_id})` : ''}
                        </div>
                      )}
                      {e.details && (
                        <div className="text-[11px] text-neutral-700 font-mono bg-white p-1.5 rounded border border-neutral-100">
                          {typeof e.details === 'object' ? JSON.stringify(e.details) : e.details}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-neutral-200 flex justify-between items-center">
              <div>
                {!selectedDriver.is_excluded && selectedDriver.status !== 'EXCLUDED' && (
                  <button
                    onClick={() => {
                      setExcludingDriver(selectedDriver);
                      setExclusionReasonInput('');
                    }}
                    className="px-3 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 text-xs font-semibold"
                  >
                    Excluir Cadastro
                  </button>
                )}
              </div>
              <button
                onClick={() => setSelectedDriver(null)}
                className="px-4 py-2 font-semibold text-xs rounded-lg bg-neutral-900 text-white"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: EXCLUIR CADASTRO DE MOTORISTA (COM MOTIVO OBRIGATÓRIO)  */}
      {/* ============================================================== */}
      {excludingDriver && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-neutral-200 space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-950">
                    Excluir Cadastro de Motorista
                  </h3>
                  <p className="text-xs text-neutral-500">{excludingDriver.name} (#{excludingDriver.id})</p>
                </div>
              </div>
              <button
                onClick={() => setExcludingDriver(null)}
                className="text-neutral-400 hover:text-neutral-700 text-xl font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1">
              <p className="font-bold">⚠️ Atenção: Ação com registro histórico auditável</p>
              <p className="text-[11px] text-rose-800">
                O motorista será desativado e desvinculado do recebimento de ofertas de entrega. Todo o histórico de rotas, eventos e o motivo da exclusão ficarão salvos para consultas futuras e análise de eventual solicitação de retorno.
              </p>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="block font-bold text-neutral-800">
                Motivo da Exclusão <span className="text-rose-600">*</span>
              </label>
              <textarea
                value={exclusionReasonInput}
                onChange={(e) => setExclusionReasonInput(e.target.value)}
                placeholder="Descreva detalhadamente o motivo (ex: desistência voluntária, reclamação de clientes, infração de regras operacionais, veículo impróprio, etc.)..."
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none min-h-[90px]"
                required
              />
              <p className="text-[10px] text-neutral-500">
                Este motivo será exibido na memória histórica de auditoria da Kantine e informado ao motorista.
              </p>
            </div>

            <div className="pt-2 border-t border-neutral-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExcludingDriver(null)}
                disabled={submittingExclusion}
                className="px-4 py-2 font-semibold text-xs rounded-lg border border-neutral-300 hover:bg-neutral-50 text-neutral-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExcludeDriver}
                disabled={submittingExclusion || !exclusionReasonInput.trim()}
                className="px-4 py-2 font-bold text-xs rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-sm disabled:opacity-50"
              >
                {submittingExclusion ? 'Excluindo...' : 'Confirmar Exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: DECISÃO DE REATIVAÇÃO / REINCLUSÃO                     */}
      {/* ============================================================== */}
      {decisionDriver && decisionType && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-neutral-200 space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-neutral-100 text-neutral-800 flex items-center justify-center shrink-0">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-950">
                    {decisionType === 'REJECT_REACTIVATION' && 'Recusar Solicitação de Reativação'}
                    {decisionType === 'APPROVE_REINCLUSION' && 'Aprovar Reinclusão de Motorista'}
                    {decisionType === 'REJECT_REINCLUSION' && 'Recusar Pedido de Reinclusão'}
                  </h3>
                  <p className="text-xs text-neutral-500">{decisionDriver.name} (#{decisionDriver.id})</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setDecisionDriver(null);
                  setDecisionType(null);
                }}
                className="text-neutral-400 hover:text-neutral-700 text-xl font-semibold"
              >
                ✕
              </button>
            </div>

            {/* Dossiê Histórico destacado para facilitar a decisão */}
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-1.5 text-amber-950">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                <span>Memória Histórica de Decisão</span>
              </div>
              {decisionDriver.exclusion_reason || decisionDriver.previous_exclusion_reason ? (
                <div className="text-[11px]">
                  <strong>Motivo da Exclusão Anterior:</strong> &ldquo;{decisionDriver.exclusion_reason || decisionDriver.previous_exclusion_reason}&rdquo;
                </div>
              ) : null}
              {decisionType === 'REJECT_REACTIVATION' && decisionDriver.reactivation_reason && (
                <div className="text-[11px]">
                  <strong>Justificativa do Pedido de Reativação:</strong> &ldquo;{decisionDriver.reactivation_reason}&rdquo;
                </div>
              )}
              {(decisionType === 'APPROVE_REINCLUSION' || decisionType === 'REJECT_REINCLUSION') && decisionDriver.reinclusion_reason && (
                <div className="text-[11px]">
                  <strong>Justificativa do Pedido de Reinclusão:</strong> &ldquo;{decisionDriver.reinclusion_reason}&rdquo;
                </div>
              )}
            </div>

            {decisionType === 'APPROVE_REINCLUSION' && (
              <div className="space-y-1 text-xs">
                <label className="block font-bold text-neutral-800">Status de Retorno</label>
                <select
                  value={decisionTargetStatus}
                  onChange={(e) => setDecisionTargetStatus(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900"
                >
                  <option value="ACTIVE">ATIVO — Habilitado para receber ofertas imediatamente</option>
                  <option value="PENDING">PENDENTE — Requer conferência cadastral prévia</option>
                </select>
              </div>
            )}

            <div className="space-y-1.5 text-xs">
              <label className="block font-bold text-neutral-800">
                {decisionType === 'APPROVE_REINCLUSION' ? 'Observações da Aprovação' : 'Motivo da Recusa *'}
              </label>
              <textarea
                value={decisionReasonInput}
                onChange={(e) => setDecisionReasonInput(e.target.value)}
                placeholder={
                  decisionType === 'APPROVE_REINCLUSION'
                    ? 'Observações internas sobre a decisão de reinclusão...'
                    : 'Explique o motivo da recusa para notificação do motorista...'
                }
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 focus:outline-none min-h-[80px]"
                required={decisionType !== 'APPROVE_REINCLUSION'}
              />
            </div>

            <div className="pt-2 border-t border-neutral-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDecisionDriver(null);
                  setDecisionType(null);
                }}
                disabled={submittingDecision}
                className="px-4 py-2 font-semibold text-xs rounded-lg border border-neutral-300 hover:bg-neutral-50 text-neutral-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDecisionSubmit}
                disabled={submittingDecision || (decisionType !== 'APPROVE_REINCLUSION' && !decisionReasonInput.trim())}
                className={`px-4 py-2 font-bold text-xs rounded-lg text-white shadow-sm disabled:opacity-50 ${
                  decisionType === 'APPROVE_REINCLUSION'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {submittingDecision
                  ? 'Processando...'
                  : decisionType === 'APPROVE_REINCLUSION'
                  ? 'Aprovar Reinclusão'
                  : 'Confirmar Recusa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: EDITAR CADASTRO DO MOTORISTA (M1.1)                     */}
      {/* ============================================================== */}
      {editingDriver && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-neutral-200">
            <div className="flex items-start justify-between pb-3 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-neutral-900" />
                <h3 className="text-base font-bold text-neutral-950">
                  Editar Cadastro do Motorista
                </h3>
              </div>
              <button
                onClick={() => setEditingDriver(null)}
                className="text-neutral-400 hover:text-neutral-700 text-xl font-semibold"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveDriverEdit} className="pt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Nome Completo
                </label>
                <input
                  type="text"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Telefone / WhatsApp
                </label>
                <input
                  type="text"
                  value={editFormData.phone}
                  onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1.5 text-xs">
                  Tipos de Veículo Habilitados <span className="font-normal text-neutral-500">(Pode selecionar mais de um ou todos os 3)</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {VEHICLE_OPTIONS.map((opt) => {
                    const isChecked = editFormData.vehicle_types.includes(opt.type);
                    return (
                      <button
                        key={opt.type}
                        type="button"
                        onClick={() => {
                          let updated: VehicleType[];
                          if (isChecked) {
                            if (editFormData.vehicle_types.length <= 1) return;
                            updated = editFormData.vehicle_types.filter((t) => t !== opt.type);
                          } else {
                            updated = [...editFormData.vehicle_types, opt.type];
                          }
                          setEditFormData({
                            ...editFormData,
                            vehicle_types: updated,
                            vehicle_type: updated.join(','),
                          });
                        }}
                        className={`flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-lg border transition cursor-pointer ${
                          isChecked
                            ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                            : 'bg-neutral-50 text-neutral-600 border-neutral-300 hover:bg-neutral-100'
                        }`}
                      >
                        <span>{opt.icon}</span>
                        <span>{opt.label}</span>
                        {isChecked && <Check className="w-3.5 h-3.5 text-white ml-auto" />}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[11px] text-neutral-500">
                  <span>Selecionados: <strong className="text-neutral-800">{getVehicleTypeLabel(editFormData.vehicle_type)}</strong></span>
                  <button
                    type="button"
                    onClick={() => {
                      const all: VehicleType[] = ['CAR', 'MOTO', 'MOTO_WITH_BAG'];
                      setEditFormData({
                        ...editFormData,
                        vehicle_types: all,
                        vehicle_type: all.join(','),
                      });
                    }}
                    className="text-blue-600 hover:underline font-medium text-[11px] cursor-pointer"
                  >
                    Marcar Todas as 3 Opções
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Tipo Pix
                  </label>
                  <select
                    value={editFormData.pix_key_type}
                    onChange={(e) => setEditFormData({ ...editFormData, pix_key_type: e.target.value as any })}
                    className="w-full px-2 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 bg-white"
                  >
                    <option value="CPF">CPF</option>
                    <option value="PHONE">Telefone</option>
                    <option value="EMAIL">E-mail</option>
                    <option value="RANDOM">Aleatória</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Chave Pix
                  </label>
                  <input
                    type="text"
                    value={editFormData.pix_key_value}
                    onChange={(e) => setEditFormData({ ...editFormData, pix_key_value: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    placeholder="Chave Pix"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-neutral-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingDriver(null)}
                  className="px-4 py-2 font-semibold rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingDriverEdit}
                  className="px-4 py-2 font-semibold rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white"
                >
                  {savingDriverEdit ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: CONVIDAR MOTORISTA PARA O TELEGRAM                      */}
      {/* ============================================================== */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-neutral-200 my-8">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-950">
                    Convidar Motorista para o Telegram
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    O motorista inicia o bot pelo link ou QR Code e conclui o cadastro em segundos
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setGeneratedInvite(null);
                }}
                className="text-neutral-400 hover:text-neutral-700 text-xl font-semibold"
              >
                ✕
              </button>
            </div>

            {/* Status do Bot */}
            <div className="mt-4 p-3 rounded-xl bg-neutral-50/80 border border-neutral-200 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-neutral-600 font-medium">Status do Bot:</span>
                {telegramStatus?.polling && telegramStatus?.botUsername ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                    @{telegramStatus.botUsername} (Online)
                  </span>
                ) : telegramStatus?.configured ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 text-[11px]">
                    Configurado (Aguardando Polling)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold bg-rose-100 text-rose-800 text-[11px]">
                    Não Configurado
                  </span>
                )}
              </div>
              {!telegramStatus?.configured && (
                <button
                  onClick={() => setShowBotModal(true)}
                  className="text-orange-600 hover:text-orange-700 font-bold text-xs underline"
                >
                  Configurar Token
                </button>
              )}
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 border-b border-neutral-200 mt-4 pb-2 text-xs font-bold">
              <button
                onClick={() => setInviteModalTab('QUICK')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                  inviteModalTab === 'QUICK'
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Link Geral & QR Code</span>
              </button>
              <button
                onClick={() => setInviteModalTab('DIRECT')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                  inviteModalTab === 'DIRECT'
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Convite Personalizado (WhatsApp)</span>
              </button>
              <button
                onClick={() => {
                  setInviteModalTab('HISTORY');
                  fetchInvitations();
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                  inviteModalTab === 'HISTORY'
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Histórico ({invitationsList.length})</span>
              </button>
            </div>

            {/* TAB 1: QUICK (Link Rápido e QR Code de Balcão) */}
            {inviteModalTab === 'QUICK' && (
              <div className="pt-4 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
                  {/* QR Code Container */}
                  <div className="flex flex-col items-center justify-center p-4 bg-neutral-50 rounded-2xl border border-neutral-200 text-center">
                    {qrDataUrl ? (
                      <div className="p-2 bg-white rounded-xl shadow-xs border border-neutral-200">
                        <img
                          src={qrDataUrl}
                          alt="QR Code Convite Telegram"
                          className="w-48 h-48 rounded-lg"
                        />
                      </div>
                    ) : (
                      <div className="w-48 h-48 rounded-xl bg-neutral-200 flex items-center justify-center text-neutral-400">
                        <QrCode className="w-8 h-8 animate-pulse" />
                      </div>
                    )}
                    <p className="text-[11px] font-bold text-neutral-800 mt-3">
                      QR Code para Balcão da Loja
                    </p>
                    <p className="text-[10px] text-neutral-500 max-w-xs mt-0.5">
                      O motorista aponta a câmera do celular e cai direto no bot da Kantine no Telegram.
                    </p>
                    {qrDataUrl && (
                      <a
                        href={qrDataUrl}
                        download="qrcode-kantine-entregador.png"
                        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-800 text-xs font-semibold shadow-2xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Baixar Imagem PNG</span>
                      </a>
                    )}
                  </div>

                  {/* Link e Ações */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-neutral-800 mb-1">
                        Link Direto do Bot no Telegram
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          readOnly
                          value={
                            defaultInviteLink ||
                            (telegramStatus?.botUsername
                              ? `https://t.me/${telegramStatus.botUsername}?start=cadastro`
                              : 'https://t.me/KantineEntregasbot?start=cadastro')
                          }
                          className="w-full px-3 py-2 text-xs font-mono bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-800 select-all"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const link =
                              defaultInviteLink ||
                              (telegramStatus?.botUsername
                                ? `https://t.me/${telegramStatus.botUsername}?start=cadastro`
                                : 'https://t.me/KantineEntregasbot?start=cadastro');
                            copyToClipboard(link, 'quick_link');
                          }}
                          className="px-3 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-xs shrink-0 flex items-center gap-1"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>{copiedKey === 'quick_link' ? 'Copiado!' : 'Copiar'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Mensagem Pronta para Envio */}
                    <div>
                      <label className="block text-xs font-bold text-neutral-800 mb-1">
                        Mensagem Padrão de Convite
                      </label>
                      <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-700 leading-relaxed font-sans">
                        Olá! Faça parte da equipe de motoristas parceiros da Kantine Delivery. 🚀 Conclua seu cadastro em menos de 1 minuto pelo nosso Telegram oficial:
                        <br />
                        <span className="font-mono text-orange-600 font-semibold break-all">
                          {defaultInviteLink ||
                            (telegramStatus?.botUsername
                              ? `https://t.me/${telegramStatus.botUsername}?start=cadastro`
                              : 'https://t.me/KantineEntregasbot?start=cadastro')}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(
                          `Olá! Faça parte da equipe de motoristas parceiros da Kantine Delivery. 🚀 Conclua seu cadastro em menos de 1 minuto pelo nosso Telegram oficial: ${
                            defaultInviteLink ||
                            (telegramStatus?.botUsername
                              ? `https://t.me/${telegramStatus.botUsername}?start=cadastro`
                              : 'https://t.me/KantineEntregasbot?start=cadastro')
                          }`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>Compartilhar no WhatsApp</span>
                      </a>
                      <a
                        href={
                          defaultInviteLink ||
                          (telegramStatus?.botUsername
                            ? `https://t.me/${telegramStatus.botUsername}?start=cadastro`
                            : 'https://t.me/KantineEntregasbot?start=cadastro')
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-300 hover:bg-neutral-100 text-neutral-800 font-semibold text-xs transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Abrir Bot</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: DIRECT (Convite Direto por WhatsApp) */}
            {inviteModalTab === 'DIRECT' && (
              <div className="pt-4 space-y-4">
                <form onSubmit={handleCreateInvite} className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-neutral-800 mb-1">
                        Nome do Motorista (Opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Carlos Silva"
                        value={inviteFormData.name}
                        onChange={(e) =>
                          setInviteFormData({ ...inviteFormData, name: e.target.value })
                        }
                        className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:ring-2 focus:ring-orange-500 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-800 mb-1">
                        Telefone / WhatsApp com DDD
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: (34) 99999-1234 ou 34999991234"
                        value={inviteFormData.phone}
                        onChange={(e) =>
                          setInviteFormData({ ...inviteFormData, phone: e.target.value })
                        }
                        className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:ring-2 focus:ring-orange-500 font-medium"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                      Tipo(s) de Veículo Sugerido(s) <span className="font-normal text-neutral-500">(Opcional - selecione 1, 2 ou todos)</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {VEHICLE_OPTIONS.map((opt) => {
                        const isChecked = inviteFormData.vehicle_types.includes(opt.type);
                        return (
                          <button
                            key={opt.type}
                            type="button"
                            onClick={() => {
                              let updated: VehicleType[];
                              if (isChecked) {
                                if (inviteFormData.vehicle_types.length <= 1) return;
                                updated = inviteFormData.vehicle_types.filter((t) => t !== opt.type);
                              } else {
                                updated = [...inviteFormData.vehicle_types, opt.type];
                              }
                              setInviteFormData({
                                ...inviteFormData,
                                vehicle_types: updated,
                                vehicle_type: updated.join(','),
                              });
                            }}
                            className={`flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-lg border transition cursor-pointer ${
                              isChecked
                                ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                                : 'bg-neutral-50 text-neutral-600 border-neutral-300 hover:bg-neutral-100'
                            }`}
                          >
                            <span>{opt.icon}</span>
                            <span>{opt.label}</span>
                            {isChecked && <Check className="w-3.5 h-3.5 text-white ml-auto" />}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[11px] text-neutral-500">
                      <span>Selecionados: <strong className="text-neutral-800">{getVehicleTypeLabel(inviteFormData.vehicle_type)}</strong></span>
                      <button
                        type="button"
                        onClick={() => {
                          const all: VehicleType[] = ['CAR', 'MOTO', 'MOTO_WITH_BAG'];
                          setInviteFormData({
                            ...inviteFormData,
                            vehicle_types: all,
                            vehicle_type: all.join(','),
                          });
                        }}
                        className="text-orange-600 hover:underline font-medium text-[11px] cursor-pointer"
                      >
                        Selecionar Todos (3)
                      </button>
                    </div>
                  </div>

                  <div className="pt-1 flex items-center justify-end">
                    <button
                      type="submit"
                      disabled={generatingInvite}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-600/20 transition-all disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{generatingInvite ? 'Gerando...' : 'Gerar Convite & Link Exclusivo'}</span>
                    </button>
                  </div>
                </form>

                {/* Exibição do Convite Gerado */}
                {generatedInvite && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-3 mt-4 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-xs text-emerald-900">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        <span>Convite Gerado com Sucesso!</span>
                      </div>
                      <span className="font-mono text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                        {generatedInvite.invitation.token}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-emerald-950">
                        Link de Acesso Direto com Token:
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={generatedInvite.inviteLink}
                          className="w-full px-3 py-2 text-xs font-mono bg-white border border-emerald-300 rounded-lg text-neutral-800 select-all"
                        />
                        <button
                          type="button"
                          onClick={() => copyToClipboard(generatedInvite.inviteLink, 'gen_link')}
                          className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs shrink-0 flex items-center gap-1"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>{copiedKey === 'gen_link' ? 'Copiado!' : 'Copiar'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="pt-2 flex flex-wrap items-center gap-2">
                      {inviteFormData.phone && (
                        <a
                          href={`https://wa.me/55${inviteFormData.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                            `Olá ${inviteFormData.name ? inviteFormData.name : ''}! A Kantine Delivery convida você para se cadastrar como nosso motorista parceiro. 🚀 Conclua seu cadastro direto pelo Telegram no link: ${generatedInvite.inviteLink}`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Enviar WhatsApp para o Motorista</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(
                            `Olá ${inviteFormData.name ? inviteFormData.name : ''}! A Kantine Delivery convida você para se cadastrar como nosso motorista parceiro. 🚀 Conclua seu cadastro direto pelo Telegram no link: ${generatedInvite.inviteLink}`,
                            'gen_msg'
                          )
                        }
                        className="px-3 py-2 rounded-lg border border-emerald-300 bg-white hover:bg-emerald-100 text-emerald-900 font-semibold text-xs transition-colors"
                      >
                        {copiedKey === 'gen_msg' ? 'Mensagem Copiada!' : 'Copiar Mensagem Completa'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: HISTORY (Histórico de Convites) */}
            {inviteModalTab === 'HISTORY' && (
              <div className="pt-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-neutral-500 font-medium">
                  <span>Convites gerados para conclusão de cadastro no Telegram</span>
                  <button
                    onClick={fetchInvitations}
                    className="flex items-center gap-1 text-orange-600 hover:underline font-bold"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingInvitations ? 'animate-spin' : ''}`} />
                    <span>Atualizar</span>
                  </button>
                </div>

                <div className="max-h-72 overflow-y-auto border border-neutral-200 rounded-xl divide-y divide-neutral-100">
                  {loadingInvitations ? (
                    <div className="p-8 text-center text-xs text-neutral-400">
                      Carregando convites...
                    </div>
                  ) : invitationsList.length === 0 ? (
                    <div className="p-8 text-center text-xs text-neutral-400">
                      Nenhum convite emitido até o momento.
                    </div>
                  ) : (
                    invitationsList.map((inv) => {
                      const botUser = telegramStatus?.botUsername || 'KantineEntregasbot';
                      const link = `https://t.me/${botUser}?start=${inv.token}`;
                      return (
                        <div key={inv.id} className="p-3 hover:bg-neutral-50 transition-colors flex items-center justify-between gap-3 text-xs">
                          <div className="space-y-0.5">
                            <div className="font-bold text-neutral-900 flex items-center gap-2">
                              <span>{inv.name || 'Motorista Convidado'}</span>
                              {inv.status === 'PENDING' && (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  PENDENTE NO TELEGRAM
                                </span>
                              )}
                              {inv.status === 'COMPLETED' && (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  CADASTRO CONCLUÍDO ✅
                                </span>
                              )}
                              {inv.status === 'CANCELLED' && (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-neutral-100 text-neutral-500 border border-neutral-200">
                                  CANCELADO
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-neutral-500 font-mono flex items-center gap-2">
                              <span>{inv.phone || 'Sem telefone'}</span>
                              <span>•</span>
                              <span>Token: {inv.token}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {inv.phone && inv.status === 'PENDING' && (
                              <a
                                href={`https://wa.me/55${inv.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                                  `Olá ${inv.name || ''}! Conclua seu cadastro na Kantine Delivery pelo link oficial do Telegram: ${link}`
                                )}`}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px]"
                                title="Reenviar pelo WhatsApp"
                              >
                                WhatsApp
                              </a>
                            )}
                            <button
                              onClick={() => copyToClipboard(link, `hist_${inv.id}`)}
                              className="px-2 py-1 rounded-md border border-neutral-300 hover:bg-neutral-100 text-neutral-700 font-semibold text-[10px]"
                            >
                              {copiedKey === `hist_${inv.id}` ? 'Copiado!' : 'Copiar Link'}
                            </button>
                            {inv.status === 'PENDING' && (
                              <button
                                onClick={() => handleConvertToDriver(inv.id)}
                                disabled={actionLoadingId === inv.id}
                                className="px-2 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title="Converter convite em cadastro pendente de aprovação"
                              >
                                <span>⚡ Pré-Cadastrar</span>
                              </button>
                            )}
                            {inv.status === 'PENDING' && (
                              <button
                                onClick={() => handleCancelInvite(inv.id)}
                                className="px-2 py-1 rounded-md text-rose-600 hover:bg-rose-50 font-semibold text-[10px]"
                              >
                                Cancelar
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="pt-4 border-t border-neutral-200 mt-5 flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowInviteModal(false);
                  setGeneratedInvite(null);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: RESETAR MOTORISTAS E HISTÓRICO                          */}
      {/* ============================================================== */}
      {showResetSystemModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-neutral-200">
            <div className="flex items-center gap-3 pb-3 border-b border-neutral-200">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900">
                  Limpar Motoristas e Histórico
                </h3>
                <p className="text-xs text-neutral-500">
                  Reiniciar testes do zero no Telegram Kantine Entregas
                </p>
              </div>
            </div>

            <div className="py-4 space-y-3 text-xs text-neutral-600">
              <p>
                Esta ação vai eliminar permanentemente:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-neutral-700 font-medium">
                <li>Todos os motoristas cadastrados (produção e desenvolvimento)</li>
                <li>Todos os convites e links de indicação pendentes ou usados</li>
                <li>Todas as rotas, paradas e eventos operacionais</li>
                <li>Sessões ativas no bot do Telegram (@KantineEntregasbot)</li>
              </ul>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                ℹ️ Isso permite recadastrar o mesmo número de celular ou usuário no Telegram sem qualquer conflito ou erro de histórico remanescente.
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-200 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={resettingSystem}
                onClick={() => setShowResetSystemModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-700 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={resettingSystem}
                onClick={handleResetSystemHistory}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {resettingSystem ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Limpando...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirmar e Limpar Tudo</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: CONFIGURAÇÃO BOT TELEGRAM                               */}
      {/* ============================================================== */}
      {showBotModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-neutral-200">
            <div className="flex items-start justify-between pb-3 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-neutral-950">
                  Configurar Bot Telegram
                </h3>
              </div>
              <button
                onClick={() => setShowBotModal(false)}
                className="text-neutral-400 hover:text-neutral-700 text-xl font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfigureBotToken} className="pt-4 space-y-4">
              <p className="text-xs text-neutral-600 leading-relaxed">
                Insira o token fornecido pelo <strong>@BotFather</strong>. O token
                é transmitido com segurança diretamente para o processo server-side
                (long polling) e <strong>nunca</strong> é registrado em logs.
              </p>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  TELEGRAM_BOT_TOKEN
                </label>
                <input
                  type="password"
                  placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  required
                />
              </div>

              <div className="pt-2 border-t border-neutral-100">
                <label className="block text-xs font-semibold text-neutral-700 mb-1 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-neutral-500" />
                  Chave Administrativa (Opcional se logado com Google)
                </label>
                <input
                  type="password"
                  placeholder="Somente se configurada no servidor (ADMIN_API_KEY)"
                  value={adminKey}
                  onChange={(e) => {
                    setAdminKey(e.target.value);
                    localStorage.setItem('kantine_admin_key', e.target.value);
                    setUseAdminKey(true);
                  }}
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowBotModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={tokenSaving}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white transition-colors disabled:opacity-50"
                >
                  {tokenSaving ? 'Conectando...' : 'Salvar e Iniciar Bot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
