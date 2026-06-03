import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Image, ScrollView,
  AppState, AppStateStatus,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as ImagePicker from 'expo-image-picker';
import { finishActivity, uploadActivityPhoto, cancelActivity } from '../services/api';
import { queueActivity, queueCancellation } from '../services/sync';
import CancelActivityModal from '../components/CancelActivityModal';
import NetInfo from '@react-native-community/netinfo';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = StackNavigationProp<RootStackParamList, 'Activity'>;
type Route = RouteProp<RootStackParamList, 'Activity'>;

export const ACTIVE_ACTIVITY_KEY = 'active_activity';

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

  // Wall-clock start time — never mutated, so elapsed is always accurate
  // even after the JS thread was paused in the background.
  const startTimestamp = useRef<number>(Date.parse(startedAt));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [elapsed, setElapsed]             = useState(0);
  const [notes, setNotes]                 = useState('');
  const [loading, setLoading]             = useState(false);
  const [photoUri, setPhotoUri]           = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => setShowCancelModal(true)} style={{ marginRight: 16 }}>
          <Text style={{ color: '#fff', fontSize: 15 }}>Cancelar</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  function calcElapsed(): number {
    return Math.max(0, Math.floor((Date.now() - startTimestamp.current) / 1000));
  }

  useEffect(() => {
    // Persist so AppNavigator can offer to resume after a force-close
    AsyncStorage.setItem(ACTIVE_ACTIVITY_KEY, JSON.stringify({
      activityId, startedAt, machine, org, method,
    })).catch(() => {});

    // Seed immediately, then tick every second
    setElapsed(calcElapsed());
    intervalRef.current = setInterval(() => setElapsed(calcElapsed()), 1000);

    // When the app returns from background the interval may have drifted;
    // snap back to the real elapsed time instantly.
    const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') setElapsed(calcElapsed());
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      appStateSub.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCancel = async (reason: string) => {
    setShowCancelModal(false);
    if (intervalRef.current) clearInterval(intervalRef.current);

    const net = await NetInfo.fetch();
    const isOnline = net.isConnected && net.isInternetReachable !== false;

    try {
      if (isOnline && activityId > 0) {
        await cancelActivity(activityId, reason || undefined);
      } else if (activityId > 0) {
        await queueCancellation({ activityId, cancel_reason: reason || undefined });
      }
    } catch {
      if (activityId > 0) {
        await queueCancellation({ activityId, cancel_reason: reason || undefined }).catch(() => {});
      }
    } finally {
      await AsyncStorage.removeItem(ACTIVE_ACTIVITY_KEY).catch(() => {});
      navigation.navigate('MachineList', { org });
    }
  };

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

  const handleFinish = async () => {
    if (!photoUri) {
      Alert.alert('Foto obrigatória', 'Tire uma foto do painel antes de finalizar.');
      return;
    }

    if (intervalRef.current) clearInterval(intervalRef.current);

    const captured = calcElapsed();
    setLoading(true);

    const net = await NetInfo.fetch();
    const isOnline = net.isConnected && net.isInternetReachable !== false;

    try {
      if (isOnline && activityId > 0) {
        // --- Photo upload (2 attempts, non-blocking) ---
        let photoUploaded = false;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            await uploadActivityPhoto(activityId, photoUri);
            photoUploaded = true;
            break;
          } catch (photoErr) {
            console.error(`Photo upload attempt ${attempt} failed:`, photoErr);
          }
        }

        // Always finish the activity regardless of photo result
        await finishActivity(activityId, notes || undefined);
        await AsyncStorage.removeItem(ACTIVE_ACTIVITY_KEY);
        const goToSurvey = () => navigation.navigate('OperationsCenterSurvey', {
          activityId,
          org,
          doneTitle: 'Atividade concluída!',
          doneSub: `Duração: ${formatElapsed(captured)}`,
        });
        if (!photoUploaded) {
          Alert.alert('Atividade concluída', 'Foto não enviada — verifique sua conexão.',
            [{ text: 'OK', onPress: goToSurvey }]);
        } else {
          goToSurvey();
        }
      } else {
        await queueActivity({
          tempId: String(Date.now()),
          org_id: org.id,
          machine_id: machine.id,
          method,
          notes: notes || undefined,
          status: 'completed',
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          duration_minutes: Math.round(captured / 60),
          synced_offline: true,
        });
        await AsyncStorage.removeItem(ACTIVE_ACTIVITY_KEY);
        navigation.navigate('OperationsCenterSurvey', {
          activityId,
          org,
          doneTitle: 'Atividade concluída!',
          doneSub: `Duração: ${formatElapsed(captured)}`,
        });
      }
    } catch (err) {
      console.error('Finish activity error:', err);
      Alert.alert('Erro', 'Não foi possível finalizar a atividade. Verifique sua conexão.');
      // Restart the live timer; it will self-correct from the timestamp
      intervalRef.current = setInterval(() => setElapsed(calcElapsed()), 1000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <CancelActivityModal
      visible={showCancelModal}
      onConfirm={handleCancel}
      onDismiss={() => setShowCancelModal(false)}
    />
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
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

      {/* Photo section */}
      <View style={styles.photoSection}>
        {photoUri ? (
          <View style={styles.photoPreview}>
            <Image source={{ uri: photoUri }} style={styles.photoThumbnail} />
            <TouchableOpacity style={styles.retakeButton} onPress={takePhoto}>
              <Text style={styles.retakeText}>Retomar foto</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.photoPlaceholder}>
            <TouchableOpacity style={styles.cameraButton} onPress={takePhoto}>
              <Text style={styles.cameraIcon}>📷</Text>
              <Text style={styles.cameraButtonText}>Fotografar painel da máquina</Text>
            </TouchableOpacity>
            <Text style={styles.photoInstruction}>
              Tire uma foto do painel mostrando a coleta concluída
            </Text>
          </View>
        )}
      </View>

      {/* Finish button */}
      <TouchableOpacity
        style={[styles.finishButton, !photoUri && styles.finishButtonDisabled]}
        onPress={handleFinish}
        disabled={loading || !photoUri}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.finishButtonText}>Finalizar Operação</Text>}
      </TouchableOpacity>

      {!photoUri && (
        <Text style={styles.photoRequired}>
          A foto do painel é obrigatória para finalizar
        </Text>
      )}
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f5f5f5' },
  container: { padding: 16, gap: 16 },
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
  photoSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  photoPlaceholder: {
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
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
  photoThumbnail: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  retakeButton: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  retakeText: { color: '#555', fontWeight: '600', fontSize: 14 },
  finishButton: {
    backgroundColor: JD_GREEN,
    borderRadius: 8,
    padding: 18,
    alignItems: 'center',
  },
  finishButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  finishButtonText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  photoRequired: {
    textAlign: 'center',
    fontSize: 13,
    color: '#ef4444',
    marginTop: -8,
  },
});
