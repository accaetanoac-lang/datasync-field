import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, TextInput, Linking, Image,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as ImagePicker from 'expo-image-picker';
import { submitOcSurvey, uploadOcPhoto } from '../services/api';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = StackNavigationProp<RootStackParamList, 'OperationsCenterSurvey'>;
type Route = RouteProp<RootStackParamList, 'OperationsCenterSurvey'>;

const JD_GREEN  = '#367C2B';
const JD_YELLOW = '#FFDE00';
const OC_URL    = 'https://www.deere.com.br/pt/agricultura-de-precisao/gerenciamento-de-informacoes/operations-center/';

type Q1Answer = 'yes' | 'no' | 'unknown';
type Q2Answer = 'yes' | 'partial' | 'no';
type Q3Answer = 'yes' | 'no' | 'already_knows';

const Q1_OPTIONS: { value: Q1Answer; label: string }[] = [
  { value: 'yes',     label: 'Sim — já tem instalado' },
  { value: 'no',      label: 'Não — não tem instalado' },
  { value: 'unknown', label: 'Não sei informar' },
];

const Q2_OPTIONS: { value: Q2Answer; label: string }[] = [
  { value: 'yes',     label: 'Sim — conhece e usa regularmente' },
  { value: 'partial', label: 'Parcialmente — tem mas não usa muito' },
  { value: 'no',      label: 'Não — tem instalado mas não usa' },
];

const Q3_OPTIONS: { value: Q3Answer; label: string }[] = [
  { value: 'yes',          label: 'Sim — quer aprender' },
  { value: 'no',           label: 'Não — não tem interesse' },
  { value: 'already_knows',label: 'Já sabe usar' },
];

export default function OperationsCenterSurveyScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { activityId, org, doneTitle, doneSub } = route.params;

  const [q1, setQ1] = useState<Q1Answer | null>(null);
  const [q2, setQ2] = useState<Q2Answer | null>(null);
  const [q3, setQ3] = useState<Q3Answer | null>(null);
  const [ocNotes, setOcNotes]       = useState('');
  const [ocPhotoUri, setOcPhotoUri] = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const [done, setDone]             = useState(false);

  const handleDone = () => {
    setDone(true);
    setTimeout(() => navigation.navigate('MachineList', { org }), 1500);
  };

  const handleSkip = () => handleDone();

  const takeOcPhoto = async () => {
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
      setOcPhotoUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    const oc_has_app    = q1 === 'yes' ? true  : q1 === 'no' ? false : null;
    const oc_uses_it    = q2 === 'yes' ? true  : q2 === 'no' ? false : null;
    const oc_interested = q3 === 'yes' ? true  : q3 === 'no' ? false : null;
    const oc_explained  = ocPhotoUri !== null;

    setLoading(true);
    try {
      await submitOcSurvey(activityId, {
        oc_has_app,
        oc_uses_it,
        oc_interested,
        oc_explained,
        oc_notes: ocNotes.trim() || undefined,
      });
      if (ocPhotoUri) {
        uploadOcPhoto(activityId, ocPhotoUri).catch(() => {});
      }
    } catch {
      // Proceed to done even if save fails
    } finally {
      setLoading(false);
      handleDone();
    }
  };

  if (done) {
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

      {/* Header */}
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>📱 Operations Center</Text>
        <Text style={styles.headerSubtitle}>John Deere Operations Center — Plataforma gratuita de gestão</Text>
      </View>

      {/* Info card */}
      <View style={styles.infoCard}>
        <Text style={styles.infoText}>
          O Operations Center permite ao cliente visualizar dados das máquinas, planos de trabalho e relatórios agronômicos gratuitamente.
        </Text>
      </View>

      {/* Q1 */}
      <View style={styles.questionCard}>
        <Text style={styles.questionText}>
          O cliente possui o Operations Center instalado no celular ou computador?
        </Text>
        {Q1_OPTIONS.map((opt) => (
          <RadioItem
            key={opt.value}
            label={opt.label}
            selected={q1 === opt.value}
            onPress={() => { setQ1(opt.value); setQ2(null); }}
          />
        ))}
      </View>

      {/* Q2 — only if Q1 = 'yes' */}
      {q1 === 'yes' && (
        <View style={styles.questionCard}>
          <Text style={styles.questionText}>
            O cliente conhece e utiliza o Operations Center?
          </Text>
          {Q2_OPTIONS.map((opt) => (
            <RadioItem
              key={opt.value}
              label={opt.label}
              selected={q2 === opt.value}
              onPress={() => setQ2(opt.value)}
            />
          ))}
        </View>
      )}

      {/* Q3 */}
      <View style={styles.questionCard}>
        <Text style={styles.questionText}>
          O cliente tem interesse em aprender a usar o Operations Center?
        </Text>
        {Q3_OPTIONS.map((opt) => (
          <RadioItem
            key={opt.value}
            label={opt.label}
            selected={q3 === opt.value}
            onPress={() => setQ3(opt.value)}
          />
        ))}
      </View>

      {/* Explanation flow — shown when client wants to learn */}
      {q3 === 'yes' && (
        <View style={styles.explainCard}>
          <Text style={styles.explainTitle}>Explique o Operations Center ao cliente</Text>
          <Text style={styles.explainText}>
            Mostre o aplicativo, as funcionalidades e como acessar os dados das máquinas.
          </Text>

          {/* Camera */}
          {ocPhotoUri ? (
            <View style={styles.photoPreview}>
              <Image source={{ uri: ocPhotoUri }} style={styles.photoThumbnail} />
              <TouchableOpacity style={styles.retakeBtn} onPress={takeOcPhoto}>
                <Text style={styles.retakeBtnText}>Refazer foto</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.cameraBtn} onPress={takeOcPhoto}>
              <Text style={styles.cameraBtnText}>📷 Foto das instruções (opcional)</Text>
            </TouchableOpacity>
          )}

          {/* Link */}
          <TouchableOpacity onPress={() => Linking.openURL(OC_URL)}>
            <Text style={styles.linkText}>🔗 Abrir Operations Center no navegador</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Notes */}
      <View style={styles.questionCard}>
        <Text style={styles.questionText}>Observações sobre uso do Operations Center</Text>
        <TextInput
          style={styles.notesInput}
          value={ocNotes}
          onChangeText={setOcNotes}
          placeholder="Observações adicionais (opcional)"
          placeholderTextColor="#aaa"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>

      {/* Action buttons */}
      <TouchableOpacity
        style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.saveBtnText}>Salvar e Finalizar</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} disabled={loading}>
        <Text style={styles.skipBtnText}>Pular</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

