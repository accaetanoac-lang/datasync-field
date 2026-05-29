import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { searchOrgs } from '../services/api';
import { getCachedOrgs, setCachedOrgs } from '../services/sync';
import { useAuth } from '../context/AuthContext';
import { Organization } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = StackNavigationProp<RootStackParamList, 'SearchOrg'>;

const JD_GREEN = '#367C2B';

export default function SearchOrgScreen() {
  const navigation = useNavigation<Nav>();
  const { logout } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (text: string) => {
    if (text.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const orgs = await searchOrgs(text);
      setResults(orgs);
      await setCachedOrgs(orgs);
    } catch {
      // Try cache on error
      const cached = await getCachedOrgs(text);
      if (cached) {
        const filtered = cached.data.filter((o) =>
          o.name.toLowerCase().includes(text.toLowerCase())
        );
        setResults(filtered);
      } else {
        Alert.alert('Sem conexão', 'Sem conexão e sem cache disponível.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (text: string) => {
    setQuery(text);
    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => doSearch(text), 300);
    setDebounceTimer(timer);
  };

  useEffect(() => () => { if (debounceTimer) clearTimeout(debounceTimer); }, [debounceTimer]);

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        value={query}
        onChangeText={handleChange}
        placeholder="Buscar organização (min. 2 caracteres)"
        placeholderTextColor="#aaa"
        autoCorrect={false}
      />

      {loading && <ActivityIndicator color={JD_GREEN} style={{ marginVertical: 8 }} />}

      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.orgCard}
            onPress={() => navigation.navigate('MachineList', { org: item })}
          >
            <Text style={styles.orgName}>{item.name}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {item.offline_machine_count ?? 0} máquinas offline
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading && query.length >= 2 ? (
            <Text style={styles.empty}>Nenhuma organização encontrada.</Text>
          ) : null
        }
      />

      <TouchableOpacity
        style={styles.nonJDButton}
        onPress={() => navigation.navigate('NonJDMachine', {})}
      >
        <Text style={styles.nonJDButtonText}>+ Máquina não-JD</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Sair</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  searchInput: {
    height: 48,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    color: '#1a1a1a',
  },
  orgCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  orgName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a', flex: 1 },
  badge: {
    backgroundColor: '#367C2B',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#888', marginTop: 32, fontSize: 15 },
  nonJDButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  nonJDButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  logoutButton: { padding: 14, alignItems: 'center', marginTop: 4 },
  logoutText: { color: '#888', fontSize: 14 },
});
