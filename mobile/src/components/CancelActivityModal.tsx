import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
} from 'react-native';

interface Props {
  visible: boolean;
  onConfirm: (reason: string) => void;
  onDismiss: () => void;
}

export default function CancelActivityModal({ visible, onConfirm, onDismiss }: Props) {
  const [reason, setReason] = useState('');
  const [showError, setShowError] = useState(false);

  const handleConfirm = () => {
    if (!reason.trim()) {
      setShowError(true);
      return;
    }
    onConfirm(reason.trim());
    setReason('');
    setShowError(false);
  };

  const handleDismiss = () => {
    setReason('');
    setShowError(false);
    onDismiss();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Cancelar atendimento?</Text>
          <Text style={styles.subtitle}>A máquina voltará para a lista de pendentes.</Text>
          <TextInput
            style={[styles.input, showError && styles.inputError]}
            value={reason}
            onChangeText={(t) => { setReason(t); if (t.trim()) setShowError(false); }}
            placeholder="Motivo do cancelamento (obrigatório)"
            placeholderTextColor="#aaa"
            multiline
            numberOfLines={2}
            textAlignVertical="top"
          />
          {showError && (
            <Text style={styles.errorText}>Informe o motivo para cancelar</Text>
          )}
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.btnNo} onPress={handleDismiss}>
              <Text style={styles.btnNoText}>Não</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnYes, !reason.trim() && styles.btnYesDisabled]}
              onPress={handleConfirm}
            >
              <Text style={styles.btnYesText}>Sim, cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    gap: 14,
  },
  title:    { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  subtitle: { fontSize: 14, color: '#555', lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1a1a1a',
    minHeight: 60,
  },
  buttons:    { flexDirection: 'row', gap: 12, marginTop: 4 },
  btnNo: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  btnNoText:  { color: '#555', fontWeight: '600', fontSize: 15 },
  inputError: { borderColor: '#ef4444' },
  errorText:  { fontSize: 12, color: '#ef4444', marginTop: -8 },

  btnYes: {
    flex: 1,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  btnYesDisabled: { backgroundColor: '#fca5a5' },
  btnYesText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
