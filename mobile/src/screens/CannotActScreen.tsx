import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { recordImpediment } from '../services/api';
import { getCurrentLocation } from '../services/geolocation';
import { RootStackParamList } from '../navigation/AppNavigator';
import { formatDaysOffline } from '../types';
import NetInfo from '@react-native-community/netinfo';

type Nav = StackNavigationProp<RootStackParamList, 'CannotAct'>;
type Route = RouteProp<RootStackParamList, 'CannotAct'>;

const JD_GREEN  = '#367C2B';
const JD_YELLOW = '#FFDE00';

const REASONS = [
  { value: 'maintenance',  label: 'Máquina em manutenção — não pode ser ligada' },
  { value: 'absent',       label: 'Máquina ausente — não está nesta fazenda no momento' },
  { value: 'in_operation', label: 'Máquina em operação de campo — não pode ser interrompida' },
  { value: 'outros',       label: 'Outros' },
];

export default function CannotActScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { machine, org } = route.params;

  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [customReason, setCustomReason]     = useState('');
  const [notes, setNotes]                   = useState('');
  const [loading, setLoading]               = useState(false);
  const [done, setDone]                     = useState(false);

  const canSubmit =
    selectedReason !== null &&
    (selectedReason !== 'outros' || customReason.trim().length > 0);

  const handleSubmit = async () => {
    if (!selectedReason) { Alert.alert('Obrigatório', 'Selecione o motivo do impedimento.'); return; }
    if (selectedReason === 'outros' && !customReason.trim()) {
      Alert.alert('Obrigatório', 'Descreva o motivo.');
      return;
    }

    const net = await NetInfo.fetch();
    if (!net.isConnected || net.isInternetReachable === false) {
      Alert.alert('Sem conexão', 'É necessário conexão com a internet para registrar um impedimento.');
      return;
    }

    setLoading(true);
    try {
      const coords = await getCurrentLocation();
      await recordImpediment(machine.id, {
        reason:        selectedReason,
        custom_reason: selectedReason === 'outros' ? customReason.trim() : undefined,
        notes:         notes.trim() || undefined,
        tech_lat:      coords?.latitude,
        tech_lng:      coords?.longitude,
      });
      setDone(true);
      setTimeout(() => navigation.navigate('MachineList', { org }), 1500);
    } catch {
      Alert.alert('Erro', 'Não foi possível registrar o impedimento. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <View style={styles.center}>
        <Text style={styles.doneIcon}>✓</Text>
        <Text style={styles.doneText}>Impedimento registrado com sucesso</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>

      {/* Header */}
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>⚠️ Registrar Impedimento</Text>
        <Text style={styles.headerSubtitle}>
          Informe o motivo pelo qual não é possível atuar nesta máquina agora
        </Text>
      </View>

      {/* Machine info */}
      <View style={styles.machineCard}>
        <InfoRow label="Chassi / PIN"  value={machine.pin ?? machine.custom_name ?? 'N/A'} />
        <InfoRow label="Dias offline"  value={formatDaysOffline(machine.days_offline)} highlight />
        <InfoRow label="Fazenda"       value={org.name} />
      </View>

      {/* Reason selector */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Motivo do impedimento <Text style={styles.required}>*</Text></Text>
        <View style={styles.radioGroup}>
          {REASONS.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[styles.radioItem, selectedReason === r.value && styles.radioItemSelected]}
              onPress={() => setSelectedReason(r.value)}
              activeOpacity={0.75}
            >
              <View style={[styles.radioCircle, selectedReason === r.value && styles.radioCircleSelected]}>
                {selectedReason === r.value && <View style={styles.radioInner} />}
              </View>
              <Text style={[styles.radioLabel, selectedReason === r.value && styles.radioLabelSelected]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {selectedReason === 'outros' && (
          <TextInput
            style={styles.reasonInput}
            value={customReason}
            onChangeText={setCustomReason}
            placeholder="Descreva o motivo"
            placeholderTextColor="#aaa"
          />
        )}
      </View>

      {/* Notes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Observações adicionais</Text>
        <TextInput
          style={styles.notesInput}
          value={notes}
          onChangeText={setNotes}
          placeholder="Informações complementares (opcional)..."
          placeholderTextColor="#aaa"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, (!canSubmit || loading) && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit || loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.submitBtnText}>📋 Registrar Impedimento</Text>}
      </TouchableOpacity>

    </ScrollView>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, highlight && styles.infoValueHighlight]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: '#f5f5f5' },
  container: { padding: 16, gap: 12 },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },

  headerCard: {
    backgroundColor: '#FEF3C7', borderRadius: 12, padding: 16, gap: 6,
    borderWidth: 1.5, borderColor: '#FDE68A',
  },
  headerTitle:    { fontSize: 17, fontWeight: '800', color: '#92400E' },
  headerSubtitle: { fontSize: 13, color: '#78350F', lineHeight: 20 },

  machineCard: {
    backgroundColor: JD_GREEN, borderRadius: 12, padding: 16, gap: 4,
  },
  infoRow:           { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.15)' },
  infoLabel:         { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  infoValue:         { color: '#fff', fontWeight: '700', fontSize: 13 },
  infoValueHighlight:{ color: JD_YELLOW, fontWeight: '800' },

  section: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 10,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  required:     { color: '#ef4444' },

  radioGroup:          { gap: 8 },
  radioItem:           { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 8, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fafafa' },
  radioItemSelected:   { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
  radioCircle:         { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  radioCircleSelected: { borderColor: '#F59E0B' },
  radioInner:          { width: 10, height: 10, borderRadius: 5, backgroundColor: '#F59E0B' },
  radioLabel:          { flex: 1, fontSize: 14, color: '#374151', lineHeight: 20 },
  radioLabelSelected:  { color: '#92400E', fontWeight: '600' },

  reasonInput: {
    borderWidth: 1.5, borderColor: '#FDE68A', borderRadius: 8,
    padding: 12, fontSize: 14, color: '#1a1a1a', backgroundColor: '#FFFBEB',
    marginTop: 4,
  },

  notesInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 12, fontSize: 14, color: '#1a1a1a', minHeight: 80,
    backgroundColor: '#fafafa',
  },

  submitBtn:         { backgroundColor: '#92400E', borderRadius: 12, padding: 18, alignItems: 'center' },
  submitBtnDisabled: { backgroundColor: '#9ca3af' },
  submitBtnText:     { color: '#fff', fontWeight: '700', fontSize: 16 },

  doneIcon: { fontSize: 64, color: JD_GREEN },
  doneText: { fontSize: 18, fontWeight: '700', color: JD_GREEN, marginTop: 16, textAlign: 'center', paddingHorizontal: 24 },
});
