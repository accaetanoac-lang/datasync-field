import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Image, TextInput,
  AppState, AppStateStatus,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as ImagePicker from 'expo-image-picker';
import NetInfo from '@react-native-community/netinfo';
import {
  startDiagnosisActivity,
  pauseActivity,
  resumeActivity,
  finishDiagnosisActivity,
  uploadActivityPhoto,
} from '../services/api';
import { RootStackParamList } from '../navigation/AppNavigator';
import { formatDaysOffline } from '../types';

type Nav = StackNavigationProp<RootStackParamList, 'Diagnosis'>;
type Route = RouteProp<RootStackParamList, 'Diagnosis'>;

export const ACTIVE_DIAGNOSIS_KEY = 'active_diagnosis';

type Resolution = 'resolved' | 'needs_return' | 'unidentified';

type SavedDiagnosis = {
  activityId: number;
  startedAt: string;        // ISO
  totalPauseMs: number;
  pausedAt: string | null;  // ISO when paused, null when running
  checklist: boolean[];
  resolution: Resolution;
};

const JD_GREEN  = '#367C2B';
const JD_YELLOW = '#FFDE00';

const CHECKLIST_ITEMS = [
  'Verificou se a chave está ligada?',
  'Tentou conectar à internet (Wi-Fi/Starlink)?',
  'Verificou o modem JDLink (luzes/status)?',
  'Verificou a fiação elétrica do modem?',
  'Realizou reset do modem?',
  'Conectividade restabelecida após procedimentos?',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function DiagnosisScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { machine, org, hoursDiff } = route.params;

  // Checklist & resolution (pre-timer phase)
  const [checklist, setChecklist]       = useState<boolean[]>(new Array(6).fill(false));
  const [resolution, setResolution]     = useState<Resolution | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<'starlink_data_sync' | 'pen_drive' | null>(null);

  // Timer phase
  const [timerStarted, setTimerStarted] = useState(false);
  const [activityId, setActivityId]     = useState<number>(0);
  const [elapsed, setElapsed]           = useState(0);      // effective seconds
  const [isPaused, setIsPaused]         = useState(false);
  const [notes, setNotes]               = useState('');
  const [photoUri, setPhotoUri]         = useState<string | null>(null);
  const [loading, setLoading]           = useState(false);
  const [done, setDone]                 = useState(false);

  // Refs for stable timer math (avoid stale closure issues)
  const startTimestampRef = useRef<number>(0);    // Date.now() when timer started
  const totalPauseMsRef   = useRef<number>(0);    // accumulated pause ms
  const pausedAtRef       = useRef<number | null>(null); // Date.now() when paused
  const activityIdRef     = useRef<number>(0);
  const intervalRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolutionRef     = useRef<Resolution | null>(null);
  const checklistRef      = useRef<boolean[]>(new Array(6).fill(false));

  const calcElapsed = useCallback((): number => {
    const pausedMs = isPaused && pausedAtRef.current
      ? Date.now() - pausedAtRef.current
      : 0;
    return Math.max(0, Math.floor(
      (Date.now() - startTimestampRef.current - totalPauseMsRef.current - pausedMs) / 1000
    ));
  }, [isPaused]);

  const startInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setElapsed(calcElapsed());
    intervalRef.current = setInterval(() => setElapsed(calcElapsed()), 1000);
  }, [calcElapsed]);

  // Restore paused state from AsyncStorage (app force-closed while paused)
  useEffect(() => {
    AsyncStorage.getItem(ACTIVE_DIAGNOSIS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const saved: SavedDiagnosis = JSON.parse(raw);
        if (!saved.activityId) return;

        startTimestampRef.current = Date.parse(saved.startedAt);
        totalPauseMsRef.current   = saved.totalPauseMs;
        activityIdRef.current     = saved.activityId;
        resolutionRef.current     = saved.resolution;
        checklistRef.current      = saved.checklist;

        setActivityId(saved.activityId);
        setResolution(saved.resolution);
        setChecklist(saved.checklist);
        setTimerStarted(true);

        if (saved.pausedAt) {
          pausedAtRef.current = Date.parse(saved.pausedAt);
          setIsPaused(true);
          setElapsed(calcElapsed());
          // Don't start interval — stay paused
        } else {
          startInterval();
        }
      } catch { /* ignore malformed */ }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Snap elapsed on app foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && timerStarted && !isPaused) {
        setElapsed(calcElapsed());
      }
    });
    return () => sub.remove();
  }, [timerStarted, isPaused, calcElapsed]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const persistState = useCallback(async (paused: boolean) => {
    const data: SavedDiagnosis = {
      activityId: activityIdRef.current,
      startedAt: new Date(startTimestampRef.current).toISOString(),
      totalPauseMs: totalPauseMsRef.current,
      pausedAt: paused && pausedAtRef.current
        ? new Date(pausedAtRef.current).toISOString()
        : null,
      checklist: checklistRef.current,
      resolution: resolutionRef.current!,
    };
    await AsyncStorage.setItem(ACTIVE_DIAGNOSIS_KEY, JSON.stringify(data)).catch(() => {});
  }, []);

  const handleStartDiagnosis = async () => {
    if (!resolution) return;
    if (resolution === 'resolved' && !selectedMethod) {
      Alert.alert('Selecione o método', 'Escolha Starlink + Data Sync ou Pen Drive.');
      return;
    }

    setLoading(true);
    try {
      const net = await NetInfo.fetch();
      const isOnline = net.isConnected && net.isInternetReachable !== false;

      let id = -1;
      if (isOnline) {
        const activity = await startDiagnosisActivity({
          org_id: org.id,
          machine_id: machine.id,
        });
        id = activity.id;
      }

      const now = Date.now();
      startTimestampRef.current = now;
      totalPauseMsRef.current   = 0;
      pausedAtRef.current       = null;
      activityIdRef.current     = id;
      resolutionRef.current     = resolution;
      checklistRef.current      = checklist;

      setActivityId(id);
      setTimerStarted(true);
      await persistState(false);
      startInterval();
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível iniciar o diagnóstico.');
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const now = Date.now();
    pausedAtRef.current = now;
    setIsPaused(true);
    setElapsed(calcElapsed());
    await persistState(true);

    if (activityIdRef.current > 0) {
      const net = await NetInfo.fetch();
      if (net.isConnected && net.isInternetReachable !== false) {
        pauseActivity(activityIdRef.current).catch(() => {});
      }
    }
  };

  const handleResume = async () => {
    if (pausedAtRef.current !== null) {
      totalPauseMsRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
    setIsPaused(false);
    await persistState(false);
    startInterval();

    if (activityIdRef.current > 0) {
      const net = await NetInfo.fetch();
      if (net.isConnected && net.isInternetReachable !== false) {
        resumeActivity(activityIdRef.current).catch(() => {});
      }
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão negada', 'Autorize o acesso à câmera nas configurações.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets.length > 0) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleFinish = async () => {
    if (!photoUri) {
      Alert.alert('Foto obrigatória', 'Tire uma foto do modem/máquina antes de finalizar.');
      return;
    }
    if (!resolution) return;

    if (intervalRef.current) clearInterval(intervalRef.current);
    setLoading(true);

    const totalPauseMinutes = Math.round(totalPauseMsRef.current / 60000);

    const net = await NetInfo.fetch();
    const isOnline = net.isConnected && net.isInternetReachable !== false;

    try {
      if (isOnline && activityIdRef.current > 0) {
        let photoUploaded = false;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            await uploadActivityPhoto(activityIdRef.current, photoUri);
            photoUploaded = true;
            break;
          } catch { /* retry */ }
        }

        await finishDiagnosisActivity(activityIdRef.current, {
          diagnosis_result: resolution,
          diagnosis_checklist: checklistRef.current,
          total_pause_minutes: totalPauseMinutes,
          notes: notes || undefined,
        });
        await AsyncStorage.removeItem(ACTIVE_DIAGNOSIS_KEY);
        setDone(true);

        if (!photoUploaded) {
          setTimeout(() => {
            Alert.alert(
              'Diagnóstico concluído',
              'Foto não enviada — verifique sua conexão.',
              [{ text: 'OK', onPress: () => navigation.navigate('MachineList', { org }) }],
            );
          }, 400);
        } else {
          setTimeout(() => navigation.navigate('MachineList', { org }), 1500);
        }
      } else {
        // Offline — mark done locally
        await AsyncStorage.removeItem(ACTIVE_DIAGNOSIS_KEY);
        setDone(true);
        setTimeout(() => navigation.navigate('MachineList', { org }), 1500);
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível finalizar o diagnóstico.');
      startInterval();
    } finally {
      setLoading(false);
    }
  };

  const toggleChecklist = (index: number) => {
    const next = [...checklist];
    next[index] = !next[index];
    setChecklist(next);
    checklistRef.current = next;
  };

  if (done) {
    const RESULT_LABEL: Record<Resolution, string> = {
      resolved:    'Conectividade restabelecida',
      needs_return:'Retorno agendado',
      unidentified:'Problema não identificado',
    };
    return (
      <View style={styles.center}>
        <Text style={styles.doneIcon}>✓</Text>
        <Text style={styles.doneText}>Diagnóstico concluído!</Text>
        <Text style={styles.doneSub}>{resolution ? RESULT_LABEL[resolution] : ''}</Text>
      </View>
    );
  }

  const canStart = resolution !== null && (resolution !== 'resolved' || selectedMethod !== null);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>

      {/* Machine info card */}
      <View style={styles.machineCard}>
        <Text style={styles.cardTitle}>Informações da Máquina</Text>
        <InfoRow label="Chassi / PIN"  value={machine.pin ?? machine.custom_name ?? 'N/A'} />
        <InfoRow label="Modelo"        value={machine.modelo ?? 'N/A'} />
        <InfoRow
          label="Dias offline"
          value={formatDaysOffline(machine.days_offline)}
          valueStyle={styles.redText}
        />
        <InfoRow
          label="Horímetro"
          value={machine.machine_hours != null ? `${machine.machine_hours} h` : 'N/A'}
        />
      </View>

      {/* Warning card */}
      <View style={styles.warningCard}>
        <Text style={styles.warningTitle}>⚠️ Alerta de Conectividade</Text>
        <Text style={styles.warningText}>
          {'Esta máquina está há '}
          <Text style={styles.warningBold}>{machine.days_offline ?? '?'} dias</Text>
          {' sem conectar'}
          {hoursDiff != null
            ? <Text>{' com diferença de apenas '}<Text style={styles.warningBold}>{hoursDiff.toFixed(1)} horas</Text>{'.'}</Text>
            : '.'}
          {' Possível problema de conectividade.'}
        </Text>
      </View>

      {/* Diagnosis checklist */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Checklist de Diagnóstico</Text>
        {CHECKLIST_ITEMS.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={styles.checkItem}
            onPress={() => toggleChecklist(index)}
            disabled={timerStarted && isPaused}
          >
            <View style={[styles.checkbox, checklist[index] && styles.checkboxChecked]}>
              {checklist[index] && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={[styles.checkLabel, checklist[index] && styles.checkLabelChecked]}>
              {index + 1}. {item}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Resolution selector */}
      {!timerStarted && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resultado do Diagnóstico</Text>

          {(
            [
              { value: 'resolved',    label: '✅ Conectividade restabelecida' },
              { value: 'needs_return',label: '🔄 Requer retorno com peça/suporte' },
              { value: 'unidentified',label: '❌ Problema não identificado' },
            ] as { value: Resolution; label: string }[]
          ).map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.resolutionBtn, resolution === opt.value && styles.resolutionBtnActive]}
              onPress={() => setResolution(opt.value)}
            >
              <Text style={[styles.resolutionText, resolution === opt.value && styles.resolutionTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}

          {/* Method selector (only for resolved) */}
          {resolution === 'resolved' && (
            <View style={styles.methodSection}>
              <Text style={styles.methodLabel}>Método de coleta</Text>
              <View style={styles.methodRow}>
                {(['starlink_data_sync', 'pen_drive'] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.methodBtn, selectedMethod === m && styles.methodBtnActive]}
                    onPress={() => setSelectedMethod(m)}
                  >
                    <Text style={[styles.methodBtnText, selectedMethod === m && styles.methodBtnTextActive]}>
                      {m === 'starlink_data_sync' ? 'Starlink + Data Sync' : 'Pen Drive'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Start button */}
          {canStart && (
            <TouchableOpacity
              style={[styles.startButton, loading && styles.startButtonDisabled]}
              onPress={handleStartDiagnosis}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.startButtonText}>Iniciar Diagnóstico</Text>}
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Timer section */}
      {timerStarted && (
        <>
          {/* Resolution badge */}
          <View style={styles.resolutionBadge}>
            <Text style={styles.resolutionBadgeText}>
              {resolution === 'resolved'    && '✅ Conectividade restabelecida'}
              {resolution === 'needs_return'&& '🔄 Requer retorno com peça/suporte'}
              {resolution === 'unidentified'&& '❌ Problema não identificado'}
            </Text>
          </View>

          {/* Timer display */}
          <View style={[styles.timerContainer, isPaused && styles.timerContainerPaused]}>
            <Text style={styles.timerLabel}>
              {isPaused ? 'PAUSADO — Tempo de diagnóstico' : 'Tempo de diagnóstico'}
            </Text>
            <Text style={[styles.timer, isPaused && styles.timerPaused]}>
              {formatElapsed(elapsed)}
            </Text>
          </View>

          {/* Pause / Resume (for needs_return and unidentified) */}
          {(resolution === 'needs_return' || resolution === 'unidentified') && (
            <TouchableOpacity
              style={isPaused ? styles.resumeButton : styles.pauseButton}
              onPress={isPaused ? handleResume : handlePause}
            >
              <Text style={styles.pauseButtonText}>
                {isPaused ? '▶ Retomar diagnóstico' : '⏸ Pausar (retornar outro dia)'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Notes (only for unidentified) */}
          {resolution === 'unidentified' && (
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Descreva o problema não identificado..."
              placeholderTextColor="#aaa"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          )}

          {/* Photo section */}
          {!isPaused && (
            <View style={styles.photoSection}>
              {photoUri ? (
                <View style={styles.photoPreview}>
                  <Image source={{ uri: photoUri }} style={styles.photoThumbnail} />
                  <TouchableOpacity style={styles.retakeButton} onPress={takePhoto}>
                    <Text style={styles.retakeText}>Refazer foto</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.photoPlaceholder}>
                  <TouchableOpacity style={styles.cameraButton} onPress={takePhoto}>
                    <Text style={styles.cameraIcon}>📷</Text>
                    <Text style={styles.cameraButtonText}>Fotografar modem/máquina</Text>
                  </TouchableOpacity>
                  <Text style={styles.photoInstruction}>
                    Foto obrigatória para finalizar o diagnóstico
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Finalize button */}
          {!isPaused && (
            <TouchableOpacity
              style={[styles.finishButton, !photoUri && styles.finishButtonDisabled]}
              onPress={handleFinish}
              disabled={loading || !photoUri}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.finishButtonText}>Finalizar Diagnóstico</Text>}
            </TouchableOpacity>
          )}

          {!photoUri && !isPaused && (
            <Text style={styles.photoRequired}>
              A foto do modem/máquina é obrigatória para finalizar
            </Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

function InfoRow({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle?: object;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueStyle]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll:     { flex: 1, backgroundColor: '#f5f5f5' },
  container:  { padding: 16, gap: 12 },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Machine card
  machineCard: {
    backgroundColor: JD_GREEN,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  cardTitle:  { color: '#fff', fontSize: 13, fontWeight: '700', opacity: 0.8, marginBottom: 4 },
  infoRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.15)' },
  infoLabel:  { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  infoValue:  { color: '#fff', fontWeight: '700', fontSize: 13 },
  redText:    { color: '#FFDE00', fontWeight: '800' },

  // Warning card
  warningCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 5,
    borderLeftColor: '#F59E0B',
  },
  warningTitle: { color: '#92400E', fontWeight: '700', fontSize: 14, marginBottom: 6 },
  warningText:  { color: '#78350F', fontSize: 13, lineHeight: 20 },
  warningBold:  { fontWeight: '800' },

  // Sections
  section:      { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 10, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 2 },

  // Checklist
  checkItem:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  checkbox:          { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  checkboxChecked:   { backgroundColor: JD_GREEN, borderColor: JD_GREEN },
  checkmark:         { color: '#fff', fontWeight: '900', fontSize: 13 },
  checkLabel:        { flex: 1, fontSize: 14, color: '#374151' },
  checkLabelChecked: { color: '#1a1a1a', fontWeight: '600' },

  // Resolution
  resolutionBtn:       { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, padding: 14 },
  resolutionBtnActive: { borderColor: JD_GREEN, backgroundColor: '#f0fdf4' },
  resolutionText:      { fontSize: 14, color: '#555', fontWeight: '600' },
  resolutionTextActive:{ color: JD_GREEN },

  // Method selector
  methodSection:   { gap: 8, marginTop: 4 },
  methodLabel:     { fontSize: 13, fontWeight: '600', color: '#555' },
  methodRow:       { flexDirection: 'row', gap: 8 },
  methodBtn:       { flex: 1, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 8, padding: 12, alignItems: 'center' },
  methodBtnActive: { borderColor: JD_GREEN, backgroundColor: '#f0fdf4' },
  methodBtnText:   { color: '#555', fontWeight: '600', fontSize: 12, textAlign: 'center' },
  methodBtnTextActive: { color: JD_GREEN },

  // Start button
  startButton:         { backgroundColor: JD_GREEN, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 4 },
  startButtonDisabled: { backgroundColor: '#a8c5a0' },
  startButtonText:     { color: '#fff', fontWeight: '700', fontSize: 16 },

  // Resolution badge (after started)
  resolutionBadge:     { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, alignItems: 'center' },
  resolutionBadgeText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Timer
  timerContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  timerContainerPaused: { backgroundColor: '#374151' },
  timerLabel:   { color: '#aaa', fontSize: 13, marginBottom: 8 },
  timer:        { fontSize: 52, fontWeight: '700', color: JD_YELLOW, fontVariant: ['tabular-nums'], letterSpacing: 2 },
  timerPaused:  { color: '#9ca3af' },

  // Pause / Resume
  pauseButton:      { backgroundColor: '#6B7280', borderRadius: 10, padding: 16, alignItems: 'center' },
  resumeButton:     { backgroundColor: JD_GREEN, borderRadius: 10, padding: 16, alignItems: 'center' },
  pauseButtonText:  { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Notes
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

  // Photo
  photoSection:     { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', overflow: 'hidden' },
  photoPlaceholder: { padding: 20, alignItems: 'center', gap: 10 },
  cameraButton:     { backgroundColor: '#1a1a1a', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 8 },
  cameraIcon:       { fontSize: 20 },
  cameraButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  photoInstruction: { fontSize: 13, color: '#888', textAlign: 'center' },
  photoPreview:     { alignItems: 'center', padding: 12, gap: 10 },
  photoThumbnail:   { width: '100%', height: 200, borderRadius: 8, backgroundColor: '#f0f0f0' },
  retakeButton:     { borderWidth: 1.5, borderColor: '#ddd', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 20 },
  retakeText:       { color: '#555', fontWeight: '600', fontSize: 14 },

  // Finish
  finishButton:         { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 18, alignItems: 'center' },
  finishButtonDisabled: { backgroundColor: '#9ca3af' },
  finishButtonText:     { color: '#fff', fontWeight: '700', fontSize: 17 },
  photoRequired:        { textAlign: 'center', fontSize: 13, color: '#ef4444', marginTop: -4 },

  // Done screen
  doneIcon: { fontSize: 72, color: JD_GREEN },
  doneText: { fontSize: 22, fontWeight: '700', color: JD_GREEN, marginTop: 16 },
  doneSub:  { fontSize: 16, color: '#555', marginTop: 8 },
});
