import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createNoUseActivity, startDiagnosisActivity } from '../services/api';
import { queueActivity } from '../services/sync';
import { getCurrentLocation } from '../services/geolocation';
import { RootStackParamList } from '../navigation/AppNavigator';
import { formatDaysOffline } from '../types';
import NetInfo from '@react-native-community/netinfo';

const ACTIVE_DIAGNOSIS_V2_PREFIX = 'active_diagnosis_v2_';

type Nav = StackNavigationProp<RootStackParamList, 'MachineDetail'>;
type Route = RouteProp<RootStackParamList, 'MachineDetail'>;

const JD_GREEN = '#367C2B';

export default function MachineDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { machine, org } = route.params;

  const [currentHours, setCurrentHours] = useState('');
  const [hoursError, setHoursError] = useState<string | null>(null);
  const [diff, setDiff] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [noUseConfirmed, setNoUseConfirmed] = useState(false);

  // PostgreSQL NUMERIC columns arrive as strings — force to number upfront
  const lastHours = Number(machine.machine_hours ?? 0);

  const handleHoursChange = (text: string) => {
    setCurrentHours(text);
    setDiff(null);
    const val = parseFloat(text);
    if (!isNaN(val) && val < lastHours) {
      setHoursError(
        `Horímetro atual não pode ser menor que o horímetro da última conexão (${lastHours} h)`
      );
    } else {
      setHoursError(null);
    }
  };

  const handleHoursSubmit = async () => {
    const val = parseFloat(currentHours);
    if (isNaN(val)) {
      setHoursError('Digite um valor numérico válido.');
      return;
    }
    if (val < lastHours) {
      setHoursError(
        `Horímetro atual não pode ser menor que o horímetro da última conexão (${lastHours} h)`
      );
      return;
    }
    setHoursError(null);
    const hoursDiff = val - lastHours;

    if (hoursDiff >= 10) {
      setLoading(true);
      try {
        // Clear any stale diagnosis keys for this machine and legacy keys
        const allKeys = await AsyncStorage.getAllKeys();
        const staleKeys = allKeys.filter(
          (k) => k === 'active_diagnosis_v1' || k === 'active_diagnosis_v2' || k.startsWith(ACTIVE_DIAGNOSIS_V2_PREFIX)
        );
        if (staleKeys.length > 0) await AsyncStorage.multiRemove(staleKeys);

        const act = await startDiagnosisActivity({
          org_id: org.id,
          machine_id: machine.id,
          current_hours: val,
        });
        const startedAt = act.started_at ?? new Date().toISOString();
        const machineKey = ACTIVE_DIAGNOSIS_V2_PREFIX + (machine.pin ?? machine.custom_name ?? String(machine.id));
        await AsyncStorage.setItem(machineKey, JSON.stringify({
          activityId: act.id,
          startedAt,
          machinePin: machine.pin ?? machine.custom_name ?? '',
          orgName: org.name,
          machine,
          org,
          currentHours: val,
          hoursDiff,
          currentScreen: 'connectivity_check',
          totalPausedMs: 0,
          pausedAt: null,
        }));
        navigation.navigate('ConnectivityCheck', { machine, org, currentHours: val, hoursDiff, activityId: act.id, startedAt });
      } catch {
        Alert.alert('Erro', 'Não foi possível iniciar o diagnóstico. Verifique sua conexão e tente novamente.');
      } finally {
        setLoading(false);
      }
      return;
    }

    setDiff(hoursDiff);
  };

  const handleNoUse = async () => {
    setLoading(true);
    const coords = await getCurrentLocation();
    const net = await NetInfo.fetch();
    const isOnline = net.isConnected && net.isInternetReachable !== false;

    try {
      if (isOnline) {
        await createNoUseActivity({
          org_id: org.id,
          machine_id: machine.id,
          current_hours: parseFloat(currentHours),
          tech_lat: coords?.latitude,
          tech_lng: coords?.longitude,
        });
      } else {
        await queueActivity({
          tempId: String(Date.now()),
          org_id: org.id,
          machine_id: machine.id,
          method: 'pen_drive',
          current_hours: parseFloat(currentHours),
          tech_lat: coords?.latitude,
          tech_lng: coords?.longitude,
          status: 'no_use',
          started_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
          synced_offline: true,
        });
      }
      setNoUseConfirmed(true);
      setTimeout(() => navigation.goBack(), 1500);
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível registrar.');
    } finally {
      setLoading(false);
    }
  };

  if (noUseConfirmed) {
    return (
      <View style={styles.center}>
        <Text style={styles.successIcon}>✓</Text>
        <Text style={styles.successText}>Registrado como sem uso.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Machine info */}
      <View style={styles.infoCard}>
        <Row label="Chassi / PIN" value={machine.pin ?? machine.custom_name ?? 'N/A'} />
        <Row label="Dias offline" value={formatDaysOffline(machine.days_offline)} />
        <Row
          label="Horímetro última conexão"
          value={machine.machine_hours != null ? `${machine.machine_hours} h` : 'N/A'}
        />
        <Row
          label="Última conexão"
          value={
            machine.last_call_date
              ? new Date(machine.last_call_date).toLocaleDateString('pt-BR')
              : 'Sem data'
          }
        />
      </View>

      {/* Horímetro input */}
      <Text style={styles.label}>Horímetro atual (confira no painel)</Text>
      <View style={styles.hoursRow}>
        <TextInput
          style={[styles.hoursInput, hoursError ? styles.hoursInputError : null]}
          value={currentHours}
          onChangeText={handleHoursChange}
          placeholder="Ex: 1580"
          placeholderTextColor="#aaa"
          keyboardType="numeric"
          returnKeyType="done"
          onSubmitEditing={handleHoursSubmit}
        />
        <TouchableOpacity
          style={[styles.confirmBtn, (hoursError || loading) ? styles.confirmBtnDisabled : null]}
          onPress={handleHoursSubmit}
          disabled={!!hoursError || loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.confirmBtnText}>OK</Text>}
        </TouchableOpacity>
      </View>
      {hoursError && (
        <Text style={styles.hoursErrorText}>{hoursError}</Text>
      )}

      {/* Result based on diff */}
      {diff !== null && (
        <View style={styles.diffSection}>
          {/* diff is always < 10 here — diff >= 10 navigates to Diagnosis */}
          <View style={styles.noUseWarning}>
            <Text style={styles.noUseTitle}>
              {diff === 0 ? 'Máquina sem uso' : 'Máquina sem uso após última subida de dados'}
            </Text>
            <Text style={styles.noUseSubtitle}>
              {diff === 0
                ? `Horímetro idêntico ao da última conexão (${lastHours} h).`
                : `Diferença de ${diff.toFixed(1)} horas — abaixo de 10 h.`}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.noUseButton}
            onPress={handleNoUse}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.noUseButtonText}>Confirmar e Encerrar</Text>}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  rowLabel: { color: '#555', fontSize: 14 },
  rowValue: { fontWeight: '600', color: '#1a1a1a', fontSize: 14 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 4 },
  hoursRow: { flexDirection: 'row', gap: 8 },
  hoursInput: {
    flex: 1,
    height: 48,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    color: '#1a1a1a',
  },
  hoursInputError: {
    borderColor: '#ef4444',
    borderWidth: 1.5,
  },
  hoursErrorText: {
    color: '#ef4444',
    fontSize: 13,
    marginTop: 4,
  },
  confirmBtn: {
    backgroundColor: JD_GREEN,
    borderRadius: 8,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  confirmBtnDisabled: { backgroundColor: '#a8c5a0' },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  diffSection: { gap: 12 },
  noUseWarning: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  noUseTitle: { fontWeight: '700', color: '#92400E', fontSize: 15 },
  noUseSubtitle: { color: '#78350F', marginTop: 4, fontSize: 13 },
  noUseButton: {
    backgroundColor: '#6B7280',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  noUseButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  successIcon: { fontSize: 64, color: JD_GREEN },
  successText: { fontSize: 18, color: JD_GREEN, fontWeight: '600', marginTop: 16 },
});
