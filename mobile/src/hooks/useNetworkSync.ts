import { useEffect, useRef } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { runFullSync } from '../services/sync';

export function useNetworkSync() {
  const wasOffline = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const isConnected = state.isConnected && state.isInternetReachable !== false;

      if (!isConnected) {
        wasOffline.current = true;
      } else if (wasOffline.current) {
        wasOffline.current = false;
        runFullSync().catch(() => {
          // Sync failures are non-fatal; will retry on next connection
        });
      }
    });

    return () => unsubscribe();
  }, []);
}
