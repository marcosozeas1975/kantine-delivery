import React, { useState, useEffect } from 'react';
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

interface Driver {
  id: number;
  telegram_user_id: string;
  telegram_chat_id: string;
  name: string;
  phone: string;
  vehicle_type: VehicleType;
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

interface Route {
  id: number;
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
  const [adminKey, setAdminKey] = useState<string>(() => {
    return localStorage.getItem('kantine_admin_key') || '';
  });
  const [useAdminKey, setUseAdminKey] = useState<boolean>(() => {
    return !!localStorage.getItem('kantine_admin_key');
  });

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
  const [submittingResolution, setSubmittingResolution] = useState<boolean>(false);

  // M4.1 Parte C: Gestão de Pagamentos das Rotas (💰 PAGAMENTOS)
  const [paymentsData, setPaymentsData] = useState<PaymentsDataResponse | null>(null);
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'PENDING' | 'PAID'>('ALL');
  const [selectedDriverFilter, setSelectedDriverFilter] = useState<number | null>(null);
  const [paymentSearch, setPaymentSearch] = useState<string>('');
  const [loadingPayments, setLoadingPayments] = useState<boolean>(false);
  const [payingRoute, setPayingRoute] = useState<{ route: Route; driver: Driver | null } | null>(null);
  const [paymentMethodInput, setPaymentMethodInput] = useState<string>('PIX');
  const [paymentReferenceInput, setPaymentReferenceInput] = useState<string>('');
  const [paymentNoteInput, setPaymentNoteInput] = useState<string>('');
  const [submittingPayment, setSubmittingPayment] = useState<boolean>(false);

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
  const [editFormData, setEditFormData] = useState({
    name: '',
    phone: '',
    vehicle_type: 'CAR' as VehicleType,
    pix_key_type: 'CPF' as 'CPF' | 'PHONE' | 'EMAIL' | 'RANDOM',
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
    vehicle_type: VehicleType;
  }>({
    name: '',
    phone: '',
    vehicle_type: 'CAR',
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
  const [routeFilter, setRouteFilter] = useState<'ALL' | RouteStatus>('ALL');
  const [loadingRoutes, setLoadingRoutes] = useState<boolean>(true);
  const [showCreateRouteModal, setShowCreateRouteModal] = useState<boolean>(false);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [selectedRouteDetails, setSelectedRouteDetails] = useState<RouteDetails | null>(null);
  const [loadingRouteDetails, setLoadingRouteDetails] = useState<boolean>(false);

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

  // New Route Form State (M2.1 Seção 23 + M4.2)
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
  }

  const [newRoute, setNewRoute] = useState<{
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
    pickup_type: 'REGISTERED',
    pickup_location_id: 1,
    pickup_name: '',
    pickup_address: '',
    pickup_neighborhood: '',
    final_deadline: '18:00',
    total_fee: '35,00',
    override_driver_fee: '',
    override_reason: '',
    accepted_vehicle_types: [
      'CAR',
      'MOTO',
      'MOTO_WITH_BAG',
    ],
    stops: [
      {
        destination_address: 'Av. Rondon Pacheco, 1000',
        destination_neighborhood: 'Santa Mônica',
        neighborhood_id: null,
        modality_code: 'BOLO',
        pricing_vehicle_category: 'CAR',
        customer_freight: '38,50',
        cargo_description: '2x Caixa de Tortas',
        delivery_mode: 'IN_PERSON',
        desired_deadline: '16:30',
        observations: '',
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
    });
    return () => unsubscribe();
  }, []);

  const getAuthHeaders = async (): Promise<HeadersInit> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (useAdminKey && adminKey.trim()) {
      headers['x-admin-key'] = adminKey.trim();
      return headers;
    }

    if (currentUser) {
      const token = await currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
      return headers;
    }

    // Default internal fallback for local dev
    headers['x-admin-key'] = 'kantine-admin-secure-key-2026';
    return headers;
  };

