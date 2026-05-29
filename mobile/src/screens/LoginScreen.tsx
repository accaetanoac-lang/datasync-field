import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { getCurrentLocation } from '../services/geolocation';
import { sendGeofence } from '../services/api';
import { queueVisit } from '../services/sync';

const EMPLOYEE_ID_REGEX = /^x\d{6}$/;
const JD_GREEN = '#367C2B';
const JD_YELLOW = '#FFDE00';

export default function LoginScreen() {
  const { login } = useAuth();
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    inputRef.current?.focus();
    captureLocation();
  }, []);

  const captureLocation = async () => {
    const coords = await getCurrentLocation();
    if (!coords) return;
    try {
      await sendGeofence(coords.latitude, coords.longitude);
    } catch {
      await queueVisit({
        tempId: String(Date.now()),
        tech_lat: coords.latitude,
        tech_lng: coords.longitude,
        recorded_at: new Date().toISOString(),
      });
    }
  };

  const handleChange = async (text: string) => {
    const cleaned = text.toLowerCase().replace(/[^x0-9]/g, '');
    setValue(cleaned);
    setError(null);

    if (cleaned.length === 7 && EMPLOYEE_ID_REGEX.test(cleaned)) {
      setLoading(true);
      try {
        await login(cleaned);
        // Navigation handled by AppNavigator via auth state change
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Erro ao autenticar. Verifique seu ID.';
        setError(msg);
        setValue('');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>DataSync</Text>
          <Text style={styles.logoSub}>Field</Text>
        </View>

        <Text style={styles.label}>ID do Funcionário</Text>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={handleChange}
          placeholder="x000000"
          placeholderTextColor="#aaa"
          maxLength={7}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="default"
          editable={!loading}
        />

        {loading && (
          <ActivityIndicator size="large" color={JD_YELLOW} style={styles.spinner} />
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.hint}>
          Digite seu ID no formato x000000.{'\n'}
          O login é automático ao completar 7 dígitos.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: JD_GREEN },
  inner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  logoContainer: { marginBottom: 48, alignItems: 'center' },
  logoText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: JD_YELLOW,
    letterSpacing: 2,
  },
  logoSub: { fontSize: 18, color: '#fff', letterSpacing: 4, marginTop: -4 },
  label: { color: '#fff', fontSize: 16, marginBottom: 8, alignSelf: 'flex-start' },
  input: {
    width: '100%',
    height: 56,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 24,
    letterSpacing: 4,
    color: '#1a1a1a',
    textAlign: 'center',
  },
  spinner: { marginTop: 24 },
  error: { color: JD_YELLOW, marginTop: 16, textAlign: 'center', fontSize: 14 },
  hint: { color: '#ffffff99', marginTop: 32, textAlign: 'center', fontSize: 13, lineHeight: 20 },
});
