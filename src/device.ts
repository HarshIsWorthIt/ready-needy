import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getAuthenticatedUserId, supabase } from './supabase';
import { reportError } from './errors';

export type DeviceLocation = {
  latitude: number;
  longitude: number;
};

export const requestCurrentLocation = async (): Promise<DeviceLocation | null> => {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    return null;
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
};

export const registerForPushNotifications = async () => {
  if (Platform.OS === 'web') {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('dispatch', {
      name: 'Dispatch requests',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#38bdf8',
    });
  }

  const permission = await Notifications.getPermissionsAsync();
  let status = permission.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== 'granted') {
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync();
  const userId = await getAuthenticatedUserId();
  if (supabase && userId) {
    const { error } = await supabase.from('device_tokens').upsert(
      {
        user_id: userId,
        token: token.data,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,token' },
    );
    if (error) {
      reportError('registerForPushNotifications.upsert', error);
      throw error;
    }
  }
  return token.data;
};
