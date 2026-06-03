import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Image, AppState, AppStateStatus,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as ImagePicker from 'expo-image-picker';
import NetInfo from '@react-native-community/netinfo';
import { finishDataCollection, uploadActivityPhoto, uploadConnectivityPhoto, cancelActivity } from '../services/api';
import { queueCancellation } from '../services/sync';
import CancelActivityModal from '../components/CancelActivityModal';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = StackNavigationProp<RootStackParamList, 'DataCollection'>;
type Route = RouteProp<RootStackParamList, 'DataCollection'>;

const JD_GREEN  = '#367C2B';
const JD_YELLOW = '#FFDE00';

function pad(n: number) { return String(n).padStart(2, '0'); }
function formatElapsed(s: number) {
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export default function DataCollectionScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { machine, org, currentHours, hoursDiff, activityId, startedAt, connectivityPhotoUri } = route.params;

  const [selectedMethod, setSelectedMethod] = useState<'starlink_data_sync' | 'pen_drive' | null>(null);
  const [collectionPhotoUri, setCollectionPhotoUri] = useState<string | null>(null);
  const [loading, setLoading]             = useState(false);
  const [elapsed, setElapsed]             = useState(0);
  const [showCancelModal, setShowCancelModal] = useState(false);

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

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => setShowCancelModal(true)} style={{ marginRight: 16 }}>
          <Text style={{ color: '#fff', fontSize: 15 }}>Cancelar</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

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
      await AsyncStorage.removeItem(machineKey).catch(() => {});
      navigation.navigate('MachineList', { org });
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
      setCollectionPhotoUri(result.assets[0].uri);
    }
  };

  const handleFinish = async () => {
    if (!collectionPhotoUri) {
      Alert.alert('Foto obrigatória', 'Fotografe o painel mostrando a coleta concluída.');
      return;
    }
    if (!selectedMethod) {
      Alert.alert('Método obrigatório', 'Selecione o método de coleta.');
      return;
    }

    if (intervalRef.current) clearInterval(intervalRef.current);
    setLoading(true);

    const net = await NetInfo.fetch();
    const isOnline = net.isConnected && net.isInternetReachable !== false;

    try {
      if (isOnline && activityId > 0) {
        // Upload Photo 1 (connectivity symbol)
        for (let i = 1; i <= 2; i++) {
          try { await uploadConnectivityPhoto(activityId, connectivityPhotoUri); break; }
          catch { /* retry */ }
        }
        // Upload Photo 2 (collection done)
        let photo2Ok = false;
        for (let i = 1; i <= 2; i++) {
          try { await uploadActivityPhoto(activityId, collectionPhotoUri); photo2Ok = true; break; }
          catch { /* retry */ }
        }

        await finishDataCollection(activityId, {
          method: selectedMethod,
          diagnosis_result: 'resolved',
        });

        await AsyncStorage.removeItem(machineKey).catch(() => {});
        const goToSurvey = () => navigation.navigate('OperationsCenterSurvey', {
          activityId,
          org,
          doneTitle: 'Coleta concluída!',
          doneSub: 'Dados sincronizados com sucesso',
        });
        if (!photo2Ok) {
          Alert.alert('Coleta concluída', 'Foto do painel não enviada — verifique sua conexão.',
            [{ text: 'OK', onPress: goToSurvey }]);
        } else {
          goToSurvey();
        }
      } else {
        await AsyncStorage.removeItem(machineKey).catch(() => {});
        navigation.navigate('OperationsCenterSurvey', {
          activityId,
          org,
          doneTitle: 'Coleta concluída!',
          doneSub: 'Dados sincronizados com sucesso',
        });
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível finalizar a coleta.');
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

      {/* Status */}
      <View style={styles.statusBadge}>
        <Text style={styles.statusText}>Máquina conectada</Text>
      </View>

      {/* Timer */}
      <View style={styles.timerBar}>
        <Text style={styles.timerLabel}>Tempo de serviço:</Text>
        <Text style={styles.timerValue}>{formatElapsed(elapsed)}</Text>
      </View>

      {/* Photo 1 preview */}
      <View style={styles.photoPreviewCard}>
        <Text style={styles.photoPreviewLabel}>Foto 1 — Símbolo de conexão confirmado</Text>
        <Image source={{ uri: connectivityPhotoUri }} style={styles.photoThumbnail} resizeMode="cover" />
      </View>

      {/* Method selector */}
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

      {/* Photo 2 */}
      <View style={styles.photoSection}>
        {collectionPhotoUri ? (
          <View style={styles.photoPreview}>
            <Image source={{ uri: collectionPhotoUri }} style={styles.photoThumbnail} />
            <TouchableOpacity style={styles.retakeButton} onPress={takePhoto}>
              <Text style={styles.retakeText}>Refazer foto</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.photoPlaceholder}>
            <TouchableOpacity style={styles.cameraButton} onPress={takePhoto}>
              <Text style={styles.cameraIcon}>📷</Text>
              <Text style={styles.cameraButtonText}>Foto do painel mostrando coleta concluída</Text>
            </TouchableOpacity>
            <Text style={styles.photoInstruction}>Fotografe o painel após realizar a coleta de dados</Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.finishBtn, (!collectionPhotoUri || !selectedMethod) && styles.finishBtnDisabled]}
        onPress={handleFinish}
        disabled={loading || !collectionPhotoUri || !selectedMethod}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.finishBtnText}>Finalizar Coleta</Text>}
      </TouchableOpacity>
      {!selectedMethod && <Text style={styles.hintText}>Selecione o método de coleta</Text>}
      {!collectionPhotoUri && <Text style={styles.hintText}>Foto obrigatória para finalizar</Text>}

    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: '#f5f5f5' },
  container: { padding: 16, gap: 12 },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },

  statusBadge: { backgroundColor: JD_GREEN, borderRadius: 10, padding: 12, alignItems: 'center' },
  statusText:  { color: '#fff', fontWeight: '700', fontSize: 15 },

  timerBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12,
  },
  timerLabel: { color: '#aaa', fontSize: 13 },
  timerValue: { fontSize: 22, fontWeight: '700', color: JD_YELLOW, fontVariant: ['tabular-nums'], letterSpacing: 1 },

  photoPreviewCard: { backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 8, borderWidth: 1.5, borderColor: '#bbf7d0' },
  photoPreviewLabel:{ fontSize: 12, fontWeight: '600', color: '#166534' },

  section:        { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 10, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2 },
  sectionTitle:   { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  methodRow:      { flexDirection: 'row', gap: 8 },
  methodBtn:      { flex: 1, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 8, padding: 12, alignItems: 'center' },
  methodBtnActive:{ borderColor: JD_GREEN, backgroundColor: '#f0fdf4' },
  methodBtnText:       { color: '#555', fontWeight: '600', fontSize: 12, textAlign: 'center' },
  methodBtnTextActive: { color: JD_GREEN },

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

  finishBtn:         { backgroundColor: JD_GREEN, borderRadius: 10, padding: 18, alignItems: 'center' },
  finishBtnDisabled: { backgroundColor: '#9ca3af' },
  finishBtnText:     { color: '#fff', fontWeight: '700', fontSize: 17 },
  hintText:          { textAlign: 'center', fontSize: 13, color: '#ef4444', marginTop: -4 },

});
