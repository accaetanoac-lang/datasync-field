import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { finishActivity } from '../services/api';
import { queueActivity } from '../services/sync';
import NetInfo from '@react-native-community/netinfo';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = StackNavigationProp<RootStackParamList, 'Activity'>;
type Route = RouteProp<RootStackParamList, 'Activity'>;

const JD_GREEN = '#367C2B';
const JD_YELLOW = '#FFDE00';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function ActivityScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { machine, org, activityId, method, startedAt } = route.params;

  const [elapsed, setElapsed] = useState(0);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Compute initial elapsed in case of re-mount
    const initialElapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    setElapsed(Math.max(0, initialElapsed));

    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startedAt]);

  const handleFinish = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setLoading(true);

    const net = await NetInfo.fetch();
    const isOnline = net.isConnected && net.isInternetReachable !== false;

    try {
      if (isOnline && activityId > 0) {
        await finishActivity(activityId, notes || undefined);
      } else {
        // Offline — update the pending activity
        await queueActivity({
          tempId: String(Date.now()),
          org_id: org.id,
          machine_id: machine.id,
          method,
          notes: notes || undefined,
          status: 'completed',
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          duration_minutes: Math.round(elapsed / 60),
          synced_offline: true,
        });
      }

      setDone(true);
      setTimeout(() => navigation.navigate('MachineList', { org }), 1500);
    } catch {
      Alert.alert('Erro', 'Não foi possível finalizar a atividade.');
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <View style={styles.center}>
        <Text style={styles.doneIcon}>✓</Text>
        <Text style={styles.doneText}>Atividade concluída!</Text>
        <Text style={styles.doneSub}>Duração: {formatElapsed(elapsed)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Machine info header */}
      <View style={styles.header}>
        <Text style={styles.orgName}>{org.name}</Text>
        <Text style={styles.machinePin}>{machine.pin ?? machine.custom_name}</Text>
        <View style={styles.methodTag}>
          <Text style={styles.methodTagText}>
            {method === 'starlink_data_sync' ? 'Starlink + Data Sync' : 'Pen Drive'}
          </Text>
        </View>
      </View>

      {/* Chronometer */}
      <View style={styles.timerContainer}>
        <Text style={styles.timerLabel}>Tempo decorrido</Text>
        <Text style={styles.timer}>{formatElapsed(elapsed)}</Text>
      </View>

      {/* Notes */}
      <TextInput
        style={styles.notesInput}
        value={notes}
        onChangeText={setNotes}
        placeholder="Observações (opcional)"
        placeholderTextColor="#aaa"
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />

      {/* Finish button */}
      <TouchableOpacity style={styles.finishButton} onPress={handleFinish} disabled={loading}>
        {loading
          ? <ActivityIndicator color={JD_GREEN} />
          : <Text style={styles.finishButtonText}>Finalizar Operação</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16, gap: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: JD_GREEN,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  orgName: { color: '#fff', fontSize: 14, opacity: 0.85 },
  machinePin: { color: '#fff', fontSize: 20, fontWeight: '700' },
  methodTag: {
    backgroundColor: JD_YELLOW,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  methodTagText: { color: '#1a1a1a', fontSize: 12, fontWeight: '700' },
  timerContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  timerLabel: { color: '#aaa', fontSize: 13, marginBottom: 8 },
  timer: {
    fontSize: 56,
    fontWeight: '700',
    color: JD_YELLOW,
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
  },
  notesInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: '#1a1a1a',
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  finishButton: {
    backgroundColor: JD_GREEN,
    borderRadius: 8,
    padding: 18,
    alignItems: 'center',
  },
  finishButtonText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  doneIcon: { fontSize: 72, color: JD_GREEN },
  doneText: { fontSize: 22, fontWeight: '700', color: JD_GREEN, marginTop: 16 },
  doneSub: { fontSize: 16, color: '#555', marginTop: 8 },
});