function RadioItem({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.radioItem, selected && styles.radioItemSelected]} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.radioCircle, selected && styles.radioCircleSelected]}>
        {selected && <View style={styles.radioInner} />}
      </View>
      <Text style={[styles.radioLabel, selected && styles.radioLabelSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: '#f5f5f5' },
  container: { padding: 16, gap: 12 },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },

  headerCard: {
    backgroundColor: JD_GREEN, borderRadius: 12, padding: 16, gap: 4,
  },
  headerTitle:    { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },

  infoCard: {
    backgroundColor: '#FEFCE8', borderRadius: 10, padding: 14,
    borderWidth: 1.5, borderColor: '#FDE047',
  },
  infoText: { color: '#854D0E', fontSize: 13, lineHeight: 20 },

  questionCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 8,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2,
  },
  questionText: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', lineHeight: 20 },

  radioItem:         { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, borderWidth: 1.5, borderColor: '#e5e7eb' },
  radioItemSelected: { borderColor: JD_GREEN, backgroundColor: '#f0fdf4' },
  radioCircle:         { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  radioCircleSelected: { borderColor: JD_GREEN },
  radioInner:          { width: 10, height: 10, borderRadius: 5, backgroundColor: JD_GREEN },
  radioLabel:          { flex: 1, fontSize: 14, color: '#374151' },
  radioLabelSelected:  { color: '#1a1a1a', fontWeight: '600' },

  explainCard: {
    backgroundColor: '#EFF6FF', borderRadius: 12, padding: 16, gap: 10,
    borderWidth: 1.5, borderColor: '#BFDBFE',
  },
  explainTitle: { fontSize: 14, fontWeight: '700', color: '#1E40AF' },
  explainText:  { fontSize: 13, color: '#3B82F6', lineHeight: 18 },

  cameraBtn:     { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 14, alignItems: 'center' },
  cameraBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  photoPreview:  { alignItems: 'center', gap: 8 },
  photoThumbnail:{ width: '100%', height: 160, borderRadius: 8, backgroundColor: '#f0f0f0' },
  retakeBtn:     { borderWidth: 1.5, borderColor: '#BFDBFE', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 16 },
  retakeBtnText: { color: '#1E40AF', fontWeight: '600', fontSize: 13 },

  linkText: { color: '#1E40AF', fontWeight: '600', fontSize: 13, textDecorationLine: 'underline' },

  notesInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 10, fontSize: 14, color: '#1a1a1a', minHeight: 70,
  },

  saveBtn:         { backgroundColor: JD_GREEN, borderRadius: 12, padding: 18, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#9ca3af' },
  saveBtnText:     { color: '#fff', fontWeight: '700', fontSize: 16 },

  skipBtn:    { borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 12, padding: 14, alignItems: 'center' },
  skipBtnText:{ color: '#6b7280', fontWeight: '600', fontSize: 14 },

  doneIcon: { fontSize: 72, color: JD_GREEN },
  doneText:  { fontSize: 22, fontWeight: '700', color: JD_GREEN, marginTop: 16, textAlign: 'center' },
  doneSub:   { fontSize: 16, color: '#555', marginTop: 8 },
});
