import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Modal, Vibration,
  ScrollView,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { searchOrgs, sendGeofence, searchMachines } from '../services/api';
import { MachineSearchResponse } from '../types';
import { getCachedOrgs, setCachedOrgs } from '../services/sync';
import { getCurrentLocation } from '../services/geolocation';
import { useAuth } from '../context/AuthContext';
import { Organization, NearbyOrg } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = StackNavigationProp<RootStackParamList, 'SearchOrg'>;
type SearchMode = 'org' | 'pin';

const JD_GREEN = '#367C2B';
const GEOFENCE_INTERVAL_MS = 5 * 60 * 1000;

export default function SearchOrgScreen() {
  const navigation = useNavigation<Nav>();
  const { clearAuth } = useAuth();
  const inputRef = useRef<TextInput>(null);

  // Org search state
  const [mode, setMode] = useState<SearchMode>('org');
  const [query, setQuery] = useState('');
  const [allOrgs, setAllOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const [showList, setShowList] = useState(false);

  // PIN search state
  const [pinQuery, setPinQuery]       = useState('');
  const [pinResponse, setPinResponse] = useState<MachineSearchResponse | null>(null);
  const [pinLoading, setPinLoading]   = useState(false);
  const [pinSearched, setPinSearched] = useState(false);
  const pinDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Geofence state
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

  const handleModeChange = (newMode: SearchMode) => {
    setMode(newMode);
    if (newMode === 'pin') {
      setShowList(false);
      setQuery('');
    } else {
      if (pinDebounceRef.current) clearTimeout(pinDebounceRef.current);
      setPinQuery('');
      setPinResponse(null);
      setPinSearched(false);
    }
  };

  // Org mode handlers
  const handleSelectOrg = (org: Organization) => {
    setShowList(false);
    navigation.navigate('MachineList', { org });
  };

  // PIN mode handlers
  const handlePinChange = (text: string) => {
    setPinQuery(text);
    if (pinDebounceRef.current) clearTimeout(pinDebounceRef.current);

    if (text.trim().length < 4) {
      setPinResponse(null);
      setPinSearched(false);
      return;
    }

    pinDebounceRef.current = setTimeout(async () => {
      setPinLoading(true);
      try {
        const response = await searchMachines(text.trim());
        setPinResponse(response);
        setPinSearched(true);
      } catch {
        setPinResponse({ found: false });
        setPinSearched(true);
      } finally {
        setPinLoading(false);
      }
    }, 400);
  };

  const handlePinSelect = (response: MachineSearchResponse) => {
    if (!response.found || !response.machine) return;
    const { source, machine } = response;

    if (source === 'non_jd') {
      navigation.navigate('NonJDMachine', {
        prefillNonJd: {
          id: machine.id,
          serial_number: machine.pin,
          custom_name: machine.custom_name ?? machine.pin ?? '',
          brand: machine.brand,
          model: machine.modelo,
        },
      });
    } else {
      const org: Organization = {
        id: machine.org_id ?? 0,
        org_id_jd: '',
        name: machine.org_name ?? 'Sem organização',
      };
      navigation.navigate('MachineDetail', { machine, org });
    }
  };

  // Geofence modal handlers
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
      {/* Mode toggle */}
      <View style={styles.toggle}>
        <TouchableOpacity
          style={[styles.toggleBtn, mode === 'org' && styles.toggleBtnActive]}
          onPress={() => handleModeChange('org')}
        >
          <Text style={[styles.toggleText, mode === 'org' && styles.toggleTextActive]}>
            🏢 Organização
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, mode === 'pin' && styles.toggleBtnActive]}
          onPress={() => handleModeChange('pin')}
        >
          <Text style={[styles.toggleText, mode === 'pin' && styles.toggleTextActive]}>
            🔧 PIN / Chassi
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Org search mode ── */}
      {mode === 'org' && (
        <>
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
                    onPress={() => handleSelectOrg(item)}
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
        </>
      )}

      {/* ── PIN / Chassi search mode ── */}
      {mode === 'pin' && (
        <>
          <TextInput
            style={[styles.searchInput, pinQuery.length > 0 && styles.searchInputActive]}
            value={pinQuery}
            onChangeText={handlePinChange}
            placeholder="Digite o PIN ou chassi da máquina"
            placeholderTextColor="#aaa"
            autoCorrect={false}
            autoCapitalize="characters"
            autoFocus={false}
          />

          {pinLoading && (
            <ActivityIndicator color={JD_GREEN} style={{ marginVertical: 8 }} />
          )}

          {pinSearched && !pinLoading && pinResponse?.found && pinResponse.machine && (
            <TouchableOpacity
              style={styles.machineCard}
              onPress={() => handlePinSelect(pinResponse)}
              activeOpacity={0.7}
            >
              <View style={styles.machineCardTop}>
                <Text style={styles.machinePin} numberOfLines={1}>
                  {pinResponse.machine.pin ?? pinResponse.machine.custom_name ?? 'Sem identificação'}
                </Text>
                {pinResponse.source === 'jd_unlinked' && (
                  <View style={styles.sourceBadgeJD}>
                    <Text style={styles.sourceBadgeText}>JD s/ org</Text>
                  </View>
                )}
                {pinResponse.source === 'non_jd' && (
                  <View style={styles.sourceBadgeNonJD}>
                    <Text style={styles.sourceBadgeText}>Não-JD</Text>
                  </View>
                )}
                {pinResponse.machine.days_offline != null && (
                  <View style={[styles.offlineBadge,
                    pinResponse.machine.days_offline > 60 ? styles.badgeRed : styles.badgeYellow]}>
                    <Text style={styles.offlineBadgeText}>{pinResponse.machine.days_offline}d</Text>
                  </View>
                )}
              </View>
              <Text style={styles.machineOrg} numberOfLines={1}>
                {pinResponse.machine.org_name || 'Sem organização'}
              </Text>
              {pinResponse.machine.last_call_date && (
                <Text style={styles.machineMeta}>
                  Última conexão: {new Date(pinResponse.machine.last_call_date).toLocaleDateString('pt-BR')}
                  {pinResponse.machine.machine_hours != null
                    ? `  ·  ${pinResponse.machine.machine_hours} h` : ''}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {pinSearched && !pinLoading && pinResponse && !pinResponse.found && (
            <View style={styles.pinEmpty}>
              <Text style={styles.pinEmptyTitle}>Máquina não encontrada</Text>
              <Text style={styles.pinEmptyText}>
                Nenhum resultado para "{pinQuery}"
              </Text>
              <TouchableOpacity
                style={styles.jdFromPinButton}
                onPress={() => navigation.navigate('JDMachineForm', { prefillPin: pinQuery })}
              >
                <Text style={styles.jdFromPinText}>+ Cadastrar como máquina John Deere</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.nonJDFromPinButton}
                onPress={() => navigation.navigate('NonJDMachine', { prefillPin: pinQuery })}
              >
                <Text style={styles.nonJDFromPinText}>+ Cadastrar como máquina não-JD</Text>
              </TouchableOpacity>
            </View>
          )}
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

  // Mode toggle
  toggle: {
    flexDirection: 'row',
    backgroundColor: '#e5e7eb',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  toggleTextActive: { color: JD_GREEN },

  // Shared search input
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

  // Org dropdown
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

  // PIN search results
  pinList: {
    marginTop: 4,
    maxHeight: 420,
  },
  machineCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  machineCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  machinePin: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', flex: 1, marginRight: 8 },
  offlineBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeYellow: { backgroundColor: '#fef3c7' },
  badgeRed: { backgroundColor: '#fee2e2' },
  offlineBadgeText: { fontSize: 12, fontWeight: '700', color: '#1a1a1a' },
  machineOrg: { fontSize: 13, color: JD_GREEN, fontWeight: '600', marginBottom: 4 },
  machineMeta: { fontSize: 12, color: '#888' },

  // Source badges on found machine card
  sourceBadgeJD: {
    backgroundColor: '#fef9c3', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, marginRight: 4,
  },
  sourceBadgeNonJD: {
    backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, marginRight: 4,
  },
  sourceBadgeText: { fontSize: 11, fontWeight: '700', color: '#374151' },

  // PIN empty state
  pinEmpty: {
    marginTop: 24,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  pinEmptyTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 6 },
  pinEmptyText: { fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 20 },
  jdFromPinButton: {
    backgroundColor: JD_GREEN,
    borderRadius: 8,
    paddingVertical: 13,
    paddingHorizontal: 24,
    marginBottom: 10,
  },
  jdFromPinText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  nonJDFromPinButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingVertical: 13,
    paddingHorizontal: 24,
  },
  nonJDFromPinText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Bottom buttons
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

  // Geofence modal
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
