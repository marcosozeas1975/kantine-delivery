import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import {
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';

type DriverStatus = 'PENDING' | 'ACTIVE' | 'BLOCKED';
type VehicleType =
  | 'CAR_HATCH'
  | 'CAR_SEDAN'
  | 'CAR_SW'
  | 'MOTO_WITH_BAG'
  | 'MOTO_WITHOUT_BAG'
  | 'OTHER';

const VEHICLE_DISPLAY: Record<string, { label: string }> = {
  CAR_HATCH: { label: 'CARRO HATCH' },
  CAR_SEDAN: { label: 'CARRO SEDAN' },
  CAR_SW: { label: 'CARRO SW' },
  MOTO_WITH_BAG: { label: 'MOTO COM BAG' },
  MOTO_WITHOUT_BAG: { label: 'MOTO SEM BAG' },
  OTHER: { label: 'OUTRO' },
};

interface Driver {
  id: number;
  telegram_user_id: string;
  telegram_chat_id: string;
  name: string;
  phone: string;
  vehicle_type: VehicleType;
  pix_key: string;
  status: DriverStatus;
  created_at: string;
  updated_at: string;
}

interface DriverEvent {
  id: number;
  driver_id: number;
  event_type: string;
  timestamp: string;
}

// M2 Delivery Types
type DeliveryStatus = 'DRAFT' | 'OFFERED' | 'CANCELLED';
type DeliveryMode = 'IN_PERSON' | 'NO_CONTACT';

interface Delivery {
  id: number;
  pickup_location: string;
  destination_address: string;
  destination_neighborhood: string;
  cargo_description: string;
  delivery_fee: string;
  delivery_mode: DeliveryMode;
  observations: string | null;
  status: DeliveryStatus;
  created_at: string;
  offered_at: string | null;
}

interface DeliveryDispatch {
  id: number;
  delivery_id: number;
  driver_id: number;
  telegram_chat_id: string;
  status: 'SENT' | 'FAILED';
  sent_at: string;
  error_code: string | null;
}

interface DeliveryEvent {
  id: number;
  delivery_id: number;
  event_type: string;
  timestamp: string;
  actor: string | null;
}

interface DeliveryDetails {
  delivery: Delivery;
  dispatches: DeliveryDispatch[];
  events: DeliveryEvent[];
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

  // Main navigation tab: ENTREGAS (M2) vs MOTORISTAS (M1)
  const [activeTab, setActiveTab] = useState<'DELIVERIES' | 'DRIVERS'>('DELIVERIES');

  // Drivers State (M1)
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverFilter, setDriverFilter] = useState<'ALL' | DriverStatus>('ALL');
  const [loadingDrivers, setLoadingDrivers] = useState<boolean>(true);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [driverEvents, setDriverEvents] = useState<DriverEvent[]>([]);
  const [loadingDriverEvents, setLoadingDriverEvents] = useState<boolean>(false);

  // Deliveries State (M2)
  const [deliveriesList, setDeliveriesList] = useState<Delivery[]>([]);
  const [deliveryFilter, setDeliveryFilter] = useState<'ALL' | DeliveryStatus>('ALL');
  const [loadingDeliveries, setLoadingDeliveries] = useState<boolean>(true);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [selectedDeliveryDetails, setSelectedDeliveryDetails] = useState<DeliveryDetails | null>(null);
  const [loadingDeliveryDetails, setLoadingDeliveryDetails] = useState<boolean>(false);

  // Form State for New Delivery
  const [newDelivery, setNewDelivery] = useState({
    pickup_location: 'Kantine Matriz',
    destination_address: '',
    destination_neighborhood: '',
    cargo_description: '',
    delivery_fee: '',
    delivery_mode: 'IN_PERSON' as DeliveryMode,
    observations: '',
  });
  const [submittingDraft, setSubmittingDraft] = useState<boolean>(false);

  // Modal alert state for in-modal feedback
  const [modalAlert, setModalAlert] = useState<string | null>(null);

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
      const url =
        driverFilter === 'ALL'
          ? '/api/admin/drivers'
          : `/api/admin/drivers?status=${driverFilter}`;
      const res = await fetch(url, { headers });

      if (res.ok) {
        const data = await res.json();
        setDrivers(data);
      }
    } catch (err: any) {
      console.error('Error fetching drivers', err);
    } finally {
      setLoadingDrivers(false);
    }
  };

  const fetchDeliveries = async () => {
    setLoadingDeliveries(true);
    try {
      const headers = await getAuthHeaders();
      const url =
        deliveryFilter === 'ALL'
          ? '/api/admin/deliveries'
          : `/api/admin/deliveries?status=${deliveryFilter}`;
      const res = await fetch(url, { headers });

      if (res.ok) {
        const data = await res.json();
        setDeliveriesList(data);
      }
    } catch (err: any) {
      console.error('Error fetching deliveries', err);
    } finally {
      setLoadingDeliveries(false);
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

  useEffect(() => {
    fetchDrivers();
    fetchDeliveries();
    fetchTelegramStatus();
  }, [driverFilter, deliveryFilter, currentUser, useAdminKey, adminKey]);

  // Driver Actions (M1)
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

  // Delivery Actions (M2)
  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingDraft(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/deliveries', {
        method: 'POST',
        headers,
        body: JSON.stringify(newDelivery),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao criar rascunho de entrega');
      }

      const data = await res.json();
      setSuccessMessage(`Rascunho da Entrega #${data.delivery.id} criado com sucesso.`);
      setShowCreateModal(false);
      setNewDelivery({
        pickup_location: 'Kantine Matriz',
        destination_address: '',
        destination_neighborhood: '',
        cargo_description: '',
        delivery_fee: '',
        delivery_mode: 'IN_PERSON',
        observations: '',
      });
      await fetchDeliveries();
      openDeliveryDetails(data.delivery.id);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmittingDraft(false);
    }
  };

  const handlePublishDelivery = async (deliveryId: number) => {
    setPublishingId(deliveryId);
    setErrorMessage(null);
    setSuccessMessage(null);
    setModalAlert(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/deliveries/${deliveryId}/publish`, {
        method: 'POST',
        headers,
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'NO_ELIGIBLE_DRIVERS' || data.error === 'NO_ACTIVE_DRIVERS_AVAILABLE') {
          const msg = data.message || 'Nenhum motorista ativo disponível para receber esta entrega. A entrega permanece como rascunho.';
          setModalAlert(msg);
          throw new Error(msg);
        }
        if (data.error === 'DELIVERY_ALREADY_OFFERED') {
          throw new Error('Esta entrega já foi publicada anteriormente.');
        }
        throw new Error(data.message || data.error || 'Falha ao publicar entrega');
      }

      setSuccessMessage(
        `Entrega #${deliveryId} publicada com sucesso! Oferta enviada: ${data.stats?.sent || 0} sucesso, ${data.stats?.failed || 0} falha(s).`
      );
      await fetchDeliveries();
      openDeliveryDetails(deliveryId);
    } catch (err: any) {
      setErrorMessage(err.message);
      setModalAlert(err.message);
    } finally {
      setPublishingId(null);
    }
  };

  const handleCancelDelivery = async (deliveryId: number) => {
    setCancellingId(deliveryId);
    setErrorMessage(null);
    setSuccessMessage(null);
    setModalAlert(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/deliveries/${deliveryId}/cancel`, {
        method: 'POST',
        headers,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao cancelar entrega');
      }

      setSuccessMessage(`Entrega #${deliveryId} cancelada com sucesso.`);
      await fetchDeliveries();
      if (selectedDeliveryDetails?.delivery.id === deliveryId) {
        openDeliveryDetails(deliveryId);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
      setModalAlert(err.message);
    } finally {
      setCancellingId(null);
    }
  };

  const openDeliveryDetails = async (deliveryId: number) => {
    setLoadingDeliveryDetails(true);
    setModalAlert(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/deliveries/${deliveryId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSelectedDeliveryDetails(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDeliveryDetails(false);
    }
  };

  const handleConfigureBotToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    setTokenSaving(true);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/telegram/configure', {
        method: 'POST',
        headers,
        body: JSON.stringify({ token: tokenInput.trim() }),
      });

      if (!res.ok) {
        throw new Error('Falha ao configurar bot. Verifique o formato do token.');
      }

      const data = await res.json();
      setTelegramStatus(data);
      setShowBotModal(false);
      setTokenInput('');
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setTokenSaving(false);
    }
  };

  const getVehicleIcon = (type: string) => {
    if (type.startsWith('MOTO')) {
      return <Bike className="w-4 h-4 text-emerald-600" />;
    }
    if (type.startsWith('CAR')) {
      return <Car className="w-4 h-4 text-blue-600" />;
    }
    return <Truck className="w-4 h-4 text-amber-600" />;
  };

  const getVehicleLabel = (type: string) => {
    return VEHICLE_DISPLAY[type]?.label || type;
  };

  const getDriverStatusBadge = (status: DriverStatus) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5" />
            PENDENTE
          </span>
        );
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle className="w-3.5 h-3.5" />
            ATIVO
          </span>
        );
      case 'BLOCKED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <Ban className="w-3.5 h-3.5" />
            BLOQUEADO
          </span>
        );
    }
  };

  const getDeliveryStatusBadge = (status: DeliveryStatus) => {
    switch (status) {
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-800 border border-neutral-300">
            <Clock className="w-3.5 h-3.5 text-neutral-500" />
            RASCUNHO
          </span>
        );
      case 'OFFERED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
            <Send className="w-3.5 h-3.5 text-blue-600" />
            PUBLICADA
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            CANCELADA
          </span>
        );
    }
  };

  const driverCounts = {
    all: drivers.length,
    pending: drivers.filter((d) => d.status === 'PENDING').length,
    active: drivers.filter((d) => d.status === 'ACTIVE').length,
    blocked: drivers.filter((d) => d.status === 'BLOCKED').length,
  };

  const deliveryCounts = {
    all: deliveriesList.length,
    draft: deliveriesList.filter((d) => d.status === 'DRAFT').length,
    offered: deliveriesList.filter((d) => d.status === 'OFFERED').length,
    cancelled: deliveriesList.filter((d) => d.status === 'CANCELLED').length,
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-white border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-neutral-900 text-white rounded-lg flex items-center justify-center font-bold text-lg tracking-tight">
              K
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-neutral-950 flex items-center gap-2">
                Kantine Delivery
                <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  M1 Homologado • M2 Ativo
                </span>
              </h1>
              <p className="text-xs text-neutral-500">
                Central Privada de Entregas da Loja
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Telegram Bot status pill */}
            <button
              onClick={() => setShowBotModal(true)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                telegramStatus?.polling
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                  : telegramStatus?.configured
                  ? 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100'
                  : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {telegramStatus?.polling
                  ? `Bot: @${telegramStatus.botUsername || 'Telegram'}`
                  : telegramStatus?.configured
                  ? 'Bot Configurado'
                  : 'Configurar Bot Token'}
              </span>
            </button>

            {/* Auth status */}
            {currentUser ? (
              <div className="flex items-center gap-2 pl-2 border-l border-neutral-200">
                <span className="text-xs text-neutral-600 hidden sm:inline">
                  {currentUser.email}
                </span>
                <button
                  onClick={() => signOut(auth)}
                  title="Sair"
                  className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => signInWithPopup(auth, googleAuthProvider)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-900 text-white hover:bg-neutral-800 transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Google Login</span>
              </button>
            )}
          </div>
        </div>

        {/* Module Subnav Tabs: ENTREGAS (M2) vs MOTORISTAS (M1) */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-neutral-100 flex gap-4">
          <button
            onClick={() => setActiveTab('DELIVERIES')}
            className={`py-3 px-1 border-b-2 text-sm font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'DELIVERIES'
                ? 'border-neutral-900 text-neutral-950'
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <Package className="w-4 h-4" />
            Entregas (M2)
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700">
              {deliveryCounts.all}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('DRIVERS')}
            className={`py-3 px-1 border-b-2 text-sm font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'DRIVERS'
                ? 'border-neutral-900 text-neutral-950'
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <Users className="w-4 h-4" />
            Motoristas (M1)
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700">
              {driverCounts.all}
            </span>
          </button>
        </div>
      </header>

      {/* Floating Alert / Toast */}
      {errorMessage && (
        <div className="fixed top-20 right-6 z-[60] max-w-md p-4 rounded-xl bg-amber-50 border-2 border-amber-300 text-amber-950 shadow-xl flex items-start gap-3 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
          <div className="flex-1">
            <div className="font-bold text-amber-950">Aviso da Operação</div>
            <div className="text-xs text-amber-900 mt-1 leading-relaxed font-semibold">
              {errorMessage}
            </div>
          </div>
          <button
            onClick={() => {
              setErrorMessage(null);
              setModalAlert(null);
            }}
            className="text-amber-700 hover:text-amber-950 font-bold p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Inline Error Alert */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-3 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
            <div className="flex-1">
              <span className="font-semibold">Aviso:</span> {errorMessage}
            </div>
            <button
              onClick={() => {
                setErrorMessage(null);
                setModalAlert(null);
              }}
              className="text-amber-700 hover:text-amber-950 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Success Alert */}
        {successMessage && (
          <div className="mb-6 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-3 text-sm">
            <CheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
            <div className="flex-1">
              <span className="font-semibold">Sucesso:</span> {successMessage}
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-600 hover:text-emerald-950 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 1: ENTREGAS (M2)                                           */}
        {/* ============================================================== */}
        {activeTab === 'DELIVERIES' && (
          <div>
            {/* Header Bar */}
            <div className="bg-white rounded-xl border border-neutral-200 p-5 mb-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-neutral-900 tracking-tight">
                    ENTREGAS
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Criação de rascunhos, publicação e distribuição automática de ofertas aos motoristas ATIVOS.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    NOVA ENTREGA
                  </button>

                  <button
                    onClick={fetchDeliveries}
                    disabled={loadingDeliveries}
                    title="Atualizar lista"
                    className="p-2 rounded-lg border border-neutral-300 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 transition-colors"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${loadingDeliveries ? 'animate-spin text-neutral-900' : ''}`}
                    />
                  </button>

                  {/* Status Filters */}
                  <div className="flex p-1 bg-neutral-100 rounded-lg border border-neutral-200 text-xs font-semibold">
                    <button
                      onClick={() => setDeliveryFilter('ALL')}
                      className={`px-3 py-1.5 rounded-md transition-colors ${
                        deliveryFilter === 'ALL'
                          ? 'bg-white text-neutral-900 shadow-xs'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      TODAS ({deliveryCounts.all})
                    </button>
                    <button
                      onClick={() => setDeliveryFilter('DRAFT')}
                      className={`px-3 py-1.5 rounded-md transition-colors ${
                        deliveryFilter === 'DRAFT'
                          ? 'bg-white text-neutral-900 shadow-xs'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      RASCUNHOS ({deliveryCounts.draft})
                    </button>
                    <button
                      onClick={() => setDeliveryFilter('OFFERED')}
                      className={`px-3 py-1.5 rounded-md transition-colors ${
                        deliveryFilter === 'OFFERED'
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      PUBLICADAS ({deliveryCounts.offered})
                    </button>
                    <button
                      onClick={() => setDeliveryFilter('CANCELLED')}
                      className={`px-3 py-1.5 rounded-md transition-colors ${
                        deliveryFilter === 'CANCELLED'
                          ? 'bg-white text-rose-700 shadow-xs'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      CANCELADAS ({deliveryCounts.cancelled})
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Deliveries Table */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-neutral-700">
                  <thead className="bg-neutral-50 text-neutral-600 text-xs uppercase font-semibold border-b border-neutral-200">
                    <tr>
                      <th scope="col" className="px-6 py-3.5">
                        ID
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        Origem / Bairro Destino
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        Carga
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        Frete / Modalidade
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        Status
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        Data Criação
                      </th>
                      <th scope="col" className="px-6 py-3.5 text-right">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {loadingDeliveries && deliveriesList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-neutral-500">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-neutral-400" />
                          Carregando entregas...
                        </td>
                      </tr>
                    ) : deliveriesList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-neutral-500">
                          Nenhuma entrega encontrada para o filtro selecionado.
                        </td>
                      </tr>
                    ) : (
                      deliveriesList.map((del) => {
                        const isPublishing = publishingId === del.id;
                        const isCancelling = cancellingId === del.id;

                        return (
                          <tr
                            key={del.id}
                            className="hover:bg-neutral-50 transition-colors"
                          >
                            {/* ID */}
                            <td className="px-6 py-4 font-mono font-bold text-neutral-900">
                              #{del.id}
                            </td>

                            {/* Origem e Bairro Destino */}
                            <td className="px-6 py-4">
                              <button
                                onClick={() => openDeliveryDetails(del.id)}
                                className="text-left group"
                              >
                                <div className="font-semibold text-neutral-900 group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
                                  <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                                  Bairro: {del.destination_neighborhood}
                                </div>
                                <div className="text-xs text-neutral-500">
                                  Origem: {del.pickup_location}
                                </div>
                              </button>
                            </td>

                            {/* Carga */}
                            <td className="px-6 py-4 text-xs font-medium text-neutral-800">
                              {del.cargo_description}
                            </td>

                            {/* Frete & Modalidade */}
                            <td className="px-6 py-4">
                              <div className="font-semibold text-neutral-950 text-xs">
                                R$ {del.delivery_fee}
                              </div>
                              <div className="text-[11px] text-neutral-500">
                                {del.delivery_mode === 'NO_CONTACT' ? 'Sem contato' : 'Presencial'}
                              </div>
                            </td>

                            {/* Status */}
                            <td className="px-6 py-4">
                              {getDeliveryStatusBadge(del.status)}
                            </td>

                            {/* Data */}
                            <td className="px-6 py-4 text-xs text-neutral-500">
                              {new Date(del.created_at).toLocaleDateString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>

                            {/* Ações */}
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {/* DRAFT Actions */}
                                {del.status === 'DRAFT' && (
                                  <>
                                    <button
                                      onClick={() => handlePublishDelivery(del.id)}
                                      disabled={isPublishing || isCancelling}
                                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 flex items-center gap-1"
                                    >
                                      {isPublishing ? (
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Send className="w-3.5 h-3.5" />
                                      )}
                                      PUBLICAR
                                    </button>
                                    <button
                                      onClick={() => handleCancelDelivery(del.id)}
                                      disabled={isPublishing || isCancelling}
                                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-100 hover:bg-rose-50 text-neutral-700 hover:text-rose-700 border border-neutral-200 transition-colors disabled:opacity-50"
                                    >
                                      CANCELAR
                                    </button>
                                  </>
                                )}

                                {/* OFFERED Actions */}
                                {del.status === 'OFFERED' && (
                                  <button
                                    onClick={() => handleCancelDelivery(del.id)}
                                    disabled={isCancelling}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors disabled:opacity-50 flex items-center gap-1"
                                  >
                                    {isCancelling ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <XCircle className="w-3.5 h-3.5" />
                                    )}
                                    CANCELAR
                                  </button>
                                )}

                                {/* Details Button */}
                                <button
                                  onClick={() => openDeliveryDetails(del.id)}
                                  title="Ver detalhes e distribuição"
                                  className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-100 transition-colors"
                                >
                                  <FileText className="w-4 h-4" />
                                </button>
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
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: MOTORISTAS (M1 Baseline)                                */}
        {/* ============================================================== */}
        {activeTab === 'DRIVERS' && (
          <div>
            {/* Header Bar */}
            <div className="bg-white rounded-xl border border-neutral-200 p-5 mb-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-neutral-900 tracking-tight">
                    MOTORISTAS
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Controle de cadastros, aprovação, bloqueio e elegibilidade de entregadores.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchDrivers}
                    disabled={loadingDrivers}
                    title="Atualizar lista"
                    className="p-2 rounded-lg border border-neutral-300 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 transition-colors"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${loadingDrivers ? 'animate-spin text-neutral-900' : ''}`}
                    />
                  </button>

                  {/* Status Filters */}
                  <div className="flex p-1 bg-neutral-100 rounded-lg border border-neutral-200 text-xs font-semibold">
                    <button
                      onClick={() => setDriverFilter('ALL')}
                      className={`px-3 py-1.5 rounded-md transition-colors ${
                        driverFilter === 'ALL'
                          ? 'bg-white text-neutral-900 shadow-xs'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      TODOS ({driverCounts.all})
                    </button>
                    <button
                      onClick={() => setDriverFilter('PENDING')}
                      className={`px-3 py-1.5 rounded-md transition-colors ${
                        driverFilter === 'PENDING'
                          ? 'bg-white text-amber-700 shadow-xs'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      PENDENTES ({driverCounts.pending})
                    </button>
                    <button
                      onClick={() => setDriverFilter('ACTIVE')}
                      className={`px-3 py-1.5 rounded-md transition-colors ${
                        driverFilter === 'ACTIVE'
                          ? 'bg-white text-emerald-700 shadow-xs'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      ATIVOS ({driverCounts.active})
                    </button>
                    <button
                      onClick={() => setDriverFilter('BLOCKED')}
                      className={`px-3 py-1.5 rounded-md transition-colors ${
                        driverFilter === 'BLOCKED'
                          ? 'bg-white text-rose-700 shadow-xs'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      BLOQUEADOS ({driverCounts.blocked})
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Table of Drivers */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-neutral-700">
                  <thead className="bg-neutral-50 text-neutral-600 text-xs uppercase font-semibold border-b border-neutral-200">
                    <tr>
                      <th scope="col" className="px-6 py-3.5">
                        Nome
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        Telefone
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        Veículo
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        Status
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        Data de Cadastro
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        Elegibilidade Ofertas
                      </th>
                      <th scope="col" className="px-6 py-3.5 text-right">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {loadingDrivers && drivers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-neutral-500">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-neutral-400" />
                          Carregando motoristas...
                        </td>
                      </tr>
                    ) : drivers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-neutral-500">
                          Nenhum motorista encontrado para o filtro selecionado.
                        </td>
                      </tr>
                    ) : (
                      drivers.map((driver) => {
                        const isBusy = actionLoadingId === driver.id;
                        const isEligible = driver.status === 'ACTIVE';

                        return (
                          <tr
                            key={driver.id}
                            className="hover:bg-neutral-50 transition-colors"
                          >
                            {/* Nome & Pix */}
                            <td className="px-6 py-4 font-medium text-neutral-900">
                              <button
                                onClick={() => openDriverDetails(driver.id)}
                                className="text-left group"
                              >
                                <div className="font-semibold text-neutral-950 group-hover:text-blue-600 transition-colors">
                                  {driver.name}
                                </div>
                                <div className="text-xs text-neutral-500 font-normal">
                                  Chave Pix: {driver.pix_key}
                                </div>
                              </button>
                            </td>

                            {/* Telefone */}
                            <td className="px-6 py-4 font-mono text-xs text-neutral-800">
                              {driver.phone}
                            </td>

                            {/* Veículo */}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5 font-medium text-xs">
                                {getVehicleIcon(driver.vehicle_type)}
                                <span>{getVehicleLabel(driver.vehicle_type)}</span>
                              </div>
                            </td>

                            {/* Status */}
                            <td className="px-6 py-4">{getDriverStatusBadge(driver.status)}</td>

                            {/* Data */}
                            <td className="px-6 py-4 text-xs text-neutral-500">
                              {new Date(driver.created_at).toLocaleDateString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>

                            {/* Elegibilidade */}
                            <td className="px-6 py-4">
                              {isEligible ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  Habilitado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
                                  Não elegível
                                </span>
                              )}
                            </td>

                            {/* Ações */}
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {/* PENDING -> [APROVAR] [BLOQUEAR] */}
                                {driver.status === 'PENDING' && (
                                  <>
                                    <button
                                      onClick={() => handleApproveDriver(driver.id)}
                                      disabled={isBusy}
                                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 flex items-center gap-1"
                                    >
                                      {isBusy ? (
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <CheckCircle className="w-3.5 h-3.5" />
                                      )}
                                      APROVAR
                                    </button>
                                    <button
                                      onClick={() => handleBlockDriver(driver.id)}
                                      disabled={isBusy}
                                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors disabled:opacity-50 flex items-center gap-1"
                                    >
                                      <Ban className="w-3.5 h-3.5" />
                                      BLOQUEAR
                                    </button>
                                  </>
                                )}

                                {/* ACTIVE -> [BLOQUEAR] */}
                                {driver.status === 'ACTIVE' && (
                                  <button
                                    onClick={() => handleBlockDriver(driver.id)}
                                    disabled={isBusy}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors disabled:opacity-50 flex items-center gap-1"
                                  >
                                    {isBusy ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Ban className="w-3.5 h-3.5" />
                                    )}
                                    BLOQUEAR
                                  </button>
                                )}

                                {/* BLOCKED -> [REATIVAR] */}
                                {driver.status === 'BLOCKED' && (
                                  <button
                                    onClick={() => handleReactivateDriver(driver.id)}
                                    disabled={isBusy}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 flex items-center gap-1"
                                  >
                                    {isBusy ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    )}
                                    REATIVAR
                                  </button>
                                )}

                                <button
                                  onClick={() => openDriverDetails(driver.id)}
                                  title="Histórico de auditoria"
                                  className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-100 transition-colors"
                                >
                                  <History className="w-4 h-4" />
                                </button>
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
          </div>
        )}
      </main>

      {/* ============================================================== */}
      {/* MODAL: NOVA ENTREGA (Formulário Rascunho M2)                   */}
      {/* ============================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-neutral-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-neutral-900" />
                <h3 className="text-base font-bold text-neutral-950">
                  Nova Entrega (Salvar Rascunho)
                </h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-neutral-400 hover:text-neutral-700 text-xl font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateDraft} className="pt-4 space-y-4 text-xs">
              {/* Origem */}
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Origem
                </label>
                <input
                  type="text"
                  value={newDelivery.pickup_location}
                  onChange={(e) => setNewDelivery({ ...newDelivery, pickup_location: e.target.value })}
                  placeholder="Kantine Matriz"
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  required
                />
              </div>

              {/* Endereço de destino (completo - server-side) */}
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Endereço de Destino (Completo)
                </label>
                <input
                  type="text"
                  value={newDelivery.destination_address}
                  onChange={(e) => setNewDelivery({ ...newDelivery, destination_address: e.target.value })}
                  placeholder="Rua das Flores, 123, Apto 402"
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  required
                />
                <span className="text-[10px] text-neutral-500">
                  O endereço completo é protegido e não é enviado ao motorista na oferta pré-aceite.
                </span>
              </div>

              {/* Bairro */}
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Bairro / Região
                </label>
                <input
                  type="text"
                  value={newDelivery.destination_neighborhood}
                  onChange={(e) => setNewDelivery({ ...newDelivery, destination_neighborhood: e.target.value })}
                  placeholder="Santa Mônica"
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  required
                />
              </div>

              {/* Descrição da Carga */}
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Descrição da Carga
                </label>
                <input
                  type="text"
                  value={newDelivery.cargo_description}
                  onChange={(e) => setNewDelivery({ ...newDelivery, cargo_description: e.target.value })}
                  placeholder="Bolo de aniversário 2kg"
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  required
                />
              </div>

              {/* Valor do Frete */}
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Valor do Frete (R$)
                </label>
                <input
                  type="text"
                  value={newDelivery.delivery_fee}
                  onChange={(e) => setNewDelivery({ ...newDelivery, delivery_fee: e.target.value })}
                  placeholder="18,00"
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  required
                />
              </div>

              {/* Modalidade */}
              <div>
                <label className="block font-semibold text-neutral-700 mb-2">
                  Modalidade
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="delivery_mode"
                      value="IN_PERSON"
                      checked={newDelivery.delivery_mode === 'IN_PERSON'}
                      onChange={() => setNewDelivery({ ...newDelivery, delivery_mode: 'IN_PERSON' })}
                      className="text-neutral-900"
                    />
                    <span>Entrega presencial</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="delivery_mode"
                      value="NO_CONTACT"
                      checked={newDelivery.delivery_mode === 'NO_CONTACT'}
                      onChange={() => setNewDelivery({ ...newDelivery, delivery_mode: 'NO_CONTACT' })}
                      className="text-neutral-900"
                    />
                    <span>Entrega sem contato</span>
                  </label>
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Observações (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={newDelivery.observations}
                  onChange={(e) => setNewDelivery({ ...newDelivery, observations: e.target.value })}
                  placeholder="Transportar nivelado, caixa frágil"
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <div className="pt-3 border-t border-neutral-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 font-semibold rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingDraft}
                  className="px-4 py-2 font-semibold rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white transition-colors disabled:opacity-50"
                >
                  {submittingDraft ? 'Salvando...' : 'SALVAR RASCUNHO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: DETALHES DA ENTREGA E DISTRIBUIÇÃO (M2)                 */}
      {/* ============================================================== */}
      {selectedDeliveryDetails && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-neutral-200 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between pb-4 border-b border-neutral-200">
              <div>
                <h3 className="text-lg font-bold text-neutral-950 flex items-center gap-2">
                  ENTREGA #{selectedDeliveryDetails.delivery.id}
                  {getDeliveryStatusBadge(selectedDeliveryDetails.delivery.status)}
                </h3>
                <p className="text-xs text-neutral-500">
                  Criada em {new Date(selectedDeliveryDetails.delivery.created_at).toLocaleString('pt-BR')}
                </p>
              </div>
              <button
                onClick={() => setSelectedDeliveryDetails(null)}
                className="text-neutral-400 hover:text-neutral-700 text-xl font-semibold leading-none"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Summary Card */}
              <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-neutral-500">Origem:</span>
                    <div className="font-semibold text-neutral-900">
                      {selectedDeliveryDetails.delivery.pickup_location}
                    </div>
                  </div>
                  <div>
                    <span className="text-neutral-500">Bairro Destino:</span>
                    <div className="font-semibold text-neutral-900">
                      {selectedDeliveryDetails.delivery.destination_neighborhood}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className="text-neutral-500">Endereço de Destino:</span>
                    <div className="font-mono text-neutral-800">
                      {selectedDeliveryDetails.delivery.destination_address}
                    </div>
                  </div>
                  <div>
                    <span className="text-neutral-500">Carga:</span>
                    <div className="font-semibold text-neutral-900">
                      {selectedDeliveryDetails.delivery.cargo_description}
                    </div>
                  </div>
                  <div>
                    <span className="text-neutral-500">Frete:</span>
                    <div className="font-semibold text-neutral-900">
                      R$ {selectedDeliveryDetails.delivery.delivery_fee}
                    </div>
                  </div>
                  <div>
                    <span className="text-neutral-500">Modalidade:</span>
                    <div className="font-semibold text-neutral-900">
                      {selectedDeliveryDetails.delivery.delivery_mode === 'NO_CONTACT'
                        ? 'SEM CONTATO'
                        : 'PRESENCIAL'}
                    </div>
                  </div>
                  <div>
                    <span className="text-neutral-500">Observações:</span>
                    <div className="font-medium text-neutral-800">
                      {selectedDeliveryDetails.delivery.observations || 'Nenhuma'}
                    </div>
                  </div>
                </div>

                {selectedDeliveryDetails.delivery.offered_at && (
                  <div className="pt-2 border-t border-neutral-200 text-[11px] text-blue-700 font-medium">
                    Publicada em: {new Date(selectedDeliveryDetails.delivery.offered_at).toLocaleString('pt-BR')}
                  </div>
                )}
              </div>

              {/* Dispatches Section (Distribution Audit) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-neutral-900 flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-blue-600" />
                    Distribuição da Oferta ({selectedDeliveryDetails.dispatches.length})
                  </h4>
                  {selectedDeliveryDetails.delivery.status === 'OFFERED' && (
                    <div className="flex items-center gap-2 text-[11px] font-semibold">
                      <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Enviadas: {selectedDeliveryDetails.stats.sent}
                      </span>
                      {selectedDeliveryDetails.stats.failed > 0 && (
                        <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          Falhas: {selectedDeliveryDetails.stats.failed}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {selectedDeliveryDetails.dispatches.length === 0 ? (
                  <div className="p-3 bg-neutral-50 rounded-lg text-neutral-500 text-center">
                    Nenhuma distribuição registrada (a entrega ainda não foi publicada).
                  </div>
                ) : (
                  <div className="border border-neutral-200 rounded-lg overflow-hidden divide-y divide-neutral-200">
                    {selectedDeliveryDetails.dispatches.map((disp) => (
                      <div key={disp.id} className="p-2.5 flex items-center justify-between hover:bg-neutral-50">
                        <div>
                          <div className="font-semibold text-neutral-900">
                            Motorista #{disp.driver_id} (Chat: {disp.telegram_chat_id})
                          </div>
                          <div className="text-[11px] text-neutral-500">
                            {new Date(disp.sent_at).toLocaleTimeString('pt-BR')}
                            {disp.error_code && (
                              <span className="text-rose-600 ml-1">({disp.error_code})</span>
                            )}
                          </div>
                        </div>
                        <div>
                          {disp.status === 'SENT' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <CheckCircle className="w-3 h-3" />
                              SENT
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              <AlertTriangle className="w-3 h-3" />
                              FAILED
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Audit Events Timeline */}
              <div>
                <h4 className="font-bold text-neutral-900 mb-2 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-neutral-600" />
                  Eventos de Auditoria
                </h4>
                <div className="space-y-1.5 border-l-2 border-neutral-200 pl-3 ml-2">
                  {selectedDeliveryDetails.events.map((ev) => (
                    <div key={ev.id} className="relative pb-1">
                      <div className="absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full bg-neutral-900 border-2 border-white" />
                      <div className="font-semibold text-neutral-900">
                        {ev.event_type}
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        {new Date(ev.timestamp).toLocaleString('pt-BR')} • {ev.actor || 'ADMIN'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* In-Modal Alert Banner */}
            {modalAlert && (
              <div className="mx-6 mb-3 p-3.5 rounded-xl bg-amber-50 border-2 border-amber-300 text-amber-950 flex items-start gap-2.5 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 font-semibold leading-relaxed">
                  {modalAlert}
                </div>
                <button
                  onClick={() => setModalAlert(null)}
                  className="text-amber-800 hover:text-black font-bold px-1"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Modal Actions */}
            <div className="pt-4 border-t border-neutral-200 flex items-center justify-between">
              <div>
                {selectedDeliveryDetails.delivery.status === 'DRAFT' && (
                  <button
                    onClick={() => handleCancelDelivery(selectedDeliveryDetails.delivery.id)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg text-rose-700 hover:bg-rose-50 border border-rose-200 transition-colors"
                  >
                    CANCELAR ENTREGA
                  </button>
                )}
                {selectedDeliveryDetails.delivery.status === 'OFFERED' && (
                  <button
                    onClick={() => handleCancelDelivery(selectedDeliveryDetails.delivery.id)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg text-rose-700 hover:bg-rose-50 border border-rose-200 transition-colors"
                  >
                    CANCELAR ENTREGA
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                {selectedDeliveryDetails.delivery.status === 'DRAFT' && (
                  <button
                    onClick={() => handlePublishDelivery(selectedDeliveryDetails.delivery.id)}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    PUBLICAR ENTREGA
                  </button>
                )}
                <button
                  onClick={() => setSelectedDeliveryDetails(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: DETALHES DO MOTORISTA (M1)                              */}
      {/* ============================================================== */}
      {selectedDriver && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-neutral-200 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between pb-4 border-b border-neutral-200">
              <div>
                <h3 className="text-lg font-bold text-neutral-950">
                  {selectedDriver.name}
                </h3>
                <p className="text-xs text-neutral-500">
                  ID: #{selectedDriver.id} • Telegram User ID:{' '}
                  {selectedDriver.telegram_user_id}
                </p>
              </div>
              <button
                onClick={() => setSelectedDriver(null)}
                className="text-neutral-400 hover:text-neutral-700 text-xl font-semibold leading-none"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-3 overflow-y-auto flex-1 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                <div>
                  <span className="text-neutral-500 font-medium">Telefone:</span>
                  <div className="font-semibold text-neutral-800">
                    {selectedDriver.phone}
                  </div>
                </div>
                <div>
                  <span className="text-neutral-500 font-medium">Veículo:</span>
                  <div className="font-semibold text-neutral-800">
                    {getVehicleLabel(selectedDriver.vehicle_type)}
                  </div>
                </div>
                <div>
                  <span className="text-neutral-500 font-medium">Chave Pix:</span>
                  <div className="font-semibold text-neutral-800">
                    {selectedDriver.pix_key}
                  </div>
                </div>
                <div>
                  <span className="text-neutral-500 font-medium">Status:</span>
                  <div className="mt-0.5">
                    {getDriverStatusBadge(selectedDriver.status)}
                  </div>
                </div>
              </div>

              {/* Audit Timeline */}
              <div className="pt-2">
                <h4 className="font-bold text-neutral-900 mb-3 flex items-center gap-1.5">
                  <History className="w-4 h-4 text-neutral-600" />
                  Eventos de Auditoria
                </h4>

                {loadingDriverEvents ? (
                  <p className="text-neutral-500 text-center py-4">
                    Carregando eventos...
                  </p>
                ) : driverEvents.length === 0 ? (
                  <p className="text-neutral-500 text-center py-4">
                    Nenhum evento registrado.
                  </p>
                ) : (
                  <div className="space-y-2 border-l-2 border-neutral-200 pl-3 ml-2">
                    {driverEvents.map((ev) => (
                      <div key={ev.id} className="relative pb-2">
                        <div className="absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full bg-neutral-900 border-2 border-white" />
                        <div className="font-semibold text-neutral-900">
                          {ev.event_type}
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          {new Date(ev.timestamp).toLocaleString('pt-BR')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-200 flex justify-end">
              <button
                onClick={() => setSelectedDriver(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 transition-colors"
              >
                Fechar
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
                (long polling) e <strong>nunca</strong> é registrado em logs ou
                relatórios.
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

              {/* Admin Key input if needed */}
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
