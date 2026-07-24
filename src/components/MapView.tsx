import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ObservationSet } from '../types';
import { MapPin, User, Calendar } from 'lucide-react';

interface MapViewProps {
  observations: ObservationSet[];
  onSelectObservation: (obs: ObservationSet) => void;
}

// Fix Leaflet marker default icon issue in bundled environments
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

export const MapView: React.FC<MapViewProps> = ({ observations, onSelectObservation }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const locatableObservations = observations.filter(
    (obs) => obs.location && typeof obs.location.latitude === 'number'
  );

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Default to Tokyo station coordinates if no locations exist
      const defaultCenter: [number, number] =
        locatableObservations.length > 0
          ? [locatableObservations[0].location!.latitude, locatableObservations[0].location!.longitude]
          : [35.6812, 139.7671];

      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 13,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Clear existing markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });

    if (locatableObservations.length === 0) return;

    const bounds = L.latLngBounds([]);

    locatableObservations.forEach((obs) => {
      const lat = obs.location!.latitude;
      const lng = obs.location!.longitude;
      bounds.extend([lat, lng]);

      const marker = L.marker([lat, lng], { icon: defaultIcon }).addTo(map);

      const popupContent = document.createElement('div');
      popupContent.className = 'p-1 text-slate-800 space-y-1 text-xs';
      popupContent.innerHTML = `
        <div class="font-bold text-sm text-indigo-900">${obs.title}</div>
        <div class="text-[11px] text-slate-600 flex items-center gap-1">
          <span>観測者: <strong>${obs.observerName}</strong></span>
        </div>
        <div class="text-[11px] text-slate-500">${obs.summary}</div>
        <div class="text-[10px] text-indigo-600 font-semibold mt-1">クリックで全容を表示 →</div>
      `;

      popupContent.onclick = () => onSelectObservation(obs);
      marker.bindPopup(popupContent);
    });

    if (locatableObservations.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [observations]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <div className="font-bold flex items-center gap-1 text-slate-800">
          <MapPin className="w-4 h-4 text-indigo-600" />
          観測位置マップ ({locatableObservations.length}件の位置つき観測)
        </div>
        <div>地図上のピンをタップして観測ログを開く</div>
      </div>

      <div
        ref={mapContainerRef}
        className="w-full h-[420px] rounded-xl border border-slate-200 overflow-hidden shadow-xs z-0"
      />
    </div>
  );
};
