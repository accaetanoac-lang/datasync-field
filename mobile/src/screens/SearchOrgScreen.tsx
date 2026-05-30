import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Modal, Vibration,
  ScrollView,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { searchOrgs, sendGeofence } from '../services/api';
import { getCachedOrgs, setCachedOrgs } from '../services/sync';
import { getCurrentLocation } from '../services/geolocation';
import { useAuth } from '../context/AuthContext';
import { Organization, NearbyOrg } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = StackNavigationProp<RootStackParamList, 'SearchOrg'>;

const JD_GREEN = '#367C2B';
const GEOFENCE_INTERVAL_MS = 5 * 60 * 1000;

export default function SearchOrgScreen() {
  const navigation = useNavigation<Nav>();
  const { clearAuth } = useAuth();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState('');
  const [allOrgs, setAllOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const [showList, setShowList] = useState(false);

  // Geofence alert state
  const [nearbyOrgs, setNearbyOrgs] = useState<NearbyOrg[]>([]);
  const [showGeofenceModal, setShowGeofenceModal] = useState(false);
  const dismissedOrgIds = useRef<Set<number>>(new Set());

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

  const checkGeofence = useCallback(async () => {
    try {
      const coords = await getCurrentLocation();
      if (!coords) return;

      const result = await sendGeofence(coords.latitude, coords.longitude);
      const newOrgs = result.nearby_orgs.filter(
        (o) => !dismissedOrgIds.current.has(o.org_id)
      );

      if (newOrgs.length > 0) {
        setNearbyOrgs(newOrgs);
        setShowGeofenceModal(true);
        Vibration.vibrate([0, 400, 150, 400]);
      }
    } catch {
      // Geofence check is best-effort — silent on failure
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAll();
      checkGeofence();
      const interval = setInterval(checkGeofence, GEOFENCE_INTERVAL_MS);

      return () => {
        clearInterval(interval);
        setShowList(false);
        setQuery('');
      };
    }, [loadAll, checkGeofence])
  );

  const handleSelect = (org: Organization) => {
    setShowList(false);
    navigation.navigate('MachineList', { org });
  };

  const handleViewMachines = (nearby: NearbyOrg) => {
    dismissedOrgIds.current.add(nearby.org_id);
    setShowGeofenceModal(false);
    const org: Organization = {
      id: nearby.org_id,
      org_id_jd: '',
      name: nearby.org_name,
      offline_machine_count: nearby.pending_machines.length,
    };
    navigation.navigate('MachineList', { org });
  };

  const handleIgnoreAll = () => {
    nearbyOrgs.forEach((o) => dismissedOrgIds.current.add(o.org_id));
    setShowGeofenceModal(false);
  };

  return (
    <View style={styles.container}>
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
          <View
            style={styles.backdrop}
            onTouchStart={() => setShowList(false)}
          />
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

      {/* Geofence nearby-farms alert */}
      <Modal
        visible={showGeofenceModal}
        transparent
        animationType="slide"
        onRequestClose={handleIgnoreAll}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalIcon}>🚨</Text>
              <Text style={styles.modalTitle}>Máquinas para coletar!</Text>
              <Text style={styles.modalSubtitle}>
                Você está próximo de fazendas com máquinas offline pendentes.
              </Text>
            </View>

            <ScrollView style={styles.orgList} showsVerticalScrollIndicator={false}>
              {nearbyOrgs.map((nearby) => (
                <View key={nearby.org_id} style={styles.nearbyOrgRow}>
                  <View style={styles.nearbyOrgInfo}>
                    <Text style={styles.nearbyOrgName} numberOfLines={1}>
                      {nearby.org_name}
                    </Text>
                    <Text style={styles.nearbyOrgDetail}>
                      {nearby.pending_machines.length}{' '}
                      máquina{nearby.pending_machines.length !== 1 ? 's' : ''} pendente{nearby.pending_machines.length !== 1 ? 's' : ''}
                      {'  ·  '}{nearby.distance_km} km
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.viewButton}
                    onPress={() => handleViewMachines(nearby)}
                  >
                    <Text style={styles.viewButtonText}>Ver</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.ignoreButton} onPress={handleIgnoreAll}>
              <Text style={styles.ignoreButtonText}>Ignorar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    zIndex: 30,
  },
  searchInputActive: {
    borderColor: JD_GREEN,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },

  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 10,
  },

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

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 36,
    maxHeight: '80%',
  },
  modalHeader: { alignItems: 'center', marginBottom: 20 },
  modalIcon: { fontSize: 40, marginBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },
  modalSubtitle: { fontSize: 13, color: '#666', textAlign: 'center', marginTop: 6 },

  orgList: { maxHeight: 300, marginBottom: 16 },

  nearbyOrgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 12,
  },
  nearbyOrgInfo: { flex: 1 },
  nearbyOrgName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  nearbyOrgDetail: { fontSize: 12, color: '#888', marginTop: 2 },

  viewButton: {
    backgroundColor: JD_GREEN,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  viewButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  ignoreButton: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  ignoreButtonText: { color: '#888', fontWeight: '600', fontSize: 15 },
});
