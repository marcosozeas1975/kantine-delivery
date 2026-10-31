import React, { useState, useEffect } from 'react';
import {
  UBERLANDIA_70_NEIGHBORHOODS,
  MOTO_RADIUS_TARIFF_TABLE,
  CAR_RADIUS_TARIFF_TABLE,
  CAR_RADIUS_DISPLAY_TIERS,
  DEFAULT_FREIGHT_PARAMETERS,
  PICKUP_PRESETS,
  calculateRoutePricing,
  generateWhatsAppProposalMessage,
  RoutePricingResult,
  StopCalculationInput,
  calculateHaversineDistanceKm,
} from '../shared/freightEngine.ts';
import { getAllMappedNeighborhoods } from '../shared/freightNeighborhoods.ts';
import { AddressAutocompleteInput, GeocodedAddressSuggestion } from './AddressAutocompleteInput.tsx';
import { extractCustomerData } from '../shared/customerUtils.ts';
import {
  Car,
  Navigation,
  DollarSign,
  Search,
  Plus,
  Trash2,
  Copy,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  Building2,
  MapPin,
  RefreshCw,
  Send,
  PlusCircle,
  FileText,
  Edit3,
  Clock,
  Package,
  Eye,
  EyeOff,
  Zap,
  Phone,
  ShoppingBag,
  Bell,
  Sparkles,
  Layers,
  Check,
  FileSpreadsheet,
  Download,
} from 'lucide-react';

export interface SimulationDraftFormPayload {
  modality: 'CAR' | 'MOTO';
  pickup_type: 'REGISTERED' | 'AD_HOC';
  pickup_location_id: number;
  pickup_name: string;
  pickup_address: string;
  pickup_neighborhood: string;
  final_deadline: string;
  total_fee: string;
  accepted_vehicle_types: ('CAR' | 'MOTO' | 'MOTO_WITH_BAG')[];
  stops: {
    destination_address: string;
    destination_neighborhood: string;
    cargo_description: string;
    delivery_mode: 'IN_PERSON' | 'NO_CONTACT';
    desired_deadline: string;
    observations: string;
    is_horizontal_condo: boolean;
  }[];
}

export interface TakeatOrderUI {
  id: number;
  takeat_order_id: string;
  store_key?: 'MATRIZ' | 'VINHEDOS';
  store_id?: string | null;
  display_id: string;
  customer_name: string;
  customer_phone: string | null;
  destination_address: string;
  destination_neighborhood: string;
  destination_city: string;
  order_items_summary: string | null;
  order_items_json: any;
  order_total: string | null;
  delivery_fee_charged: string | null;
  payment_method: string | null;
  change_for: string | null;
  pickup_preset: string;
  status: 'PENDING_COURIER' | 'IN_ROUTE' | 'DELIVERED' | 'DISMISSED';
  calculated_freight_value: string | null;
  calculated_freight_details: any;
  created_route_id: number | null;
  raw_payload: any;
  created_at: string;
  accepted_at: string | null;
  dispatched_at: string | null;
}

export interface TakeatConfigUI {
  id: number;
  store_key: 'MATRIZ' | 'VINHEDOS';
  store_name?: string;
  api_key: string | null;
  webhook_secret: string | null;
  store_id: string | null;
  default_pickup_preset: string;
  auto_calculate_freight: boolean;
  preferred_modality: 'MOTO' | 'CAR';
  notification_sound_enabled: boolean;
  is_active: boolean;
  has_api_key?: boolean;
  has_webhook_secret?: boolean;
  last_webhook_received_at?: string | null;
}

interface Props {
  getAuthHeaders: () => Promise<HeadersInit>;
  setSuccessMessage: (msg: string | null) => void;
  setErrorMessage: (msg: string | null) => void;
  pickupLocations?: Array<{
    id: number;
    name: string;
    address: string;
    neighborhood?: string | null;
    active: boolean;
  }>;
  onRouteDraftCreated?: () => void;
  onLoadIntoRouteForm?: (draft: SimulationDraftFormPayload) => void;
  onNavigateToRoutes?: () => void;
  pendingTakeatCount?: number;
  onRefreshPendingTakeatCount?: () => void;
}

