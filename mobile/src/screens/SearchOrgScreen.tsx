import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
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
  const { clearAuth } = useAuth();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState('');
  const [allOrgs, setAllOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const [showList, setShowList] = useState(false);

  const filtered = query.trim() === ''
    ? allOrgs
    : allOrgs.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()));

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const orgs = await searchOrgs('');
      setAllOrgs(orgs);
      await setCachedOrgs(orgs);
    } catch {
      const cached = await getCachedOrgs('');
      if (cached) {
        setAllOrgs(cached.data);
      } else {
        Alert.alert('Sem conexão', 'Não foi possível carregar organizações.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useFocusEffect(useCallback(() => {
    return () => {
      setShowList(false);
      setQuery('');
    };
  }, []));

  const handleSelect = (org: Organization) => {
    setShowList(false);
    navigation.navigate('MachineList', { org });
  };

  return (
    // Plain View — no TouchableWithoutFeedback so the TextInput is focusable on web
    <View style={styles.container}>

      {/* TextInput is NOT nested inside any Touchable.
          zIndex: 30 keeps it above the backdrop when the dropdown is open. */}
      <TextInput
        ref={inputRef}
        style={[styles.searchInput, showList && styles.searchInputActive]}
        value={query}
        onChangeText={setQuery}
        onFocus={() => setShowList(true)}
        placeholder="Buscar organização..."
        placeholderTextColor="#aaa"
        autoCorrect={false}
        autoCapitalize="none"
        autoFocus={false}
      />

      {loading && (
        <ActivityIndicator color={JD_GREEN} style={{ marginVertical: 8 }} />
      )}

      {showList && !loading && (
        <>
          {/* Transparent backdrop — sits behind the dropdown (zIndex 10).
              onTouchStart closes the list when the user taps outside. */}
          <View
            style={styles.backdrop}
            onTouchStart={() => setShowList(false)}
          />

          {/* Dropdown — rendered after backdrop so it paints on top (zIndex 20).
              keyboardShouldPersistTaps="handled" lets list items receive taps
              even while the keyboard is open on native. */}
          <FlatList
            style={styles.list}
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.orgCard}
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
              >
                <Text style={styles.orgName} numberOfLines={1}>{item.name}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {item.offline_machine_count ?? 0} offline
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {query.length > 0
                  ? 'Nenhuma organização encontrada.'
                  : 'Nenhuma organização com máquinas offline.'}
              </Text>
            }
          />
        </>
      )}

      <View style={{ flex: 1 }} />

      <TouchableOpacity
        style={styles.nonJDButton}
        onPress={() => navigation.navigate('NonJDMachine', {})}
      >
        <Text style={styles.nonJDButtonText}>+ Máquina não-JD</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={clearAuth}>
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
    borderWidth: 1.5,
    borderColor: '#ddd',
    color: '#1a1a1a',
    // Must be above backdrop (10) and dropdown (20) so pointer events always reach the input
    zIndex: 30,
  },
  searchInputActive: {
    borderColor: JD_GREEN,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },

  // Transparent full-screen overlay rendered behind the dropdown.
  // Catches any tap outside the dropdown to dismiss it.
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },

  // Dropdown sits above the backdrop in both render order and zIndex.
  list: {
    zIndex: 20,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: JD_GREEN,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    maxHeight: 380,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },

  orgCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  orgName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a', flex: 1, marginRight: 8 },
  badge: {
    backgroundColor: JD_GREEN,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 62,
    alignItems: 'center',
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  empty: { textAlign: 'center', color: '#888', padding: 24, fontSize: 14 },

  nonJDButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 4,
  },
  nonJDButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  logoutButton: { padding: 14, alignItems: 'center' },
  logoutText: { color: '#888', fontSize: 14 },
});