  const fetchDrivers = async () => {
    setLoadingDrivers(true);
    try {
      const headers = await getAuthHeaders();
      let url = '/api/admin/drivers';
      if (
        driverFilter === 'PENDING' ||
        driverFilter === 'ACTIVE' ||
        driverFilter === 'BLOCKED' ||
        driverFilter === 'EXCLUDED'
      ) {
        url = `/api/admin/drivers?status=${driverFilter}`;
      }
      const res = await fetch(url, { headers });

      if (res.ok) {
        let data: Driver[] = await res.json();
        if (driverFilter === 'REACTIVATION_REQUESTED') {
          data = data.filter((d) => d.reactivation_requested);
        } else if (driverFilter === 'REINCLUSION_REQUESTED') {
          data = data.filter((d) => d.reinclusion_requested);
        }
        setDrivers(data);
      }
    } catch (err: any) {
      console.error('Error fetching drivers', err);
    } finally {
      setLoadingDrivers(false);
    }
  };

  const fetchPickupLocations = async () => {
    setLoadingLocations(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/pickup-locations', { headers });
      if (res.ok) {
        const data = await res.json();
        setPickupLocations(data);
        if (data.length > 0 && !newRoute.pickup_location_id) {
          setNewRoute((prev) => ({ ...prev, pickup_location_id: data[0].id }));
        }
      }
    } catch (err: any) {
      console.error('Error fetching pickup locations', err);
    } finally {
      setLoadingLocations(false);
    }
  };

