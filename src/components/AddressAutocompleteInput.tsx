import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Search, CheckCircle2, Loader2, Navigation, X } from 'lucide-react';
import { GeoCoordinate } from '../shared/freightEngine.ts';

export interface GeocodedAddressSuggestion {
  id: string;
  formattedAddress: string;
  street: string;
  number?: string;
  neighborhood: string;
  city: string;
  state: string;
  coords: GeoCoordinate;
  distanceKm?: number;
  source: 'NOMINATIM' | 'LOCAL_INDEX';
}

interface AddressAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelectSuggestion: (suggestion: GeocodedAddressSuggestion) => void;
  onResetValidation?: () => void;
  placeholder?: string;
  originCoords?: GeoCoordinate;
  className?: string;
  required?: boolean;
  isConfirmed?: boolean;
  confirmedNeighborhood?: string;
}

export const AddressAutocompleteInput: React.FC<AddressAutocompleteInputProps> = ({
  value,
  onChange,
  onSelectSuggestion,
  onResetValidation,
  placeholder = 'Endereço (Rua, Número ou Local em Uberlândia)...',
  originCoords,
  className = '',
  required = false,
  isConfirmed = false,
  confirmedNeighborhood,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<GeocodedAddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<any>(null);
  const lastConfirmedTextRef = useRef<string>(value);

  // Fecha ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Busca sugestões com debounce (250ms)
  useEffect(() => {
    if (!value || value.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    // Se o valor digitado for diferente do confirmado, desvalida
    if (isConfirmed && value !== lastConfirmedTextRef.current) {
      if (onResetValidation) onResetValidation();
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: value.trim() });
        if (originCoords) {
          params.append('originLat', originCoords.lat.toString());
          params.append('originLng', originCoords.lng.toString());
        }
        const res = await fetch(`/api/geocode/autocomplete?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.suggestions && data.suggestions.length > 0) {
            setSuggestions(data.suggestions);
            setIsOpen(true);
          } else {
            setSuggestions([]);
          }
        }
      } catch (err) {
        console.error('Erro ao buscar autocomplete:', err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, originCoords?.lat, originCoords?.lng]);

  const handleSelect = (s: GeocodedAddressSuggestion) => {
    lastConfirmedTextRef.current = s.formattedAddress;
    onChange(s.formattedAddress);
    onSelectSuggestion(s);
    setIsOpen(false);
  };

  // Ao sair do campo ou dar Enter, se não foi confirmado manualmente mas tem sugestões, valida automaticamente a melhor opção
  const handleAutoValidate = async () => {
    if (isConfirmed || !value || value.trim().length < 3) return;

    if (suggestions.length > 0) {
      handleSelect(suggestions[0]);
      return;
    }

    // Busca direta rápida
    try {
      setLoading(true);
      const params = new URLSearchParams({ q: value.trim() });
      if (originCoords) {
        params.append('originLat', originCoords.lat.toString());
        params.append('originLng', originCoords.lng.toString());
      }
      const res = await fetch(`/api/geocode/autocomplete?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.suggestions && data.suggestions.length > 0) {
          handleSelect(data.suggestions[0]);
        }
      }
    } catch (e) {
      // silencioso
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    onChange('');
    setSuggestions([]);
    setIsOpen(false);
    if (onResetValidation) onResetValidation();
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
          ) : isConfirmed ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          ) : (
            <MapPin className="w-4 h-4 text-neutral-400" />
          )}
        </div>

        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (isConfirmed && onResetValidation) {
              onResetValidation();
            }
          }}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onBlur={() => {
            // Pequeno delay para permitir o clique no item
            setTimeout(() => {
              handleAutoValidate();
            }, 250);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAutoValidate();
            }
          }}
          placeholder={placeholder}
          required={required}
          className={`w-full pl-9 pr-24 py-2 text-xs border rounded-xl bg-white transition-all shadow-2xs ${
            isConfirmed
              ? 'border-emerald-400 ring-1 ring-emerald-200 text-neutral-900 font-semibold'
              : 'border-neutral-300 focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 text-neutral-800'
          } ${className}`}
        />

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-neutral-400 hover:text-neutral-600 rounded-full hover:bg-neutral-100"
              title="Limpar endereço"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {isConfirmed ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase tracking-wider flex items-center gap-0.5">
              <span>GPS</span>
              <CheckCircle2 className="w-3 h-3 text-emerald-600 inline" />
            </span>
          ) : (
            value.trim().length >= 3 && (
              <button
                type="button"
                onClick={() => handleAutoValidate()}
                disabled={loading}
                className="px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-900 hover:bg-neutral-800 text-white transition-all shadow-2xs cursor-pointer flex items-center gap-1 disabled:opacity-50"
                title="Buscar e validar coordenadas GPS em Uberlândia"
              >
                {loading ? (
                  <Loader2 className="w-3 h-3 animate-spin text-white" />
                ) : (
                  <Navigation className="w-2.5 h-2.5 text-white" />
                )}
                <span>Validar GPS</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Dropdown de Sugestões (Estilo App de Transporte: Uber/99) */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-xl border border-neutral-200 shadow-2xl overflow-hidden divide-y divide-neutral-100 max-h-64 overflow-y-auto">
          <div className="px-3 py-1.5 bg-neutral-50 text-[10px] font-bold text-neutral-500 uppercase tracking-wider flex items-center justify-between border-b border-neutral-100">
            <span className="flex items-center gap-1.5 text-neutral-700">
              <Search className="w-3 h-3 text-orange-600" />
              <span>Locais Reconhecidos em Uberlândia</span>
            </span>
            <span className="text-[9px] text-neutral-400 font-normal">
              Selecione para validar bairro e raio
            </span>
          </div>

          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleSelect(s)}
              className="w-full text-left px-3 py-2.5 hover:bg-orange-50/80 active:bg-orange-100 transition-colors flex items-start gap-2.5 cursor-pointer group"
            >
              <div className="w-7 h-7 rounded-lg bg-neutral-100 group-hover:bg-orange-100 text-neutral-600 group-hover:text-orange-700 flex items-center justify-center shrink-0 mt-0.5 transition-colors">
                <Navigation className="w-4 h-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="font-bold text-xs text-neutral-900 group-hover:text-orange-950 truncate">
                  {s.formattedAddress}
                </div>
                <div className="text-[11px] text-neutral-500 group-hover:text-neutral-700 truncate flex items-center gap-1.5 mt-0.5">
                  <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                    Bairro {s.neighborhood}
                  </span>
                  <span>•</span>
                  <span>{s.city}/{s.state}</span>
                  {s.distanceKm !== undefined && (
                    <>
                      <span>•</span>
                      <span className="text-orange-700 font-mono font-bold bg-orange-50 px-1 rounded">
                        Raio ~{s.distanceKm} km
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-[10px] font-bold text-orange-600 group-hover:text-orange-700 bg-orange-50 px-2 py-1 rounded-lg">
                  Confirmar &rarr;
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
