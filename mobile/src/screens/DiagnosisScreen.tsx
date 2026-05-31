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
  startActivity,
  startDiagnosisActivity,
  pauseActivity,
  resumeActivity,
  finishActivity,
  finishDiagnosisActivity,
  uploadActivityPhoto,
} from '../services/api';
import { RootStackParamList } from '../navigation/AppNavigator';
import { formatDaysOffline } from '../types';

type Nav = StackNavigationProp<RootStackParamList, 'Diagnosis'>;
type Route = RouteProp<RootStackParamList, 'Diagnosis'>;

export const ACTIVE_DIAGNOSIS_KEY = 'active_diagnosis';

type Resolution = 'resolved' | 'needs_return' | 'no_collection';
type Phase = 'checklist' | 'timer' | 'static_form';

type SavedDiagnosis = {
  activityId: number;
  startedAt: string;
  totalPauseMs: number;
  pausedAt: string | null;
  checklist: boolean[];
  resolution: Resolution;
  method?: 'starlink_data_sync' | 'pen_drive';
};

const JD_GREEN  = '#367C2B';
const JD_YELLOW = '#FFDE00';

const CHECKLIST_ITEMS = [
  'Máquina não foi ligada neste período',
  'Sem sinal de internet na localização',
  'Modem JDLink sem energia/desconectado',
  'Problema elétrico no sistema de conectividade',
  'Falha no firmware do modem',
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
  const { machine, org, currentHours, hoursDiff } = route.params;

  const [checklist, setChecklist]     = useState<boolean[]>(new Array(5).fill(false));
  const [resolution, setResolution]   = useState<Resolution | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<'starlink_data_sync' | 'pen_drive' | null>(null);
  const [phase, setPhase]             = useState<Phase>('checklist');

  const [notes, setNotes]       = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);

  const [elapsed, setElapsed]   = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const startTimestampRef = useRef<number>(0);
  const totalPauseMsRef   = useRef<number>(0);
  const pausedAtRef       = useRef<number | null>(null);
  const activityIdRef     = useRef<number>(0);
  const intervalRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolutionRef     = useRef<Resolution | null>(null);
  const checklistRef      = useRef<boolean[]>(new Array(5).fill(false));
  const methodRef         = useRef<'starlink_data_sync' | 'pen_drive' | null>(null);

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

  // Restore saved state on mount (crash recovery)
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
        methodRef.current         = saved.method ?? null;

        setResolution(saved.resolution);
        setChecklist(saved.checklist);
        if (saved.method) setSelectedMethod(saved.method);
        setPhase('timer');

        if (saved.pausedAt) {
          pausedAtRef.current = Date.parse(saved.pausedAt);
          setIsPaused(true);
          setElapsed(calcElapsed());
        } else {
          startInterval();
        }
      } catch { /* ignore malformed */ }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && phase === 'timer' && !isPaused) {
        setElapsed(calcElapsed());
      }
    });
    return () => sub.remove();
  }, [phase, isPaused, calcElapsed]);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const persistState = useCallback(async (paused: boolean) => {
    const data: SavedDiagnosis = {
      activityId:   activityIdRef.current,
      startedAt:    new Date(startTimestampRef.current).toISOString(),
      totalPauseMs: totalPauseMsRef.current,
      pausedAt: paused && pausedAtRef.current
        ? new Date(pausedAtRef.current).toISOString()
        : null,
      checklist:  checklistRef.current,
      resolution: resolutionRef.current!,
      method:     methodRef.current ?? undefined,
    };
    await AsyncStorage.setItem(ACTIVE_DIAGNOSIS_KEY, JSON.stringify(data)).catch(() => {});
  }, []);

  // Start timer — options A (resolved) and B (needs_return)
  const handleStart = async () => {
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
        if (resolution === 'resolved') {
          const act = await startActivity({
            org_id: org.id,
            machine_id: machine.id,
            method: selectedMethod!,
            current_hours: currentHours,
          });
          id = act.id;
        } else {
          const act = await startDiagnosisActivity({ org_id: org.id, machine_id: machine.id });
          id = act.id;
        }
      }

      startTimestampRef.current = Date.now();
      totalPauseMsRef.current   = 0;
      pausedAtRef.current       = null;
      activityIdRef.current     = id;
      resolutionRef.current     = resolution;
      checklistRef.current      = checklist;
      methodRef.current         = selectedMethod;

      setPhase('timer');
      await persistState(false);
      startInterval();
    } catch {
      Alert.alert('Erro', 'Não foi possível iniciar.');
    } finally {
      setLoading(false);
    }
  };

  // Option C: skip timer, go directly to form
  const handleGoToStaticForm = () => {
    resolutionRef.current = 'no_collection';
    checklistRef.current  = checklist;
    setPhase('static_form');
  };

  const handlePause = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    pausedAtRef.current = Date.now();
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

  // Finish timer phase (options A and B)
  const handleFinishTimer = async () => {
    if (!photoUri) {
      Alert.alert('Foto obrigatória', 'Tire uma foto antes de finalizar.');
      return;
    }
    if (resolutionRef.current === 'needs_return' && !notes.trim()) {
      Alert.alert('Notas obrigatórias', 'Descreva o que precisa ser feito.');
      return;
    }

    if (intervalRef.current) clearInterval(intervalRef.current);
    setLoading(true);

    const totalPauseMinutes = Math.round(totalPauseMsRef.current / 60000);
    const net = await NetInfo.fetch();
    const isOnline = net.isConnected && net.isInternetReachable !== false;

    try {
      if (isOnline && activityIdRef.current > 0) {
        let photoUploaded = false;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try { await uploadActivityPhoto(activityIdRef.current, photoUri); photoUploaded = true; break; }
          catch { /* retry */ }
        }

        if (resolutionRef.current === 'resolved') {
          const checkedCauses = checklistRef.current
            .map((v, i) => v ? CHECKLIST_ITEMS[i] : null)
            .filter(Boolean).join('; ');
          await finishActivity(activityIdRef.current, checkedCauses || undefined);
        } else {
          await finishDiagnosisActivity(activityIdRef.current, {
            diagnosis_result: 'needs_return',
            diagnosis_checklist: checklistRef.current,
            total_pause_minutes: totalPauseMinutes,
            notes: notes.trim() || undefined,
          });
        }

        await AsyncStorage.removeItem(ACTIVE_DIAGNOSIS_KEY);
        setDone(true);

        if (!photoUploaded) {
          setTimeout(() => Alert.alert(
            'Concluído',
            'Foto não enviada — verifique sua conexão.',
            [{ text: 'OK', onPress: () => navigation.navigate('MachineList', { org }) }],
          ), 400);
        } else {
          setTimeout(() => navigation.navigate('MachineList', { org }), 1500);
        }
      } else {
        await AsyncStorage.removeItem(ACTIVE_DIAGNOSIS_KEY);
        setDone(true);
        setTimeout(() => navigation.navigate('MachineList', { org }), 1500);
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível finalizar.');
      startInterval();
    } finally {
      setLoading(false);
    }
  };

  // Finish static form (option C — no timer)
  const handleFinishStaticForm = async () => {
    if (!photoUri) {
      Alert.alert('Foto obrigatória', 'Tire uma foto antes de registrar.');
      return;
    }
    if (!notes.trim()) {
      Alert.alert('Notas obrigatórias', 'Descreva o que foi encontrado.');
      return;
    }

    setLoading(true);
    const net = await NetInfo.fetch();
    const isOnline = net.isConnected && net.isInternetReachable !== false;

    try {
      if (isOnline) {
        const act = await startDiagnosisActivity({ org_id: org.id, machine_id: machine.id });

        let photoUploaded = false;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try { await uploadActivityPhoto(act.id, photoUri); photoUploaded = true; break; }
          catch { /* retry */ }
        }

        await finishDiagnosisActivity(act.id, {
          diagnosis_result: 'needs_return',
          diagnosis_checklist: checklistRef.current,
          total_pause_minutes: 0,
          notes: notes.trim(),
        });

        setDone(true);
        if (!photoUploaded) {
          setTimeout(() => Alert.alert(
            'Registrado',
            'Foto não enviada — verifique sua conexão.',
            [{ text: 'OK', onPress: () => navigation.navigate('MachineList', { org }) }],
          ), 400);
        } else {
          setTimeout(() => navigation.navigate('MachineList', { org }), 1500);
        }
      } else {
        setDone(true);
        setTimeout(() => navigation.navigate('MachineList', { org }), 1500);
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar o diagnóstico.');
    } finally {
      setLoading(false);
    }
  };

  const toggleChecklist = (i: number) => {
    const next = [...checklist];
    next[i] = !next[i];
    setChecklist(next);
    checklistRef.current = next;
  };

  if (done) {
    return (
      <View style={styles.center}>
        <Text style={styles.doneIcon}>✓</Text>
        <Text style={styles.doneText}>
          {resolution === 'resolved' ? 'Coleta concluída!' : 'Diagnóstico registrado!'}
        </Text>
        <Text style={styles.doneSub}>
          {resolution === 'resolved' ? 'Atividade salva com sucesso' : 'Retorno registrado com sucesso'}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>

      {/* Machine info */}
      <View style={styles.machineCard}>
        <Text style={styles.cardTitle}>Informações da Máquina</Text>
        <InfoRow label="Chassi / PIN"         value={machine.pin ?? machine.custom_name ?? 'N/A'} />
        <InfoRow label="Modelo"               value={machine.modelo ?? 'N/A'} />
        <InfoRow
          label="Dias offline"
          value={formatDaysOffline(machine.days_offline)}
          valueStyle={styles.yellowText}
        />
        <InfoRow label="Horímetro registrado" value={machine.machine_hours != null ? `${machine.machine_hours} h` : 'N/A'} />
        <InfoRow label="Horímetro atual"      value={`${currentHours} h`} />
        <InfoRow label="Diferença"            value={`${hoursDiff.toFixed(1)} h`} />
      </View>

      {/* Possible causes checklist — always visible */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Possíveis causas</Text>
        <Text style={styles.sectionSub}>Marque o que se aplica à situação</Text>
        {CHECKLIST_ITEMS.map((item, i) => (
          <TouchableOpacity
            key={i}
            style={styles.checkItem}
            onPress={() => phase === 'checklist' && toggleChecklist(i)}
            disabled={phase !== 'checklist'}
          >
            <View style={[styles.checkbox, checklist[i] && styles.checkboxChecked]}>
              {checklist[i] && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={[styles.checkLabel, checklist[i] && styles.checkLabelChecked]}>
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* PHASE: checklist — resolution options */}
      {phase === 'checklist' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>O que fazer agora?</Text>

          {/* Option A — resolved */}
          <TouchableOpacity
            style={[styles.optionCard, resolution === 'resolved' && styles.optionCardActive]}
            onPress={() => { setResolution('resolved'); setSelectedMethod(null); }}
            activeOpacity={0.85}
          >
            <Text style={styles.optionLabel}>✅ Problema resolvido — iniciar coleta agora</Text>
            <Text style={styles.optionDesc}>O técnico corrigiu o problema e a máquina está pronta para coleta</Text>

            {resolution === 'resolved' && (
              <View style={styles.optionExpanded}>
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
                {selectedMethod && (
                  <TouchableOpacity
                    style={[styles.startBtn, styles.startBtnGreen, loading && styles.startBtnDisabled]}
                    onPress={handleStart}
                    disabled={loading}
                  >
                    {loading
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.startBtnText}>Iniciar Coleta ▶</Text>}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </TouchableOpacity>

          {/* Option B — needs_return with timer */}
          <TouchableOpacity
            style={[styles.optionCard, resolution === 'needs_return' && styles.optionCardActive]}
            onPress={() => { setResolution('needs_return'); setSelectedMethod(null); }}
            activeOpacity={0.85}
          >
            <Text style={styles.optionLabel}>🔄 Requer retorno com peça/suporte técnico</Text>
            <Text style={styles.optionDesc}>Documentar o diagnóstico com timer e registrar o que precisa ser feito</Text>

            {resolution === 'needs_return' && (
              <View style={styles.optionExpanded}>
                <TouchableOpacity
                  style={[styles.startBtn, styles.startBtnBlack, loading && styles.startBtnDisabled]}
                  onPress={handleStart}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.startBtnText}>Iniciar Diagnóstico com Timer ▶</Text>}
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>

          {/* Option C — no_collection, no timer */}
          <TouchableOpacity
            style={[styles.optionCard, resolution === 'no_collection' && styles.optionCardActive]}
            onPress={() => { setResolution('no_collection'); setSelectedMethod(null); }}
            activeOpacity={0.85}
          >
            <Text style={styles.optionLabel}>📋 Registrar diagnóstico sem coleta</Text>
            <Text style={styles.optionDesc}>Registrar apenas as causas encontradas, sem iniciar coleta</Text>

            {resolution === 'no_collection' && (
              <View style={styles.optionExpanded}>
                <TouchableOpacity
                  style={[styles.startBtn, styles.startBtnGray]}
                  onPress={handleGoToStaticForm}
                >
                  <Text style={styles.startBtnText}>Continuar →</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* PHASE: timer (options A and B) */}
      {phase === 'timer' && (
        <>
          <View style={styles.resolutionBadge}>
            <Text style={styles.resolutionBadgeText}>
              {resolution === 'resolved' ? '✅ Coleta em andamento' : '🔄 Diagnóstico em andamento'}
            </Text>
          </View>

          <View style={[styles.timerBox, isPaused && styles.timerBoxPaused]}>
            <Text style={styles.timerLabel}>
              {isPaused ? 'PAUSADO' : resolution === 'resolved' ? 'Tempo de coleta' : 'Tempo de diagnóstico'}
            </Text>
            <Text style={[styles.timer, isPaused && styles.timerPaused]}>
              {formatElapsed(elapsed)}
            </Text>
          </View>

          {/* Pause/Resume only for option B */}
          {resolution === 'needs_return' && (
            <TouchableOpacity
              style={isPaused ? styles.resumeBtn : styles.pauseBtn}
              onPress={isPaused ? handleResume : handlePause}
            >
              <Text style={styles.pauseBtnText}>
                {isPaused ? '▶ Retomar diagnóstico' : '⏸ Pausar (retornar outro dia)'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Notes — required for option B, hidden while paused */}
          {resolution === 'needs_return' && !isPaused && (
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Descreva o que precisa ser feito (obrigatório)..."
              placeholderTextColor="#aaa"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          )}

          {!isPaused && (
            <PhotoBlock
              photoUri={photoUri}
              onTakePhoto={takePhoto}
              label={resolution === 'resolved' ? 'Fotografar painel (coleta concluída)' : 'Fotografar modem/máquina'}
            />
          )}

          {!isPaused && (
            <TouchableOpacity
              style={[styles.finishBtn, !photoUri && styles.finishBtnDisabled]}
              onPress={handleFinishTimer}
              disabled={loading || !photoUri}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.finishBtnText}>
                    {resolution === 'resolved' ? 'Finalizar Coleta' : 'Finalizar Diagnóstico'}
                  </Text>}
            </TouchableOpacity>
          )}
          {!photoUri && !isPaused && (
            <Text style={styles.photoRequired}>Foto obrigatória para finalizar</Text>
          )}
        </>
      )}

      {/* PHASE: static form (option C) */}
      {phase === 'static_form' && (
        <>
          <View style={styles.resolutionBadge}>
            <Text style={styles.resolutionBadgeText}>📋 Registrar diagnóstico</Text>
          </View>

          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Descreva o que foi encontrado (obrigatório)..."
            placeholderTextColor="#aaa"
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />

          <PhotoBlock
            photoUri={photoUri}
            onTakePhoto={takePhoto}
            label="Fotografar modem/máquina"
          />

          <TouchableOpacity
            style={[styles.finishBtn, !photoUri && styles.finishBtnDisabled]}
            onPress={handleFinishStaticForm}
            disabled={loading || !photoUri}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.finishBtnText}>Registrar Diagnóstico</Text>}
          </TouchableOpacity>
          {!photoUri && (
            <Text style={styles.photoRequired}>Foto obrigatória para registrar</Text>
          )}
        </>
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

function PhotoBlock({ photoUri, onTakePhoto, label }: {
  photoUri: string | null;
  onTakePhoto: () => void;
  label: string;
}) {
  return (
    <View style={styles.photoSection}>
      {photoUri ? (
        <View style={styles.photoPreview}>
          <Image source={{ uri: photoUri }} style={styles.photoThumbnail} />
          <TouchableOpacity style={styles.retakeButton} onPress={onTakePhoto}>
            <Text style={styles.retakeText}>Refazer foto</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.photoPlaceholder}>
          <TouchableOpacity style={styles.cameraButton} onPress={onTakePhoto}>
            <Text style={styles.cameraIcon}>📷</Text>
            <Text style={styles.cameraButtonText}>{label}</Text>
          </TouchableOpacity>
          <Text style={styles.photoInstruction}>Foto obrigatória para finalizar</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: '#f5f5f5' },
  container: { padding: 16, gap: 12 },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Machine card
  machineCard: { backgroundColor: JD_GREEN, borderRadius: 12, padding: 16, gap: 4 },
  cardTitle:   { color: '#fff', fontSize: 13, fontWeight: '700', opacity: 0.8, marginBottom: 4 },
  infoRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.15)' },
  infoLabel:   { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  infoValue:   { color: '#fff', fontWeight: '700', fontSize: 13 },
  yellowText:  { color: JD_YELLOW, fontWeight: '800' },

  // Sections
  section:      { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 10, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 2 },
  sectionSub:   { fontSize: 13, color: '#888', marginBottom: 4 },

  // Checklist
  checkItem:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  checkbox:          { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  checkboxChecked:   { backgroundColor: JD_GREEN, borderColor: JD_GREEN },
  checkmark:         { color: '#fff', fontWeight: '900', fontSize: 13 },
  checkLabel:        { flex: 1, fontSize: 14, color: '#374151' },
  checkLabelChecked: { color: '#1a1a1a', fontWeight: '600' },

  // Option cards
  optionCard:       { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, gap: 6 },
  optionCardActive: { borderColor: JD_GREEN, backgroundColor: '#f0fdf4' },
  optionLabel:      { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  optionDesc:       { fontSize: 13, color: '#6b7280' },
  optionExpanded:   { gap: 10, marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb' },

  // Method selector
  methodLabel:         { fontSize: 13, fontWeight: '600', color: '#555' },
  methodRow:           { flexDirection: 'row', gap: 8 },
  methodBtn:           { flex: 1, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 8, padding: 12, alignItems: 'center' },
  methodBtnActive:     { borderColor: JD_GREEN, backgroundColor: '#f0fdf4' },
  methodBtnText:       { color: '#555', fontWeight: '600', fontSize: 12, textAlign: 'center' },
  methodBtnTextActive: { color: JD_GREEN },

  // Start buttons
  startBtn:         { borderRadius: 10, padding: 14, alignItems: 'center' },
  startBtnGreen:    { backgroundColor: JD_GREEN },
  startBtnBlack:    { backgroundColor: '#1a1a1a' },
  startBtnGray:     { backgroundColor: '#6B7280' },
  startBtnDisabled: { opacity: 0.5 },
  startBtnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Resolution badge
  resolutionBadge:     { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, alignItems: 'center' },
  resolutionBadgeText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Timer
  timerBox:       { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 24, alignItems: 'center' },
  timerBoxPaused: { backgroundColor: '#374151' },
  timerLabel:     { color: '#aaa', fontSize: 13, marginBottom: 8 },
  timer:          { fontSize: 52, fontWeight: '700', color: JD_YELLOW, fontVariant: ['tabular-nums'], letterSpacing: 2 },
  timerPaused:    { color: '#9ca3af' },

  // Pause / Resume
  pauseBtn:     { backgroundColor: '#6B7280', borderRadius: 10, padding: 16, alignItems: 'center' },
  resumeBtn:    { backgroundColor: JD_GREEN, borderRadius: 10, padding: 16, alignItems: 'center' },
  pauseBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

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
  finishBtn:         { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 18, alignItems: 'center' },
  finishBtnDisabled: { backgroundColor: '#9ca3af' },
  finishBtnText:     { color: '#fff', fontWeight: '700', fontSize: 17 },
  photoRequired:     { textAlign: 'center', fontSize: 13, color: '#ef4444', marginTop: -4 },

  // Done
  doneIcon: { fontSize: 72, color: JD_GREEN },
  doneText: { fontSize: 22, fontWeight: '700', color: JD_GREEN, marginTop: 16 },
  doneSub:  { fontSize: 16, color: '#555', marginTop: 8 },
});
