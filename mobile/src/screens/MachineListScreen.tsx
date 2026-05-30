import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, Animated,
} from 'react-native';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { getOrgMachines } from '../services/api';
import { getCachedMachines, setCachedMachines } from '../services/sync';
import { Machine, getOfflineBadge, formatDaysOffline } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = StackNavigationProp<RootStackParamList, 'MachineList'>;
type Route = RouteProp<RootStackParamList, 'MachineList'>;

const BADGE_COLORS = { yellow: '#F59E0B', red: '#EF4444', black: '#1a1a1a' };
const POLL_INTERVAL_MS = 30_000;

export default function MachineListScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { org } = route.params;

  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const prevMachineIds = useRef<Set<number>>(new Set());

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setToastMessage(null));
  }, [toastOpacity]);

  const loadMachines = useCallback(async (isRefresh = false, isPolling = false) => {
    if (isRefresh) setRefreshing(true);
    else if (!isPolling) setLoading(true);

    try {
      const data = await getOrgMachines(org.id);

      if (isPolling && prevMachineIds.current.size > 0) {
        const newIds = new Set(data.map((m) => m.id));
        const removedCount = [...prevMachineIds.current].filter((id) => !newIds.has(id)).length;
        if (removedCount > 0) {
          showToast(`${removedCount} máquina${removedCount > 1 ? 's' : ''} atualizada${removedCount > 1 ? 's' : ''}`);
        }
      }

      prevMachineIds.current = new Set(data.map((m) => m.id));
      setMachines(data);
      await setCachedMachines(org.id, data);
    } catch {
      const cached = await getCachedMachines(org.id);
      if (cached) {
        setMachines(cached.data);
      } else if (!isPolling) {
        Alert.alert('Erro', 'Não foi possível carregar as máquinas.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [org.id, showToast]);

  useFocusEffect(useCallback(() => {
    loadMachines();
    const interval = setInterval(() => loadMachines(false, true), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadMachines]));

  const renderBadge = (machine: Machine) => {
    const badge = getOfflineBadge(machine.days_offline);
    const color = BADGE_COLORS[badge];
    return (
      <View style={[styles.offlineBadge, { backgroundColor: color }]}>
        <Text style={styles.offlineBadgeText}>{formatDaysOffline(machine.days_offline)}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#367C2B" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {machines.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Nenhuma máquina offline encontrada nesta organização.</Text>
        </View>
      ) : (
        <FlatList
          data={machines}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadMachines(true)} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('MachineDetail', { machine: item, org })}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.pin}>{item.pin ?? item.custom_name ?? 'Sem ID'}</Text>
                {renderBadge(item)}
              </View>

              <View style={styles.cardBody}>
                <Text style={styles.detail}>
                  Horímetro última conexão:{' '}
                  <Text style={styles.detailValue}>
                    {item.machine_hours != null ? `${item.machine_hours} h` : 'N/A'}
                  </Text>
                </Text>
                <Text style={styles.detail}>
                  Última conexão:{' '}
                  <Text style={styles.detailValue}>
                    {item.last_call_date
                      ? new Date(item.last_call_date).toLocaleDateString('pt-BR')
                      : 'Sem data'}
                  </Text>
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListFooterComponent={
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => navigation.navigate('NonJDMachine', { org })}
            >
              <Text style={styles.addButtonText}>+ Adicionar máquina não-JD</Text>
            </TouchableOpacity>
          }
        />
      )}

      {toastMessage && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { textAlign: 'center', color: '#888', fontSize: 15 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  pin: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', flex: 1 },
  offlineBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  offlineBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  cardBody: { gap: 4 },
  detail: { fontSize: 13, color: '#555' },
  detailValue: { fontWeight: '600', color: '#1a1a1a' },
  addButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    margin: 8,
  },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  toast: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: 'rgba(30,30,30,0.88)',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
