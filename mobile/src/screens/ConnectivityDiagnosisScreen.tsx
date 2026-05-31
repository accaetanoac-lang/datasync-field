import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Image, AppState, AppStateStatus,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as ImagePicker from 'expo-image-picker';
import { AxiosError } from 'axios';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
  startDiagnosisActivity,
  pauseActivity,
  resumeActivity,
  finishDiagnosisActivity,
  startActivity,
  uploadActivityPhoto,
} from '../services/api';
import { getCurrentLocation } from '../services/geolocation';
import NetInfo from '@react-native-community/netinfo';

type Nav = StackNavigationProp<RootStackParamList, 'ConnectivityDiagnosis'>;
type Route = RouteProp<RootStackParamList, 'ConnectivityDiagnosis'>;

const JD_GREEN = '#367C2B';
const DIAGNOSIS_STATE_KEY = 'active_diagnosis_v1';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

const DIAGNOSIS_STEPS = [
  {
    id: 1,
    title: 'Verificar dispositivo de conectividade',
    description: 'Confirme se o StarFire/StarLink está fisicamente encaixado e com LEDs indicativos ativos.',
  },
  {
    id: 2,
    title: 'Inspecionar cabos e antena',
    description: 'Cheque visualmente o cabo de dados e a antena por danos, dobras ou desconexão.',
  },
  {
    id: 3,
    title: 'Reiniciar o display da máquina',
    description: 'Desligue e ligue a chave geral. Aguarde 2 minutos e verifique se o ícone de conectividade aparece no display GreenStar.',
  },
  {
    id: 4,
    title: 'Verificar cobertura de sinal',
    description: 'Confirme que há cobertura de rede no local. Se possível, mova a máquina para área aberta e tente novamente.',
  },
];

interface SavedDiagnosis {
  activityId: number;
  startedAt: number;
  totalPausedMs: number;
  pausedSince: number | null;
  checkedSteps: number[];
}

export default function ConnectivityDiagnosisScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { machine, org, currentHours } = route.params;

  const [activityId, setActivityId] = useState<number | null>(null);
  const [initLoading, setInitLoading] = useState(true);

  // Timer state
  const startedAtRef = useRef<number>(Date.now());
  const totalPausedMsRef = useRef<number>(0);
  const pausedSinceRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [elapsed, setElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Checklist / photo / finish
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<'resolved' | 'escalated' | null>(null);

  const daysOffline = machine.days_offline ?? 0;
  const hoursDiff = currentHours - (machine.machine_hours ?? 0);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function calcActiveSeconds(): number {
    const runningMs = Date.now() - startedAtRef.current - totalPausedMsRef.current;
    return Math.max(0, Math.floor(runningMs / 1000));
  }

  function startTicking() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setElapsed(calcActiveSeconds());
    intervalRef.current = setInterval(() => setElapsed(calcActiveSeconds()), 1000);
  }

  function stopTicking() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  async function persistState(overrides: Partial<SavedDiagnosis> = {}) {
    if (!activityId) return;
    const state: SavedDiagnosis = {
      activityId,
      startedAt: startedAtRef.current,
      totalPausedMs: totalPausedMsRef.current,
      pausedSince: pausedSinceRef.current,
      checkedSteps: Array.from(checkedSteps),
      ...overrides,
    };
    await AsyncStorage.setItem(DIAGNOSIS_STATE_KEY, JSON.stringify(state));
  }

  // ─── Init ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Try to restore a previous paused/in-progress session
      try {
        const raw = await AsyncStorage.getItem(DIAGNOSIS_STATE_KEY);
        if (raw && !cancelled) {
          const saved: SavedDiagnosis = JSON.parse(raw);
          // Only restore if it's for the same machine (same org+machine combo would be nicer,
          // but activityId is enough given diagnosis is machine-specific)
          startedAtRef.current = saved.startedAt;
          totalPausedMsRef.current = saved.totalPausedMs;
          pausedSinceRef.current = saved.pausedSince;
          setCheckedSteps(new Set(saved.checkedSteps));
          setActivityId(saved.activityId);

          if (saved.pausedSince !== null) {
            setIsPaused(true);
            // Show frozen elapsed time (how much active time before pause)
            const frozenMs = saved.startedAt
              ? saved.startedAt - startedAtRef.current + saved.totalPausedMs
              : 0;
            setElapsed(Math.max(0, Math.floor((Date.now() - saved.startedAt - saved.totalPausedMs - (Date.now() - saved.pausedSince)) / 1000)));
          } else {
            startTicking();
          }
          setInitLoading(false);
          return;
        }
      } catch { /* ignore parse errors */ }

      // No saved state — start a fresh diagnosis activity
      try {
        const coords = await getCurrentLocation();
        const activity = await startDiagnosisActivity({
          org_id: org.id,
          machine_id: machine.id,
          current_hours: currentHours,
          tech_lat: coords?.latitude,
          tech_lng: coords?.longitude,
        });

        if (!cancelled) {
          startedAtRef.current = Date.now();
          setActivityId(activity.id);
          startTicking();

          const state: SavedDiagnosis = {
            activityId: activity.id,
            startedAt: startedAtRef.current,
            totalPausedMs: 0,
            pausedSince: null,
            checkedSteps: [],
          };
          await AsyncStorage.setItem(DIAGNOSIS_STATE_KEY, JSON.stringify(state));
        }
      } catch (err) {
        if (!cancelled) {
          Alert.alert('Erro', 'Não foi possível iniciar o diagnóstico. Verifique sua conexão.');
          navigation.goBack();
        }
      } finally {
        if (!cancelled) setInitLoading(false);
      }
    }

    init();

    const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && !isPaused) setElapsed(calcActiveSeconds());
    });

    return () => {
      cancelled = true;
      stopTicking();
      appStateSub.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Pause / Resume ──────────────────────────────────────────────────────────

  const handlePause = async () => {
    if (!activityId || isPaused) return;
    const now = Date.now();
    pausedSinceRef.current = now;
    stopTicking();
    setIsPaused(true);

    await persistState({ pausedSince: now });
    pauseActivity(activityId).catch(() => {}); // best-effort API call
  };

  const handleResume = async () => {
    if (!activityId || !isPaused) return;
    const now = Date.now();
    const pauseDuration = pausedSinceRef.current ? now - pausedSinceRef.current : 0;
    totalPausedMsRef.current += pauseDuration;
    pausedSinceRef.current = null;
    setIsPaused(false);
    startTicking();

    await persistState({ pausedSince: null, totalPausedMs: totalPausedMsRef.current });
    resumeActivity(activityId).catch(() => {});
  };

  // ─── Photo ───────────────────────────────────────────────────────────────────

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão negada', 'Autorize o acesso à câmera nas configurações do dispositivo.');
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

  // ─── Finish ──────────────────────────────────────────────────────────────────

  async function finishDiagnosis(diagnosisResult: 'resolved' | 'escalated') {
    if (!activityId) return;

    if (!photoUri) {
      Alert.alert('Foto obrigatória', 'Fotografe o modem/dispositivo de conectividade antes de finalizar.');
      return;
    }

    stopTicking();
    setLoading(true);

    // If still paused, account for the current pause duration
    if (isPaused && pausedSinceRef.current) {
      totalPausedMsRef.current += Date.now() - pausedSinceRef.current;
      pausedSinceRef.current = null;
    }

    const totalPauseMinutes = Math.round(totalPausedMsRef.current / 60000);
    const checklist = DIAGNOSIS_STEPS.map((s) => checkedSteps.has(s.id));

    try {
      // Upload photo first (best-effort, non-blocking if fails)
      try {
        await uploadActivityPhoto(activityId, photoUri);
      } catch (photoErr) {
        console.warn('Diagnosis photo upload failed:', photoErr);
      }

      await finishDiagnosisActivity(activityId, {
        diagnosis_result: diagnosisResult,
        diagnosis_checklist: checklist,
        total_pause_minutes: totalPauseMinutes,
      });

      await AsyncStorage.removeItem(DIAGNOSIS_STATE_KEY);

      if (diagnosisResult === 'escalated') {
        setDone('escalated');
        setTimeout(() => navigation.navigate('MachineList', { org }), 2000);
        return;
      }

      // resolved → start pen drive collection activity
      const coords = await getCurrentLocation();
      const net = await NetInfo.fetch();
      const isOnline = net.isConnected && net.isInternetReachable !== false;

      if (isOnline) {
        const penActivity = await startActivity({
          org_id: org.id,
          machine_id: machine.id,
          method: 'pen_drive',
          current_hours: currentHours,
          tech_lat: coords?.latitude,
          tech_lng: coords?.longitude,
        });
        navigation.navigate('Activity', {
          machine,
          org,
          activityId: penActivity.id,
          method: 'pen_drive',
          startedAt: penActivity.started_at ?? new Date().toISOString(),
        });
      } else {
        navigation.navigate('Activity', {
          machine,
          org,
          activityId: -1,
          method: 'pen_drive',
          startedAt: new Date().toISOString(),
        });
      }
    } catch (err: unknown) {
      // Restart timer on error
      if (!isPaused) startTicking();
      if (err instanceof AxiosError && err.response?.status === 409) {
        Alert.alert('Conflito', 'Esta máquina já está em coleta por outro técnico.');
      } else {
        Alert.alert('Erro', 'Não foi possível finalizar o diagnóstico. Verifique sua conexão.');
      }
    } finally {
      setLoading(false);
    }
  }

  // ─── Toggle step ─────────────────────────────────────────────────────────────

  const toggleStep = (id: number) => {
    setCheckedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Done screen ─────────────────────────────────────────────────────────────

  if (done === 'escalated') {
    return (
      <View style={styles.center}>
        <Text style={styles.doneIcon}>⚠</Text>
        <Text style={styles.doneTitle}>Diagnóstico registrado.</Text>
        <Text style={styles.doneSub}>Escalone para o suporte técnico de conectividade.</Text>
      </View>
    );
  }

  // ─── Loading init ─────────────────────────────────────────────────────────────

  if (initLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={JD_GREEN} />
        <Text style={styles.initText}>Iniciando diagnóstico…</Text>
      </View>
    );
  }

  // ─── Main screen ─────────────────────────────────────────────────────────────

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Alert banner */}
      <View style={styles.alertBanner}>
        <Text style={styles.alertTitle}>Possível falha de conectividade</Text>
        <Text style={styles.alertSubtitle}>
          Offline há {daysOffline} dias · diferença de {hoursDiff.toFixed(1)} h no horímetro.
          A máquina parece estar em uso mas sem transmitir dados.
        </Text>
      </View>

      {/* Timer */}
      <View style={[styles.timerContainer, isPaused && styles.timerContainerPaused]}>
        <Text style={styles.timerLabel}>
          {isPaused ? 'Diagnóstico pausado' : 'Tempo de diagnóstico'}
        </Text>
        <Text style={[styles.timer, isPaused && styles.timerPaused]}>
          {formatElapsed(elapsed)}
        </Text>

        {isPaused ? (
          <TouchableOpacity style={styles.resumeBtn} onPress={handleResume} disabled={loading}>
            <Text style={styles.resumeBtnText}>▶ Retomar diagnóstico</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.pauseBtn} onPress={handlePause} disabled={loading}>
            <Text style={styles.pauseBtnText}>⏸ Pausar (retornar outro dia)</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Checklist */}
      <Text style={styles.sectionTitle}>Execute o diagnóstico</Text>
      {DIAGNOSIS_STEPS.map((step) => (
        <TouchableOpacity
          key={step.id}
          style={[styles.stepCard, checkedSteps.has(step.id) && styles.stepCardChecked]}
          onPress={() => toggleStep(step.id)}
          activeOpacity={0.7}
          disabled={isPaused}
        >
          <View style={[styles.checkbox, checkedSteps.has(step.id) && styles.checkboxChecked]}>
            {checkedSteps.has(step.id) && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <View style={styles.stepBody}>
            <Text style={[styles.stepTitle, checkedSteps.has(step.id) && styles.stepTitleDone]}>
              {step.id}. {step.title}
            </Text>
            <Text style={styles.stepDesc}>{step.description}</Text>
          </View>
        </TouchableOpacity>
      ))}

      {/* Photo */}
      <Text style={styles.sectionTitle}>Evidência fotográfica</Text>
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
            <TouchableOpacity style={styles.cameraButton} onPress={takePhoto} disabled={isPaused}>
              <Text style={styles.cameraIcon}>📷</Text>
              <Text style={styles.cameraButtonText}>Fotografar modem / dispositivo</Text>
            </TouchableOpacity>
            <Text style={styles.photoInstruction}>
              Registre foto do dispositivo de conectividade (obrigatório)
            </Text>
          </View>
        )}
      </View>
      {!photoUri && (
        <Text style={styles.photoRequired}>A foto é obrigatória para finalizar</Text>
      )}

      {/* Resolution actions */}
      {!isPaused && (
        <>
          <Text style={styles.sectionTitle}>Resolução</Text>

          <TouchableOpacity
            style={[styles.penDriveBtn, (!photoUri || loading) && styles.btnDisabled]}
            onPress={() => finishDiagnosis('resolved')}
            disabled={!photoUri || loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.penDriveBtnText}>Resolver — Coletar via Pen Drive</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.escalateBtn, (!photoUri || loading) && styles.btnDisabled]}
            onPress={() => finishDiagnosis('escalated')}
            disabled={!photoUri || loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.escalateBtnText}>Registrar e Escalonar para Suporte</Text>}
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  initText: { marginTop: 12, color: '#6B7280', fontSize: 14 },
  doneIcon: { fontSize: 56, marginBottom: 16 },
  doneTitle: { fontSize: 18, color: '#374151', fontWeight: '700', textAlign: 'center' },
  doneSub: { fontSize: 14, color: '#6B7280', marginTop: 8, textAlign: 'center' },

  alertBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  alertTitle: { fontWeight: '700', color: '#92400E', fontSize: 15, marginBottom: 6 },
  alertSubtitle: { color: '#78350F', fontSize: 13, lineHeight: 18 },

  timerContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  timerContainerPaused: { backgroundColor: '#374151' },
  timerLabel: { color: '#9CA3AF', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  timer: {
    fontSize: 52,
    fontWeight: '700',
    color: '#FFDE00',
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
  },
  timerPaused: { color: '#9CA3AF' },

  pauseBtn: {
    backgroundColor: '#374151',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  pauseBtnText: { color: '#E5E7EB', fontWeight: '600', fontSize: 14 },
  resumeBtn: {
    backgroundColor: JD_GREEN,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 4,
  },
  resumeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },

  stepCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    gap: 12,
    alignItems: 'flex-start',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
  },
  stepCardChecked: { borderColor: JD_GREEN, backgroundColor: '#f0fdf4' },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: { borderColor: JD_GREEN, backgroundColor: JD_GREEN },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  stepBody: { flex: 1 },
  stepTitle: { fontWeight: '600', color: '#1a1a1a', fontSize: 14, marginBottom: 3 },
  stepTitleDone: { color: JD_GREEN },
  stepDesc: { color: '#6B7280', fontSize: 12, lineHeight: 17 },

  photoSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  photoPlaceholder: { padding: 20, alignItems: 'center', gap: 10 },
  cameraButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cameraIcon: { fontSize: 20 },
  cameraButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  photoInstruction: { fontSize: 13, color: '#888', textAlign: 'center' },
  photoPreview: { alignItems: 'center', padding: 12, gap: 10 },
  photoThumbnail: { width: '100%', height: 200, borderRadius: 8, backgroundColor: '#f0f0f0' },
  retakeButton: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  retakeText: { color: '#555', fontWeight: '600', fontSize: 14 },
  photoRequired: { textAlign: 'center', fontSize: 13, color: '#ef4444', marginTop: -4 },

  penDriveBtn: {
    backgroundColor: JD_GREEN,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  penDriveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  escalateBtn: {
    backgroundColor: '#6B7280',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  escalateBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.4 },
});
