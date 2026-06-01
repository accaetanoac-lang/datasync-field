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
  pauseActivity,
  resumeActivity,
  finishDiagnosisActivity,
  uploadActivityPhoto,
} from '../services/api';
import { RootStackParamList } from '../navigation/AppNavigator';
import { formatDaysOffline } from '../types';

type Nav = StackNavigationProp<RootStackParamList, 'Diagnosis'>;
type Route = RouteProp<RootStackParamList, 'Diagnosis'>;

// Keep old key exported for backward compat (AppNavigator may still reference it)
export const ACTIVE_DIAGNOSIS_KEY = 'active_diagnosis';
export const ACTIVE_DIAGNOSIS_V2_KEY = 'active_diagnosis_v2';

type Step = 'step1' | 'step2a' | 'step2b' | 'step2c';
type Step2bOption = 'resolved_now' | 'needs_return' | null;

const JD_GREEN  = '#367C2B';
const JD_YELLOW = '#FFDE00';

const CONNECTED_CAUSES = [
  'Máquina estava sem ignição ligada',
  'Sem sinal de internet na localização (resolvido com Starlink)',
  'Reinício do sistema resolveu o problema',
  'Outro',
];

const NO_MODEM_PREDISPOSED = [
  { value: 'yes',     label: 'Sim — possui conector/chicote para instalação' },
  { value: 'no',      label: 'Não — requer adaptação/instalação de chicote' },
  { value: 'unknown', label: 'Não sei — verificação técnica necessária' },
];

const NO_MODEM_RECOMMENDATION = [
  { value: 'recommend_install', label: 'Recomendar instalação do Modem JDLink ao cliente' },
  { value: 'open_os',           label: 'Abrir OS de instalação do modem' },
  { value: 'tech_verify',       label: 'Verificação técnica necessária antes de recomendar' },
];

