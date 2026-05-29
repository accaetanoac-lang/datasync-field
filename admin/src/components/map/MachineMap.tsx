'use client';
import React, { useEffect, useRef } from 'react';
import { Machine } from '../../types';

interface Props {
  machines: Machine[];
  visits?: { visit_lat: number; visit_lng: number; has_collection: boolean; technician_name?: string }[];
}

const BADGE_COLORS: Record<string, string> = {
  '16 to 60 days': '#f59e0b',
  '61 to 365 days': '#ef4444',
  '365+ days': '#1a1a1a',
};

export default function MachineMap({ machines, visits = [] }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<unknown>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return;
    if (mapInstance.current) return; // Already initialized

    // Dynamically import Leaflet to avoid SSR issues
    import('leaflet').then((L) => {
      import('leaflet/dist/leaflet.css' as unknown as string).catch(() => {});

      const validMachines = machines.filter((m) => m.last_known_lat && m.last_known_lng);
      const center: [number, number] =
        validMachines.length > 0
          ? [Number(validMachines[0].last_known_lat), Number(validMachines[0].last_known_lng)]
          : [-15.7801, -47.9292]; // Brasília as default

      const map = L.map(mapRef.current!, { zoomControl: true }).setView(center, 7);
      mapInstance.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      // Machine markers
      for (const m of validMachines) {
        const color = BADGE_COLORS[m.offline_range ?? ''] ?? '#6b7280';
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });

        L.marker([Number(m.last_known_lat), Number(m.last_known_lng)], { icon })
          .addTo(map)
          .bindPopup(
            `<b>${m.pin ?? m.custom_name ?? 'Sem ID'}</b><br>
             ${m.days_offline ?? '?'} dias offline<br>
             ${m.org_name ?? ''}`
          );
      }

      // Visit markers
      for (const v of visits) {
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:14px;height:14px;border-radius:50%;background:${v.has_collection ? '#22c55e' : '#ef4444'};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        L.marker([v.visit_lat, v.visit_lng], { icon })
          .addTo(map)
          .bindPopup(
            `<b>${v.has_collection ? 'Visita c/ coleta' : 'Visita SEM coleta'}</b><br>${v.technician_name ?? ''}`
          );
      }
    });

    return () => {
      if (mapInstance.current) {
        (mapInstance.current as { remove: () => void }).remove();
        mapInstance.current = null;
      }
    };
  }, [machines, visits]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="font-semibold text-gray-700 mb-3">Mapa de Localização das Máquinas</h3>
      <div className="flex gap-4 mb-3 text-xs text-gray-500">
        <span><span className="inline-block w-3 h-3 rounded-full bg-yellow-500 mr-1"></span>30–60 dias</span>
        <span><span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-1"></span>61–365 dias</span>
        <span><span className="inline-block w-3 h-3 rounded-full bg-gray-900 mr-1"></span>365+ dias</span>
        <span><span className="inline-block w-3 h-3 rounded-full bg-green-500 mr-1"></span>Visita c/ coleta</span>
        <span><span className="inline-block w-3 h-3 rounded-full bg-red-600 mr-1"></span>Visita s/ coleta</span>
      </div>
      <div ref={mapRef} style={{ height: 400, borderRadius: 8 }} />
    </div>
  );
}
