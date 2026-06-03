import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import NetInfo from '@react-native-community/netinfo';
import { registerJdUnlinkedMachine, startActivity, createNoUseActivity } from '../services/api';
import { queueJdMachine, queueActivity } from '../services/sync';
import { getCurrentLocation } from '../services/geolocation';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = StackNavigationProp<RootStackParamList, 'JDMachineForm'>;
type Route = RouteProp<RootStackParamList, 'JDMachineForm'>;
type Method = 'starlink_data_sync' | 'pen_drive';

const JD_GREEN  = '#367C2B';
const JD_YELLOW = '#FFDE00';

const MACHINE_TYPES = ['Trator', 'Colhedora', 'Pulverizador', 'Plantadeira', 'Outro'];

export default function JDMachineFormScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { prefillPin } = route.params;

  const [pin, setPin]                       = useState(prefillPin ?? '');
  const [organizationName, setOrgName]      = useState('');
  const [model, setModel]                   = useState('');
  const [machineName, setMachineName]       = useState('');
  const [machineType, setMachineType]       = useState('');
  const [year, setYear]                     = useState('');
  const [engineHours, setEngineHours]       = useState('');
  const [notes, setNotes]                   = useState('');
  const [loading, setLoading]               = useState(false);
  const [step, setStep]                     = useState<'form' | 'hours'>('form');
  const [machineId, setMachineId]           = useState<number | null>(null);
  const [currentHours, setCurrentHours]     = useState('');
  const [diff, setDiff]                     = useState<number | null>(null);
  const [method, setMethod]                 = useState<Method | null>(null);

  const handleRegister = async () => {
    if (!pin.trim()) { Alert.alert('Erro', 'O PIN/Chassi é obrigatório.'); return; }

    setLoading(true);
    const net = await NetInfo.fetch();
    const isOnline = net.isConnected && net.isInternetReachable !== false;

    const data = {
      pin: pin.trim(),
      organization_name: organizationName.trim() || undefined,
      model: model.trim() || undefined,
      machine_name: machineName.trim() || undefined,
      machine_type: machineType || undefined,
      year: year ? parseInt(year, 10) : undefined,
      engine_hours: engineHours ? parseFloat(engineHours) : undefined,
      notes: notes.trim() || undefined,
    };

    try {
      if (isOnline) {
        const result = await registerJdUnlinkedMachine(data);
        setMachineId(result.machine_id);
        setStep('hours');
      } else {
        await queueJdMachine({ tempId: String(Date.now()), ...data });
        Alert.alert(
          'Sem conexão',
          'Máquina salva localmente. Será registrada no servidor quando a conexão retornar.',
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao cadastrar máquina.';
      Alert.alert('Erro', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleHoursConfirm = () => {
    const val = parseFloat(currentHours);
    if (isNaN(val)) { Alert.alert('Erro', 'Digite um valor numérico válido.'); return; }
    setDiff(val);
  };

  const handleNoUse = async () => {
    if (!machineId) return;
    setLoading(true);
    const coords = await getCurrentLocation();
    const net    = await NetInfo.fetch();
    const isOnline = net.isConnected && net.isInternetReachable !== false;
    try {
      if (isOnline) {
        await createNoUseActivity({
          machine_id: machineId,
          current_hours: parseFloat(currentHours),
          tech_lat: coords?.latitude,
          tech_lng: coords?.longitude,
        });
      } else {
        await queueActivity({
          tempId: String(Date.now()),
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
      Alert.alert('Registrado', 'Máquina registrada como sem uso.', [
        { text: 'OK', onPress: () => navigation.navigate('SearchOrg') },
      ]);
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
    const net    = await NetInfo.fetch();
    const isOnline = net.isConnected && net.isInternetReachable !== false;
    const orgName  = organizationName.trim() || 'Sem organização';
    const machine  = {
      id: machineId, org_id: 0, is_john_deere: true,
      pin: pin.trim(), custom_name: machineName.trim() || pin.trim(),
    };
    const org = { id: 0, org_id_jd: '', name: orgName };
    try {
      if (isOnline) {
        const activity = await startActivity({
          machine_id: machineId, method,
          current_hours: parseFloat(currentHours),
          tech_lat: coords?.latitude, tech_lng: coords?.longitude,
        });
        navigation.navigate('Activity', {
          machine, org, activityId: activity.id, method,
          startedAt: activity.started_at ?? new Date().toISOString(),
        });
      } else {
        await queueActivity({
          tempId: String(Date.now()),
          machine_id: machineId, method,
          current_hours: parseFloat(currentHours),
          tech_lat: coords?.latitude, tech_lng: coords?.longitude,
          status: 'in_progress',
          started_at: new Date().toISOString(),
          synced_offline: true,
        });
        Alert.alert('Sem conexão', 'Atividade registrada offline. Será sincronizada ao reconectar.', [
          { text: 'OK', onPress: () => navigation.navigate('SearchOrg') },
        ]);
      }
    } catch (err: unknown) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Erro ao iniciar atividade.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'hours') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <Text style={styles.headerPin}>📍 {pin.toUpperCase()}</Text>
          {machineName ? <Text style={styles.headerSub}>{machineName}</Text> : null}
          {organizationName ? <Text style={styles.headerOrg}>{organizationName}</Text> : null}
        </View>

        <Text style={styles.sectionTitle}>Horímetro</Text>
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
              <Text style={styles.noUseTitle}>Diferença baixa</Text>
              <Text style={styles.noUseSubtitle}>{diff.toFixed(0)} h — abaixo de 50 h</Text>
            </View>
            <TouchableOpacity style={styles.grayButton} onPress={handleNoUse} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.grayButtonText}>Confirmar Sem Uso</Text>}
            </TouchableOpacity>
          </>
        )}

        {diff !== null && diff >= 50 && (
          <>
            <Text style={styles.diffPositive}>Diferença: {diff.toFixed(0)} h — coleta necessária</Text>
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
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Iniciar Atividade</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* JD badge */}
      <View style={styles.jdBadge}>
        <Text style={styles.jdBadgeText}>John Deere</Text>
      </View>

      <Field label="PIN / Chassi *" value={pin} onChange={setPin} caps />
      <Field label="Nome da organização" value={organizationName} onChange={setOrgName} />

      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>Marca</Text>
        <View style={styles.brandBox}>
          <Text style={styles.brandText}>John Deere</Text>
        </View>
      </View>

      <Field label="Modelo (ex: S780, 8R 410)" value={model} onChange={setModel} />
      <Field label="Nome da máquina (apelido)" value={machineName} onChange={setMachineName} />

      {/* Machine type picker */}
      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>Tipo de máquina</Text>
        <View style={styles.typeRow}>
          {MACHINE_TYPES.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.typeBtn, machineType === t && styles.typeBtnActive]}
              onPress={() => setMachineType(t)}
            >
              <Text style={[styles.typeBtnText, machineType === t && styles.typeBtnTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Field label="Ano" value={year} onChange={setYear} numeric />
      <Field label="Horímetro atual" value={engineHours} onChange={setEngineHours} numeric />
      <Field label="Observações (opcional)" value={notes} onChange={setNotes} multiline />

      <TouchableOpacity
        style={[styles.primaryButton, !pin.trim() && styles.primaryButtonDisabled]}
        onPress={handleRegister}
        disabled={!pin.trim() || loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Salvar máquina</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

function Field({
  label, value, onChange, caps, numeric, multiline,
}: {
  label: string; value: string; onChange: (t: string) => void;
  caps?: boolean; numeric?: boolean; multiline?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && { height: 72, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChange}
        placeholder={label.replace(' *', '')}
        placeholderTextColor="#aaa"
        autoCapitalize={caps ? 'characters' : 'sentences'}
        keyboardType={numeric ? 'numeric' : 'default'}
        multiline={multiline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content:   { padding: 16, gap: 10, paddingBottom: 32 },

  jdBadge: {
    alignSelf: 'flex-start',
    backgroundColor: JD_YELLOW,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 4,
  },
  jdBadgeText: { color: '#1a1a1a', fontWeight: '800', fontSize: 13 },

  headerCard: {
    backgroundColor: JD_GREEN, borderRadius: 12, padding: 16, gap: 4, marginBottom: 8,
  },
  headerPin: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '600' },
  headerOrg: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },

  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  label:        { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 4 },

  fieldWrap:  { gap: 4 },
  fieldLabel: { fontSize: 13, color: '#555' },
  fieldInput: {
    backgroundColor: '#fff', borderRadius: 8, padding: 12,
    fontSize: 15, borderWidth: 1, borderColor: '#ddd', color: '#1a1a1a',
  },

  brandBox: {
    backgroundColor: '#f3f4f6', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#e5e7eb',
  },
  brandText: { fontSize: 15, color: '#374151', fontWeight: '600' },

  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: {
    borderWidth: 1.5, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  typeBtnActive:     { borderColor: JD_GREEN, backgroundColor: '#f0fdf4' },
  typeBtnText:       { fontSize: 13, color: '#555', fontWeight: '600' },
  typeBtnTextActive: { color: JD_GREEN },

  primaryButton:         { backgroundColor: JD_GREEN, borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 8 },
  primaryButtonDisabled: { backgroundColor: '#a8c5a0' },
  primaryButtonText:     { color: '#fff', fontWeight: '700', fontSize: 16 },

  grayButton:     { backgroundColor: '#6B7280', borderRadius: 8, padding: 14, alignItems: 'center' },
  grayButtonText: { color: '#fff', fontWeight: '700' },

  hoursRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  hoursInput: {
    flex: 1, height: 48, backgroundColor: '#fff', borderRadius: 8,
    paddingHorizontal: 16, fontSize: 20, borderWidth: 1, borderColor: '#ddd', color: '#1a1a1a',
  },
  confirmBtn:     { backgroundColor: JD_GREEN, borderRadius: 8, paddingHorizontal: 20, justifyContent: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  noUseWarning:  { backgroundColor: '#FEF3C7', borderRadius: 8, padding: 14, borderLeftWidth: 4, borderLeftColor: '#F59E0B', marginBottom: 8 },
  noUseTitle:    { fontWeight: '700', color: '#92400E', fontSize: 14 },
  noUseSubtitle: { color: '#78350F', marginTop: 2, fontSize: 13 },
  diffPositive:  { color: JD_GREEN, fontWeight: '600', fontSize: 15, marginBottom: 4 },

  methodRow:           { flexDirection: 'row', gap: 8, marginBottom: 8 },
  methodBtn:           { flex: 1, borderWidth: 2, borderColor: '#ddd', borderRadius: 8, padding: 12, alignItems: 'center' },
  methodBtnActive:     { borderColor: JD_GREEN, backgroundColor: '#f0fdf4' },
  methodBtnText:       { color: '#555', fontWeight: '600', fontSize: 13, textAlign: 'center' },
  methodBtnTextActive: { color: JD_GREEN },
});