const DISCONNECTED_CAUSES = [
  'Modem JDLink sem energia/desconectado',
  'Problema elétrico no sistema de conectividade',
  'Antena danificada ou desconectada',
  'Falha no firmware do modem',
  'Problema identificado mas requer peça/suporte',
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
  const { machine, org, currentHours, hoursDiff, activityId: routeActivityId, startedAt: routeStartedAt } = route.params;

  const [step, setStep]                 = useState<Step>('step1');
  const [step2bOption, setStep2bOption] = useState<Step2bOption>(null);
  const [connChecklist, setConnChecklist]       = useState<boolean[]>(new Array(4).fill(false));
  const [disconnChecklist, setDisconnChecklist] = useState<boolean[]>(new Array(5).fill(false));
  const [selectedMethod, setSelectedMethod]     = useState<'starlink_data_sync' | 'pen_drive' | null>(null);
  const [noModemPredisposed, setNoModemPredisposed]         = useState<string | null>(null);
  const [noModemRecommendation, setNoModemRecommendation]   = useState<string | null>(null);
  const [notes, setNotes]       = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const [doneResult, setDoneResult] = useState<'resolved' | 'needs_return' | 'no_modem' | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed]   = useState(0);

  const startTimestampRef  = useRef<number>(Date.parse(routeStartedAt));
  const totalPauseMsRef    = useRef<number>(0);
  const pausedAtRef        = useRef<number | null>(null);
  const activityIdRef      = useRef<number>(routeActivityId);
  const intervalRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef            = useRef<Step>('step1');
  const step2bOptionRef    = useRef<Step2bOption>(null);

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

  // Mount: restore saved state if same activity, then start timer
  useEffect(() => {
    // Remove stale old-format key to prevent double-alert in AppNavigator
    AsyncStorage.removeItem(ACTIVE_DIAGNOSIS_KEY).catch(() => {});

    AsyncStorage.getItem(ACTIVE_DIAGNOSIS_V2_KEY).then((raw) => {
      if (!raw) { startInterval(); return; }
      try {
        const saved = JSON.parse(raw);
        if (saved.activityId !== routeActivityId) { startInterval(); return; }

        totalPauseMsRef.current = saved.totalPausedMs ?? 0;

        if (saved.step && saved.step !== 'step1') {
          setStep(saved.step);
          stepRef.current = saved.step;
        }
        if (saved.step2bOption) {
          setStep2bOption(saved.step2bOption);
          step2bOptionRef.current = saved.step2bOption;
        }

        if (saved.pausedAt) {
          pausedAtRef.current = Date.parse(saved.pausedAt);
          setIsPaused(true);
          setElapsed(calcElapsed());
        } else {
          startInterval();
        }
      } catch {
        startInterval();
      }
    }).catch(() => startInterval());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && !isPaused) setElapsed(calcElapsed());
    });
    return () => sub.remove();
  }, [isPaused, calcElapsed]);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const persistState = useCallback(async (paused: boolean) => {
    const data = {
      activityId:    activityIdRef.current,
      startedAt:     routeStartedAt,
      machinePin:    machine.pin ?? machine.custom_name ?? '',
      orgName:       org.name,
      machine,
      org,
      currentHours,
      hoursDiff,
      step:          stepRef.current,
      step2bOption:  step2bOptionRef.current,
      totalPausedMs: totalPauseMsRef.current,
      pausedAt: paused && pausedAtRef.current
        ? new Date(pausedAtRef.current).toISOString()
        : null,
    };
    await AsyncStorage.setItem(ACTIVE_DIAGNOSIS_V2_KEY, JSON.stringify(data)).catch(() => {});
  }, [machine, org, currentHours, hoursDiff, routeStartedAt]);

  const goToStep2a = () => {
    stepRef.current = 'step2a';
    setStep('step2a');
    persistState(false);
  };

  const goToStep2b = () => {
    stepRef.current = 'step2b';
    setStep('step2b');
    persistState(false);
  };

  const goToStep2c = () => {
    stepRef.current = 'step2c';
    setStep('step2c');
    persistState(false);
  };

  const selectStep2bOption = (opt: Step2bOption) => {
    step2bOptionRef.current = opt;
    setStep2bOption(opt);
    setPhotoUri(null);
    setSelectedMethod(null);
    persistState(false);
  };

  const handlePause = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    pausedAtRef.current = Date.now();
    setIsPaused(true);
    setElapsed(calcElapsed());
    await persistState(true);
    const net = await NetInfo.fetch();
    if (net.isConnected && net.isInternetReachable !== false && activityIdRef.current > 0) {
      pauseActivity(activityIdRef.current).catch(() => {});
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
    const net = await NetInfo.fetch();
    if (net.isConnected && net.isInternetReachable !== false && activityIdRef.current > 0) {
      resumeActivity(activityIdRef.current).catch(() => {});
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

  const handleFinish = async (diagnosisResult: 'resolved' | 'needs_return' | 'no_modem') => {
    if (!photoUri) {
      Alert.alert('Foto obrigatória', 'Tire uma foto antes de finalizar.');
      return;
    }
    if (diagnosisResult === 'needs_return' && !notes.trim()) {
      Alert.alert('Notas obrigatórias', 'Descreva o problema encontrado e o que é necessário.');
      return;
    }
    if (diagnosisResult === 'no_modem') {
      if (!noModemPredisposed) {
        Alert.alert('Campo obrigatório', 'Responda se a máquina é pré-disposta para instalação.');
        return;
      }
      if (!noModemRecommendation) {
        Alert.alert('Campo obrigatório', 'Selecione a recomendação para o cliente.');
        return;
      }
      if (!notes.trim()) {
        Alert.alert('Notas obrigatórias', 'Descreva as condições da máquina e observações.');
        return;
      }
    }

    if (intervalRef.current) clearInterval(intervalRef.current);
    setLoading(true);

    const checklist: boolean[] | Record<string, string | null> =
      diagnosisResult === 'no_modem'
        ? { predisposed: noModemPredisposed, recommendation: noModemRecommendation }
        : step === 'step2a' ? connChecklist : disconnChecklist;
    const totalPauseMin = Math.round(totalPauseMsRef.current / 60000);
    const net = await NetInfo.fetch();
    const isOnline = net.isConnected && net.isInternetReachable !== false;

    try {
      if (isOnline && activityIdRef.current > 0) {
        let photoUploaded = false;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try { await uploadActivityPhoto(activityIdRef.current, photoUri); photoUploaded = true; break; }
          catch { /* retry */ }
        }

        await finishDiagnosisActivity(activityIdRef.current, {
          diagnosis_result:   diagnosisResult,
          diagnosis_checklist: checklist,
          total_pause_minutes: totalPauseMin,
          notes: diagnosisResult === 'needs_return' ? notes.trim() : undefined,
        });

        await AsyncStorage.removeItem(ACTIVE_DIAGNOSIS_V2_KEY);
        setDoneResult(diagnosisResult);
        setDone(true);

        if (!photoUploaded) {
          setTimeout(() => Alert.alert(
            diagnosisResult === 'resolved' ? 'Concluído' : 'Diagnóstico registrado',
            'Foto não enviada — verifique sua conexão.',
            [{ text: 'OK', onPress: () => navigation.navigate('MachineList', { org }) }],
          ), 400);
        } else {
          setTimeout(() => navigation.navigate('MachineList', { org }), 1500);
        }
      } else {
        await AsyncStorage.removeItem(ACTIVE_DIAGNOSIS_V2_KEY);
        setDoneResult(diagnosisResult);
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

  if (done) {
    const doneTitle = doneResult === 'resolved' ? 'Coleta concluída!' : doneResult === 'no_modem' ? 'Registrado!' : 'Diagnóstico registrado!';
    const doneSub   = doneResult === 'resolved' ? 'Atividade salva com sucesso' : doneResult === 'no_modem' ? 'Ausência de modem registrada com sucesso' : 'Retorno registrado com sucesso';
    return (
      <View style={styles.center}>
        <Text style={styles.doneIcon}>✓</Text>
        <Text style={styles.doneText}>{doneTitle}</Text>
        <Text style={styles.doneSub}>{doneSub}</Text>
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
        <InfoRow label="Dias offline"         value={formatDaysOffline(machine.days_offline)} valueStyle={styles.yellowText} />
        <InfoRow label="Horímetro atual"      value={`${currentHours} h`} />
        <InfoRow label="Diferença"            value={`${hoursDiff.toFixed(1)} h`} />
      </View>

      {/* Timer — always visible */}
      <View style={[styles.timerBar, isPaused && styles.timerBarPaused]}>
        <Text style={styles.timerBarLabel}>Tempo:</Text>
        <Text style={[styles.timerBarValue, isPaused && styles.timerBarValuePaused]}>
          {formatElapsed(elapsed)}
        </Text>
        {isPaused && <Text style={styles.pausedBadge}>PAUSADO</Text>}
      </View>

      {/* ── STEP 1: Ignition + Connectivity Check ─────────────────────── */}
      {step === 'step1' && (
        <View style={styles.section}>
          <Text style={styles.stepBadge}>Passo 1 de 2</Text>
          <Text style={styles.sectionTitle}>Ligar a ignição e verificar conectividade</Text>
          <Text style={styles.sectionDesc}>
            Ligue a chave de ignição da máquina e aguarde o sistema inicializar
          </Text>
          <TouchableOpacity style={styles.connectedBtn} onPress={goToStep2a}>
            <Text style={styles.connectedBtnText}>Máquina conectou!</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.notConnectedBtn} onPress={goToStep2b}>
            <Text style={styles.notConnectedBtnText}>Máquina não conectou</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.noModemBtn} onPress={goToStep2c}>
            <Text style={styles.noModemBtnText}>Máquina sem modem JDLink instalado</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── STEP 2A: Machine Connected ────────────────────────────────── */}
      {step === 'step2a' && (
        <>
          <View style={styles.successSection}>
            <Text style={styles.successTitle}>Máquina conectada com sucesso!</Text>
            <Text style={styles.sectionSubLabel}>Marque o que se aplicava antes da conexão:</Text>
            {CONNECTED_CAUSES.map((item, i) => (
              <TouchableOpacity
                key={i}
                style={styles.checkItem}
                onPress={() => {
                  const next = [...connChecklist];
                  next[i] = !next[i];
                  setConnChecklist(next);
                }}
              >
                <View style={[styles.checkbox, connChecklist[i] && styles.checkboxChecked]}>
                  {connChecklist[i] && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={[styles.checkLabel, connChecklist[i] && styles.checkLabelChecked]}>
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Método de coleta</Text>
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

          <PhotoBlock
            photoUri={photoUri}
            onTakePhoto={takePhoto}
            label="Foto do painel mostrando conexão ativa"
            instruction="Fotografe o painel mostrando o símbolo de conexão ativa"
          />

          <TouchableOpacity
            style={[styles.finishBtn, (!photoUri || !selectedMethod) && styles.finishBtnDisabled]}
            onPress={() => handleFinish('resolved')}
            disabled={loading || !photoUri || !selectedMethod}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.finishBtnText}>Finalizar Coleta</Text>}
          </TouchableOpacity>
          {!selectedMethod && <Text style={styles.hintText}>Selecione o método de coleta</Text>}
          {!photoUri && <Text style={styles.hintText}>Foto obrigatória para finalizar</Text>}
        </>
      )}

      {/* ── STEP 2B: Machine NOT Connected ───────────────────────────── */}
      {step === 'step2b' && (
        <>
          <View style={styles.warningSection}>
            <Text style={styles.warningTitle}>Máquina sem conectividade</Text>
            <Text style={styles.sectionSubLabel}>Marque as causas identificadas:</Text>
            {DISCONNECTED_CAUSES.map((item, i) => (
              <TouchableOpacity
                key={i}
                style={styles.checkItem}
                onPress={() => {
                  const next = [...disconnChecklist];
                  next[i] = !next[i];
                  setDisconnChecklist(next);
                }}
              >
                <View style={[styles.checkbox, disconnChecklist[i] && styles.checkboxChecked]}>
                  {disconnChecklist[i] && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={[styles.checkLabel, disconnChecklist[i] && styles.checkLabelChecked]}>
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Sub-option A: resolved now */}
          <TouchableOpacity
            style={[styles.optionCard, step2bOption === 'resolved_now' && styles.optionCardActive]}
            onPress={() => selectStep2bOption('resolved_now')}
            activeOpacity={0.85}
          >
            <Text style={styles.optionTitle}>Problema resolvido agora</Text>
            <Text style={styles.optionDesc}>O problema foi corrigido e a máquina está conectada</Text>

            {step2bOption === 'resolved_now' && (
              <View style={styles.optionBody}>
                <Text style={styles.sectionTitle}>Método de coleta</Text>
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
                <PhotoBlock
                  photoUri={photoUri}
                  onTakePhoto={takePhoto}
                  label="Foto do painel mostrando conexão ativa"
                  instruction="Fotografe o painel mostrando o símbolo de conexão ativa"
                />
                <TouchableOpacity
                  style={[styles.finishBtn, (!photoUri || !selectedMethod) && styles.finishBtnDisabled]}
                  onPress={() => handleFinish('resolved')}
                  disabled={loading || !photoUri || !selectedMethod}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.finishBtnText}>Finalizar Coleta</Text>}
                </TouchableOpacity>
                {!selectedMethod && <Text style={styles.hintText}>Selecione o método de coleta</Text>}
                {!photoUri && <Text style={styles.hintText}>Foto obrigatória para finalizar</Text>}
              </View>
            )}
          </TouchableOpacity>

          {/* Sub-option B: needs return */}
          <TouchableOpacity
            style={[styles.optionCard, step2bOption === 'needs_return' && styles.optionCardActive]}
            onPress={() => selectStep2bOption('needs_return')}
            activeOpacity={0.85}
          >
            <Text style={styles.optionTitle}>Requer retorno com peça/suporte</Text>
            <Text style={styles.optionDesc}>Não foi possível resolver — documentar e pausar se necessário</Text>

            {step2bOption === 'needs_return' && !isPaused && (
              <View style={styles.optionBody}>
                <TextInput
                  style={styles.notesInput}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Descreva o problema encontrado e o que é necessário (obrigatório)..."
                  placeholderTextColor="#aaa"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
                <PhotoBlock
                  photoUri={photoUri}
                  onTakePhoto={takePhoto}
                  label="Foto do modem/máquina mostrando o problema"
                  instruction="Fotografe o componente com problema"
                />
                <TouchableOpacity style={styles.pauseBtn} onPress={handlePause}>
                  <Text style={styles.pauseBtnText}>Pausar — retornar outro dia</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.finishBtn, (!photoUri || !notes.trim()) && styles.finishBtnDisabled]}
                  onPress={() => handleFinish('needs_return')}
                  disabled={loading || !photoUri || !notes.trim()}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.finishBtnText}>Finalizar Diagnóstico</Text>}
                </TouchableOpacity>
                {!notes.trim() && <Text style={styles.hintText}>Notas obrigatórias para finalizar</Text>}
                {!photoUri && <Text style={styles.hintText}>Foto obrigatória para finalizar</Text>}
              </View>
            )}

            {step2bOption === 'needs_return' && isPaused && (
              <View style={styles.optionBody}>
                <TouchableOpacity style={styles.resumeBtn} onPress={handleResume}>
                  <Text style={styles.pauseBtnText}>Retomar diagnóstico</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        </>
      )}
      {/* ── STEP 2C: No Modem Installed ──────────────────────────────── */}
      {step === 'step2c' && (
        <>
          <View style={styles.noModemSection}>
            <Text style={styles.noModemTitle}>Máquina sem Modem JDLink</Text>
            <Text style={styles.noModemSubtitle}>
              Esta máquina não possui o Modem JDLink M ou R instalado
            </Text>
            <View style={styles.noModemInfoBox}>
              <Text style={styles.noModemInfoText}>
                O JDLink Modem (M ou R) é necessário para conectar a máquina ao John Deere
                Operations Center. Sem ele, não é possível realizar a telemetria e o envio
                automático de dados.
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>A máquina é pré-disposta para instalação do modem?</Text>
            <RadioGroup
              options={NO_MODEM_PREDISPOSED}
              selected={noModemPredisposed}
              onSelect={setNoModemPredisposed}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Qual a recomendação?</Text>
            <RadioGroup
              options={NO_MODEM_RECOMMENDATION}
              selected={noModemRecommendation}
              onSelect={setNoModemRecommendation}
            />
          </View>

          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Descreva as condições da máquina e observações sobre a instalação do modem (obrigatório)..."
            placeholderTextColor="#aaa"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          <PhotoBlock
            photoUri={photoUri}
            onTakePhoto={takePhoto}
            label="Foto da máquina mostrando ausência do modem"
            instruction="Fotografe o local onde o modem deveria estar instalado"
          />

          <TouchableOpacity
            style={[
              styles.finishBtn,
              (!photoUri || !noModemPredisposed || !noModemRecommendation || !notes.trim()) && styles.finishBtnDisabled,
            ]}
            onPress={() => handleFinish('no_modem')}
            disabled={loading || !photoUri || !noModemPredisposed || !noModemRecommendation || !notes.trim()}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.finishBtnText}>Registrar e Finalizar</Text>}
          </TouchableOpacity>
          {(!noModemPredisposed || !noModemRecommendation) && (
            <Text style={styles.hintText}>Responda as duas perguntas acima</Text>
          )}
          {!notes.trim() && <Text style={styles.hintText}>Notas obrigatórias para finalizar</Text>}
          {!photoUri && <Text style={styles.hintText}>Foto obrigatória para finalizar</Text>}
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

function RadioGroup({
  options, selected, onSelect,
}: {
  options: { value: string; label: string }[];
  selected: string | null;
  onSelect: (v: string) => void;
}) {
  return (
    <View style={styles.radioGroup}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[styles.radioItem, selected === opt.value && styles.radioItemSelected]}
          onPress={() => onSelect(opt.value)}
          activeOpacity={0.75}
        >
          <View style={[styles.radioCircle, selected === opt.value && styles.radioCircleSelected]}>
            {selected === opt.value && <View style={styles.radioInner} />}
          </View>
          <Text style={[styles.radioLabel, selected === opt.value && styles.radioLabelSelected]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function PhotoBlock({
  photoUri, onTakePhoto, label, instruction,
}: {
  photoUri: string | null;
  onTakePhoto: () => void;
  label: string;
  instruction: string;
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
          <Text style={styles.photoInstruction}>{instruction}</Text>
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

  // Timer bar
  timerBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12,
  },
  timerBarPaused:      { backgroundColor: '#374151' },
  timerBarLabel:       { color: '#aaa', fontSize: 13 },
  timerBarValue:       { fontSize: 22, fontWeight: '700', color: JD_YELLOW, fontVariant: ['tabular-nums'], letterSpacing: 1 },
  timerBarValuePaused: { color: '#9ca3af' },
  pausedBadge:         { marginLeft: 'auto', backgroundColor: '#6B7280', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, color: '#fff', fontSize: 11, fontWeight: '700' },

  // Generic section
  section: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 10,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2,
  },
  stepBadge:      { alignSelf: 'flex-start', backgroundColor: JD_GREEN, color: '#fff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, fontSize: 11, fontWeight: '700', overflow: 'hidden' },
  sectionTitle:   { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  sectionDesc:    { fontSize: 13, color: '#6b7280', lineHeight: 20 },
  sectionSubLabel:{ fontSize: 13, color: '#888', marginBottom: 4 },

  // Step 1 buttons
  connectedBtn: {
    backgroundColor: JD_GREEN, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 4,
  },
  connectedBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  notConnectedBtn: {
    backgroundColor: '#1a1a1a', borderRadius: 10, padding: 16, alignItems: 'center',
  },
  notConnectedBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Step 2A success section
  successSection: {
    backgroundColor: '#f0fdf4', borderRadius: 12, padding: 16, gap: 10,
    borderWidth: 1.5, borderColor: '#bbf7d0',
  },
  successTitle: { fontSize: 15, fontWeight: '700', color: '#166534' },

  // Step 2B warning section
  warningSection: {
    backgroundColor: '#FEF3C7', borderRadius: 12, padding: 16, gap: 10,
    borderWidth: 1.5, borderColor: '#FDE68A',
  },
  warningTitle: { fontSize: 15, fontWeight: '700', color: '#92400E' },

  // Checklist
  checkItem:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  checkbox:          { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  checkboxChecked:   { backgroundColor: JD_GREEN, borderColor: JD_GREEN },
  checkmark:         { color: '#fff', fontWeight: '900', fontSize: 13 },
  checkLabel:        { flex: 1, fontSize: 14, color: '#374151' },
  checkLabelChecked: { color: '#1a1a1a', fontWeight: '600' },

  // Option cards (step 2B sub-options)
  optionCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 4,
    borderWidth: 1.5, borderColor: '#e5e7eb',
  },
  optionCardActive: { borderColor: JD_GREEN, backgroundColor: '#f0fdf4' },
  optionTitle:      { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  optionDesc:       { fontSize: 13, color: '#6b7280' },
  optionBody:       { gap: 10, marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb' },

  // Method selector
  methodRow:           { flexDirection: 'row', gap: 8 },
  methodBtn:           { flex: 1, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 8, padding: 12, alignItems: 'center' },
  methodBtnActive:     { borderColor: JD_GREEN, backgroundColor: '#f0fdf4' },
  methodBtnText:       { color: '#555', fontWeight: '600', fontSize: 12, textAlign: 'center' },
  methodBtnTextActive: { color: JD_GREEN },

  // Pause / Resume
  pauseBtn:     { backgroundColor: '#6B7280', borderRadius: 10, padding: 14, alignItems: 'center' },
  resumeBtn:    { backgroundColor: JD_GREEN,  borderRadius: 10, padding: 16, alignItems: 'center' },
  pauseBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Notes
  notesInput: {
    backgroundColor: '#fff', borderRadius: 8, padding: 14,
    fontSize: 15, color: '#1a1a1a', minHeight: 100,
    borderWidth: 1, borderColor: '#ddd',
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

  // Finish button
  finishBtn:         { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 18, alignItems: 'center' },
  finishBtnDisabled: { backgroundColor: '#9ca3af' },
  finishBtnText:     { color: '#fff', fontWeight: '700', fontSize: 17 },
  hintText:          { textAlign: 'center', fontSize: 13, color: '#ef4444', marginTop: -4 },

  // Step 1 — No Modem button
  noModemBtn: {
    backgroundColor: '#1D4ED8', borderRadius: 10, padding: 16, alignItems: 'center',
  },
  noModemBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Step 2C — No modem section
  noModemSection: {
    backgroundColor: '#EFF6FF', borderRadius: 12, padding: 16, gap: 10,
    borderWidth: 1.5, borderColor: '#BFDBFE',
  },
  noModemTitle:    { fontSize: 15, fontWeight: '700', color: '#1E40AF' },
  noModemSubtitle: { fontSize: 13, color: '#3B82F6' },
  noModemInfoBox:  { backgroundColor: '#DBEAFE', borderRadius: 8, padding: 12 },
  noModemInfoText: { fontSize: 13, color: '#1E40AF', lineHeight: 20 },

  // Radio group
  radioGroup:         { gap: 8 },
  radioItem:          { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 8, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  radioItemSelected:  { borderColor: JD_GREEN, backgroundColor: '#f0fdf4' },
  radioCircle:        { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  radioCircleSelected:{ borderColor: JD_GREEN },
  radioInner:         { width: 10, height: 10, borderRadius: 5, backgroundColor: JD_GREEN },
  radioLabel:         { flex: 1, fontSize: 14, color: '#374151', lineHeight: 20 },
  radioLabelSelected: { color: '#1a1a1a', fontWeight: '600' },

  // Done
  doneIcon: { fontSize: 72, color: JD_GREEN },
  doneText: { fontSize: 22, fontWeight: '700', color: JD_GREEN, marginTop: 16 },
  doneSub:  { fontSize: 16, color: '#555', marginTop: 8 },
});
