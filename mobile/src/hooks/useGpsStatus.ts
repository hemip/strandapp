import {useCallback, useEffect, useState} from 'react';
import {PermissionsAndroid, Platform} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import {GpsSnapshot} from '../types/basicData';

const initialState: GpsSnapshot = {
  status: 'idle',
  message: 'GPS ej kontrollerad ännu.',
};

export function useGpsStatus() {
  const [gps, setGps] = useState<GpsSnapshot>(initialState);

  const refreshGps = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setGps({status: 'unavailable', message: 'GPS är endast konfigurerad för Android i denna version.'});
      return;
    }

    setGps(prev => ({...prev, status: 'searching', message: 'Söker GPS-position...'}));

    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Tillåt platsåtkomst',
        message: 'Strand behöver GPS för att kunna visa position, noggrannhet och startpunkt.',
        buttonPositive: 'Tillåt',
        buttonNegative: 'Avbryt',
      },
    );

    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      setGps({status: 'permission_denied', message: 'Platsbehörighet nekades.'});
      return;
    }

    Geolocation.getCurrentPosition(
      position => {
        setGps({
          status: 'ok',
          message: 'GPS redo.',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
      },
      error => {
        setGps({
          status: 'error',
          message: error.message || 'Kunde inte läsa GPS-position.',
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
        forceRequestLocation: true,
      },
    );
  }, []);

  useEffect(() => {
    refreshGps();
  }, [refreshGps]);

  return {
    gps,
    refreshGps,
  };
}
