import React, { useState, useEffect } from 'react';
import {
  Pencil,
  AlertTriangle,
  CheckCircle,
  Clock,
  MapPin,
  Package,
  Plus,
  Trash2,
  Lock,
  ArrowRight,
  Send,
  X,
  RefreshCw,
  Info,
  Calculator,
} from 'lucide-react';
import {
  calculateRoutePricing,
  UBERLANDIA_70_NEIGHBORHOODS,
  PICKUP_PRESETS,
} from '../shared/freightEngine.ts';
import {
  Route,
  RouteStop,
  PickupLocation,
  EditRouteDTO,
  RouteEditAnalysis,
  PickupType,
  DeliveryMode,
  VehicleType,
} from '../server/types.ts';

interface RouteEditModalProps {
  routeId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedRoute: any) => void;
  getAuthHeaders: () => Promise<HeadersInit>;
  locations: Array<{ id: number; name: string; address: string; neighborhood?: string | null; active?: boolean }>;
}

export const RouteEditModal: React.FC<RouteEditModalProps> = ({
  routeId,
  isOpen,
  onClose,
  onSuccess,
  getAuthHeaders,
  locations,
}) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  // Fresh route data
  const [currentRoute, setCurrentRoute] = useState<Route | null>(null);
  const [currentStops, setCurrentStops] = useState<RouteStop[]>([]);

  // Step state: 'EDIT' | 'PREVIEW'
  const [step, setStep] = useState<'EDIT' | 'PREVIEW'>('EDIT');
  const [previewAnalysis, setPreviewAnalysis] = useState<RouteEditAnalysis | null>(null);

  // Rejected proposal recovery state
  const [hasRejectedProposal, setHasRejectedProposal] = useState<boolean>(false);
  const [rejectedProposalInfo, setRejectedProposalInfo] = useState<{
    diff_summary?: string;
    rejected_at?: string;
  } | null>(null);

  // Form states
  const [pickupType, setPickupType] = useState<PickupType>('REGISTERED');
  const [pickupLocationId, setPickupLocationId] = useState<number | undefined>(undefined);
  const [pickupName, setPickupName] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupNeighborhood, setPickupNeighborhood] = useState('');
  const [finalDeadline, setFinalDeadline] = useState('');
  const [finalDriverFee, setFinalDriverFee] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [acceptedVehicleTypes, setAcceptedVehicleTypes] = useState<VehicleType[]>(['CAR', 'MOTO', 'MOTO_WITH_BAG']);

  // Editable stops
  interface EditableStop {
    id?: number;
    sequence: number;
    destination_address: string;
    destination_neighborhood: string;
    cargo_description: string;
    observations: string;
    desired_deadline: string;
    delivery_mode: DeliveryMode;
    status?: string;
    isDelivered: boolean;
    isNew?: boolean;
    is_horizontal_condo?: boolean;
  }
  const [stopsList, setStopsList] = useState<EditableStop[]>([]);

  const restoreOriginalRouteData = async () => {
    if (!currentRoute) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/admin/routes/${routeId}/discard-rejected-proposal`, {
        method: 'POST',
        headers,
      });
    } catch (e) {
      console.warn('Failed to discard rejected proposal in backend', e);
    }
    setHasRejectedProposal(false);
    setRejectedProposalInfo(null);
    setPickupType(currentRoute.pickup_type);
    setPickupLocationId(currentRoute.pickup_location_id || undefined);
    setPickupName(currentRoute.pickup_name || '');
    setPickupAddress(currentRoute.pickup_address || '');
    setPickupNeighborhood(currentRoute.pickup_neighborhood_snapshot || '');
    setFinalDeadline(currentRoute.final_deadline || '');
    setFinalDriverFee(
      currentRoute.final_driver_fee !== null && currentRoute.final_driver_fee !== undefined
        ? String(currentRoute.final_driver_fee)
        : currentRoute.total_fee || ''
    );
    setOverrideReason(currentRoute.override_reason || '');
    setAcceptedVehicleTypes(
      currentRoute.accepted_vehicle_types || ['CAR', 'MOTO', 'MOTO_WITH_BAG']
    );

    setStopsList(
      currentStops.map((s, index) => ({
        id: s.id,
        sequence: s.sequence || index + 1,
        destination_address: s.destination_address,
        destination_neighborhood: s.destination_neighborhood,
        cargo_description: s.cargo_description,
        observations: s.observations || '',
        desired_deadline: s.desired_deadline || '',
        delivery_mode: s.delivery_mode,
        status: s.status,
        isDelivered: s.status === 'DELIVERED',
      }))
    );
  };

  const fetchFreshRoute = async (id: number) => {
    setLoading(true);
    setError(null);
    setConflictWarning(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/routes/${id}`, { headers });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Falha ao buscar dados atualizados da rota');
      }
      const data = await res.json();
      const route: Route = data.route;
      const stops: RouteStop[] = data.stops || route.stops || [];

      setCurrentRoute(route);
      setCurrentStops(stops);

      // Verificar se há uma proposta rejeitada recente para recuperar os dados editados
      let rejectedProposal: EditRouteDTO | null = null;
      let rejectedMeta: { diff_summary?: string; rejected_at?: string } | null = null;

      if (route.pending_material_change) {
        try {
          const parsed =
            typeof route.pending_material_change === 'string'
              ? JSON.parse(route.pending_material_change)
              : route.pending_material_change;
          if (parsed && parsed.status === 'REJECTED' && parsed.proposal) {
            rejectedProposal = parsed.proposal;
            rejectedMeta = {
              diff_summary: parsed.diff_summary,
              rejected_at: parsed.rejected_at,
            };
          }
        } catch (e) {
          console.warn('Failed to parse pending_material_change', e);
        }
      }

      // Fallback: verificar histórico de updates por uma proposta com status REJECTED
      if (!rejectedProposal) {
        try {
          const updatesRes = await fetch(`/api/admin/routes/${id}/updates`, { headers });
          if (updatesRes.ok) {
            const updatesData = await updatesRes.json();
            const updatesList = Array.isArray(updatesData) ? updatesData : updatesData.updates || [];
            const lastRejected = updatesList.find(
              (u: any) => u.driver_approval_status === 'REJECTED' && u.pending_proposal
            );
            if (lastRejected) {
              rejectedProposal =
                typeof lastRejected.pending_proposal === 'string'
                  ? JSON.parse(lastRejected.pending_proposal)
                  : lastRejected.pending_proposal;
              rejectedMeta = {
                diff_summary: lastRejected.diff_summary,
                rejected_at: lastRejected.driver_decision_at || lastRejected.created_at,
              };
            }
          }
        } catch (e) {
          console.warn('Failed to fetch updates for rejected proposal fallback', e);
        }
      }

      if (rejectedProposal) {
        setHasRejectedProposal(true);
        setRejectedProposalInfo(rejectedMeta);

        // Preencher o formulário com os dados alterados da proposta recusada
        setPickupType(rejectedProposal.pickup_type || route.pickup_type);
        setPickupLocationId(
          rejectedProposal.pickup_location_id !== undefined
            ? (rejectedProposal.pickup_location_id ?? undefined)
            : (route.pickup_location_id || undefined)
        );
        setPickupName(rejectedProposal.pickup_name || route.pickup_name || '');
        setPickupAddress(rejectedProposal.pickup_address || route.pickup_address || '');
        setPickupNeighborhood(
          rejectedProposal.pickup_neighborhood || route.pickup_neighborhood_snapshot || ''
        );
        setFinalDeadline(rejectedProposal.final_deadline || route.final_deadline || '');
        setFinalDriverFee(
          rejectedProposal.final_driver_fee !== null &&
            rejectedProposal.final_driver_fee !== undefined
            ? String(rejectedProposal.final_driver_fee)
            : route.final_driver_fee !== null && route.final_driver_fee !== undefined
            ? String(route.final_driver_fee)
            : route.total_fee || ''
        );
        setOverrideReason(
          rejectedProposal.override_reason || route.override_reason || ''
        );
        setAcceptedVehicleTypes(
          rejectedProposal.accepted_vehicle_types ||
            route.accepted_vehicle_types || ['CAR', 'MOTO', 'MOTO_WITH_BAG']
        );

        if (Array.isArray(rejectedProposal.stops) && rejectedProposal.stops.length > 0) {
          setStopsList(
            rejectedProposal.stops.map((s: any, index: number) => {
              const orig = stops.find((os) => os.id === s.id);
              return {
                id: s.id,
                sequence: s.sequence || index + 1,
                destination_address: s.destination_address || '',
                destination_neighborhood: s.destination_neighborhood || '',
                cargo_description: s.cargo_description || '',
                observations: s.observations || '',
                desired_deadline: s.desired_deadline || '',
                delivery_mode: s.delivery_mode || 'IN_PERSON',
                status: orig?.status || s.status,
                isDelivered: orig?.status === 'DELIVERED',
                isNew: !s.id,
                is_horizontal_condo: Boolean(s.is_horizontal_condo || (s.observations && s.observations.includes('[Condomínio Horizontal]'))),
              };
            })
          );
        } else {
          setStopsList(
            stops.map((s, index) => ({
              id: s.id,
              sequence: s.sequence || index + 1,
              destination_address: s.destination_address,
              destination_neighborhood: s.destination_neighborhood,
              cargo_description: s.cargo_description,
              observations: s.observations || '',
              desired_deadline: s.desired_deadline || '',
              delivery_mode: s.delivery_mode,
              status: s.status,
              isDelivered: s.status === 'DELIVERED',
              is_horizontal_condo: Boolean(s.is_horizontal_condo || (s.observations && s.observations.includes('[Condomínio Horizontal]'))),
            }))
          );
        }
      } else {
        setHasRejectedProposal(false);
        setRejectedProposalInfo(null);

        // Preenchimento padrão a partir da rota ativa
        setPickupType(route.pickup_type);
        setPickupLocationId(route.pickup_location_id || undefined);
        setPickupName(route.pickup_name || '');
        setPickupAddress(route.pickup_address || '');
        setPickupNeighborhood(route.pickup_neighborhood_snapshot || '');
        setFinalDeadline(route.final_deadline || '');
        setFinalDriverFee(
          route.final_driver_fee !== null && route.final_driver_fee !== undefined
            ? String(route.final_driver_fee)
            : route.total_fee || ''
        );
        setOverrideReason(route.override_reason || '');
        setAcceptedVehicleTypes(route.accepted_vehicle_types || ['CAR', 'MOTO', 'MOTO_WITH_BAG']);

        setStopsList(
          stops.map((s, index) => ({
            id: s.id,
            sequence: s.sequence || index + 1,
            destination_address: s.destination_address,
            destination_neighborhood: s.destination_neighborhood,
            cargo_description: s.cargo_description,
            observations: s.observations || '',
            desired_deadline: s.desired_deadline || '',
            delivery_mode: s.delivery_mode,
            status: s.status,
            isDelivered: s.status === 'DELIVERED',
            is_horizontal_condo: Boolean(s.is_horizontal_condo || (s.observations && s.observations.includes('[Condomínio Horizontal]'))),
          }))
        );
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && routeId) {
      setStep('EDIT');
      setPreviewAnalysis(null);
      fetchFreshRoute(routeId);
    } else {
      setCurrentRoute(null);
      setCurrentStops([]);
      setStopsList([]);
      setError(null);
      setConflictWarning(null);
    }
  }, [isOpen, routeId]);

  if (!isOpen || !routeId) return null;

  const isRouteEditable =
    currentRoute &&
    ['DRAFT', 'OFFERED', 'ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT'].includes(
      currentRoute.status
    );

  const handleLocationChange = (locId: number) => {
    setPickupLocationId(locId);
    const selected = locations.find((l) => l.id === locId);
    if (selected) {
      setPickupName(selected.name);
      setPickupAddress(selected.address);
      setPickupNeighborhood(selected.neighborhood || '');
    }
  };

  const handleAddStop = () => {
    const nextSeq = stopsList.length + 1;
    setStopsList([
      ...stopsList,
      {
        sequence: nextSeq,
        destination_address: '',
        destination_neighborhood: '',
        cargo_description: '',
        observations: '',
        desired_deadline: '',
        delivery_mode: 'IN_PERSON',
        isDelivered: false,
        isNew: true,
        is_horizontal_condo: false,
      },
    ]);
  };

  const handleRemoveStop = (index: number) => {
    const target = stopsList[index];
    if (target.isDelivered) return;
    const next = stopsList.filter((_, i) => i !== index).map((s, i) => ({
      ...s,
      sequence: i + 1,
    }));
    setStopsList(next);
  };

  const handleUpdateStop = (index: number, field: keyof EditableStop, value: any) => {
    const next = [...stopsList];
    if (next[index].isDelivered) return; // Paradas entregues são imutáveis
    next[index] = { ...next[index], [field]: value };
    setStopsList(next);
  };

  const buildEditDTO = (): EditRouteDTO => {
    if (!currentRoute) throw new Error('Rota não carregada');

    return {
      expected_version: currentRoute.route_version,
      pickup_type: pickupType,
      pickup_location_id: pickupType === 'REGISTERED' ? pickupLocationId : undefined,
      pickup_name: pickupName.trim(),
      pickup_address: pickupAddress.trim(),
      pickup_neighborhood: pickupNeighborhood.trim(),
      pickup_neighborhood_snapshot: pickupNeighborhood.trim(),
      final_deadline: finalDeadline.trim(),
      accepted_vehicle_types: acceptedVehicleTypes,
      final_driver_fee: finalDriverFee.trim() ? finalDriverFee.trim() : undefined,
      override_reason: overrideReason.trim() ? overrideReason.trim() : undefined,
      stops: stopsList.map((s, idx) => ({
        id: s.id,
        sequence: idx + 1,
        destination_address: s.destination_address.trim(),
        destination_neighborhood: s.destination_neighborhood.trim(),
        cargo_description: s.cargo_description.trim(),
        observations: (() => {
          let obs = s.observations.trim();
          if (s.is_horizontal_condo && !obs.includes('[Condomínio Horizontal]')) {
            obs = obs ? `[Condomínio Horizontal] ${obs}` : '[Condomínio Horizontal]';
          }
          return obs || undefined;
        })(),
        is_horizontal_condo: s.is_horizontal_condo,
        desired_deadline: s.desired_deadline.trim() || undefined,
        delivery_mode: s.delivery_mode,
      })),
    };
  };

  // Step 1 -> Step 2: Preview (or direct save if DRAFT)
  const handleRequestPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRoute) return;

    // Basic validation
    if (stopsList.length === 0) {
      setError('A rota deve conter pelo menos uma parada.');
      return;
    }
    for (let i = 0; i < stopsList.length; i++) {
      const s = stopsList[i];
      if (!s.destination_address.trim()) {
        setError(`Endereço obrigatório na Parada #${i + 1}.`);
        return;
      }
      if (!s.destination_neighborhood.trim()) {
        setError(`Bairro obrigatório na Parada #${i + 1}.`);
        return;
      }
      if (!s.cargo_description.trim()) {
        setError(`Descrição do pedido/carga obrigatória na Parada #${i + 1}.`);
        return;
      }
    }

    if (acceptedVehicleTypes.length === 0) {
      setError('Selecione pelo menos um tipo de veículo aceitável.');
      return;
    }

    // Se a rota for RASCUNHO (DRAFT), salva diretamente sem precisar de etapa intermediária de preview
    if (currentRoute.status === 'DRAFT') {
      await handleExecuteEdit();
      return;
    }

    setSubmitting(true);
    setError(null);
    setConflictWarning(null);

    try {
      const dto = buildEditDTO();
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/routes/${routeId}/edit-preview`, {
        method: 'POST',
        headers,
        body: JSON.stringify(dto),
      });

      if (res.status === 409) {
        // Conflito de concorrência detectado no preview
        setConflictWarning(
          '⚠️ Conflito de Concorrência: Esta rota foi modificada por outro processo. Recarregando versão mais recente...'
        );
        await fetchFreshRoute(routeId);
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Falha ao gerar preview da edição.');
      }

      const analysis: RouteEditAnalysis = await res.json();
      setPreviewAnalysis(analysis);
      setStep('PREVIEW');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Step 2 -> Execute Edit
  const handleExecuteEdit = async () => {
    if (!currentRoute) return;
    setSubmitting(true);
    setError(null);
    setConflictWarning(null);

    try {
      const dto = buildEditDTO();
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/routes/${routeId}/edit`, {
        method: 'POST',
        headers,
        body: JSON.stringify(dto),
      });

      if (res.status === 409) {
        // Concorrência detectada no salvamento
        setConflictWarning(
          '⚠️ Conflito de Concorrência (409): Esta rota foi modificada por outro operador ou processo. Os dados foram atualizados com a versão mais recente. Por favor, revise as informações e confirme novamente.'
        );
        setStep('EDIT');
        await fetchFreshRoute(routeId);
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Falha ao executar alteração na rota.');
      }

      const data = await res.json();
      onSuccess(data.route);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-neutral-200 my-8 space-y-5 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
              <Pencil className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-950 flex items-center gap-2">
                <span>Editar Rota #{routeId}</span>
                {currentRoute && (
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200">
                    v{currentRoute.route_version}
                  </span>
                )}
                {currentRoute && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      currentRoute.status === 'DRAFT'
                        ? 'bg-amber-100 text-amber-800'
                        : currentRoute.status === 'OFFERED'
                        ? 'bg-blue-100 text-blue-800'
                        : currentRoute.status === 'ACCEPTED'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-neutral-100 text-neutral-800'
                    }`}
                  >
                    {currentRoute.status}
                  </span>
                )}
              </h3>
              <p className="text-xs text-neutral-500">
                {step === 'EDIT'
                  ? 'M4.4: Edição controlada, versionamento estrito e classificação automática.'
                  : 'M4.4: Confirmação e visualização do impacto antes da aplicação.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 text-xl font-semibold p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Loading Spinner */}
        {loading && (
          <div className="py-12 text-center text-neutral-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-neutral-400" />
            Carregando dados mais recentes da rota diretamente do servidor...
          </div>
        )}

        {/* Route not editable banner */}
        {!loading && currentRoute && !isRouteEditable && (
          <div className="p-4 rounded-xl bg-neutral-100 border border-neutral-300 text-neutral-700 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold text-neutral-900">
              <Lock className="w-4 h-4 text-neutral-500" />
              <span>Rota Não Editável ({currentRoute.status})</span>
            </div>
            <p>
              {currentRoute.status === 'COMPLETED'
                ? 'Esta rota já foi concluída e todas as paradas foram entregues. Não é permitido alterar rotas finalizadas.'
                : 'Esta rota foi cancelada e não pode mais receber alterações operacionais ou de entrega.'}
            </p>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-neutral-900 text-white font-semibold text-xs"
              >
                Voltar
              </button>
            </div>
          </div>
        )}

        {/* Pending Material Change Banner */}
        {!loading && currentRoute && isRouteEditable && currentRoute.change_pending_driver_approval && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Alteração Material Pendente de Aprovação:</strong>
              <p className="mt-0.5 text-amber-800">
                Uma proposta anterior já foi enviada ao motorista via Telegram e aguarda decisão.
                Não é recomendado submeter uma nova proposta simultânea até que o motorista responda.
              </p>
            </div>
          </div>
        )}

        {/* Rejected Material Change Restored for Readjustment Banner */}
        {!loading && currentRoute && isRouteEditable && hasRejectedProposal && (
          <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-400 text-amber-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm text-amber-900 flex items-center gap-2">
                  <span>Alteração Recusada Anteriormente Recuperada</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
                    Pronta para Reajuste
                  </span>
                </div>
                <p className="mt-1 text-amber-800 leading-relaxed text-[11px]">
                  O motorista não aceitou a proposta anterior. As alterações feitas nos dados da corrida foram <strong>recuperadas e mantidas no formulário</strong> abaixo. Você pode ajustar o frete do motorista ou os dados e enviar uma nova proposta para o motorista aprovar.
                </p>
                {rejectedProposalInfo?.diff_summary && (
                  <p className="mt-1 text-[10px] text-amber-700 font-mono">
                    Última proposta: {rejectedProposalInfo.diff_summary}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={restoreOriginalRouteData}
              className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-700 font-bold text-[11px] whitespace-nowrap transition-colors shrink-0 cursor-pointer shadow-2xs"
              title="Descartar as alterações da proposta recusada e recarregar os dados originais da rota"
            >
              Restaurar Original
            </button>
          </div>
        )}

        {/* Concurrency Conflict Warning */}
        {conflictWarning && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <strong>Conflito Detectado:</strong>
              <p className="mt-0.5 text-rose-800">{conflictWarning}</p>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: FORMULÁRIO DE EDIÇÃO */}
        {!loading && currentRoute && isRouteEditable && step === 'EDIT' && (
          <form onSubmit={handleRequestPreview} className="space-y-4 text-xs">
            {/* Coleta & Prazo */}
            <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200/80 space-y-3">
              <div className="font-bold text-neutral-800 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                <MapPin className="w-3.5 h-3.5 text-orange-600" />
                <span>Ponto de Coleta e Prazo Final</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-600 font-semibold mb-1">Tipo de Ponto</label>
                  <select
                    value={pickupType}
                    onChange={(e) => setPickupType(e.target.value as PickupType)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="REGISTERED">Local Pré-Cadastrado</option>
                    <option value="AD_HOC">Endereço Personalizado</option>
                  </select>
                </div>

                {pickupType === 'REGISTERED' ? (
                  <div>
                    <label className="block text-neutral-600 font-semibold mb-1">Selecione o Local</label>
                    <select
                      value={pickupLocationId || ''}
                      onChange={(e) => handleLocationChange(parseInt(e.target.value, 10))}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="">Selecione...</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name} — {loc.neighborhood || loc.address}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-neutral-600 font-semibold mb-1">Nome do Local</label>
                    <input
                      type="text"
                      value={pickupName}
                      onChange={(e) => setPickupName(e.target.value)}
                      placeholder="Ex: Kantine Centro"
                      className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-neutral-600 font-semibold mb-1">Endereço de Coleta</label>
                  <input
                    type="text"
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    placeholder="Rua, número, complemento"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-neutral-600 font-semibold mb-1">Bairro de Coleta</label>
                  <input
                    type="text"
                    value={pickupNeighborhood}
                    onChange={(e) => setPickupNeighborhood(e.target.value)}
                    placeholder="Ex: Centro"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-neutral-200/60">
                <div>
                  <label className="block text-neutral-600 font-semibold mb-1">
                    Duração / Prazo Final da Rota
                  </label>
                  <input
                    type="text"
                    value={finalDeadline}
                    onChange={(e) => setFinalDeadline(e.target.value)}
                    placeholder="Ex: 50 min ou 18:30"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white font-mono focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div className={hasRejectedProposal ? 'p-2.5 rounded-xl bg-amber-50/80 border-2 border-amber-400' : ''}>
                  <label className="block text-neutral-600 font-semibold mb-1">
                    Frete do Motorista (R$)
                    <span className="text-[10px] text-amber-700 font-normal ml-1">
                      (Alteração Material)
                    </span>
                    {hasRejectedProposal && (
                      <span className="text-[10px] text-amber-900 font-bold block mt-0.5">
                        💡 Reajuste o valor do frete para nova negociação com o motorista
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={finalDriverFee}
                    onChange={(e) => setFinalDriverFee(e.target.value)}
                    placeholder="Ex: 45.00"
                    className={`w-full px-3 py-2 rounded-lg border bg-white font-mono font-bold text-emerald-800 focus:outline-hidden focus:ring-2 ${
                      hasRejectedProposal
                        ? 'border-amber-400 ring-2 ring-amber-300 text-amber-950 focus:ring-amber-500'
                        : 'border-neutral-300 focus:ring-orange-500'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-neutral-600 font-semibold mb-1">
                    Motivo do Ajuste de Frete
                  </label>
                  <input
                    type="text"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Ex: Adicionado parada ou chuva"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Veículos Aceitos */}
              <div className="pt-2 border-t border-neutral-200/60">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-2">
                  <label className="block text-neutral-700 font-bold text-xs">
                    🚗 Veículos Aceitáveis para esta Rota
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAcceptedVehicleTypes(['MOTO', 'MOTO_WITH_BAG'])}
                      className={`px-2.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                        !acceptedVehicleTypes.includes('CAR') && (acceptedVehicleTypes.includes('MOTO') || acceptedVehicleTypes.includes('MOTO_WITH_BAG'))
                          ? 'border-orange-600 bg-orange-600 text-white'
                          : 'border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-700'
                      }`}
                    >
                      🏍️ Apenas Moto
                    </button>
                    <button
                      type="button"
                      onClick={() => setAcceptedVehicleTypes(['CAR'])}
                      className={`px-2.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                        acceptedVehicleTypes.length === 1 && acceptedVehicleTypes[0] === 'CAR'
                          ? 'border-orange-600 bg-orange-600 text-white'
                          : 'border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-700'
                      }`}
                    >
                      🚗 Apenas Carro
                    </button>
                    <button
                      type="button"
                      onClick={() => setAcceptedVehicleTypes(['CAR', 'MOTO', 'MOTO_WITH_BAG'])}
                      className={`px-2.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                        acceptedVehicleTypes.includes('CAR') && acceptedVehicleTypes.includes('MOTO')
                          ? 'border-orange-600 bg-orange-600 text-white'
                          : 'border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-700'
                      }`}
                    >
                      🌐 Todos
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { type: 'CAR' as const, label: 'Carro', icon: '🚗' },
                    { type: 'MOTO' as const, label: 'Moto', icon: '🏍️' },
                    { type: 'MOTO_WITH_BAG' as const, label: 'Moto com Bag', icon: '🎒' },
                  ].map((opt) => {
                    const checked = acceptedVehicleTypes.includes(opt.type);
                    return (
                      <label
                        key={opt.type}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                          checked
                            ? 'border-orange-500 bg-orange-50 text-neutral-900 font-bold ring-1 ring-orange-500/20'
                            : 'border-neutral-200 bg-white text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            if (checked) {
                              if (acceptedVehicleTypes.length > 1) {
                                setAcceptedVehicleTypes(acceptedVehicleTypes.filter((v) => v !== opt.type));
                              }
                            } else {
                              setAcceptedVehicleTypes([...acceptedVehicleTypes, opt.type]);
                            }
                          }}
                          className="accent-orange-600 rounded"
                        />
                        <span className="text-base">{opt.icon}</span>
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Paradas da Rota */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-bold text-neutral-800 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                  <Package className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Paradas da Rota ({stopsList.length})</span>
                </div>
                <button
                  type="button"
                  onClick={handleAddStop}
                  className="px-2.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs"
                >
                  <Plus className="w-3 h-3" />
                  <span>Adicionar Parada</span>
                </button>
              </div>

              <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                {stopsList.map((stop, index) => (
                  <div
                    key={stop.id || `new_${index}`}
                    className={`p-3 rounded-xl border transition-all ${
                      stop.isDelivered
                        ? 'bg-neutral-100/70 border-neutral-300 opacity-80'
                        : 'bg-white border-neutral-200 shadow-xs'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-[10px]">
                          {index + 1}
                        </span>
                        <strong className="text-neutral-900">
                          Parada #{index + 1} {stop.id ? `(ID: ${stop.id})` : '(Nova)'}
                        </strong>
                        {stop.isDelivered && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <Lock className="w-2.5 h-2.5" />
                            Entregue (Imutável)
                          </span>
                        )}
                      </div>
                      {!stop.isDelivered && stopsList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveStop(index)}
                          className="text-rose-600 hover:text-rose-800 p-1"
                          title="Remover parada"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] text-neutral-500 font-medium">
                          Endereço de Entrega
                        </label>
                        <input
                          type="text"
                          disabled={stop.isDelivered}
                          value={stop.destination_address}
                          onChange={(e) => handleUpdateStop(index, 'destination_address', e.target.value)}
                          placeholder="Rua, número, apto"
                          className="w-full px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white disabled:bg-neutral-100 disabled:text-neutral-500 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-neutral-500 font-medium">Bairro</label>
                        <input
                          type="text"
                          disabled={stop.isDelivered}
                          value={stop.destination_neighborhood}
                          onChange={(e) =>
                            handleUpdateStop(index, 'destination_neighborhood', e.target.value)
                          }
                          placeholder="Bairro"
                          className="w-full px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white disabled:bg-neutral-100 disabled:text-neutral-500 text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                      <div>
                        <label className="block text-[10px] text-neutral-500 font-medium">
                          Descrição / Carga
                        </label>
                        <input
                          type="text"
                          disabled={stop.isDelivered}
                          value={stop.cargo_description}
                          onChange={(e) => handleUpdateStop(index, 'cargo_description', e.target.value)}
                          placeholder="Ex: Bolo 2kg"
                          className="w-full px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white disabled:bg-neutral-100 disabled:text-neutral-500 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-neutral-500 font-medium">
                          Prazo Desejável
                        </label>
                        <input
                          type="text"
                          disabled={stop.isDelivered}
                          value={stop.desired_deadline}
                          onChange={(e) => handleUpdateStop(index, 'desired_deadline', e.target.value)}
                          placeholder="Ex: 17:00"
                          className="w-full px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white disabled:bg-neutral-100 disabled:text-neutral-500 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-neutral-500 font-medium">
                          Observações
                        </label>
                        <input
                          type="text"
                          disabled={stop.isDelivered}
                          value={stop.observations}
                          onChange={(e) => handleUpdateStop(index, 'observations', e.target.value)}
                          placeholder="Ex: Portaria / Deixar com vizinho"
                          className="w-full px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white disabled:bg-neutral-100 disabled:text-neutral-500 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-neutral-200 flex items-center justify-between">
              <span className="text-[11px] text-neutral-500">
                Versão enviada: <strong className="font-mono">v{currentRoute.route_version}</strong>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-700 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold flex items-center gap-1.5 shadow-xs"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{currentRoute.status === 'DRAFT' ? 'Salvando...' : 'Analisando...'}</span>
                    </>
                  ) : currentRoute.status === 'DRAFT' ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Salvar Rascunho</span>
                    </>
                  ) : (
                    <>
                      <span>Revisar Alterações</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* STEP 2: PREVIEW OBRIGATÓRIO (A4) */}
        {!loading && currentRoute && isRouteEditable && step === 'PREVIEW' && previewAnalysis && (
          <div className="space-y-4 text-xs">
            {/* Header Badge */}
            <div
              className={`p-4 rounded-xl border flex items-start gap-3 ${
                previewAnalysis.is_material
                  ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                  : 'bg-blue-50/80 border-blue-300 text-blue-950'
              }`}
            >
              <div
                className={`p-2 rounded-lg ${
                  previewAnalysis.is_material
                    ? 'bg-amber-500 text-white'
                    : 'bg-blue-500 text-white'
                }`}
              >
                {previewAnalysis.is_material ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <Info className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[11px] ${
                      previewAnalysis.is_material
                        ? 'bg-amber-200 text-amber-900 border border-amber-300'
                        : 'bg-blue-200 text-blue-900 border border-blue-300'
                    }`}
                  >
                    {previewAnalysis.change_type === 'MATERIAL'
                      ? 'ALTERAÇÃO MATERIAL'
                      : 'ALTERAÇÃO OPERACIONAL'}
                  </span>
                  <span className="text-[11px] text-neutral-500 font-mono">
                    v{currentRoute.route_version} → v{currentRoute.route_version + 1}
                  </span>
                </div>

                <p className="mt-1 font-semibold text-xs leading-relaxed">
                  {currentRoute.status === 'DRAFT' &&
                    'Esta rota está em RASCUNHO. As alterações serão salvas imediatamente e a versão será incrementada para v' +
                      (currentRoute.route_version + 1) +
                      '. Nenhum envio ao Telegram será realizado.'}

                  {currentRoute.status === 'OFFERED' &&
                    'Esta rota já foi PUBLICADA em oferta. A oferta anterior v' +
                      currentRoute.route_version +
                      ' será invalidada e uma nova oferta v' +
                      (currentRoute.route_version + 1) +
                      ' será reenviada aos motoristas elegíveis.'}

                  {['ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT'].includes(
                    currentRoute.status
                  ) &&
                    (previewAnalysis.is_material
                      ? '⚠️ Esta alteração é MATERIAL (impacta frete ou quantidade de paradas). Ela NÃO será aplicada silenciosamente. Uma proposta será enviada ao motorista vencedor via Telegram com opções [ACEITAR] e [RECUSAR]. O valor atual só mudará se o motorista aceitar.'
                      : 'ℹ️ Esta alteração é OPERACIONAL (endereço, prazo ou observações). Ela será aplicada imediatamente e o motorista vencedor receberá no Telegram o itinerário atualizado com novo link de navegação.')}
                </p>
              </div>
            </div>

            {/* Diff Summary */}
            <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200">
              <span className="font-bold text-neutral-700 block mb-1 uppercase tracking-wider text-[10px]">
                Resumo das Modificações
              </span>
              <p className="text-neutral-900 text-xs font-medium">
                {previewAnalysis.diff_summary || 'Nenhuma alteração detectada.'}
              </p>
            </div>

            {/* Detailed Changes Table */}
            <div className="border border-neutral-200 rounded-xl overflow-hidden">
              <div className="bg-neutral-50 px-3 py-2 border-b border-neutral-200 font-bold text-neutral-700 text-[11px] uppercase tracking-wider">
                Comparativo (Antes vs Depois)
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-neutral-100">
                {previewAnalysis.diff_items.map((item, idx) => (
                  <div key={idx} className="p-2.5 text-xs grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <span className="font-bold text-neutral-800">{item.label}</span>
                    <div className="text-rose-700 bg-rose-50 px-2 py-1 rounded font-mono text-[11px]">
                      <span className="text-[10px] text-rose-500 block font-sans">Antes:</span>
                      {String(item.old_value)}
                    </div>
                    <div className="text-emerald-800 bg-emerald-50 px-2 py-1 rounded font-mono text-[11px]">
                      <span className="text-[10px] text-emerald-600 block font-sans">Depois:</span>
                      {String(item.new_value)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-neutral-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep('EDIT')}
                className="px-4 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-700 font-bold"
              >
                Voltar e Corrigir
              </button>
              <button
                type="button"
                onClick={handleExecuteEdit}
                disabled={submitting}
                className={`px-4 py-2 rounded-lg font-bold text-white shadow-xs flex items-center gap-1.5 ${
                  previewAnalysis.is_material
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Aplicando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>
                      {previewAnalysis.is_material &&
                      ['ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT'].includes(
                        currentRoute.status
                      )
                        ? 'Confirmar e Enviar Proposta ao Motorista'
                        : 'Confirmar e Aplicar Alteração'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
