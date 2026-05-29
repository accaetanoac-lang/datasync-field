import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { createNonJDMachine, startActivity, createNoUseActivity } from '../services/api';
import { queueActivity } from '../services/sync';
import { getCurrentLocation } from '../services/geolocation';
import NetInfo from '@react-native-community/netinfo';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = StackNavigationProp<RootStackParamList, 'NonJDMachine'>;
type Route = RouteProp<RootStackParamList, 'NonJDMachine'>;
type Method = 'starlink_data_sync' | 'pen_drive';

const JD_GREEN = '#367C2B';

export default function NonJDMachineScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { org } = route.params;

  const [customName, setCustomName] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [description, setDescription] = useState('');
  const [currentHours, setCurrentHours] = useState('');
  const [diff, setDiff] = useState<number | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [loading, setLoading] = useState(false);
  const [machineId, setMachineId] = useState<number | null>(null);
  const [step, setStep] = useState<'form' | 'hours' | 'done'>('form');

  const handleRegisterMachine = async () => {
    if (!customName.trim()) {
      Alert.alert('Erro', 'O nome/identificação da máquina é obrigatório.');
      return;
    }
    setLoading(true);
    try {
      const desc = [brand, model, description].filter(Boolean).join(' | ');
      const machine = await createNonJDMachine({
        org_id: org?.id,
        custom_name: customName.trim(),
        custom_description: desc || undefined,
      });
      setMachineId(machine.id);
      setStep('hours');
    } catch {
      Alert.alert('Erro', 'Não foi possível cadastrar a máquina.');
    } finally {
      setLoading(false);
    }
  };

  const handleHoursConfirm = () => {
    const val = parseFloat(currentHours);
    if (isNaN(val)) {
      Alert.alert('Erro', 'Digite um valor numérico válido.');
      return;
    }
    setDiff(val);
  };

  const handleNoUse = async () => {
    if (!machineId) return;
    setLoading(true);
    const coords = await getCurrentLocation();
    const net = await NetInfo.fetch();
    const isOnline = net.isConnected && net.isInternetReachable !== false;

    try {
      if (isOnline) {
        await createNoUseActivity({
          org_id: org?.id,
          machine_id: machineId,
          current_hours: parseFloat(currentHours),
          tech_lat: coords?.latitude,
          tech_lng: coords?.longitude,
        });
      } else {
        await queueActivity({
          tempId: String(Date.now()),
          org_id: org?.id,
          machine_id: machineId,
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
      setStep('done');
    } catch {
      Alert.alert('Erro', 'Não foi possível registrar.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartActivity = async () => {
    if (!method || !machineId) return;
    setLoading(true);
    const coords = await getCurrentLocation();
    const net = await NetInfo.fetch();
    const isOnline = net.isConnected && net.isInternetReachable !== false;

    try {
      if (isOnline) {
        const activity = await startActivity({
          org_id: org?.id,
          machine_id: machineId,
          method,
          current_hours: parseFloat(currentHours),
          tech_lat: coords?.latitude,
          tech_lng: coords?.longitude,
        });

        const fakeMachine = {
          id: machineId,
          org_id: org?.id ?? 0,
          is_john_deere: false,
          custom_name: customName,
        };

        navigation.navigate('Activity', {
          machine: fakeMachine,
          org: org ?? { id: 0, org_id_jd: '', name: 'Sem org' },
          activityId: activity.id,
          method,
          startedAt: activity.started_at ?? new Date().toISOString(),
        });
      } else {
        await queueActivity({
          tempId: String(Date.now()),
          org_id: org?.id,
          machine_id: machineId,
          method,
          current_hours: parseFloat(currentHours),
          tech_lat: coords?.latitude,
          tech_lng: coords?.longitude,
          status: 'in_progress',
          started_at: new Date().toISOString(),
          synced_offline: true,
        });
        setStep('done');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao iniciar atividade.';
      Alert.alert('Erro', msg);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'done') {
    return (
      <View style={styles.center}>
        <Text style={styles.doneIcon}>✓</Text>
        <Text style={styles.doneText}>Registrado com sucesso!</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {step === 'form' && (
        <>
          <Text style={styles.sectionTitle}>Dados da Máquina</Text>

          <Field label="Nome / Identificação *" value={customName} onChange={setCustomName} />
          <Field label="Marca" value={brand} onChange={setBrand} />
          <Field label="Modelo" value={model} onChange={setModel} />
          <Field label="Descrição" value={description} onChange={setDescription} multiline />

          {org && (
            <View style={styles.orgTag}>
              <Text style={styles.orgTagText}>Organização: {org.name}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleRegisterMachine}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryButtonText}>Continuar</Text>}
          </TouchableOpacity>
        </>
      )}

      {step === 'hours' && (
        <>
          <Text style={styles.sectionTitle}>Horímetro</Text>
          <Text style={styles.machineLabel}>{customName}</Text>

          <Text style={styles.label}>Horímetro atual (confira no painel)</Text>
          <View style={styles.hoursRow}>
            <TextInput
              style={styles.hoursInput}
              value={currentHours}
              onChangeText={setCurrentHours}
              placeholder="Ex: 1580"
              placeholderTextColor="#aaa"
              keyboardType="numeric"
            />
            <TouchableOpacity style={styles.confirmBtn} onPress={handleHoursConfirm}>
              <Text style={styles.confirmBtnText}>OK</Text>
            </TouchableOpacity>
          </View>

          {diff !== null && diff < 50 && (
            <>
              <View style={styles.noUseWarning}>
                <Text style={styles.noUseTitle}>Máquina sem uso</Text>
                <Text style={styles.noUseSubtitle}>Diferença de {diff.toFixed(1)} h (abaixo de 50 h)</Text>
              </View>
              <TouchableOpacity style={styles.grayButton} onPress={handleNoUse} disabled={loading}>
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.grayButtonText}>Confirmar e Encerrar</Text>}
              </TouchableOpacity>
            </>
          )}

          {diff !== null && diff >= 50 && (
            <>
              <Text style={styles.diffPositive}>Diferença: {diff.toFixed(1)} h — coleta necessária</Text>
              <Text style={styles.label}>Método de coleta</Text>
              <View style={styles.methodRow}>
                {(['starlink_data_sync', 'pen_drive'] as Method[]).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.methodBtn, method === m && styles.methodBtnActive]}
                    onPress={() => setMethod(m)}
                  >
                    <Text style={[styles.methodBtnText, method === m && styles.methodBtnTextActive]}>
                      {m === 'starlink_data_sync' ? 'Starlink + Data Sync' : 'Pen Drive'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.primaryButton, !method && styles.primaryButtonDisabled]}
                onPress={handleStartActivity}
                disabled={!method || loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryButtonText}>Iniciar Atividade</Text>}
              </TouchableOpacity>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={fieldStyles.label}>{label}</Text>
      <TextInput
        style={[fieldStyles.input, multiline && { height: 80, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        placeholderTextColor="#aaa"
        placeholder={label.replace(' *', '')}
      />
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  label: { fontSize: 13, color: '#555', marginBottom: 4 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#ddd',
    color: '#1a1a1a',
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 16, gap: 8 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  machineLabel: { fontSize: 16, fontWeight: '600', color: JD_GREEN, marginBottom: 8 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 4 },
  orgTag: {
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    padding: 10,
    marginBottom: 4,
  },
  orgTagText: { color: JD_GREEN, fontWeight: '600' },
  primaryButton: {
    backgroundColor: JD_GREEN,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonDisabled: { backgroundColor: '#a8c5a0' },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  grayButton: {
    backgroundColor: '#6B7280',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  grayButtonText: { color: '#fff', fontWeight: '700' },
  hoursRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
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
  confirmBtn: {
    backgroundColor: JD_GREEN,
    borderRadius: 8,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  noUseWarning: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  noUseTitle: { fontWeight: '700', color: '#92400E', fontSize: 15 },
  noUseSubtitle: { color: '#78350F', marginTop: 4 },
  diffPositive: { color: JD_GREEN, fontWeight: '600', fontSize: 15 },
  methodRow: { flexDirection: 'row', gap: 8 },
  methodBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  methodBtnActive: { borderColor: JD_GREEN, backgroundColor: '#f0fdf4' },
  methodBtnText: { color: '#555', fontWeight: '600', fontSize: 13, textAlign: 'center' },
  methodBtnTextActive: { color: JD_GREEN },
  doneIcon: { fontSize: 72, color: JD_GREEN },
  doneText: { fontSize: 22, fontWeight: '700', color: JD_GREEN, marginTop: 16 },
});
