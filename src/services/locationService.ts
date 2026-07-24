import { LocationData } from '../types';

export async function getCurrentLocation(): Promise<LocationData | null> {
  if (!navigator.geolocation) {
    console.warn('Geolocation is not supported by this browser.');
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        let address: string | undefined;

        try {
          // Reverse geocoding using OpenStreetMap Nominatim
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=ja`,
            {
              headers: {
                'User-Agent': 'MultimodalObservationHub/1.0',
              },
            }
          );
          if (res.ok) {
            const data = await res.json();
            address = data.display_name || data.address?.city || data.address?.town || data.address?.suburb;
          }
        } catch (e) {
          console.warn('Reverse geocoding failed:', e);
        }

        resolve({
          latitude,
          longitude,
          accuracy: Math.round(accuracy),
          address: address || `緯度: ${latitude.toFixed(4)}, 経度: ${longitude.toFixed(4)}`,
        });
      },
      (error) => {
        console.warn('Geolocation error:', error.message);
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  });
}