  const fetchRoutes = async () => {
    setLoadingRoutes(true);
    try {
      const headers = await getAuthHeaders();
      const url =
        routeFilter === 'ALL'
          ? '/api/admin/routes'
          : `/api/admin/routes?status=${routeFilter}`;
      const res = await fetch(url, { headers });

      if (res.ok) {
        const data = await res.json();
        setRoutesList(data);
      }
    } catch (err: any) {
      console.error('Error fetching routes', err);
    } finally {
      setLoadingRoutes(false);
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
      const res = await fetch('/api/admin/driver-invitations', { headers });
      if (res.ok) {
        const data = await res.json();
        setInvitationsList(data.invitations || []);
        if (data.defaultInviteLink) {
          setDefaultInviteLink(data.defaultInviteLink);
        }
      }
    } catch (err: any) {
      console.error('Error fetching driver invitations', err);
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
  const fetchReferrals = async () => {
    setLoadingReferrals(true);
    try {
      const headers = await getAuthHeaders();
      let url = '/api/admin/referrals';
      const params = new URLSearchParams();
      if (referralFilter !== 'ALL') params.set('status', referralFilter);
      if (referralSearch) params.set('search', referralSearch);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        setReferralsList(data);
      }
    } catch (err: any) {
      console.error('Failed to fetch referrals', err);
    } finally {
      setLoadingReferrals(false);
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
  const fetchIncidents = async () => {
    setLoadingIncidents(true);
    try {
      const headers = await getAuthHeaders();
      let url = '/api/admin/incidents';
      const params = new URLSearchParams();
      if (incidentResolutionFilter !== 'ALL') params.set('resolution_status', incidentResolutionFilter);
      if (incidentSearch) params.set('search', incidentSearch);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        setIncidentsList(data);
      }
    } catch (err: any) {
      console.error('Failed to fetch incidents', err);
    } finally {
      setLoadingIncidents(false);
    }
  };

  const handleOpenResolveIncidentModal = (item: OperationalIncidentItem) => {
    setResolvingStop(item);
    setSelectedResolutionType('RETURN_TO_ORIGIN');
    setResolutionNoteInput('');
  };

  const handleConfirmResolveIncident = async () => {
    if (!resolvingStop) return;
    setSubmittingResolution(true);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/stops/${resolvingStop.stop.id}/resolve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          resolution_type: selectedResolutionType,
          resolution_note: resolutionNoteInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao resolver incidente');
      setSuccessMessage('✅ Incidente resolvido com sucesso! A destinação da encomenda foi registrada.');
      setResolvingStop(null);
      await fetchIncidents();
      await fetchRoutes();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmittingResolution(false);
    }
  };

  // ==========================================
  // M4.1 PARTE C: Gestão de Pagamentos das Rotas (💰 PAGAMENTOS) Handlers
  // ==========================================
  const fetchPayments = async () => {
    setLoadingPayments(true);
    try {
      const headers = await getAuthHeaders();
      let url = '/api/admin/payments';
      const params = new URLSearchParams();
      if (paymentFilter !== 'ALL') params.set('payment_status', paymentFilter);
      if (selectedDriverFilter) params.set('driver_id', String(selectedDriverFilter));
      if (paymentSearch) params.set('search', paymentSearch);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        setPaymentsData(data);
      }
    } catch (err: any) {
      console.error('Failed to fetch payments data', err);
    } finally {
      setLoadingPayments(false);
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

  // ==========================================
  // M4.1 PARTE A: Auditoria de Veículos dos Indicados Handlers
  // ==========================================
  const fetchVehicleAudit = async () => {
    setLoadingVehicleAudit(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/drivers/referral-vehicle-audit', { headers });
      if (res.ok) {
        const data = await res.json();
        setVehicleAuditList(data);
      }
    } catch (err: any) {
      console.error('Failed to fetch vehicle audit', err);
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

  useEffect(() => {
    fetchDrivers();
    fetchPickupLocations();
    fetchRoutes();
    fetchTelegramStatus();
    fetchInvitations();
    fetchReferrals();
    fetchIncidents();
    fetchPayments();
    fetchVehicleAudit();
  }, [
    driverFilter,
    routeFilter,
    referralFilter,
    incidentResolutionFilter,
    paymentFilter,
    selectedDriverFilter,
    currentUser,
    useAdminKey,
    adminKey,
  ]);

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
    setInviteFormData({
      name: driver.name,
      phone: driver.phone,
      vehicle_type: 'CAR',
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
    setEditFormData({
      name: driver.name,
      phone: driver.phone,
      vehicle_type: driver.vehicle_type,
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

  const handleUpdateStopField = (index: number, field: keyof FormStop, value: string) => {
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

  const handleCancelRoute = async (routeId: number) => {
    if (!confirm(`Tem certeza que deseja cancelar a Rota #${routeId}?`)) return;

    setCancellingId(routeId);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/routes/${routeId}/cancel`, {
        method: 'POST',
        headers,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao cancelar rota.');
      }

      setSuccessMessage(`Rota #${routeId} cancelada com sucesso.`);
      await fetchRoutes();
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
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/routes/${routeId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSelectedRouteDetails(data);
      }
    } catch (e) {
      console.error(e);
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
        const res = await fetch(`/api/telegram/file-url/${encodeURIComponent(proofReference)}`);
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

  return (
    <div className="min-h-screen text-neutral-900 pb-16 font-sans">
      {/* ============================================================== */}
      {/* HEADER                                                         */}
      {/* ============================================================== */}
      <header className="border-b border-neutral-200/80 bg-white/90 backdrop-blur sticky top-0 z-30 shadow-xs">
        <div className="w-full px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-neutral-200/90 flex items-center justify-center p-1.5 shadow-sm shadow-neutral-900/5 hover:border-neutral-300 transition-all shrink-0">
              <KantineLogo className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-neutral-950">
                  Kantine Delivery
                </h1>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                  M2.1 Multi-Paradas
                </span>
              </div>
              <p className="text-xs text-neutral-500 font-medium">
                Uberlândia • Painel Administrativo de Rotas e Motoristas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Telegram Bot status badge */}
            <button
              onClick={() => setShowBotModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all bg-white hover:bg-neutral-50 shadow-xs"
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
                  <LogOut className="w-4 h-4" />
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
        <div className="w-full px-4 sm:px-6 flex items-center gap-2 border-t border-neutral-100 pt-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('ROUTES')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs sm:text-sm font-bold transition-colors ${
              activeTab === 'ROUTES'
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Rotas de Entrega</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-200 text-neutral-700">
              {routesList.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('LOCATIONS')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs sm:text-sm font-bold transition-colors ${
              activeTab === 'LOCATIONS'
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Pontos de Coleta</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-200 text-neutral-700">
              {pickupLocations.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('DRIVERS')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs sm:text-sm font-bold transition-colors ${
              activeTab === 'DRIVERS'
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Motoristas</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-200 text-neutral-700">
              {drivers.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('REFERRALS');
              fetchReferrals();
            }}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs sm:text-sm font-bold transition-colors ${
              activeTab === 'REFERRALS'
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Indicações (M1.2)</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-200 text-neutral-700">
              {referralsList.length}
            </span>
            {referralsList.filter((r) => r.status === 'PENDING_REVIEW').length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Há indicações pendentes de análise"></span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('INCIDENTS');
              fetchIncidents();
            }}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs sm:text-sm font-bold transition-colors ${
              activeTab === 'INCIDENTS'
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>Pendências (M4.1)</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                incidentsList.filter((i) => (i.stop.incident_resolution_status || 'OPEN') === 'OPEN').length > 0
                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                  : 'bg-neutral-200 text-neutral-700'
              }`}
            >
              {incidentsList.filter((i) => (i.stop.incident_resolution_status || 'OPEN') === 'OPEN').length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('PAYMENTS');
              fetchPayments();
            }}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs sm:text-sm font-bold transition-colors ${
              activeTab === 'PAYMENTS'
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <span>Pagamentos (M4.1)</span>
            {paymentsData?.summary.pendingRoutesCount ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-300">
                {paymentsData.summary.pendingRoutesCount}
              </span>
            ) : null}
          </button>
        </div>
      </header>

      {/* ============================================================== */}
      {/* GLOBAL TOAST ALERTS                                            */}
      {/* ============================================================== */}
      {errorMessage && (
        <div className="w-full px-4 sm:px-6 mt-4">
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
        <div className="w-full px-4 sm:px-6 mt-4">
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
        <main id="main-content" className="w-full px-4 sm:px-6 mt-6 space-y-6">
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
                {(['ALL', 'DRAFT', 'OFFERED', 'ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setRouteFilter(filter)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      routeFilter === filter
                        ? 'bg-neutral-900 text-white shadow-xs'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {filter === 'ALL' && 'Todas as Rotas'}
                    {filter === 'DRAFT' && '📝 Rascunhos'}
                    {filter === 'OFFERED' && '🚀 Em Oferta'}
                    {filter === 'ACCEPTED' && '✅ Aceitas'}
                    {filter === 'ARRIVED_PICKUP' && '📍 Na Coleta'}
                    {filter === 'PICKED_UP' && '📦 Coletadas'}
                    {filter === 'IN_TRANSIT' && '🛵 Em Rota'}
                    {filter === 'COMPLETED' && '🏁 Concluídas'}
                    {filter === 'CANCELLED' && '❌ Canceladas'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                onClick={fetchRoutes}
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
                <thead className="bg-neutral-50/80 border-b border-neutral-200 text-neutral-600 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">ID / Status</th>
                    <th className="px-4 py-3">Ponto de Coleta</th>
                    <th className="px-4 py-3">Paradas / Entregas</th>
                    <th className="px-4 py-3 whitespace-nowrap">Prazo Final</th>
                    <th className="px-4 py-3 whitespace-nowrap">Frete Total</th>
                    <th className="px-4 py-3 whitespace-nowrap">Veículos Aceitos</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {loadingRoutes ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-neutral-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-neutral-400" />
                        Carregando rotas...
                      </td>
                    </tr>
                  ) : routesList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-neutral-400">
                        Nenhuma rota encontrada para este filtro.
                      </td>
                    </tr>
                  ) : (
                    routesList.map((route) => {
                      const stopsCount = route.stops?.length || 1;
                      const stopsSummary = route.stops
                        ? route.stops.map((s) => s.destination_neighborhood).join(' → ')
                        : '1 parada';

                      return (
                        <tr key={route.id} className="hover:bg-neutral-50/50 transition-colors">
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="font-mono font-bold text-sm text-neutral-900">
                              #{route.id}
                            </div>
                            <div className="mt-1">
                              {route.status === 'DRAFT' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  RASCUNHO
                                </span>
                              )}
                              {route.status === 'OFFERED' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                  EM OFERTA
                                </span>
                              )}
                              {route.status === 'ACCEPTED' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                  ACEITA
                                </span>
                              )}
                              {route.status === 'ARRIVED_PICKUP' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                                  📍 NA COLETA
                                </span>
                              )}
                              {route.status === 'PICKED_UP' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  📦 COLETADA
                                </span>
                              )}
                              {route.status === 'IN_TRANSIT' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                  🛵 EM ROTA
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
                            </div>
                          </td>

                          <td className="px-4 py-3.5 max-w-[220px] 2xl:max-w-[280px]">
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

                          <td className="px-4 py-3.5 max-w-[220px] 2xl:max-w-[280px]">
                            <div className="flex items-center gap-1.5 font-bold text-neutral-900">
                              <Package className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                              <span>{stopsCount} {stopsCount === 1 ? 'Parada' : 'Paradas'}</span>
                            </div>
                            <div className="text-[11px] text-neutral-500 font-medium truncate mt-0.5">
                              {stopsSummary}
                            </div>
                          </td>

                          <td className="px-4 py-3.5 font-semibold text-neutral-800 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-neutral-400" />
                              <span>{route.final_deadline}</span>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="font-bold text-sm text-emerald-700">
                              R$ {route.total_fee}
                            </span>
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {renderCompactVehicleBadges(route.accepted_vehicle_types)}
                          </td>

                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                              <button
                                onClick={() => openRouteDetails(route.id)}
                                className="px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-100 text-neutral-700 text-[11px] font-bold transition-colors whitespace-nowrap"
                              >
                                Detalhes
                              </button>

                              {/* M4.4: Botão Editar (A1) */}
                              {['DRAFT', 'OFFERED', 'ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT'].includes(route.status) ? (
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

                              {(route.status === 'DRAFT' || route.status === 'OFFERED') && (
                                <button
                                  onClick={() => handleCancelRoute(route.id)}
                                  disabled={cancellingId === route.id}
                                  className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold transition-colors whitespace-nowrap"
                                >
                                  Cancelar
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
        <main id="main-content" className="w-full px-4 sm:px-6 mt-6 space-y-6">
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
        <main id="main-content" className="w-full px-4 sm:px-6 mt-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/80 backdrop-blur p-4 rounded-2xl border border-neutral-200 shadow-xs">
            <div>
              <h2 className="text-base font-bold text-neutral-950 flex items-center gap-2">
                <span>Motoristas Cadastrados (Telegram & App)</span>
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {(
                  [
                    { key: 'ALL', label: 'Todos' },
                    { key: 'PENDING', label: '⏳ Aguardando Aprovação' },
                    { key: 'ACTIVE', label: '✅ Ativos' },
                    { key: 'BLOCKED', label: '🚫 Bloqueados' },
                    { key: 'EXCLUDED', label: '📁 Excluídos (Processo Zerado)' },
                    { key: 'REACTIVATION_REQUESTED', label: '🔄 Pedidos Reativação' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setDriverFilter(item.key as any)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      driverFilter === item.key
                        ? 'bg-neutral-900 text-white shadow-xs'
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
                onClick={fetchDrivers}
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
                    return (
                      <tr key={driver.id} className="hover:bg-neutral-50/50 transition-colors">
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
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-100 text-neutral-800 font-medium text-[11px] border border-neutral-200">
                            <span>{VEHICLE_DISPLAY[driver.vehicle_type]?.icon}</span>
                            <span>{VEHICLE_DISPLAY[driver.vehicle_type]?.label || driver.vehicle_type}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="space-y-1">
                            {driver.status === 'ACTIVE' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                ATIVO
                              </span>
                            )}
                            {driver.status === 'PENDING' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                PENDENTE
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
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
                              >
                                Aprovar
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
        <main id="main-content" className="w-full px-4 sm:px-6 mt-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/80 backdrop-blur p-4 rounded-2xl border border-neutral-200 shadow-xs">
            <div>
              <h2 className="text-base font-bold text-neutral-950 flex items-center gap-2">
                <span>Indicações de Motoristas (Rede Fechada M1.2)</span>
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {(
                  [
                    { key: 'ALL', label: 'Todas' },
                    { key: 'PENDING_REVIEW', label: '⏳ Em Análise' },
                    { key: 'APPROVED', label: '✅ Aprovadas' },
                    { key: 'INVITE_USED', label: '📲 Cadastro Realizado' },
                    { key: 'REJECTED', label: '🚫 Não Aprovadas' },
                    { key: 'EXPIRED', label: '⌛ Expiradas' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setReferralFilter(f.key as any)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      referralFilter === f.key
                        ? 'bg-neutral-900 text-white shadow-xs'
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
                onClick={fetchReferrals}
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
                    return (
                      <tr key={ref.id} className="hover:bg-neutral-50/50 transition-colors">
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
                              <div className="text-[11px] text-neutral-500 flex items-center gap-1">
                                <span>{VEHICLE_DISPLAY[ref.referred_by_driver.vehicle_type]?.icon}</span>
                                <span>{VEHICLE_DISPLAY[ref.referred_by_driver.vehicle_type]?.label}</span>
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
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              ref.status === 'PENDING_REVIEW'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : ref.status === 'APPROVED'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : ref.status === 'INVITE_USED'
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : ref.status === 'REJECTED'
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                            }`}
                          >
                            {ref.status === 'PENDING_REVIEW' && 'EM ANÁLISE'}
                            {ref.status === 'APPROVED' && 'APROVADA — CONVITE ATIVO'}
                            {ref.status === 'INVITE_USED' && 'CADASTRO REALIZADO'}
                            {ref.status === 'REJECTED' && 'NÃO APROVADA'}
                            {ref.status === 'EXPIRED' && 'CONVITE EXPIRADO'}
                          </span>
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
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-xs transition-colors flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" />
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
        <main id="main-content" className="w-full px-4 sm:px-6 mt-6 space-y-6">
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
                    { key: 'OPEN', label: '🔴 Não Resolvidas' },
                    { key: 'RESOLVED', label: '🟢 Resolvidas' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setIncidentResolutionFilter(f.key as any)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      incidentResolutionFilter === f.key
                        ? 'bg-neutral-900 text-white shadow-xs'
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
                onClick={fetchIncidents}
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
                      <tr key={item.stop.id} className="hover:bg-neutral-50/60 transition-colors">
                        <td className="px-4 py-3 font-semibold text-neutral-900">
                          <div className="font-mono text-sm text-neutral-950 font-bold">
                            Rota #{item.route.id}
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
                            <span className="text-neutral-400">Não informado</span>
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
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                <span>🔴</span>
                                <span>NÃO RESOLVIDO</span>
                              </span>
                              <div className="text-[11px] text-rose-600 font-medium mt-1">
                                Encomenda retida aguardando destino
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenResolveIncidentModal(item)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-xs ${
                              isResolved
                                ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                                : 'bg-orange-600 hover:bg-orange-700 text-white'
                            }`}
                          >
                            {isResolved ? 'Alterar Resolução' : 'Resolver'}
                          </button>
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
        <main id="main-content" className="w-full px-4 sm:px-6 mt-6 space-y-6">
          {/* Header & KPI Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white border border-amber-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">A Pagar (Pendente)</span>
                <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600 font-bold">🟡</span>
              </div>
              <div className="text-2xl font-bold text-neutral-950 mt-2 font-mono">
                R$ {paymentsData ? paymentsData.summary.totalPendingAmount.toFixed(2).replace('.', ',') : '0,00'}
              </div>
              <div className="text-[11px] text-amber-700 font-semibold mt-1">
                {paymentsData?.summary.pendingRoutesCount || 0} rotas aguardando repasse
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
                    { key: 'PENDING', label: '🟡 Pendentes de Repasse' },
                    { key: 'PAID', label: '🟢 Repassadas (Pagas)' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setPaymentFilter(f.key as any)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      paymentFilter === f.key
                        ? 'bg-neutral-900 text-white shadow-xs'
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
                  onClick={fetchPayments}
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
                    <th className="px-4 py-3">Valor do Repasse</th>
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
                        <tr key={route.id} className="hover:bg-neutral-50/60 transition-colors">
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

                          <td className="px-4 py-3 font-mono text-sm font-bold text-neutral-950">
                            R$ {route.total_fee}
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
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  <span>🟡</span>
                                  <span>PENDENTE DE REPASSE</span>
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
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors"
                              >
                                Registrar Pagamento
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

            {/* Nota Operacional / Instruções */}
            <div>
              <label className="block font-bold text-neutral-800 text-xs mb-1">
                Observações Operacionais / Instruções da Loja:
              </label>
              <textarea
                rows={3}
                placeholder="Ex: Motorista avisado para retornar à Kantine Matriz com o bolo até as 19h..."
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
                <span className="text-neutral-600">Valor a Transferir:</span>
                <span className="font-mono text-lg font-bold text-emerald-900">
                  R$ {payingRoute.route.total_fee}
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
                            <div className="text-[11px] text-neutral-500 flex items-center gap-1">
                              <span>{VEHICLE_DISPLAY[item.indicator_vehicle_type]?.icon}</span>
                              <span>{VEHICLE_DISPLAY[item.indicator_vehicle_type]?.label}</span>
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-neutral-100 text-neutral-800 border border-neutral-200">
                            <span>{VEHICLE_DISPLAY[item.vehicle_type]?.icon}</span>
                            <span>{VEHICLE_DISPLAY[item.vehicle_type]?.label || item.vehicle_type}</span>
                          </span>
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
                    <span>Prazo Final da Rota (Obrigatório)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 18:00 ou 19:30"
                    value={newRoute.final_deadline}
                    onChange={(e) => setNewRoute({ ...newRoute, final_deadline: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:ring-2 focus:ring-orange-500 font-semibold"
                    required
                  />
                  <p className="text-[10px] text-neutral-500 mt-1">
                    Horário máximo desejado para conclusão de todas as entregas.
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
                  <p className="text-[10px] text-neutral-500 mt-1">
                    Frete único pago pela rota completa com todas as paradas.
                  </p>
                </div>
              </div>

              {/* Veículos Aceitos (Seção 18) */}
              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                  🚗 Veículos Aceitáveis para esta Rota
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {VEHICLE_OPTIONS.map((opt) => {
                    const checked = newRoute.accepted_vehicle_types.includes(opt.type);
                    return (
                      <label
                        key={opt.type}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                          checked
                            ? 'border-orange-500 bg-orange-50/50 text-neutral-900 font-bold'
                            : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleVehicleType(opt.type)}
                          className="accent-orange-600 rounded"
                        />
                        <span>{opt.icon}</span>
                        <span className="truncate">{opt.label}</span>
                      </label>
                    );
                  })}
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
                          <input
                            type="text"
                            placeholder="Endereço de Destino (Rua, Número)"
                            value={stop.destination_address}
                            onChange={(e) => handleUpdateStopField(idx, 'destination_address', e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
                            required
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="Bairro"
                            value={stop.destination_neighborhood}
                            onChange={(e) => handleUpdateStopField(idx, 'destination_neighborhood', e.target.value)}
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
                    </div>
                  ))}
                </div>
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
              <div className="flex justify-between items-center border-b border-orange-200/60 pb-2">
                <span className="font-bold text-sm text-neutral-950 font-mono">
                  ROTA #{routeToPublish.id}
                </span>
                <span className="font-bold text-sm text-emerald-700">
                  Frete Total: R$ {routeToPublish.total_fee}
                </span>
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
                  {routeToPublish.stops?.map((s, idx) => (
                    <div key={s.id || idx} className="flex items-start gap-2 bg-white p-2 rounded border border-neutral-200/80">
                      <span className="font-bold text-orange-600">{idx + 1} —</span>
                      <div className="flex-1">
                        <span className="font-bold text-neutral-900">{s.destination_neighborhood}</span>
                        <span className="text-neutral-500 text-[11px] block">{s.cargo_description}</span>
                        {s.desired_deadline && (
                          <span className="text-amber-700 font-semibold text-[10px] block">
                            ⏱️ Desejável: {s.desired_deadline}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
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
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-xl border border-neutral-200 my-8 space-y-5">
            <div className="flex items-start justify-between pb-3 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-orange-600" />
                <div>
                  <h3 className="text-base font-bold text-neutral-950 flex items-center gap-2">
                    <span>Rota #{selectedRouteDetails.route.id}</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      selectedRouteDetails.route.status === 'COMPLETED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : selectedRouteDetails.route.status === 'IN_TRANSIT'
                        ? 'bg-blue-100 text-blue-800'
                        : selectedRouteDetails.route.status === 'PICKED_UP'
                        ? 'bg-amber-100 text-amber-800'
                        : selectedRouteDetails.route.status === 'ARRIVED_PICKUP'
                        ? 'bg-indigo-100 text-indigo-800'
                        : selectedRouteDetails.route.status === 'ACCEPTED'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-neutral-100 text-neutral-800'
                    }`}>
                      {selectedRouteDetails.route.status}
                    </span>
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {selectedRouteDetails.route.accepted_driver_id ? (
                      <span>
                        Motorista: <strong>{drivers.find((d) => d.id === selectedRouteDetails.route.accepted_driver_id)?.name || `#${selectedRouteDetails.route.accepted_driver_id}`}</strong>
                        {' '}({drivers.find((d) => d.id === selectedRouteDetails.route.accepted_driver_id)?.vehicle_type})
                      </span>
                    ) : (
                      'Nenhum motorista alocado no momento'
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {['DRAFT', 'OFFERED', 'ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT'].includes(selectedRouteDetails.route.status) ? (
                  <button
                    onClick={() => setEditingRouteId(selectedRouteDetails.route.id)}
                    className="px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs"
                    title="Editar rota (M4.4)"
                  >
                    <Pencil className="w-3.5 h-3.5 text-amber-700" />
                    <span>Editar Rota</span>
                  </button>
                ) : (
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
                )}
                <button
                  onClick={() => setSelectedRouteDetails(null)}
                  className="text-neutral-400 hover:text-neutral-700 text-xl font-semibold p-1"
                >
                  ✕
                </button>
              </div>
            </div>

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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-neutral-50 text-xs">
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
                <span className="text-neutral-500 block">Frete Total</span>
                <span className="font-bold text-emerald-700 text-sm block">R$ {selectedRouteDetails.route.total_fee}</span>
              </div>
            </div>

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
                  <span>{operationalLoading ? 'Iniciando...' : '🛵 Iniciar Rota'}</span>
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
                      <th className="px-3 py-2">Carga</th>
                      <th className="px-3 py-2">Modalidade</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Comprovante / PIN</th>
                      <th className="px-3 py-2 text-right">Ações Operacionais</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {selectedRouteDetails.route.stops?.map((stop) => (
                      <tr key={stop.id} className="hover:bg-neutral-50/50">
                        <td className="px-3 py-2.5 font-mono font-bold">{stop.sequence}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-neutral-900">{stop.destination_address}</div>
                          <div className="text-[10px] text-neutral-500">{stop.destination_neighborhood}</div>
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
                            <div className="text-[10px]">
                              <span className="text-neutral-500">PIN do Cliente: </span>
                              <strong className="font-mono bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-900 border border-neutral-200">
                                {stop.pin_code || '—'}
                              </strong>
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
                    ))}
                  </tbody>
                </table>
              </div>
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
            {selectedRouteDetails.dispatches.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider mb-2">
                  Dispatches no Telegram ({selectedRouteDetails.dispatches.length})
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
                      {selectedRouteDetails.dispatches.map((disp) => (
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
                {selectedRouteDetails.events.map((evt) => (
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

            <div className="pt-2 border-t border-neutral-200 flex justify-end">
              <button
                onClick={() => setSelectedRouteDetails(null)}
                className="px-4 py-2 font-semibold text-xs rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white transition-colors"
              >
                Fechar
              </button>
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
              <div><strong>Veículo:</strong> {VEHICLE_DISPLAY[selectedDriver.vehicle_type]?.label || selectedDriver.vehicle_type}</div>
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
                <label className="block font-semibold text-neutral-700 mb-1">
                  Tipo de Veículo
                </label>
                <select
                  value={editFormData.vehicle_type}
                  onChange={(e) => setEditFormData({ ...editFormData, vehicle_type: e.target.value as VehicleType })}
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 bg-white"
                >
                  {VEHICLE_OPTIONS.map((opt) => (
                    <option key={opt.type} value={opt.type}>
                      {opt.icon} {opt.label}
                    </option>
                  ))}
                </select>
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
                    <label className="block text-xs font-bold text-neutral-800 mb-1">
                      Tipo de Veículo Sugerido (Opcional)
                    </label>
                    <select
                      value={inviteFormData.vehicle_type}
                      onChange={(e) =>
                        setInviteFormData({
                          ...inviteFormData,
                          vehicle_type: e.target.value as VehicleType,
                        })
                      }
                      className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white focus:ring-2 focus:ring-orange-500 font-semibold"
                    >
                      {VEHICLE_OPTIONS.map((opt) => (
                        <option key={opt.type} value={opt.type}>
                          {opt.icon} {opt.label}
                        </option>
                      ))}
                    </select>
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
                  placeholder="kantine-admin-secure-key-2026"
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