export const FreightEngineSettings: React.FC<Props> = ({
  getAuthHeaders,
  setSuccessMessage,
  setErrorMessage,
  pickupLocations,
  onRouteDraftCreated,
  onLoadIntoRouteForm,
  onNavigateToRoutes,
  pendingTakeatCount = 0,
  onRefreshPendingTakeatCount,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<
    'TAKEAT_ORDERS' | 'SIMULATOR' | 'CAR_RADIUS' | 'MOTO_RADIUS' | 'PARAMS' | 'TAKEAT_CONFIG'
  >(pendingTakeatCount > 0 ? 'TAKEAT_ORDERS' : 'SIMULATOR');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPrice, setFilterPrice] = useState<number | 'ALL'>('ALL');
  const [seedingDb, setSeedingDb] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);

  // Takeat Orders State
  const [takeatOrders, setTakeatOrders] = useState<TakeatOrderUI[]>([]);
  const [loadingTakeatOrders, setLoadingTakeatOrders] = useState(false);
  const [takeatFilter, setTakeatFilter] = useState<'PENDING_COURIER' | 'IN_ROUTE' | 'ALL'>('PENDING_COURIER');
  const [takeatStoreFilter, setTakeatStoreFilter] = useState<'ALL' | 'MATRIZ' | 'VINHEDOS'>('ALL');
  const [selectedTakeatIds, setSelectedTakeatIds] = useState<number[]>([]);
  const [convertingTakeatId, setConvertingTakeatId] = useState<number | null>(null);
  const [simulatingTakeat, setSimulatingTakeat] = useState(false);
  const [syncingTakeat, setSyncingTakeat] = useState(false);

  // Takeat Multi-Store Config State
  const [selectedConfigStore, setSelectedConfigStore] = useState<'MATRIZ' | 'VINHEDOS'>('MATRIZ');
  const [storeConfigs, setStoreConfigs] = useState<{
    MATRIZ: TakeatConfigUI;
    VINHEDOS: TakeatConfigUI;
  }>({
    MATRIZ: {
      id: 1,
      store_key: 'MATRIZ',
      store_name: 'Kantine Matriz',
      api_key: '',
      webhook_secret: '',
      store_id: 'kantinegastronomia',
      default_pickup_preset: 'MATRIZ',
      auto_calculate_freight: true,
      preferred_modality: 'MOTO',
      notification_sound_enabled: true,
      is_active: true,
    },
    VINHEDOS: {
      id: 2,
      store_key: 'VINHEDOS',
      store_name: 'Kantine Vinhedos',
      api_key: '',
      webhook_secret: '',
      store_id: 'kantine-vinhedos',
      default_pickup_preset: 'VINHEDOS',
      auto_calculate_freight: true,
      preferred_modality: 'MOTO',
      notification_sound_enabled: true,
      is_active: true,
    },
  });

  const activeConfig = storeConfigs[selectedConfigStore];

  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);

  // Simulator State
  const [simModality, setSimModality] = useState<'CAR' | 'MOTO'>('MOTO');
  const [simOriginKey, setSimOriginKey] = useState<'MATRIZ' | 'VINHEDOS' | 'CUSTOM'>('MATRIZ');
  const [simCustomAddress, setSimCustomAddress] = useState('');
  const [simDeadline, setSimDeadline] = useState('50 min');
  const [simCargoDescription, setSimCargoDescription] = useState('Encomenda Kantine Gastronomia');
  const [simStops, setSimStops] = useState<StopCalculationInput[]>([
    {
      sequence: 1,
      destination_address: 'Av. Afonso Pena, 2950',
      destination_neighborhood: 'Alto Umuarama',
      dropoff_coords: { lat: -18.8847, lng: -48.2528 },
      is_horizontal_condo: false,
    },
    {
      sequence: 2,
      destination_address: 'Av. Floriano Peixoto, 1200',
      destination_neighborhood: 'Umuarama',
      dropoff_coords: { lat: -18.8944, lng: -48.2556 },
      is_horizontal_condo: false,
    },
  ]);
  const [manualOverrideIdx, setManualOverrideIdx] = useState<number | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleSeedDatabase = async () => {
    if (!confirm('Deseja sincronizar os 70 bairros e preços de Uberlândia na base de dados oficial?')) {
      return;
    }
    setSeedingDb(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/freight-engine/seed-70-neighborhoods', {
        method: 'POST',
        headers,
      });
      if (!res.ok) throw new Error('Falha ao sincronizar bairros no banco');
      const data = await res.json();
      setSuccessMessage(`Sucesso! ${data.seeded_neighborhoods} bairros e tarifas sincronizados na base.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao sincronizar banco');
    } finally {
      setSeedingDb(false);
    }
  };

  // ==========================================
  // FUNÇÕES DE INTEGRAÇÃO TAKEAT
  // ==========================================

  const fetchTakeatOrders = async (status = takeatFilter, store = takeatStoreFilter) => {
    setLoadingTakeatOrders(true);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();
      if (status && status !== 'ALL') params.append('status', status);
      if (store && store !== 'ALL') params.append('store', store);
      const url = `/api/admin/takeat/orders${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error('Falha ao buscar pedidos do Takeat');
      const data = await res.json();
      setTakeatOrders(data.orders || []);
      if (onRefreshPendingTakeatCount) {
        onRefreshPendingTakeatCount();
      }
    } catch (err: any) {
      console.error('[fetchTakeatOrders error]', err.message);
    } finally {
      setLoadingTakeatOrders(false);
    }
  };

  const fetchTakeatConfig = async () => {
    setLoadingConfig(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/takeat/configs', { headers });
      if (!res.ok) throw new Error('Falha ao carregar configurações do Takeat');
      const data = await res.json();
      if (data.MATRIZ && data.VINHEDOS) {
        setStoreConfigs({
          MATRIZ: {
            id: data.MATRIZ.id || 1,
            store_key: 'MATRIZ',
            store_name: data.MATRIZ.store_name || 'Kantine Matriz',
            api_key: data.MATRIZ.api_key || '',
            webhook_secret: data.MATRIZ.webhook_secret || '',
            store_id: data.MATRIZ.store_id || 'kantine-matriz',
            default_pickup_preset: data.MATRIZ.default_pickup_preset || 'MATRIZ',
            auto_calculate_freight: data.MATRIZ.auto_calculate_freight !== false,
            preferred_modality: data.MATRIZ.preferred_modality || 'MOTO',
            notification_sound_enabled: data.MATRIZ.notification_sound_enabled !== false,
            is_active: data.MATRIZ.is_active !== false,
            has_api_key: data.MATRIZ.has_api_key,
            has_webhook_secret: data.MATRIZ.has_webhook_secret,
            last_webhook_received_at: data.MATRIZ.last_webhook_received_at,
          },
          VINHEDOS: {
            id: data.VINHEDOS.id || 2,
            store_key: 'VINHEDOS',
            store_name: data.VINHEDOS.store_name || 'Kantine Vinhedos',
            api_key: data.VINHEDOS.api_key || '',
            webhook_secret: data.VINHEDOS.webhook_secret || '',
            store_id: data.VINHEDOS.store_id || 'kantine-vinhedos',
            default_pickup_preset: data.VINHEDOS.default_pickup_preset || 'VINHEDOS',
            auto_calculate_freight: data.VINHEDOS.auto_calculate_freight !== false,
            preferred_modality: data.VINHEDOS.preferred_modality || 'MOTO',
            notification_sound_enabled: data.VINHEDOS.notification_sound_enabled !== false,
            is_active: data.VINHEDOS.is_active !== false,
            has_api_key: data.VINHEDOS.has_api_key,
            has_webhook_secret: data.VINHEDOS.has_webhook_secret,
            last_webhook_received_at: data.VINHEDOS.last_webhook_received_at,
          },
        });
      }
    } catch (err: any) {
      console.error('[fetchTakeatConfig error]', err.message);
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    fetchTakeatOrders();
    fetchTakeatConfig();
  }, []);

  useEffect(() => {
    if (activeSubTab === 'TAKEAT_ORDERS') {
      fetchTakeatOrders(takeatFilter, takeatStoreFilter);
    } else if (activeSubTab === 'TAKEAT_CONFIG') {
      fetchTakeatConfig();
    }
  }, [activeSubTab, takeatFilter, takeatStoreFilter]);

  const handleSaveTakeatConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const headers = await getAuthHeaders();
      const currentConfig = storeConfigs[selectedConfigStore];
      const res = await fetch('/api/admin/takeat/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...currentConfig,
          store_key: selectedConfigStore,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao salvar configurações do Takeat');
      }
      const saved = await res.json();
      setStoreConfigs((prev) => ({
        ...prev,
        [selectedConfigStore]: {
          ...prev[selectedConfigStore],
          ...saved,
        },
      }));
      setSuccessMessage(`Chaves e configurações da ${selectedConfigStore === 'VINHEDOS' ? 'Kantine Vinhedos' : 'Kantine Matriz'} salvas com sucesso no banco!`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao salvar configuração do Takeat');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSimulateTakeatOrder = async (targetStore: 'MATRIZ' | 'VINHEDOS' = 'MATRIZ') => {
    setSimulatingTakeat(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/takeat/simulate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeKey: targetStore }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao simular pedido');
      }
      const data = await res.json();
      const storeLabel = targetStore === 'VINHEDOS' ? 'Vinhedos' : 'Matriz';
      setSuccessMessage(`Pedido ${data.order?.display_id} do Takeat (${storeLabel}) recebido e calculado com sucesso pelo Motor de Fretes!`);
      await fetchTakeatOrders('PENDING_COURIER', 'ALL');
      setActiveSubTab('TAKEAT_ORDERS');
      if (onRefreshPendingTakeatCount) {
        onRefreshPendingTakeatCount();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao simular pedido do Takeat');
    } finally {
      setSimulatingTakeat(false);
    }
  };

  const handleSyncTakeatRest = async (store: 'MATRIZ' | 'VINHEDOS' = selectedConfigStore) => {
    setSyncingTakeat(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/takeat/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeKey: store }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao sincronizar pedidos da Takeat via REST');
      }
      setSuccessMessage(data.message || 'Pedidos consultados via API REST com sucesso!');
      await fetchTakeatOrders('PENDING_COURIER', store);
      if (onRefreshPendingTakeatCount) {
        onRefreshPendingTakeatCount();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao sincronizar com a Takeat');
    } finally {
      setSyncingTakeat(false);
    }
  };

  const handleConvertOrderToRoute = async (orderId: number, offerNow: boolean) => {
    setConvertingTakeatId(orderId);
    try {
      const order = takeatOrders.find((o) => o.id === orderId);
      const storeKey = order?.store_key || 'MATRIZ';
      const storeConfig = storeConfigs[storeKey];
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/takeat/orders/${orderId}/create-route`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          offerNow,
          modality: storeConfig?.preferred_modality || 'MOTO',
          pickupPreset: storeKey === 'VINHEDOS' ? 'VINHEDOS' : 'MATRIZ',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao converter pedido em rota.');
      }
      const data = await res.json();
      const storeLabel = storeKey === 'VINHEDOS' ? 'Vinhedos' : 'Matriz';
      if (offerNow) {
        setSuccessMessage(`Rota #${data.route?.id} (${storeLabel}) criada e despachada para a frota de motoboys no Telegram!`);
      } else {
        setSuccessMessage(`Rascunho de Rota #${data.route?.id} (${storeLabel}) criado com sucesso a partir do pedido Takeat!`);
      }
      await fetchTakeatOrders();
      if (onRouteDraftCreated) {
        onRouteDraftCreated();
      } else if (onNavigateToRoutes) {
        onNavigateToRoutes();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao converter pedido em rota');
    } finally {
      setConvertingTakeatId(null);
    }
  };

  const handleLoadTakeatIntoSimulator = (order: TakeatOrderUI) => {
    const storeKey = order.store_key || 'MATRIZ';
    const storeConfig = storeConfigs[storeKey];
    setSimModality(storeConfig?.preferred_modality || 'MOTO');
    setSimOriginKey(storeKey === 'VINHEDOS' ? 'VINHEDOS' : 'MATRIZ');
    setSimCargoDescription(`Takeat ${order.display_id} (${storeKey}): ${order.order_items_summary || 'Delivery'} (${order.customer_name})`);
    setSimStops([
      {
        sequence: 1,
        destination_address: order.destination_address,
        destination_neighborhood: order.destination_neighborhood,
        is_horizontal_condo: false,
      },
    ]);
    setActiveSubTab('SIMULATOR');
    setSuccessMessage(`Pedido ${order.display_id} (${storeKey} &rarr; ${order.destination_neighborhood}) carregado no simulador de frete!`);
  };

  const handleGroupSelectedTakeatOrders = () => {
    if (selectedTakeatIds.length < 2) {
      setErrorMessage('Selecione pelo menos 2 pedidos para agrupar em uma rota compartilhada.');
      return;
    }
    const selectedOrders = takeatOrders.filter((o) => selectedTakeatIds.includes(o.id));
    if (selectedOrders.length === 0) return;

    // Detectar ponto de saída dominante ou do primeiro pedido
    const primaryStoreKey = selectedOrders[0].store_key || 'MATRIZ';
    setSimModality('MOTO');
    setSimOriginKey(primaryStoreKey === 'VINHEDOS' ? 'VINHEDOS' : 'MATRIZ');
    setSimCargoDescription(`Rota Agrupada Takeat (${primaryStoreKey}): ${selectedOrders.map((o) => o.display_id).join(' + ')}`);
    setSimStops(
      selectedOrders.map((o, idx) => ({
        sequence: idx + 1,
        destination_address: o.destination_address,
        destination_neighborhood: o.destination_neighborhood,
        is_horizontal_condo: false,
      }))
    );
    setActiveSubTab('SIMULATOR');
    setSuccessMessage(`${selectedOrders.length} pedidos Takeat agrupados no simulador de frete com desconto inteligente de 70%!`);
  };

  const handleDismissTakeatOrder = async (orderId: number) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/takeat/orders/${orderId}/dismiss`, {
        method: 'POST',
        headers,
      });
      if (!res.ok) throw new Error('Falha ao dispensar pedido');
      setSuccessMessage('Pedido dispensado da fila de entregadores.');
      await fetchTakeatOrders();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao dispensar pedido');
    }
  };

  const handleDeleteTakeatOrder = async (orderId: number) => {
    if (!confirm('Deseja excluir este registro de pedido do Takeat?')) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/takeat/orders/${orderId}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) throw new Error('Falha ao excluir pedido');
      setSuccessMessage('Pedido excluído com sucesso.');
      await fetchTakeatOrders();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao excluir pedido');
    }
  };


  // Run Simulation
  const getOriginInfo = () => {
    if (simOriginKey === 'VINHEDOS') return PICKUP_PRESETS.VINHEDOS;
    if (simOriginKey === 'CUSTOM') {
      return {
        name: 'Coleta Alternativa',
        address: simCustomAddress.trim() || 'Uberlândia - MG',
        neighborhood: 'Personalizado',
        coords: PICKUP_PRESETS.MATRIZ.coords,
      };
    }
    return PICKUP_PRESETS.MATRIZ;
  };

  const simResult: RoutePricingResult = calculateRoutePricing(
    simModality,
    getOriginInfo(),
    simStops,
    DEFAULT_FREIGHT_PARAMETERS
  );

  const whatsAppProposal = generateWhatsAppProposalMessage({
    modality: simModality,
    originNameOrAddress: getOriginInfo().name + ' (' + getOriginInfo().address + ')',
    stops: simStops,
    driverFee: simResult.driver_remuneration,
    googleMapsUrl: simResult.google_maps_url,
    observations: 'Entrega Kantine Gastronomia',
  });

  // Todos os 110 bairros mapeados de Uberlândia
  const allNeighborhoods = getAllMappedNeighborhoods();

  // Filtered Neighborhoods (70 originais)
  const filteredNeighborhoods = UBERLANDIA_70_NEIGHBORHOODS.filter((n) => {
    const matchesSearch =
      n.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.normalized.includes(searchTerm.toLowerCase());
    const matchesPrice = filterPrice === 'ALL' || n.carFee === filterPrice;
    return matchesSearch && matchesPrice;
  });


  // Resolver Ponto de Coleta da Simulação
  const resolvePickupData = () => {
    if (simOriginKey === 'VINHEDOS') {
      const vinhedosLoc = pickupLocations?.find(
        (l) => l.name.toLowerCase().includes('vinhedos') && l.active
      ) || pickupLocations?.find((l) => l.name.toLowerCase().includes('vinhedos'));

      if (vinhedosLoc) {
        return {
          pickup_type: 'REGISTERED' as const,
          pickup_location_id: vinhedosLoc.id,
          pickup_name: vinhedosLoc.name,
          pickup_address: vinhedosLoc.address,
          pickup_neighborhood: vinhedosLoc.neighborhood || 'Vinhedos',
        };
      }
    }

    if (simOriginKey === 'MATRIZ') {
      const matrizLoc = pickupLocations?.find(
        (l) => (l.name.toLowerCase().includes('matriz') || l.name.toLowerCase().includes('getúlio') || l.name.toLowerCase().includes('getulio')) && l.active
      ) || pickupLocations?.[0];

      if (matrizLoc) {
        return {
          pickup_type: 'REGISTERED' as const,
          pickup_location_id: matrizLoc.id,
          pickup_name: matrizLoc.name,
          pickup_address: matrizLoc.address,
          pickup_neighborhood: matrizLoc.neighborhood || 'Martins',
        };
      }
    }

    return {
      pickup_type: 'AD_HOC' as const,
      pickup_location_id: pickupLocations?.[0]?.id || 1,
      pickup_name: 'Coleta Alternativa',
      pickup_address: simCustomAddress.trim() || 'Uberlândia - MG',
      pickup_neighborhood: 'Centro',
    };
  };

  // Criar Rascunho de Rota Imediatamente na Base de Dados com Validação Estrita de GPS
  const handleCreateDraftDirectly = async () => {
    try {
      setCreatingDraft(true);
      setErrorMessage(null);

      const origin = resolvePickupData();
      const updatedStops = [...simStops];

      // Validação: Garante que nenhuma parada seja salva com bairro desatualizado ou sem GPS
      for (let i = 0; i < updatedStops.length; i++) {
        const s = updatedStops[i];
        if (!s.destination_address || s.destination_address.trim().length < 3) {
          throw new Error(`A Parada #${i + 1} não possui endereço preenchido.`);
        }

        if (!s.dropoff_coords || !s.destination_neighborhood) {
          // Tenta validação automática em tempo real
          try {
            const res = await fetch(`/api/geocode/autocomplete?q=${encodeURIComponent(s.destination_address.trim())}`);
            if (res.ok) {
              const data = await res.json();
              if (data.suggestions && data.suggestions.length > 0) {
                const top = data.suggestions[0];
                s.destination_address = top.formattedAddress;
                s.destination_neighborhood = top.neighborhood;
                s.dropoff_coords = top.coords;
                updatedStops[i] = { ...s };
              }
            }
          } catch (e) {}
        }

        if (!s.dropoff_coords || !s.destination_neighborhood) {
          throw new Error(
            `A Parada #${i + 1} ("${s.destination_address}") precisa ter o endereço validado pelo GPS antes de criar o rascunho. Clique em 'Validar GPS' no campo de endereço ou selecione a sugestão correta.`
          );
        }
      }

      setSimStops(updatedStops);

      const formattedFee = simResult.route_operational_total.toFixed(2).replace('.', ',');

      const stopsPayload = updatedStops.map((s) => ({
        destination_address: s.destination_address.trim() || `Endereço de Entrega - ${s.destination_neighborhood}`,
        destination_neighborhood: s.destination_neighborhood.trim() || 'Centro',
        cargo_description: simCargoDescription.trim() || 'Encomenda Kantine Gastronomia',
        delivery_mode: 'IN_PERSON' as const,
        desired_deadline: undefined,
        observations: simModality === 'CAR' && s.is_horizontal_condo ? '[Condomínio Horizontal]' : undefined,
        is_horizontal_condo: Boolean(simModality === 'CAR' && s.is_horizontal_condo),
      }));

      const payload = {
        pickup_type: origin.pickup_type,
        pickup_location_id: origin.pickup_type === 'REGISTERED' ? origin.pickup_location_id : undefined,
        pickup_name: origin.pickup_type === 'AD_HOC' ? origin.pickup_name : undefined,
        pickup_address: origin.pickup_type === 'AD_HOC' ? origin.pickup_address : undefined,
        pickup_neighborhood: origin.pickup_type === 'AD_HOC' ? origin.pickup_neighborhood : undefined,
        final_deadline: simDeadline.trim() || '50 min',
        total_fee: formattedFee,
        accepted_vehicle_types: simModality === 'CAR' ? ['CAR'] : ['MOTO', 'MOTO_WITH_BAG'],
        stops: stopsPayload,
      };

      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/routes', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao salvar rascunho da rota.');
      }

      const data = await res.json();
      setSuccessMessage(`Rascunho de Rota #${data.route?.id || ''} criado com sucesso a partir da simulação de frete!`);
      if (onRouteDraftCreated) {
        onRouteDraftCreated();
      } else if (onNavigateToRoutes) {
        onNavigateToRoutes();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao gerar rascunho de rota');
    } finally {
      setCreatingDraft(false);
    }
  };

  // Carregar dados no formulário de criação de rota com validação estrita
  const handleLoadIntoRouteForm = async () => {
    try {
      setErrorMessage(null);
      const updatedStops = [...simStops];

      for (let i = 0; i < updatedStops.length; i++) {
        const s = updatedStops[i];
        if (!s.destination_address || s.destination_address.trim().length < 3) {
          setErrorMessage(`A Parada #${i + 1} não possui endereço preenchido.`);
          return;
        }

        if (!s.dropoff_coords || !s.destination_neighborhood) {
          try {
            const res = await fetch(`/api/geocode/autocomplete?q=${encodeURIComponent(s.destination_address.trim())}`);
            if (res.ok) {
              const data = await res.json();
              if (data.suggestions && data.suggestions.length > 0) {
                const top = data.suggestions[0];
                s.destination_address = top.formattedAddress;
                s.destination_neighborhood = top.neighborhood;
                s.dropoff_coords = top.coords;
                updatedStops[i] = { ...s };
              }
            }
          } catch (e) {}
        }

        if (!s.dropoff_coords || !s.destination_neighborhood) {
          setErrorMessage(
            `A Parada #${i + 1} ("${s.destination_address}") precisa ser validada no GPS antes de prosseguir.`
          );
          return;
        }
      }

      setSimStops(updatedStops);

      const origin = resolvePickupData();
      const formattedFee = simResult.route_operational_total.toFixed(2).replace('.', ',');

      const stopsForm = updatedStops.map((s) => ({
        destination_address: s.destination_address.trim() || `Endereço de Entrega - ${s.destination_neighborhood}`,
        destination_neighborhood: s.destination_neighborhood.trim() || 'Centro',
        cargo_description: simCargoDescription.trim() || 'Encomenda Kantine Gastronomia',
        delivery_mode: 'IN_PERSON' as const,
        desired_deadline: '',
        observations: simModality === 'CAR' && s.is_horizontal_condo ? '[Condomínio Horizontal]' : '',
        is_horizontal_condo: Boolean(simModality === 'CAR' && s.is_horizontal_condo),
      }));

      if (onLoadIntoRouteForm) {
        onLoadIntoRouteForm({
          modality: simModality,
          pickup_type: origin.pickup_type,
          pickup_location_id: origin.pickup_location_id,
          pickup_name: origin.pickup_name,
          pickup_address: origin.pickup_address,
          pickup_neighborhood: origin.pickup_neighborhood,
          final_deadline: simDeadline.trim() || '50 min',
          total_fee: formattedFee,
          accepted_vehicle_types: simModality === 'CAR' ? ['CAR'] : ['MOTO', 'MOTO_WITH_BAG'],
          stops: stopsForm,
        });
        setSuccessMessage('Dados da simulação carregados no formulário de rota com sucesso!');
      } else if (onNavigateToRoutes) {
        onNavigateToRoutes();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao carregar no formulário');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Motor de Fretes (Layout Limpo / Fundo Branco / Sem Cores Fortes) */}
      <div className="p-5 rounded-2xl bg-white border border-neutral-200 text-neutral-900 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-700 border border-neutral-200 uppercase tracking-wider">
                Kantine Gastronomia
              </span>
              <h2 className="text-lg font-black tracking-tight text-neutral-950">
                Motor de Fretes & Precificação Oficial
              </h2>
            </div>
            <p className="text-xs text-neutral-500 mt-1 max-w-2xl leading-relaxed">
              Cálculo por raio geodésico Haversine (Carro e Moto de 1 a 20 km),
              adicional de condomínio horizontal (+20%), fator de agrupamento (70%) e repasse 90/10.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/api/freight-engine/download-excel"
              download="Tabela_de_Fretes_Kantine_Gastronomia_Uberlandia.xlsx"
              className="px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              title="Baixar planilha Excel completa atualizada (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Baixar Excel Atualizado (.xlsx)</span>
            </a>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-neutral-100 text-xs">
          <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-2.5">
            <span className="text-[11px] text-neutral-500 font-medium block">Tabela de Carro</span>
            <span className="text-sm font-black text-neutral-900">1 km a 20 km (Raio)</span>
          </div>
          <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-2.5">
            <span className="text-[11px] text-neutral-500 font-medium block">Tabela de Moto</span>
            <span className="text-sm font-black text-neutral-900">1 km a 20 km (Raio)</span>
          </div>
          <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-2.5">
            <span className="text-[11px] text-neutral-500 font-medium block">Condomínio Horizontal</span>
            <span className="text-sm font-black text-neutral-900">+20% na Base</span>
          </div>
          <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-2.5">
            <span className="text-[11px] text-neutral-500 font-medium block">Agrupamento & Repasse</span>
            <span className="text-sm font-black text-neutral-900">70% / 90% Entregador</span>
          </div>
        </div>
      </div>

      {/* Sub-tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-2 overflow-x-auto">

        <button
          onClick={() => setActiveSubTab('TAKEAT_ORDERS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'TAKEAT_ORDERS'
              ? 'bg-red-600 text-white shadow-md'
              : pendingTakeatCount > 0 || takeatOrders.filter((o) => o.status === 'PENDING_COURIER').length > 0
              ? 'bg-red-100 text-red-800 border-2 border-red-400 animate-pulse font-black'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          <span className="text-base">🛵</span>
          <span>Pedidos Takeat</span>
          {pendingTakeatCount > 0 || takeatOrders.filter((o) => o.status === 'PENDING_COURIER').length > 0 ? (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-black bg-white text-red-700 shadow-xs animate-bounce">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping"></span>
              <span>
                {pendingTakeatCount > 0
                  ? pendingTakeatCount
                  : takeatOrders.filter((o) => o.status === 'PENDING_COURIER').length}
              </span>
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-neutral-200 text-neutral-600">
              {takeatOrders.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('SIMULATOR')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'SIMULATOR'
              ? 'bg-neutral-900 text-white shadow-xs'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          <Navigation className="w-4 h-4" />
          <span>Simulador & Calculadora ao Vivo</span>
        </button>

        <button
          onClick={() => setActiveSubTab('CAR_RADIUS')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'CAR_RADIUS'
              ? 'bg-neutral-900 text-white shadow-xs'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          <Car className="w-4 h-4" />
          <span>Tabela Carro por Raio (1–20 km)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('MOTO_RADIUS')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'MOTO_RADIUS'
              ? 'bg-neutral-900 text-white shadow-xs'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          <span className="text-base">🏍️</span>
          <span>Tabela Moto por Raio (1–20 km)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('PARAMS')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'PARAMS'
              ? 'bg-neutral-900 text-white shadow-xs'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Regras e Parâmetros</span>
        </button>

        <button
          onClick={() => setActiveSubTab('TAKEAT_CONFIG')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'TAKEAT_CONFIG'
              ? 'bg-neutral-900 text-white shadow-xs'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Configuração & Chaves Takeat</span>
        </button>
      </div>

      {/* ============================================================== */}
      {/* 0. PAINEL DE PEDIDOS TAKEAT (DELIVERY PRÓPRIO)                 */}
      {/* ============================================================== */}
      {activeSubTab === 'TAKEAT_ORDERS' && (
        <div className="space-y-5">
          {/* Top Bar com Ações e Status */}
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-700 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-600 animate-ping"></span>
                  Takeat PDV & Delivery
                </span>
                <h3 className="text-base font-black text-neutral-900 tracking-tight">
                  Pedidos Recebidos Aguardando Entregador
                </h3>
              </div>
              <p className="text-xs text-neutral-500 mt-1 max-w-2xl leading-relaxed">
                Quando um pedido de delivery próprio é aceito no Takeat, os dados chegam aqui em tempo real. O frete é calculado automaticamente pelo Motor de Fretes da Kantine (sem taxa de condomínio para moto).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-xl">
                <button
                  onClick={() => handleSimulateTakeatOrder('MATRIZ')}
                  disabled={simulatingTakeat}
                  className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-blue-50 text-blue-900 border border-blue-200 font-bold text-[11px] shadow-2xs transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Gera um pedido de teste originado na Kantine Matriz"
                >
                  <Sparkles className="w-3 h-3 text-blue-600" />
                  <span>+ Testar Matriz</span>
                </button>
                <button
                  onClick={() => handleSimulateTakeatOrder('VINHEDOS')}
                  disabled={simulatingTakeat}
                  className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-purple-50 text-purple-900 border border-purple-200 font-bold text-[11px] shadow-2xs transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Gera um pedido de teste originado na Kantine Vinhedos"
                >
                  <Sparkles className="w-3 h-3 text-purple-600" />
                  <span>+ Testar Vinhedos</span>
                </button>
              </div>

              <button
                onClick={() => handleSyncTakeatRest(takeatStoreFilter === 'VINHEDOS' ? 'VINHEDOS' : 'MATRIZ')}
                disabled={syncingTakeat}
                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Consulta os pedidos ativos diretamente na API REST da Takeat usando sua Chave de REST"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingTakeat ? 'animate-spin' : ''}`} />
                <span>{syncingTakeat ? 'Consultando Takeat...' : '🔄 Puxar Pedidos (REST)'}</span>
              </button>

              <button
                onClick={() => fetchTakeatOrders(takeatFilter, takeatStoreFilter)}
                disabled={loadingTakeatOrders}
                className="px-3 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingTakeatOrders ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>

              <button
                onClick={() => setActiveSubTab('TAKEAT_CONFIG')}
                className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-amber-600" />
                <span>Configurar Chaves</span>
              </button>
            </div>
          </div>

          {/* Filtros por Status, Loja e Barra de Agrupamento */}
          <div className="space-y-2 bg-neutral-50 p-3 rounded-xl border border-neutral-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Filtros de Status */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-neutral-500 mr-1">Status:</span>
                <button
                  onClick={() => setTakeatFilter('PENDING_COURIER')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    takeatFilter === 'PENDING_COURIER'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-100'
                  }`}
                >
                  Aguardando Entregador ({takeatOrders.filter((o) => o.status === 'PENDING_COURIER').length})
                </button>
                <button
                  onClick={() => setTakeatFilter('IN_ROUTE')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    takeatFilter === 'IN_ROUTE'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-100'
                  }`}
                >
                  Em Rota ({takeatOrders.filter((o) => o.status === 'IN_ROUTE').length})
                </button>
                <button
                  onClick={() => setTakeatFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    takeatFilter === 'ALL'
                      ? 'bg-neutral-800 text-white shadow-xs'
                      : 'bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-100'
                  }`}
                >
                  Todos ({takeatOrders.length})
                </button>
              </div>

              {/* Filtros por Loja (Matriz vs Vinhedos) */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-neutral-500 mr-1">Unidade:</span>
                <button
                  onClick={() => setTakeatStoreFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    takeatStoreFilter === 'ALL'
                      ? 'bg-neutral-900 text-white shadow-xs'
                      : 'bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-100'
                  }`}
                >
                  Todas
                </button>
                <button
                  onClick={() => setTakeatStoreFilter('MATRIZ')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    takeatStoreFilter === 'MATRIZ'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-blue-900 border border-blue-200 hover:bg-blue-50'
                  }`}
                >
                  <span>🏢 Matriz</span>
                  <span className="text-[10px] opacity-80 font-normal">
                    ({takeatOrders.filter((o) => o.store_key !== 'VINHEDOS').length})
                  </span>
                </button>
                <button
                  onClick={() => setTakeatStoreFilter('VINHEDOS')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    takeatStoreFilter === 'VINHEDOS'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-white text-purple-900 border border-purple-200 hover:bg-purple-50'
                  }`}
                >
                  <span>🍇 Vinhedos</span>
                  <span className="text-[10px] opacity-80 font-normal">
                    ({takeatOrders.filter((o) => o.store_key === 'VINHEDOS').length})
                  </span>
                </button>
              </div>
            </div>

            {/* Ação de Agrupamento em Massa */}
            {selectedTakeatIds.length >= 2 && (
              <div className="flex items-center justify-between bg-gradient-to-r from-amber-500 to-orange-600 text-white px-3 py-1.5 rounded-lg shadow-sm mt-2">
                <span className="text-xs font-black">
                  📦 {selectedTakeatIds.length} pedidos selecionados para roteirização conjunta
                </span>
                <button
                  onClick={handleGroupSelectedTakeatOrders}
                  className="px-2.5 py-1 bg-white text-orange-700 hover:bg-orange-50 font-black text-xs rounded-md shadow-xs transition-all cursor-pointer flex items-center gap-1"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Agrupar no Simulador (Desconto 70%) &rarr;</span>
                </button>
              </div>
            )}
          </div>

          {/* Lista de Pedidos */}
          {loadingTakeatOrders ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-neutral-200">
              <RefreshCw className="w-8 h-8 text-orange-600 animate-spin mx-auto mb-2" />
              <p className="text-sm font-bold text-neutral-700">Carregando pedidos do Takeat...</p>
            </div>
          ) : takeatOrders.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-neutral-300 space-y-3">
              <span className="text-4xl block">🛵</span>
              <h4 className="text-sm font-bold text-neutral-800">
                {takeatFilter === 'PENDING_COURIER'
                  ? 'Nenhum pedido Takeat aguardando entregador no momento'
                  : 'Nenhum pedido encontrado neste filtro'}
              </h4>
              <p className="text-xs text-neutral-500 max-w-md mx-auto">
                Assim que um cliente fizer um pedido no delivery do Takeat e o operador aceitar no PDV, ele aparecerá aqui com cálculo de frete automático e o menu ficará piscando.
              </p>
              <div className="pt-2 flex items-center justify-center gap-2">
                <button
                  onClick={() => handleSimulateTakeatOrder('MATRIZ')}
                  disabled={simulatingTakeat}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Simular Pedido Matriz (Teste)</span>
                </button>
                <button
                  onClick={() => handleSimulateTakeatOrder('VINHEDOS')}
                  disabled={simulatingTakeat}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm transition-all inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Simular Pedido Vinhedos (Teste)</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {takeatOrders.map((order) => {
                const isSelected = selectedTakeatIds.includes(order.id);
                const isPending = order.status === 'PENDING_COURIER';
                const calculatedValue = parseFloat(order.calculated_freight_value || '0') || 0;
                const driverFee = (calculatedValue * 0.9).toFixed(2).replace('.', ',');
                const kantineFee = (calculatedValue * 0.1).toFixed(2).replace('.', ',');
                const takeatChargedFee = parseFloat(order.delivery_fee_charged || '0') || 0;

                return (
                  <div
                    key={order.id}
                    className={`bg-white rounded-2xl border transition-all p-5 shadow-xs space-y-4 ${
                      isPending
                        ? 'border-red-300 ring-1 ring-red-200'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    {/* Header do Card */}
                    <div className="flex items-start justify-between gap-3 border-b border-neutral-100 pb-3">
                      <div className="flex items-center gap-2.5">
                        {isPending && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTakeatIds((prev) => [...prev, order.id]);
                              } else {
                                setSelectedTakeatIds((prev) => prev.filter((id) => id !== order.id));
                              }
                            }}
                            className="w-4 h-4 rounded text-red-600 cursor-pointer"
                            title="Selecionar para agrupar em 1 rota"
                          />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm text-neutral-900 tracking-tight">
                              {order.display_id}
                            </span>

                            {/* Tag de Unidade (Matriz vs Vinhedos) */}
                            {order.store_key === 'VINHEDOS' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-0.5">
                                <span>🍇</span>
                                <span>Vinhedos</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-0.5">
                                <span>🏢</span>
                                <span>Matriz</span>
                              </span>
                            )}

                            {isPending ? (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-700 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping"></span>
                                Aguardando Entregador
                              </span>
                            ) : order.status === 'IN_ROUTE' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                                🛵 Em Rota {order.created_route_id ? `(#${order.created_route_id})` : ''}
                              </span>
                            ) : order.status === 'DELIVERED' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                                ✓ Entregue
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-200 text-neutral-600">
                                Dispensado
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-neutral-400 mt-0.5">
                            Recebido: {new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-black text-neutral-900 block">
                          R$ {parseFloat(order.order_total || '0').toFixed(2).replace('.', ',')}
                        </span>
                        <span className="text-[10px] font-bold text-neutral-500 uppercase">
                          {order.payment_method || 'PIX'}
                          {order.change_for ? ` (Troco p/ R$ ${order.change_for})` : ''}
                        </span>
                      </div>
                    </div>

                    {/* Dados do Cliente e Destino */}
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-neutral-800">{order.customer_name}</span>
                        {order.customer_phone && (
                          <a
                            href={`https://wa.me/55${order.customer_phone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md"
                          >
                            <Phone className="w-3 h-3" />
                            <span>{order.customer_phone}</span>
                          </a>
                        )}
                      </div>

                      <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-200/80 space-y-1">
                        <div className="flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-orange-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium text-neutral-900 leading-tight">
                              {order.destination_address}
                            </p>
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-orange-100 text-orange-800">
                              Bairro: {order.destination_neighborhood}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Itens do Pedido */}
                      {order.order_items_summary && (
                        <div className="flex items-start gap-1.5 text-neutral-600">
                          <ShoppingBag className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-0.5" />
                          <p className="text-[11px] leading-relaxed italic line-clamp-2">
                            {order.order_items_summary}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Box de Precificação & Frete Kantine */}
                    <div className="p-3 rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 text-xs space-y-1.5">
                      <div className="flex items-center justify-between font-bold text-neutral-800">
                        <span className="flex items-center gap-1 text-orange-800">
                          <DollarSign className="w-3.5 h-3.5" />
                          <span>Cálculo Frete Motor Kantine:</span>
                        </span>
                        <span className="text-sm font-black text-orange-700 font-mono">
                          R$ {calculatedValue.toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                      <div className="text-[10px] text-amber-900 bg-white/70 px-2 py-1 rounded-md border border-amber-200/60 flex items-center justify-between">
                        <span>Ponto de Coleta (Origem):</span>
                        <span className="font-bold">
                          {order.store_key === 'VINHEDOS'
                            ? '🍇 Vinhedos (José Elias, 71)'
                            : '🏢 Matriz (Getúlio Vargas, 1846)'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[10px] pt-1 border-t border-orange-200/70 text-neutral-600">
                        <div>
                          <span className="text-neutral-400 block">Taxa Takeat</span>
                          <span className="font-bold text-neutral-700">R$ {takeatChargedFee.toFixed(2).replace('.', ',')}</span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block">Repasse Motoboy (90%)</span>
                          <span className="font-bold text-emerald-700 font-mono">R$ {driverFee}</span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block">Kantine (10%)</span>
                          <span className="font-bold text-amber-700 font-mono">R$ {kantineFee}</span>
                        </div>
                      </div>
                    </div>

                    {/* Botões de Ação */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-100">
                      {isPending && (
                        <>
                          <button
                            onClick={() => handleConvertOrderToRoute(order.id, true)}
                            disabled={convertingTakeatId === order.id}
                            className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-black text-xs shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Cria a rota e já publica imediatamente para os motoboys aceitarem no Telegram"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>{convertingTakeatId === order.id ? 'Despachando...' : 'Despachar para Motoboys'}</span>
                          </button>

                          <button
                            onClick={() => handleConvertOrderToRoute(order.id, false)}
                            disabled={convertingTakeatId === order.id}
                            className="py-2 px-3 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            title="Salva como rascunho de rota na tela de rotas"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Rascunho</span>
                          </button>

                          <button
                            onClick={() => handleLoadTakeatIntoSimulator(order)}
                            className="py-2 px-2.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 font-bold text-xs transition-all flex items-center gap-1 cursor-pointer"
                            title="Carrega este endereço no simulador ao lado para simular paradas ou carro"
                          >
                            <Navigation className="w-3.5 h-3.5" />
                            <span>Simular</span>
                          </button>

                          <button
                            onClick={() => handleDismissTakeatOrder(order.id)}
                            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
                            title="Dispensar da fila"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}

                      {!isPending && (
                        <div className="w-full flex items-center justify-between text-xs">
                          {order.created_route_id && (
                            <button
                              onClick={() => {
                                if (onNavigateToRoutes) onNavigateToRoutes();
                              }}
                              className="text-orange-600 hover:text-orange-700 font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <span>Ver Rota #{order.created_route_id} &rarr;</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteTakeatOrder(order.id)}
                            className="text-neutral-400 hover:text-rose-600 text-[11px] ml-auto cursor-pointer"
                          >
                            Excluir registro
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Banner de aviso rápido dentro do Simulador se houver pedidos pendentes */}
      {activeSubTab === 'SIMULATOR' && takeatOrders.filter((o) => o.status === 'PENDING_COURIER').length > 0 && (
        <div
          onClick={() => setActiveSubTab('TAKEAT_ORDERS')}
          className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 shadow-xs flex items-center justify-between cursor-pointer hover:bg-amber-100/70 transition-all"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🛵</span>
            <div>
              <p className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                {takeatOrders.filter((o) => o.status === 'PENDING_COURIER').length === 1
                  ? '1 Pedido Takeat Aceito Aguardando Entregador'
                  : `${takeatOrders.filter((o) => o.status === 'PENDING_COURIER').length} Pedidos Takeat Aceitos Aguardando Entregador`}
              </p>
              <p className="text-[11px] text-amber-800">
                Clique aqui para ver a fila de pedidos do Takeat e despachar com 1 clique para os motoboys.
              </p>
            </div>
          </div>
          <span className="text-xs font-bold bg-white text-amber-900 border border-amber-300 px-3 py-1.5 rounded-lg shadow-2xs whitespace-nowrap">
            Ver Pedidos Takeat &rarr;
          </span>
        </div>
      )}

      {/* ============================================================== */}
      {/* 1. SIMULADOR AO VIVO                                            */}
      {/* ============================================================== */}
      {activeSubTab === 'SIMULATOR' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Coluna Esquerda: Configuração da Rota */}
          <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-5">
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <Navigation className="w-4 h-4 text-orange-600" />
              <span>Configuração da Rota Simulada</span>
            </h3>

            {/* Modalidade */}
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1.5">
                Modalidade de Transporte
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSimModality('MOTO')}
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    simModality === 'MOTO'
                      ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  <span className="text-lg">🏍️</span>
                  <span>Moto (Raio Geodésico Haversine)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSimModality('CAR')}
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    simModality === 'CAR'
                      ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  <Car className="w-4 h-4" />
                  <span>Carro (Raio Geodésico 1–20 km)</span>
                </button>
              </div>
            </div>

            {/* Ponto de Coleta */}
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1.5">
                📍 Ponto de Coleta (Origem)
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSimOriginKey('MATRIZ')}
                  className={`p-2.5 rounded-xl border text-xs font-semibold text-left transition-all cursor-pointer ${
                    simOriginKey === 'MATRIZ'
                      ? 'border-neutral-900 bg-neutral-100 text-neutral-950 font-bold ring-1 ring-neutral-900'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  <div className="font-bold">Kantine Matriz</div>
                  <div className="text-[10px] text-neutral-500 truncate">Av. Getúlio Vargas, 1846</div>
                </button>

                <button
                  type="button"
                  onClick={() => setSimOriginKey('VINHEDOS')}
                  className={`p-2.5 rounded-xl border text-xs font-semibold text-left transition-all cursor-pointer ${
                    simOriginKey === 'VINHEDOS'
                      ? 'border-neutral-900 bg-neutral-100 text-neutral-950 font-bold ring-1 ring-neutral-900'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  <div className="font-bold">Kantine Vinhedos</div>
                  <div className="text-[10px] text-neutral-500 truncate">Rua José Elias, 71</div>
                </button>

                <button
                  type="button"
                  onClick={() => setSimOriginKey('CUSTOM')}
                  className={`p-2.5 rounded-xl border text-xs font-semibold text-left transition-all cursor-pointer ${
                    simOriginKey === 'CUSTOM'
                      ? 'border-neutral-900 bg-neutral-100 text-neutral-950 font-bold ring-1 ring-neutral-900'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  <div className="font-bold">Coleta Alternativa</div>
                  <div className="text-[10px] text-neutral-500 truncate">Endereço livre</div>
                </button>
              </div>

              {simOriginKey === 'CUSTOM' && (
                <div className="mt-2">
                  <input
                    type="text"
                    placeholder="Digite o endereço completo da coleta alternativa..."
                    value={simCustomAddress}
                    onChange={(e) => setSimCustomAddress(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                  />
                </div>
              )}
            </div>

            {/* Parâmetros do Rascunho de Rota */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-200">
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-orange-600" />
                  <span>Duração Máxima Desejada (Prazo Final no Aceite)</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: 50 min ou 18:00"
                  value={simDeadline}
                  onChange={(e) => setSimDeadline(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white font-semibold"
                />
                <span className="text-[10px] text-neutral-400 block mt-0.5">
                  Ao aceitar a corrida, o horário final exato será calculado automaticamente.
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1 flex items-center gap-1">
                  <Package className="w-3.5 h-3.5 text-orange-600" />
                  <span>Descrição da Carga</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Encomenda Kantine Gastronomia"
                  value={simCargoDescription}
                  onChange={(e) => setSimCargoDescription(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white"
                />
              </div>
            </div>

            {/* Paradas */}
            <div className="space-y-3 pt-2 border-t border-neutral-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                  Paradas de Entrega ({simStops.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const nextSeq = simStops.length + 1;
                    setSimStops([
                      ...simStops,
                      {
                        sequence: nextSeq,
                        destination_address: '',
                        destination_neighborhood: 'Centro',
                        is_horizontal_condo: false,
                      },
                    ]);
                  }}
                  className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Adicionar Parada</span>
                </button>
              </div>

              <div className="space-y-3">
                {simStops.map((stop, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/70 space-y-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-neutral-900 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-orange-600 text-white flex items-center justify-center text-[10px]">
                          {idx + 1}
                        </span>
                        <span>Parada #{idx + 1}</span>
                      </span>

                      {simStops.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = simStops.filter((_, i) => i !== idx).map((s, i) => ({
                              ...s,
                              sequence: i + 1,
                            }));
                            setSimStops(updated);
                          }}
                          className="text-rose-600 hover:text-rose-800 p-1 cursor-pointer"
                          title="Remover parada"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Campo de Endereço Unificado (Estilo Apps de Transporte) */}
                    <div>
                      <AddressAutocompleteInput
                        value={stop.destination_address}
                        onChange={(val) => {
                          const updated = [...simStops];
                          updated[idx].destination_address = val;
                          // Quando o usuário altera o texto do endereço, limpa o bairro antigo e coordenadas
                          // para evitar que um bairro desatualizado seja mantido
                          updated[idx].dropoff_coords = undefined;
                          updated[idx].destination_neighborhood = '';
                          setSimStops(updated);
                        }}
                        onResetValidation={() => {
                          const updated = [...simStops];
                          updated[idx].dropoff_coords = undefined;
                          updated[idx].destination_neighborhood = '';
                          setSimStops(updated);
                        }}
                        onSelectSuggestion={(s: GeocodedAddressSuggestion) => {
                          const updated = [...simStops];
                          updated[idx].destination_address = s.formattedAddress;
                          updated[idx].destination_neighborhood = s.neighborhood;
                          updated[idx].dropoff_coords = s.coords;
                          setSimStops(updated);
                          setSuccessMessage(`📍 Endereço validado: ${s.formattedAddress} (Bairro ${s.neighborhood})`);
                        }}
                        originCoords={getOriginInfo().coords}
                        placeholder="Endereço de Destino (digite a rua, número ou local...)"
                        isConfirmed={Boolean(stop.dropoff_coords)}
                        confirmedNeighborhood={stop.destination_neighborhood}
                      />
                    </div>

                    {/* Bairro Validado e Sincronizado Conforme Endereço */}
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${stop.dropoff_coords ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`}></span>
                        <span className="text-[11px] text-neutral-500 font-medium">Bairro:</span>
                        <span className="font-bold text-neutral-900 bg-white px-2 py-0.5 rounded-md border border-neutral-200 shadow-2xs">
                          {stop.destination_neighborhood || 'Identificando pelo endereço...'}
                        </span>
                        {stop.dropoff_coords && (
                          <span className="text-[10px] text-emerald-700 font-mono hidden sm:inline">
                            (GPS: {stop.dropoff_coords.lat.toFixed(4)}, {stop.dropoff_coords.lng.toFixed(4)})
                          </span>
                        )}
                      </div>

                      {manualOverrideIdx === idx ? (
                        <div className="flex items-center gap-1.5">
                          <select
                            value={stop.destination_neighborhood}
                            onChange={(e) => {
                              const updated = [...simStops];
                              const newNeighborhood = e.target.value;
                              updated[idx].destination_neighborhood = newNeighborhood;
                              const foundN = allNeighborhoods.find((n) => n.name === newNeighborhood);
                              if (foundN) {
                                updated[idx].dropoff_coords = foundN.coords;
                              }
                              setSimStops(updated);
                            }}
                            className="px-2 py-1 border border-orange-300 rounded-lg bg-white font-semibold text-xs focus:border-orange-500"
                          >
                            {allNeighborhoods.map((n) => (
                              <option key={n.name} value={n.name}>
                                {n.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setManualOverrideIdx(null)}
                            className="text-[10px] text-neutral-600 hover:text-neutral-900 font-bold px-2 py-1 rounded bg-neutral-200 cursor-pointer"
                          >
                            OK
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setManualOverrideIdx(idx)}
                          className="text-[10px] font-semibold text-neutral-500 hover:text-orange-600 underline cursor-pointer"
                        >
                          Alterar Bairro
                        </button>
                      )}
                    </div>

                    {/* Toggle Condomínio Horizontal (Exclusivo para CARRO) */}
                    {simModality === 'CAR' ? (
                      <div className="flex items-center justify-between pt-1 border-t border-neutral-200/80">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={stop.is_horizontal_condo}
                            onChange={(e) => {
                              const updated = [...simStops];
                              updated[idx].is_horizontal_condo = e.target.checked;
                              setSimStops(updated);
                            }}
                            className="w-4 h-4 accent-orange-600 rounded"
                          />
                          <span className="font-bold text-neutral-800 text-[11px] flex items-center gap-1">
                            <span>🏡 Condomínio Horizontal</span>
                            <span className="text-[10px] text-orange-600 font-extrabold bg-orange-100 px-1.5 py-0.2 rounded-full">
                              +20% na tarifa base (Carro)
                            </span>
                          </span>
                        </label>
                        <span className="text-[10px] text-neutral-400">
                          {stop.is_horizontal_condo ? 'Sim' : 'Não'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between pt-1 border-t border-neutral-200/60 text-[10px] text-neutral-400">
                        <span>🏍️ Moto: sem adicional de condomínio</span>
                        <span className="text-neutral-400 font-mono">Tarifa por raio</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Coluna Direita: Resultado do Motor */}
          <div className="lg:col-span-5 space-y-5">
            {/* Box de Resultado Financeiro */}
            <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                <h3 className="text-sm font-black text-neutral-950 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                  <span>Resultado da Precificação</span>
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-neutral-100 text-neutral-800 border border-neutral-200">
                  {simResult.is_grouped ? '70% Agrupada' : '100% Individual'}
                </span>
              </div>

              {/* Paradas Detalhadas */}
              <div className="space-y-2 text-xs">
                {simResult.stops.map((s, idx) => {
                  const customerInfo = extractCustomerData({
                    cargo_description: simCargoDescription,
                    destination_address: s.destination_address,
                  });
                  return (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-200/80 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-neutral-900 flex items-center justify-between gap-1">
                        <span>Parada #{s.sequence}: {s.destination_neighborhood || 'Bairro pendente'}</span>
                      </div>
                      {(customerInfo.name || customerInfo.phone) && (
                        <div className="text-[10px] text-neutral-700 flex items-center gap-1.5 mt-0.5 font-medium truncate">
                          {customerInfo.name && (
                            <span className="font-bold text-neutral-800 flex items-center gap-0.5">
                              <span>👤</span>
                              <span>{customerInfo.name}</span>
                            </span>
                          )}
                          {customerInfo.phone && (
                            <span className="text-emerald-700 flex items-center gap-0.5 font-semibold bg-emerald-50 px-1 rounded">
                              <Phone className="w-2.5 h-2.5 text-emerald-600" />
                              <span>{customerInfo.phone}</span>
                            </span>
                          )}
                        </div>
                      )}
                      <div className="text-[10px] text-neutral-500 mt-0.5">
                        Base: R$ {s.base_tariff.toFixed(2)}
                        {s.is_horizontal_condo ? ' (+20% condomínio = R$ ' + s.base_tariff_with_condo.toFixed(2) + ')' : ''}
                        {simResult.is_grouped ? ' × 70%' : ''}
                        {s.distance_km ? ` • Raio: ${s.distance_km} km (${s.rounded_radius_km} km)` : ''}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono font-black text-sm text-neutral-950">
                        R$ {s.final_stop_tariff.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  );
                })}
              </div>

              {/* Resumo da Corrida & Split 90/10 */}
              <div className="p-4 rounded-xl bg-neutral-900 text-white space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                  <span className="text-xs text-neutral-400">Total Operacional da Rota:</span>
                  <span className="text-lg font-black text-white font-mono">
                    R$ {simResult.route_operational_total.toFixed(2)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                  <div className="bg-neutral-800/80 p-2.5 rounded-lg border border-neutral-700">
                    <span className="text-[10px] text-neutral-400 block font-semibold">
                      🛵 Entregador (90%)
                    </span>
                    <span className="text-base font-black text-emerald-400 font-mono">
                      R$ {simResult.driver_remuneration.toFixed(2)}
                    </span>
                  </div>

                  <div className="bg-neutral-800/80 p-2.5 rounded-lg border border-neutral-700">
                    <span className="text-[10px] text-neutral-400 block font-semibold">
                      🏢 Kantine Gestão (10%)
                    </span>
                    <span className="text-base font-black text-amber-400 font-mono">
                      R$ {simResult.kantine_administration.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="text-[10px] text-neutral-400 italic text-center">
                  Soma exata em centavos: R$ {simResult.driver_remuneration.toFixed(2)} + R$ {simResult.kantine_administration.toFixed(2)} = R$ {simResult.route_operational_total.toFixed(2)}
                </div>
              </div>

              {/* Botão Google Maps */}
              {simResult.google_maps_url && (
                <div className="pt-1">
                  <a
                    href={simResult.google_maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-3 rounded-xl bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 text-neutral-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-neutral-600" />
                    <span>Abrir Rota no Google Maps</span>
                  </a>
                </div>
              )}
            </div>

            {/* ============================================================== */}
            {/* CONVERSÃO EM RASCUNHO DE ROTA OPERACIONAL                      */}
            {/* ============================================================== */}
            <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-neutral-900 text-white flex items-center justify-center shadow-xs">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-neutral-900 leading-tight">
                      Transformar em Rota de Entrega
                    </h4>
                    <span className="text-[10px] text-neutral-500 font-medium">
                      Integração Direta com a Central de Rotas
                    </span>
                  </div>
                </div>
                {simStops.every((s) => s.dropoff_coords && s.destination_neighborhood) ? (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    GPS Validado
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                    Validação GPS Pendente
                  </span>
                )}
              </div>

              <p className="text-xs text-neutral-600 leading-relaxed">
                Transforme os valores calculados, paradas e ponto de coleta desta simulação diretamente em um rascunho de rota no painel operacional.
              </p>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handleCreateDraftDirectly}
                  disabled={creatingDraft}
                  className="w-full py-3 px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-950 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  title="Cria o rascunho no banco e abre a tela de rotas"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>{creatingDraft ? 'Criando Rascunho no Banco...' : 'Criar Rascunho de Rota com Esta Simulação'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleLoadIntoRouteForm}
                  className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-neutral-50 border border-neutral-300 text-neutral-800 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-2xs"
                  title="Abre a modal de criação de rota com todos os dados da simulação pré-preenchidos"
                >
                  <Edit3 className="w-4 h-4 text-neutral-600" />
                  <span>Carregar e Ajustar no Formulário de Nova Rota</span>
                </button>
              </div>
            </div>

            {/* Proposta Formatada para WhatsApp */}
            <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                  <Send className="w-4 h-4 text-emerald-600" />
                  <span>Mensagem para WhatsApp</span>
                </h4>
                <button
                  type="button"
                  onClick={() => copyToClipboard(whatsAppProposal, 'whatsapp_sim')}
                  className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedKey === 'whatsapp_sim' ? 'Copiado!' : 'Copiar Texto'}</span>
                </button>
              </div>

              <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 font-mono text-[11px] text-neutral-800 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
                {whatsAppProposal}
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(whatsAppProposal)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Compartilhar via WhatsApp</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* ============================================================== */}
      {/* 2. TABELA OFICIAL DE CARRO POR RAIO (1 A 20 KM)                 */}
      {/* ============================================================== */}
      {activeSubTab === 'CAR_RADIUS' && (
        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                <Car className="w-4 h-4 text-orange-600" />
                <span>Tabela Oficial de Carro por Distância / Raio (1 a 20 km)</span>
              </h3>
              <p className="text-xs text-neutral-600 mt-0.5">
                Os valores abaixo representam o <strong>Preço Final da Entrega</strong>. O repasse ao motorista é <strong>deduzido de 10%</strong> (90% motorista / 10% gestão Kantine).
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <a
                href="/api/freight-engine/download-excel"
                download="Tabela_de_Fretes_Kantine_Gastronomia_Uberlandia.xlsx"
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                title="Baixar planilha Excel atualizada com as novas tarifas de carro"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar Excel</span>
              </a>
              <span className="px-2.5 py-1 rounded-lg bg-orange-50 text-orange-800 font-bold border border-orange-200">
                12 Faixas de Distância
              </span>
            </div>
          </div>

          {/* Grid com as 12 Faixas de Distância de Carro */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {CAR_RADIUS_DISPLAY_TIERS.map((tier) => (
              <div
                key={tier.tier}
                className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/70 text-center space-y-1.5 hover:border-orange-300 transition-colors"
              >
                <div className="flex items-center justify-center gap-1.5">
                  <Car className="w-3.5 h-3.5 text-neutral-500" />
                  <span className="text-xs font-bold text-neutral-700">
                    {tier.tier}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 block">
                    Preço Final
                  </span>
                  <span className="text-lg font-black font-mono text-orange-700 block">
                    R$ {tier.fee.toFixed(2)}
                  </span>
                </div>
                <span className="text-[10px] text-neutral-400 block">
                  {tier.rangeKm}
                </span>
                <div className="pt-2 border-t border-neutral-200/80 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-emerald-700 font-bold" title="Preço Final deduzido de 10% de taxa Kantine">
                    Mot. (-10%): R$ {(tier.fee * 0.9).toFixed(2)}
                  </span>
                  <span className="text-neutral-500" title="Taxa de Gestão Kantine (10%)">
                    10%: R$ {(tier.fee * 0.1).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Avisos e Regras da Modalidade Carro */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Distâncias Acima de 20 km (Sob Consulta):</span>
                <span>
                  Para corridas de carro com distância superior a 20 km a partir do ponto de coleta, a precificação é negociada sob consulta ou calculada com taxa especial informada manualmente pelo operador.
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-orange-50 border border-orange-200 text-xs text-orange-900 flex items-start gap-2">
              <Building2 className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Condomínio Horizontal (+20% na Base):</span>
                <span>
                  Para entregas de Carro com destino em condomínio horizontal, o acréscimo de +20% é aplicado sobre a tarifa-base do raio antes do cálculo de agrupamento (fator 70%).
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. TABELA DE MOTO POR RAIO (1 A 20 KM)                          */}
      {/* ============================================================== */}
      {activeSubTab === 'MOTO_RADIUS' && (
        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-4">
          <div>
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <span className="text-base">🏍️</span>
              <span>Tabela Oficial de Moto por Raio Geográfico (Seção 6)</span>
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Cálculo em linha reta geodésico (Haversine) da coleta a cada entrega.
              Arredondamento para o km superior (ex: 4,3 km = 5 km). Acima de 20 km: SOB CONSULTA.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {Object.entries(MOTO_RADIUS_TARIFF_TABLE).map(([kmStr, fee]) => {
              const km = Number(kmStr);
              return (
                <div
                  key={km}
                  className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/70 text-center space-y-1"
                >
                  <span className="text-xs font-bold text-neutral-600 block">
                    Até {km} km
                  </span>
                  <span className="text-base font-black font-mono text-orange-700 block">
                    R$ {fee.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-neutral-400 block">
                    {km === 1 ? 'Raio mínimo' : `Faixa de ${km - 1}.1 a ${km} km`}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Acima de 20 km:</strong> Tarifa <strong>SOB CONSULTA</strong>. O operador deve confirmar manualmente o valor para trajetos superiores ao raio máximo de 20 km.
            </span>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 4. REGRAS E PARÂMETROS                                          */}
      {/* ============================================================== */}
      {activeSubTab === 'PARAMS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-orange-600" />
              <span>Pontos de Coleta Cadastrados (Seção 4)</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 space-y-1">
                <span className="font-bold text-neutral-900 block">Kantine Matriz</span>
                <span className="text-neutral-600 block">Av. Getúlio Vargas, 1846 — Uberlândia/MG</span>
                <span className="text-[11px] text-neutral-400 block font-mono">
                  lat: {PICKUP_PRESETS.MATRIZ.coords.lat}, lng: {PICKUP_PRESETS.MATRIZ.coords.lng}
                </span>
              </div>

              <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 space-y-1">
                <span className="font-bold text-neutral-900 block">Kantine Vinhedos</span>
                <span className="text-neutral-600 block">Rua José Elias, 71 — Uberlândia/MG</span>
                <span className="text-[11px] text-neutral-400 block font-mono">
                  lat: {PICKUP_PRESETS.VINHEDOS.coords.lat}, lng: {PICKUP_PRESETS.VINHEDOS.coords.lng}
                </span>
              </div>

              <div className="p-3 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/50 space-y-1">
                <span className="font-bold text-neutral-900 block">Coleta Alternativa</span>
                <span className="text-neutral-500 block">Endereço livre validado na criação da rota.</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-orange-600" />
              <span>Parâmetros Operacionais Fixos</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 flex items-center justify-between">
                <div>
                  <span className="font-bold text-neutral-900 block">Condomínio Horizontal</span>
                  <span className="text-neutral-500 text-[11px]">Acréscimo sobre a tarifa base individual</span>
                </div>
                <span className="font-mono font-bold text-sm text-orange-600">+20%</span>
              </div>

              <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 flex items-center justify-between">
                <div>
                  <span className="font-bold text-neutral-900 block">Fator de Agrupamento</span>
                  <span className="text-neutral-500 text-[11px]">Aplicado em rotas com 2 ou mais entregas</span>
                </div>
                <span className="font-mono font-bold text-sm text-blue-600">70% da tarifa</span>
              </div>

              <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 flex items-center justify-between">
                <div>
                  <span className="font-bold text-neutral-900 block">Repasse do Entregador</span>
                  <span className="text-neutral-500 text-[11px]">Percentual da rota destinado ao motorista</span>
                </div>
                <span className="font-mono font-bold text-sm text-emerald-600">90%</span>
              </div>

              <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 flex items-center justify-between">
                <div>
                  <span className="font-bold text-neutral-900 block">Administração Kantine</span>
                  <span className="text-neutral-500 text-[11px]">Percentual administrativo Kantine</span>
                </div>
                <span className="font-mono font-bold text-sm text-amber-600">10%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 5. CONFIGURAÇÕES & CHAVES DA INTEGRAÇÃO TAKEAT (MULTI-LOJA)    */}
      {/* ============================================================== */}
      {activeSubTab === 'TAKEAT_CONFIG' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 uppercase tracking-widest flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-amber-600" />
                  Takeat Multi-Unidade (Matriz & Vinhedos)
                </span>
                <h3 className="text-base font-black text-neutral-900 tracking-tight">
                  Configuração & Chaves de API por Loja
                </h3>
              </div>
              <p className="text-xs text-neutral-500 mt-1 max-w-2xl leading-relaxed">
                Cada loja possui seus próprios identificadores no Takeat (Store ID / Cardápio / Webhooks). Configure abaixo os dados independentes da <strong>Kantine Matriz</strong> e da <strong>Kantine Vinhedos</strong> para cálculo de frete a partir do ponto de coleta exato de cada uma.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleSimulateTakeatOrder(selectedConfigStore)}
                disabled={simulatingTakeat}
                className="px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Testar Pedido Simulado ({selectedConfigStore === 'VINHEDOS' ? 'Vinhedos' : 'Matriz'})</span>
              </button>
            </div>
          </div>

          {/* Seletor de Loja (Matriz vs Vinhedos) */}
          <div className="bg-white p-3 rounded-2xl border border-neutral-200 shadow-xs flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-neutral-500 ml-2 mr-1">Selecione a Loja para Configurar:</span>
            <button
              type="button"
              onClick={() => setSelectedConfigStore('MATRIZ')}
              className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                selectedConfigStore === 'MATRIZ'
                  ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-300'
                  : 'bg-neutral-50 border border-neutral-200 text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <span>🏢 Kantine Matriz</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-md ${selectedConfigStore === 'MATRIZ' ? 'bg-blue-700 text-blue-100' : 'bg-neutral-200 text-neutral-600'}`}>
                Av. Getúlio Vargas, 1846
              </span>
              {storeConfigs.MATRIZ.has_api_key && (
                <span className="w-2 h-2 rounded-full bg-emerald-400" title="API Key configurada"></span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setSelectedConfigStore('VINHEDOS')}
              className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                selectedConfigStore === 'VINHEDOS'
                  ? 'bg-purple-600 text-white shadow-md ring-2 ring-purple-300'
                  : 'bg-neutral-50 border border-neutral-200 text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <span>🍇 Kantine Vinhedos</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-md ${selectedConfigStore === 'VINHEDOS' ? 'bg-purple-700 text-purple-100' : 'bg-neutral-200 text-neutral-600'}`}>
                Rua José Elias, 71
              </span>
              {storeConfigs.VINHEDOS.has_api_key && (
                <span className="w-2 h-2 rounded-full bg-emerald-400" title="API Key configurada"></span>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Coluna 1: Formulário de Credenciais e Parâmetros */}
            <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-5">
              {/* Box URL do Webhook Específico desta loja */}
              <div className={`p-4 rounded-xl border space-y-2 ${
                selectedConfigStore === 'VINHEDOS'
                  ? 'bg-gradient-to-r from-purple-50 to-fuchsia-50 border-purple-200'
                  : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200'
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-black flex items-center gap-1.5 ${
                    selectedConfigStore === 'VINHEDOS' ? 'text-purple-900' : 'text-blue-900'
                  }`}>
                    <Navigation className="w-3.5 h-3.5" />
                    <span>
                      URL do Webhook Exclusiva para a Loja {selectedConfigStore === 'VINHEDOS' ? 'Vinhedos' : 'Matriz'}
                    </span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                    Ativo e Pronto
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/api/webhooks/takeat/${selectedConfigStore.toLowerCase()}`}
                    className="flex-1 px-3 py-2 text-xs bg-white border border-neutral-300 rounded-lg text-neutral-800 font-mono select-all shadow-inner"
                  />
                  <button
                    onClick={() => copyToClipboard(`${window.location.origin}/api/webhooks/takeat/${selectedConfigStore.toLowerCase()}`, `webhook_${selectedConfigStore}`)}
                    className={`px-3 py-2 rounded-lg text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer whitespace-nowrap ${
                      selectedConfigStore === 'VINHEDOS' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {copiedKey === `webhook_${selectedConfigStore}` ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-white" />
                        <span>Copiar URL</span>
                      </>
                    )}
                  </button>
                </div>
                <p className={`text-[11px] leading-relaxed ${
                  selectedConfigStore === 'VINHEDOS' ? 'text-purple-900/80' : 'text-blue-900/80'
                }`}>
                  No painel Takeat da <strong>{selectedConfigStore === 'VINHEDOS' ? 'Kantine Vinhedos' : 'Kantine Matriz'}</strong>, cadastre esta URL para receber os eventos. Todo pedido que chegar por aqui será associado imediatamente a esta unidade e o cálculo do frete partirá de seu endereço!
                </p>
              </div>

              {/* Formulário de Configuração da Loja Selecionada */}
              <form onSubmit={handleSaveTakeatConfig} className="space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-neutral-800 flex items-center gap-1.5">
                    <span>Configurações: {activeConfig.store_name || (selectedConfigStore === 'VINHEDOS' ? 'Kantine Vinhedos' : 'Kantine Matriz')}</span>
                  </h4>
                  <span className="text-[11px] font-bold text-neutral-500">
                    ID Interno: #{activeConfig.id}
                  </span>
                </div>

                {/* Nome de Exibição da Unidade */}
                <div>
                  <label className="block text-xs font-bold text-neutral-800 mb-1">
                    Nome Identificador da Unidade
                  </label>
                  <input
                    type="text"
                    value={activeConfig.store_name || ''}
                    onChange={(e) =>
                      setStoreConfigs({
                        ...storeConfigs,
                        [selectedConfigStore]: {
                          ...activeConfig,
                          store_name: e.target.value,
                        },
                      })
                    }
                    placeholder="Ex: Kantine Matriz ou Kantine Vinhedos"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-xs focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  />
                </div>

                {/* Store ID / Slug no Takeat */}
                <div>
                  <label className="block text-xs font-bold text-neutral-800 mb-1">
                    ID da Loja / Slug no Takeat ({selectedConfigStore})
                  </label>
                  <input
                    type="text"
                    value={activeConfig.store_id || ''}
                    onChange={(e) =>
                      setStoreConfigs({
                        ...storeConfigs,
                        [selectedConfigStore]: {
                          ...activeConfig,
                          store_id: e.target.value,
                        },
                      })
                    }
                    placeholder={selectedConfigStore === 'VINHEDOS' ? 'ex: kantine-vinhedos ou ID numérico' : 'ex: kantinegastronomia'}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-xs focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Identificador desta unidade no Takeat. Permite que o webhook geral identifique a loja automaticamente caso use uma única URL.
                  </p>
                </div>

                {/* API Key / Token */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-neutral-800">
                      Chave de API / Bearer Token do Takeat ({selectedConfigStore})
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="text-[11px] text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer"
                    >
                      {showApiKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span>{showApiKey ? 'Ocultar chave' : 'Mostrar chave'}</span>
                    </button>
                  </div>
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={activeConfig.api_key || ''}
                    onChange={(e) =>
                      setStoreConfigs({
                        ...storeConfigs,
                        [selectedConfigStore]: {
                          ...activeConfig,
                          api_key: e.target.value,
                        },
                      })
                    }
                    placeholder="Cole a chave de API gerada no Takeat para esta loja..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-xs font-mono focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Armazenada com segurança no banco de dados. Nunca exposta a entregadores ou clientes.
                  </p>
                </div>

                {/* Webhook Secret */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-neutral-800">
                      Segredo do Webhook (Opcional - Validação de Assinatura)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                      className="text-[11px] text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer"
                    >
                      {showWebhookSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span>{showWebhookSecret ? 'Ocultar' : 'Mostrar'}</span>
                    </button>
                  </div>
                  <input
                    type={showWebhookSecret ? 'text' : 'password'}
                    value={activeConfig.webhook_secret || ''}
                    onChange={(e) =>
                      setStoreConfigs({
                        ...storeConfigs,
                        [selectedConfigStore]: {
                          ...activeConfig,
                          webhook_secret: e.target.value,
                        },
                      })
                    }
                    placeholder="Segredo do webhook configurado no Takeat..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-xs font-mono focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  />
                </div>

                <div className="pt-3 border-t border-neutral-200 space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-neutral-700">
                    Ponto de Saída & Modalidade
                  </h4>

                  {/* Ponto de Saída */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                      Ponto de Saída Vinculado (Origem do Frete)
                    </label>
                    <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-xs text-neutral-900 block">
                          {selectedConfigStore === 'VINHEDOS' ? '🍇 Kantine Vinhedos' : '🏢 Kantine Matriz'}
                        </span>
                        <span className="text-[11px] text-neutral-500 block">
                          {selectedConfigStore === 'VINHEDOS'
                            ? 'Rua José Elias, 71 — Bairro Karaíba'
                            : 'Av. Getúlio Vargas, 1846 — Bairro Daniel Fonseca'}
                        </span>
                      </div>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        Ponto Automático
                      </span>
                    </div>
                  </div>

                  {/* Modalidade Padrão */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                      Modalidade Preferencial desta Loja
                    </label>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <label
                        className={`p-3 rounded-xl border cursor-pointer flex items-center gap-2 transition-all ${
                          activeConfig.preferred_modality === 'MOTO'
                            ? 'border-orange-500 bg-orange-50/60 text-orange-900 font-bold'
                            : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`preferred_modality_${selectedConfigStore}`}
                          value="MOTO"
                          checked={activeConfig.preferred_modality === 'MOTO'}
                          onChange={() =>
                            setStoreConfigs({
                              ...storeConfigs,
                              [selectedConfigStore]: {
                                ...activeConfig,
                                preferred_modality: 'MOTO',
                              },
                            })
                          }
                          className="text-orange-600"
                        />
                        <div>
                          <span>🏍️ Moto (Raio 1–20 km)</span>
                          <span className="text-[10px] text-neutral-500 block font-normal">
                            Sem taxa de condomínio
                          </span>
                        </div>
                      </label>

                      <label
                        className={`p-3 rounded-xl border cursor-pointer flex items-center gap-2 transition-all ${
                          activeConfig.preferred_modality === 'CAR'
                            ? 'border-orange-500 bg-orange-50/60 text-orange-900 font-bold'
                            : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`preferred_modality_${selectedConfigStore}`}
                          value="CAR"
                          checked={activeConfig.preferred_modality === 'CAR'}
                          onChange={() =>
                            setStoreConfigs({
                              ...storeConfigs,
                              [selectedConfigStore]: {
                                ...activeConfig,
                                preferred_modality: 'CAR',
                              },
                            })
                          }
                          className="text-orange-600"
                        />
                        <div>
                          <span>🚗 Carro (70 Bairros)</span>
                          <span className="text-[10px] text-neutral-500 block font-normal">
                            Faixas R$ 18 / R$ 24 / R$ 30
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Toggles */}
                  <div className="space-y-2 pt-2">
                    <label className="flex items-center gap-2 text-xs text-neutral-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeConfig.auto_calculate_freight}
                        onChange={(e) =>
                          setStoreConfigs({
                            ...storeConfigs,
                            [selectedConfigStore]: {
                              ...activeConfig,
                              auto_calculate_freight: e.target.checked,
                            },
                          })
                        }
                        className="w-4 h-4 text-orange-600 rounded"
                      />
                      <span className="font-medium">
                        Calcular frete automaticamente no Motor da Kantine ao receber pedidos da {selectedConfigStore === 'VINHEDOS' ? 'Vinhedos' : 'Matriz'}
                      </span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-neutral-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeConfig.notification_sound_enabled}
                        onChange={(e) =>
                          setStoreConfigs({
                            ...storeConfigs,
                            [selectedConfigStore]: {
                              ...activeConfig,
                              notification_sound_enabled: e.target.checked,
                            },
                          })
                        }
                        className="w-4 h-4 text-orange-600 rounded"
                      />
                      <span className="font-medium">
                        Destacar menu com aviso pulsante ao receber novos pedidos desta loja
                      </span>
                    </label>
                  </div>
                </div>

                <div className="pt-4 border-t border-neutral-200 flex items-center justify-end">
                  <button
                    type="submit"
                    disabled={savingConfig}
                    className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>
                      {savingConfig
                        ? 'Salvando...'
                        : `Salvar Configurações da ${selectedConfigStore === 'VINHEDOS' ? 'Vinhedos' : 'Matriz'}`}
                    </span>
                  </button>
                </div>
              </form>
            </div>

            {/* Coluna 2: Instruções & Documentação Takeat Multi-Loja */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-neutral-800 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-orange-600" />
                    <span>Conexão Multi-Loja no Takeat</span>
                  </h4>
                  <a
                    href="https://docs.takeat.app/externo/v1/mcp-api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-bold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1"
                  >
                    <span>Docs Takeat</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="space-y-3 text-xs text-neutral-600 leading-relaxed">
                  <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 space-y-1">
                    <span className="font-bold text-neutral-900 block">1. Painel de Cada Loja</span>
                    <p className="text-[11px] text-neutral-500">
                      No Takeat, cada unidade (Matriz e Vinhedos) tem seu próprio painel ou seletor de filial com ID específico.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 space-y-1">
                    <span className="font-bold text-neutral-900 block">2. Webhook por Filial</span>
                    <p className="text-[11px] text-neutral-500">
                      Cole a <strong>URL do Webhook Matriz</strong> no painel da Matriz e a <strong>URL do Webhook Vinhedos</strong> no painel dos Vinhedos.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 space-y-1">
                    <span className="font-bold text-neutral-900 block">3. Cálculo Geodésico Automático</span>
                    <p className="text-[11px] text-neutral-500">
                      Os pedidos recebidos de Vinhedos usam as coordenadas do Karaíba/José Elias, enquanto os da Matriz usam o Daniel Fonseca/Getúlio Vargas. O motoboy recebe a rota com a coleta na unidade correta!
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 space-y-1">
                    <span className="font-bold text-neutral-900 block">4. Filtro e Separação</span>
                    <p className="text-[11px] text-neutral-500">
                      Na aba <strong>Pedidos Takeat</strong>, os operadores podem filtrar por Todas, apenas Matriz ou apenas Vinhedos para acompanhar a fila de saída.
                    </p>
                  </div>
                </div>

                {activeConfig.last_webhook_received_at && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                    <span className="font-bold block">
                      Último Webhook Recebido na {selectedConfigStore === 'VINHEDOS' ? 'Vinhedos' : 'Matriz'}:
                    </span>
                    <span className="text-[11px]">
                      {new Date(activeConfig.last_webhook_received_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
