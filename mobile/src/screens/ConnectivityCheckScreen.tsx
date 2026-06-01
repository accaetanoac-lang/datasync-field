import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, AppState, AppStateStatus, TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as ImagePicker from 'expo-image-picker';
import { RootStackParamList } from '../navigation/AppNavigator';
import { formatDaysOffline } from '../types';

type Nav = StackNavigationProp<RootStackParamList, 'ConnectivityCheck'>;
type Route = RouteProp<RootStackParamList, 'ConnectivityCheck'>;

const JD_GREEN  = '#367C2B';
const JD_YELLOW = '#FFDE00';

const CONNECTED_CAUSES = [
  'Máquina não foi ligada neste período',
  'Sem sinal de internet na localização (resolvido com Starlink)',
  'Reinício do sistema resolveu o problema',
];

function pad(n: number) { return String(n).padStart(2, '0'); }
function formatElapsed(s: number) {
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export default function ConnectivityCheckScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { machine, org, currentHours, hoursDiff, activityId, startedAt } = route.params;

  const [elapsed, setElapsed]             = useState(0);
  const [takingPhoto, setTakingPhoto]     = useState(false);
  const [showCauses, setShowCauses]       = useState(false);
  const [causesChecklist, setCausesChecklist] = useState<boolean[]>(new Array(3).fill(false));
  const [outrosChecked, setOutrosChecked] = useState(false);
  const [outrosText, setOutrosText]       = useState('');

  const startTsRef  = useRef(Date.parse(startedAt));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const calcElapsed = useCallback(
    () => Math.max(0, Math.floor((Date.now() - startTsRef.current) / 1000)),
    []
  );

  useEffect(() => {
    setElapsed(calcElapsed());
    intervalRef.current = setInterval(() => setElapsed(calcElapsed()), 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [calcElapsed]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') setElapsed(calcElapsed());
    });
    return () => sub.remove();
  }, [calcElapsed]);

  const machineKey = `active_diagnosis_v2_${machine.pin ?? machine.custom_name ?? machine.id}`;

  const updateStoredScreen = async (screen: string, extra?: Record<string, unknown>) => {
    try {
      const raw = await AsyncStorage.getItem(machineKey);
      if (!raw) return;
      await AsyncStorage.setItem(machineKey, JSON.stringify({ ...JSON.parse(raw), currentScreen: screen, ...extra }));
    } catch { /* non-fatal */ }
  };

  const handleConnected = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão negada', 'Autorize o acesso à câmera nas configurações.');
      return;
    }
    setTakingPhoto(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets.length > 0) {
        const photoUri = result.assets[0].uri;
        await updateStoredScreen('data_collection', { connectivityPhotoUri: photoUri });
        navigation.navigate('DataCollection', {
          machine, org, currentHours, hoursDiff, activityId, startedAt, connectivityPhotoUri: photoUri,
        });
      }
    } finally {
      setTakingPhoto(false);
    }
  };

  const handleNotConnected = async () => {
    await updateStoredScreen('diagnosis');
    navigation.navigate('Diagnosis', { machine, org, currentHours, hoursDiff, activityId, startedAt, initialStep: 'step2b' });
  };

  const handleNoModem = async () => {
    await updateStoredScreen('no_modem');
    navigation.navigate('Diagnosis', { machine, org, currentHours, hoursDiff, activityId, startedAt, initialStep: 'step2c' });
  };

  const toggleCause = (i: number) => {
    const next = [...causesChecklist];
    next[i] = !next[i];
    setCausesChecklist(next);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>

      {/* Machine info */}
      <View style={styles.machineCard}>
        <Text style={styles.cardTitle}>Informações da Máquina</Text>
        <InfoRow label="Chassi / PIN"    value={machine.pin ?? machine.custom_name ?? 'N/A'} />
        <InfoRow label="Dias offline"    value={formatDaysOffline(machine.days_offline)} valueStyle={styles.yellowText} />
        <InfoRow label="Horímetro atual" value={`${currentHours} h`} />
        <InfoRow label="Diferença"       value={`${hoursDiff.toFixed(1)} h`} />
      </View>

      {/* Timer */}
      <View style={styles.timerBar}>
        <Text style={styles.timerLabel}>Tempo de serviço:</Text>
        <Text style={styles.timerValue}>{formatElapsed(elapsed)}</Text>
      </View>

      {/* Instruction */}
      <View style={styles.instructionCard}>
        <Text style={styles.instructionTitle}>Verificação de conectividade</Text>
        <Text style={styles.instructionText}>
          Ligue a ignição e conecte a máquina à internet. Aguarde o símbolo de conexão aparecer no painel.
        </Text>
      </View>

      {/* A — Connected */}
      {!showCauses ? (
        <>
          <TouchableOpacity
            style={[styles.connectedBtn, takingPhoto && styles.btnDisabled]}
            onPress={() => setShowCauses(true)}
            disabled={takingPhoto}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>Máquina conectou!</Text>
          </TouchableOpacity>
          <Text style={styles.btnHint}>Você identificará as causas e fotografará o painel</Text>

          {/* B — Not connected */}
          <TouchableOpacity
            style={[styles.notConnectedBtn, takingPhoto && styles.btnDisabled]}
            onPress={handleNotConnected}
            disabled={takingPhoto}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>Não foi possível conectar</Text>
          </TouchableOpacity>

          {/* C — No modem */}
          <TouchableOpacity
            style={[styles.noModemBtn, takingPhoto && styles.btnDisabled]}
            onPress={handleNoModem}
            disabled={takingPhoto}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>Sem modem JDLink instalado</Text>
          </TouchableOpacity>
        </>
      ) : (
        /* Causes checklist — shown after "Máquina conectou!" */
        <View style={styles.causesCard}>
          <Text style={styles.causesTitle}>✅ Máquina conectada</Text>
          <Text style={styles.causesSubtitle}>Por que estava sem conexão? Marque as causas identificadas:</Text>

          {CONNECTED_CAUSES.map((item, i) => (
            <TouchableOpacity
              key={i}
              style={styles.checkItem}
              onPress={() => toggleCause(i)}
            >
              <View style={[styles.checkbox, causesChecklist[i] && styles.checkboxChecked]}>
                {causesChecklist[i] && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={[styles.checkLabel, causesChecklist[i] && styles.checkLabelChecked]}>
                {item}
              </Text>
            </TouchableOpacity>
          ))}

          {/* Outros */}
          <TouchableOpacity
            style={styles.checkItem}
            onPress={() => setOutrosChecked(!outrosChecked)}
          >
            <View style={[styles.checkbox, outrosChecked && styles.checkboxChecked]}>
              {outrosChecked && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={[styles.checkLabel, outrosChecked && styles.checkLabelChecked]}>Outros</Text>
          </TouchableOpacity>
          {outrosChecked && (
            <TextInput
              style={styles.outrosInput}
              value={outrosText}
              onChangeText={setOutrosText}
              placeholder="Descreva a causa"
              placeholderTextColor="#aaa"
            />
          )}

          {/* Photo button */}
          <TouchableOpacity
            style={[styles.photoBtn, takingPhoto && styles.btnDisabled]}
            onPress={handleConnected}
            disabled={takingPhoto}
            activeOpacity={0.85}
          >
            {takingPhoto
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>📷 Fotografar painel mostrando conexão</Text>}
          </TouchableOpacity>
          <Text style={styles.btnHint}>Fotografe o símbolo de conexão ativo no painel</Text>

          {/* Back */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => { setShowCauses(false); setCausesChecklist(new Array(3).fill(false)); setOutrosChecked(false); setOutrosText(''); }}
          >
            <Text style={styles.backBtnText}>Voltar</Text>
          </TouchableOpacity>
        </View>
      )}

    </ScrollView>
  );
}

function InfoRow({ label, value, valueStyle }: { label: string; value: string; valueStyle?: object }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueStyle]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: '#f5f5f5' },
  container: { padding: 16, gap: 12 },

  machineCard: { backgroundColor: JD_GREEN, borderRadius: 12, padding: 16, gap: 4 },
  cardTitle:   { color: '#fff', fontSize: 13, fontWeight: '700', opacity: 0.8, marginBottom: 4 },
  infoRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.15)' },
  infoLabel:   { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  infoValue:   { color: '#fff', fontWeight: '700', fontSize: 13 },
  yellowText:  { color: JD_YELLOW, fontWeight: '800' },

  timerBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12,
  },
  timerLabel: { color: '#aaa', fontSize: 13 },
  timerValue: { fontSize: 22, fontWeight: '700', color: JD_YELLOW, fontVariant: ['tabular-nums'], letterSpacing: 1 },

  instructionCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 8,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2,
  },
  instructionTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  instructionText:  { fontSize: 14, color: '#6b7280', lineHeight: 22 },

  btnText:        { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnDisabled:    { opacity: 0.5 },
  btnHint:        { textAlign: 'center', fontSize: 12, color: '#6b7280', marginTop: -4 },
  connectedBtn:   { backgroundColor: JD_GREEN,  borderRadius: 12, padding: 18, alignItems: 'center' },
  notConnectedBtn:{ backgroundColor: '#1a1a1a', borderRadius: 12, padding: 18, alignItems: 'center' },
  noModemBtn:     { backgroundColor: '#1D4ED8', borderRadius: 12, padding: 18, alignItems: 'center' },

  causesCard: {
    backgroundColor: '#F0FDF4', borderRadius: 12, padding: 16, gap: 10,
    borderWidth: 1.5, borderColor: '#86EFAC',
  },
  causesTitle:    { fontSize: 16, fontWeight: '700', color: '#166534' },
  causesSubtitle: { fontSize: 13, color: '#4B7C59', marginBottom: 4 },

  checkItem:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  checkbox:          { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  checkboxChecked:   { backgroundColor: JD_GREEN, borderColor: JD_GREEN },
  checkmark:         { color: '#fff', fontWeight: '900', fontSize: 13 },
  checkLabel:        { flex: 1, fontSize: 14, color: '#374151' },
  checkLabelChecked: { color: '#1a1a1a', fontWeight: '600' },

  outrosInput: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    padding: 10, fontSize: 14, color: '#1a1a1a', backgroundColor: '#fff',
    marginLeft: 32,
  },

  photoBtn: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4,
  },

  backBtn: {
    borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 10,
    padding: 12, alignItems: 'center', backgroundColor: '#fff',
  },
  backBtnText: { color: '#6b7280', fontWeight: '600', fontSize: 14 },
});
