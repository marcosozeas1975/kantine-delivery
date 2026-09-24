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

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [filter, setFilter] = useState<'ALL' | DriverStatus>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Selected driver for audit event view
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [driverEvents, setDriverEvents] = useState<DriverEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState<boolean>(false);

  // Telegram bot state & config modal
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [showBotModal, setShowBotModal] = useState<boolean>(false);
  const [tokenInput, setTokenInput] = useState<string>('');
  const [tokenSaving, setTokenSaving] = useState<boolean>(false);

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
    setLoading(true);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const url =
        filter === 'ALL'
          ? '/api/admin/drivers'
          : `/api/admin/drivers?status=${filter}`;
      const res = await fetch(url, { headers });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Acesso não autorizado. Conecte-se como administrador.');
        }
        throw new Error('Falha ao carregar lista de motoristas.');
      }

      const data = await res.json();
      setDrivers(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao carregar motoristas');
    } finally {
      setLoading(false);
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
    fetchTelegramStatus();
  }, [filter, currentUser, useAdminKey, adminKey]);

  const handleApprove = async (driverId: number) => {
    setActionLoadingId(driverId);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/drivers/${driverId}/approve`, {
        method: 'POST',
        headers,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Falha ao aprovar motorista');
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

  const handleBlock = async (driverId: number) => {
    setActionLoadingId(driverId);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/drivers/${driverId}/block`, {
        method: 'POST',
        headers,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Falha ao bloquear motorista');
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

  const handleReactivate = async (driverId: number) => {
    setActionLoadingId(driverId);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/drivers/${driverId}/reactivate`, {
        method: 'POST',
        headers,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Falha ao reativar motorista');
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
    setLoadingEvents(true);
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
      setLoadingEvents(false);
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

  const getStatusBadge = (status: DriverStatus) => {
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

  const counts = {
    all: drivers.length,
    pending: drivers.filter((d) => d.status === 'PENDING').length,
    active: drivers.filter((d) => d.status === 'ACTIVE').length,
    blocked: drivers.filter((d) => d.status === 'BLOCKED').length,
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
                <span className="text-xs font-semibold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
                  M1 • Homologação
                </span>
              </h1>
              <p className="text-xs text-neutral-500">
                Central Privada de Entregas • Gestão de Motoristas
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
                  ? `Bot Ativo: @${telegramStatus.botUsername || 'Telegram'}`
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
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
            <div className="flex-1">
              <span className="font-semibold">Atenção:</span> {errorMessage}
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-600 hover:text-rose-950 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Header Bar: Title + Filter Tabs */}
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
                disabled={loading}
                title="Atualizar lista"
                className="p-2 rounded-lg border border-neutral-300 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 transition-colors"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loading ? 'animate-spin text-neutral-900' : ''}`}
                />
              </button>

              {/* Status Filters */}
              <div className="flex p-1 bg-neutral-100 rounded-lg border border-neutral-200 text-xs font-semibold">
                <button
                  onClick={() => setFilter('ALL')}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    filter === 'ALL'
                      ? 'bg-white text-neutral-900 shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  TODOS ({counts.all})
                </button>
                <button
                  onClick={() => setFilter('PENDING')}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    filter === 'PENDING'
                      ? 'bg-white text-amber-700 shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  PENDENTES ({counts.pending})
                </button>
                <button
                  onClick={() => setFilter('ACTIVE')}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    filter === 'ACTIVE'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  ATIVOS ({counts.active})
                </button>
                <button
                  onClick={() => setFilter('BLOCKED')}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    filter === 'BLOCKED'
                      ? 'bg-white text-rose-700 shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  BLOQUEADOS ({counts.blocked})
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
                    Elegibilidade (M2)
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-right">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {loading && drivers.length === 0 ? (
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
                        <td className="px-6 py-4">{getStatusBadge(driver.status)}</td>

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
                                  onClick={() => handleApprove(driver.id)}
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
                                  onClick={() => handleBlock(driver.id)}
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
                                onClick={() => handleBlock(driver.id)}
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
                                onClick={() => handleReactivate(driver.id)}
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
      </main>

      {/* Audit History Drawer / Modal */}
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
                    {getStatusBadge(selectedDriver.status)}
                  </div>
                </div>
              </div>

              {/* Audit Timeline */}
              <div className="pt-2">
                <h4 className="font-bold text-neutral-900 mb-3 flex items-center gap-1.5">
                  <History className="w-4 h-4 text-neutral-600" />
                  Eventos de Auditoria
                </h4>

                {loadingEvents ? (
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

      {/* Telegram Token Configuration Modal */}
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
