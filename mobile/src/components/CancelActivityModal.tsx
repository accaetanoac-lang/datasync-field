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

  const handleConfirm = () => {
    onConfirm(reason.trim());
    setReason('');
  };

  const handleDismiss = () => {
    setReason('');
    onDismiss();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Cancelar atendimento?</Text>
          <Text style={styles.subtitle}>A máquina voltará para a lista de pendentes.</Text>
          <TextInput
            style={styles.input}
            value={reason}
            onChangeText={setReason}
            placeholder="Motivo (opcional)"
            placeholderTextColor="#aaa"
            multiline
            numberOfLines={2}
            textAlignVertical="top"
          />
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.btnNo} onPress={handleDismiss}>
              <Text style={styles.btnNoText}>Não</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnYes} onPress={handleConfirm}>
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
  btnYes: {
    flex: 1,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  btnYesText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
