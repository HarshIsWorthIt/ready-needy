import * as Camera from 'expo-camera';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const requestCameraPermission = async () => {
  const response = await Camera.Camera.requestCameraPermissionsAsync();
  return response.granted;
};

export const requestNotificationPermission = async () => {
  if (Platform.OS === 'web') {
    const browser = globalThis as typeof globalThis & {
      Notification?: { permission: string; requestPermission: () => Promise<string> };
    };
    if (!browser.Notification) {
      return false;
    }
    if (browser.Notification.permission === 'granted') {
      return true;
    }
    return (await browser.Notification.requestPermission()) === 'granted';
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('dispatch', {
      name: 'Dispatch requests',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#38bdf8',
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return requested.granted;
};
