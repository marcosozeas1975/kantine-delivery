import React, { useState, useEffect } from 'react';
import { History, RefreshCw, AlertCircle, CheckCircle, Clock, XCircle, User } from 'lucide-react';
import { RouteUpdateRecord } from '../server/types.ts';

interface RouteUpdatesHistoryProps {
  routeId: number;
  getAuthHeaders: () => Promise<HeadersInit>;
}

export const RouteUpdatesHistory: React.FC<RouteUpdatesHistoryProps> = ({
  routeId,
  getAuthHeaders,
}) => {
  const [updates, setUpdates] = useState<RouteUpdateRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUpdates = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/routes/${routeId}/updates`, { headers });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Falha ao buscar histórico de versões');
      }
      const data: RouteUpdateRecord[] = await res.json();
      setUpdates(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (routeId) {
      fetchUpdates();
    }
  }, [routeId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-neutral-500" />
          <span>Histórico de Alterações e Versões (M4.4)</span>
        </h4>
        <button
          type="button"
          onClick={fetchUpdates}
          disabled={loading}
          className="text-neutral-500 hover:text-neutral-900 p-1 text-[11px] font-semibold flex items-center gap-1"
          title="Recarregar histórico"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {loading && (
        <div className="py-4 text-center text-xs text-neutral-400">
          <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-neutral-400" />
          Carregando histórico de alterações...
        </div>
      )}

      {error && (
        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && updates.length === 0 && (
        <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 text-center text-xs text-neutral-500">
          Nenhuma alteração registrada após a criação inicial desta rota (versão atual é a original).
        </div>
      )}

      {!loading && updates.length > 0 && (
        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
          {updates.map((up) => {
            const isMaterial = up.change_type === 'MATERIAL';

            return (
              <div
                key={up.id}
                className="p-3 rounded-xl border border-neutral-200 bg-white shadow-2xs space-y-2 text-xs"
              >
                {/* Header row */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs bg-neutral-100 text-neutral-800 px-2 py-0.5 rounded border border-neutral-200">
                      v{up.old_version} → v{up.new_version}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        isMaterial
                          ? 'bg-amber-100 text-amber-900 border-amber-300'
                          : 'bg-blue-100 text-blue-900 border-blue-300'
                      }`}
                    >
                      {isMaterial ? 'MATERIAL' : 'OPERACIONAL'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-neutral-500">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3 text-neutral-400" />
                      <strong>{up.actor}</strong>
                    </span>
                    <span className="font-mono">
                      {new Date(up.created_at).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                {/* Diff summary */}
                <div className="text-neutral-800 font-medium">
                  {up.diff_summary}
                </div>

                {/* Approval Status Badge for Material changes */}
                {isMaterial && (
                  <div className="pt-1 flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase text-neutral-500">
                      Decisão do Motorista:
                    </span>
                    {up.driver_approval_status === 'PENDING' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        <Clock className="w-3 h-3 text-amber-700" />
                        Aguardando Resposta no Telegram
                      </span>
                    )}
                    {up.driver_approval_status === 'ACCEPTED' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                        <CheckCircle className="w-3 h-3 text-emerald-700" />
                        Aceita pelo Motorista
                        {up.driver_decision_at && (
                          <span className="font-normal font-mono ml-1">
                            ({new Date(up.driver_decision_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})
                          </span>
                        )}
                      </span>
                    )}
                    {up.driver_approval_status === 'REJECTED' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-300">
                        <XCircle className="w-3 h-3 text-rose-700" />
                        Recusada pelo Motorista
                        {up.driver_decision_at && (
                          <span className="font-normal font-mono ml-1">
                            ({new Date(up.driver_decision_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})
                          </span>
                        )}
                      </span>
                    )}
                    {up.driver_approval_status === 'NOT_REQUIRED' && (
                      <span className="text-neutral-500 text-[10px]">Não requerida</span>
                    )}
                  </div>
                )}

                {/* Acknowledgement Status for Operational changes */}
                {!isMaterial && up.driver_acknowledged_at && (
                  <div className="pt-1 flex items-center gap-1.5 text-[11px] text-emerald-800">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                      Motorista confirmou ciência em{' '}
                      {new Date(up.driver_acknowledged_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
