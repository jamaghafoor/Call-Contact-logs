/**
 * Contacts & Call History Sync Screen
 *
 * @format
 */

import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  StatusBar,
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
  NativeModules,
  ActivityIndicator,
  RefreshControl,
  AppState,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

const {ContactsCallLogModule} = NativeModules;

// ─── API Config ──────────────────────────────────────────────────────────────
const API_BASE_URL = Platform.select({
  android: 'https://calllogs.vercel.app',
  default: 'https://calllogs.vercel.app',
});

// Cache the real device ID once fetched from native module
let cachedDeviceId: string | null = null;

async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }
  try {
    if (ContactsCallLogModule?.getDeviceInfo) {
      const info = await ContactsCallLogModule.getDeviceInfo();
      if (info?.label && info?.androidId) {
        const id = `${info.label} (${info.androidId})`;
        cachedDeviceId = id;
        return id;
      } else if (info?.androidId) {
        const id = String(info.androidId);
        cachedDeviceId = id;
        return id;
      }
    }
  } catch (err) {
    console.warn('Failed to get real device info:', err);
  }
  const fallback = `${Platform.OS}-${Platform.Version || 'device'}`;
  cachedDeviceId = fallback;
  return fallback;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Contact {
  id: string;
  name: string;
  phoneNumber: string;
  photoUri: string | null;
}

interface CallLogEntry {
  id: string;
  name: string;
  phoneNumber: string;
  type: string;
  dateTimestamp: number;
  duration: number;
}

type ActiveTab = 'contacts' | 'callHistory';

// ─── Requesting Permissions ──────────────────────────────────────────────────

async function checkContactsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  try {
    return await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
    );
  } catch {
    return false;
  }
}

async function checkCallLogPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  try {
    const hasCallLog = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
    );
    const hasPhoneState = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
    );
    return hasCallLog && hasPhoneState;
  } catch {
    return false;
  }
}

async function requestContactsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
      {
        title: 'Contacts Permission',
        message: 'This app needs access to your contacts to fetch and sync them.',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

async function requestCallLogPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  try {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
      PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
    ]);
    return (
      results[PermissionsAndroid.PERMISSIONS.READ_CALL_LOG] ===
        PermissionsAndroid.RESULTS.GRANTED &&
      results[PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE] ===
        PermissionsAndroid.RESULTS.GRANTED
    );
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── API Upload Helpers ──────────────────────────────────────────────────────

async function syncContactsToServer(contacts: Contact[]): Promise<boolean> {
  if (!contacts || contacts.length === 0) {
    return false;
  }
  try {
    const deviceId = await getDeviceId();
    const response = await fetch(`${API_BASE_URL}/api/contacts/sync`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({deviceId, contacts}),
    });
    const data = await response.json();
    if (!data.success) {
      console.warn('Contacts sync warning:', data.message);
      return false;
    } else {
      console.log(`Contacts synced for ${deviceId}: ${data.upserted} new, ${data.updated} updated`);
      return true;
    }
  } catch (error: any) {
    console.warn('Failed to sync contacts to server:', error.message);
    return false;
  }
}

async function syncCallLogsToServer(callLogs: CallLogEntry[]): Promise<boolean> {
  if (!callLogs || callLogs.length === 0) {
    return false;
  }
  try {
    const deviceId = await getDeviceId();
    const response = await fetch(`${API_BASE_URL}/api/call-logs/sync`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({deviceId, callLogs}),
    });
    const data = await response.json();
    if (!data.success) {
      console.warn('Call logs sync warning:', data.message);
      return false;
    } else {
      console.log(`Call logs synced for ${deviceId}: ${data.upserted} new, ${data.updated} updated`);
      return true;
    }
  } catch (error: any) {
    console.warn('Failed to sync call logs to server:', error.message);
    return false;
  }
}

// ─── UI Components ───────────────────────────────────────────────────────────

function PermissionDenied({
  onRetry,
  message,
}: {
  onRetry: () => void;
  message: string;
}) {
  return (
    <View style={styles.centerContainer}>
      <Text style={styles.stateIcon}>🔒</Text>
      <Text style={styles.stateTitle}>Permission Required</Text>
      <Text style={styles.stateSubtitle}>{message}</Text>
      <TouchableOpacity style={styles.primaryButton} onPress={onRetry}>
        <Text style={styles.primaryButtonText}>Grant Permission</Text>
      </TouchableOpacity>
    </View>
  );
}

function SyncStatusMessage({
  title,
  subtitle,
  count,
  unit,
  syncedAt,
  deviceLabel,
  onRefresh,
  refreshing,
  loading,
}: {
  title: string;
  subtitle: string;
  count: number;
  unit: string;
  syncedAt: string;
  deviceLabel: string;
  onRefresh: () => void;
  refreshing: boolean;
  loading: boolean;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#6C63FF']}
          tintColor="#6C63FF"
        />
      }>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Text style={styles.checkIcon}>✓</Text>
        </View>

        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Total {unit}</Text>
            <Text style={styles.statNumber}>{count}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Server Status</Text>
            <Text style={[styles.statNumber, {color: '#4CAF50'}]}>Uploaded</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailList}>
          {syncedAt !== '' && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Last Synced</Text>
              <Text style={styles.detailValue}>{syncedAt}</Text>
            </View>
          )}

          {deviceLabel !== '' && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Source Device</Text>
              <Text style={styles.detailValue} numberOfLines={1}>
                {deviceLabel}
              </Text>
            </View>
          )}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Destination</Text>
            <Text style={styles.detailValue}>MongoDB (HelpBot)</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.resyncButton}
          onPress={onRefresh}
          disabled={loading || refreshing}
          activeOpacity={0.8}>
          {loading || refreshing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.resyncButtonText}>🔄 Sync Again</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function EmptyDataMessage({
  icon,
  title,
  subtitle,
  onRefresh,
}: {
  icon: string;
  title: string;
  subtitle: string;
  onRefresh: () => void;
}) {
  return (
    <View style={styles.centerContainer}>
      <Text style={styles.stateIcon}>{icon}</Text>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateSubtitle}>{subtitle}</Text>
      <TouchableOpacity style={styles.primaryButton} onPress={onRefresh}>
        <Text style={styles.primaryButtonText}>🔄 Check Again</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const mountedRef = useRef(true);

  const [activeTab, setActiveTab] = useState<ActiveTab>('contacts');
  const [contactsCount, setContactsCount] = useState<number>(0);
  const [callLogCount, setCallLogCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [contactsPermission, setContactsPermission] = useState(false);
  const [callLogPermission, setCallLogPermission] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [deviceLabel, setDeviceLabel] = useState<string>('');
  const [contactsSynced, setContactsSynced] = useState(false);
  const [callLogSynced, setCallLogSynced] = useState(false);
  const [contactsSyncedAt, setContactsSyncedAt] = useState<string>('');
  const [callLogSyncedAt, setCallLogSyncedAt] = useState<string>('');

  const contactsLoadedRef = useRef(false);
  const callLogLoadedRef = useRef(false);

  // ── Fetch contacts & sync to server ──
  const fetchContacts = useCallback(async () => {
    try {
      setSyncStatus('Fetching contacts...');
      const data = await ContactsCallLogModule.getContacts();
      if (!mountedRef.current) return;
      setContactsCount(data ? data.length : 0);
      contactsLoadedRef.current = true;
      setContactsSynced(false);

      if (data && data.length > 0) {
        setSyncStatus('Uploading contacts to server...');
        const success = await syncContactsToServer(data);
        if (mountedRef.current) {
          setSyncStatus('');
          if (success) {
            setContactsSynced(true);
            setContactsSyncedAt(
              new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            );
          }
        }
      } else {
        if (mountedRef.current) setSyncStatus('');
      }
    } catch (error: any) {
      console.warn('Failed to fetch contacts:', error.message);
      if (mountedRef.current) setSyncStatus('');
    }
  }, []);

  // ── Fetch call logs & sync to server ──
  const fetchCallLog = useCallback(async () => {
    try {
      setSyncStatus('Fetching call history...');
      const data = await ContactsCallLogModule.getCallLog(100);
      if (!mountedRef.current) return;
      setCallLogCount(data ? data.length : 0);
      callLogLoadedRef.current = true;
      setCallLogSynced(false);

      if (data && data.length > 0) {
        setSyncStatus('Uploading call logs to server...');
        const success = await syncCallLogsToServer(data);
        if (mountedRef.current) {
          setSyncStatus('');
          if (success) {
            setCallLogSynced(true);
            setCallLogSyncedAt(
              new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            );
          }
        }
      } else {
        if (mountedRef.current) setSyncStatus('');
      }
    } catch (error: any) {
      console.warn('Failed to fetch call log:', error.message);
      if (mountedRef.current) setSyncStatus('');
    }
  }, []);

  // ── Ensure permissions & load ──
  const ensureContactsPermissionAndLoad = useCallback(async () => {
    let granted = await checkContactsPermission();
    if (!granted) {
      granted = await requestContactsPermission();
      await delay(500);
      if (!granted) {
        granted = await checkContactsPermission();
      }
    }
    if (!mountedRef.current) return;
    setContactsPermission(granted);
    if (granted) {
      await fetchContacts();
    }
  }, [fetchContacts]);

  const ensureCallLogPermissionAndLoad = useCallback(async () => {
    let granted = await checkCallLogPermission();
    if (!granted) {
      granted = await requestCallLogPermission();
      await delay(500);
      if (!granted) {
        granted = await checkCallLogPermission();
      }
    }
    if (!mountedRef.current) return;
    setCallLogPermission(granted);
    if (granted) {
      await fetchCallLog();
    }
  }, [fetchCallLog]);

  const retryContactsPermission = useCallback(async () => {
    setLoading(true);
    await ensureContactsPermissionAndLoad();
    if (!mountedRef.current) return;
    setLoading(false);
  }, [ensureContactsPermissionAndLoad]);

  const retryCallLogPermission = useCallback(async () => {
    setLoading(true);
    await ensureCallLogPermissionAndLoad();
    if (!mountedRef.current) return;
    setLoading(false);
  }, [ensureCallLogPermissionAndLoad]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function init() {
      const id = await getDeviceId();
      if (!cancelled) setDeviceLabel(id);

      await ensureContactsPermissionAndLoad();
      if (cancelled) return;
      await ensureCallLogPermissionAndLoad();
      if (cancelled) return;
      setLoading(false);
    }

    init();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [ensureContactsPermissionAndLoad, ensureCallLogPermissionAndLoad]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async nextState => {
      if (nextState === 'active') {
        if (!contactsLoadedRef.current) {
          const hasContacts = await checkContactsPermission();
          if (hasContacts && mountedRef.current) {
            setContactsPermission(true);
            fetchContacts();
          }
        }
        if (!callLogLoadedRef.current) {
          const hasCallLog = await checkCallLogPermission();
          if (hasCallLog && mountedRef.current) {
            setCallLogPermission(true);
            fetchCallLog();
          }
        }
      }
    });
    return () => subscription.remove();
  }, [fetchContacts, fetchCallLog]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const promises: Promise<void>[] = [];
    if (contactsPermission) promises.push(fetchContacts());
    if (callLogPermission) promises.push(fetchCallLog());
    await Promise.all(promises);
    if (mountedRef.current) setRefreshing(false);
  }, [contactsPermission, callLogPermission, fetchContacts, fetchCallLog]);

  return (
    <View style={[styles.container, {paddingTop: insets.top}]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Data Sync</Text>
        <View style={styles.headerMeta}>
          <Text style={styles.headerCount}>
            {activeTab === 'contacts'
              ? contactsSynced
                ? `${contactsCount} contacts uploaded`
                : 'Contacts Sync'
              : callLogSynced
                ? `${callLogCount} calls uploaded`
                : 'Call History Sync'}
          </Text>
          {deviceLabel !== '' && (
            <Text style={styles.deviceLabel} numberOfLines={1}>
              📱 {deviceLabel}
            </Text>
          )}
        </View>
        {syncStatus !== '' && (
          <View style={styles.syncBadge}>
            <ActivityIndicator size="small" color="#6C63FF" />
            <Text style={styles.syncText}>{syncStatus}</Text>
          </View>
        )}
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'contacts' && styles.activeTab]}
          onPress={() => setActiveTab('contacts')}
          activeOpacity={0.7}>
          <Text style={styles.tabIcon}>👤</Text>
          <Text
            style={[
              styles.tabText,
              activeTab === 'contacts' && styles.activeTabText,
            ]}>
            Contacts
          </Text>
          {contactsSynced && <Text style={styles.tabSyncedDot}>✓</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'callHistory' && styles.activeTab,
          ]}
          onPress={() => setActiveTab('callHistory')}
          activeOpacity={0.7}>
          <Text style={styles.tabIcon}>📞</Text>
          <Text
            style={[
              styles.tabText,
              activeTab === 'callHistory' && styles.activeTabText,
            ]}>
            Call History
          </Text>
          {callLogSynced && <Text style={styles.tabSyncedDot}>✓</Text>}
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#6C63FF" />
          <Text style={styles.loadingText}>
            {syncStatus || 'Loading...'}
          </Text>
        </View>
      ) : activeTab === 'contacts' ? (
        !contactsPermission ? (
          <PermissionDenied
            message="Contacts permission is required to fetch and upload your contacts to the server."
            onRetry={retryContactsPermission}
          />
        ) : contactsSynced ? (
          <SyncStatusMessage
            title="Contacts Uploaded Successfully"
            subtitle="Your contacts list was fetched from this phone and uploaded to the server."
            count={contactsCount}
            unit="Contacts"
            syncedAt={contactsSyncedAt}
            deviceLabel={deviceLabel}
            onRefresh={onRefresh}
            refreshing={refreshing}
            loading={loading}
          />
        ) : contactsCount === 0 && !syncStatus ? (
          <EmptyDataMessage
            icon="📭"
            title="No Contacts Found"
            subtitle="No contacts were found on this phone to upload."
            onRefresh={onRefresh}
          />
        ) : (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#6C63FF" />
            <Text style={styles.loadingText}>
              {syncStatus || 'Uploading contacts to server...'}
            </Text>
          </View>
        )
      ) : !callLogPermission ? (
        <PermissionDenied
          message="Call log permission is required to fetch and upload your call history to the server."
          onRetry={retryCallLogPermission}
        />
      ) : callLogSynced ? (
        <SyncStatusMessage
          title="Call History Uploaded Successfully"
          subtitle="Your call history was fetched from this phone and uploaded to the server."
          count={callLogCount}
          unit="Calls"
          syncedAt={callLogSyncedAt}
          deviceLabel={deviceLabel}
          onRefresh={onRefresh}
          refreshing={refreshing}
          loading={loading}
        />
      ) : callLogCount === 0 && !syncStatus ? (
        <EmptyDataMessage
          icon="📵"
          title="No Call History Found"
          subtitle="No call logs were found on this phone to upload."
          onRefresh={onRefresh}
        />
      ) : (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#6C63FF" />
          <Text style={styles.loadingText}>
            {syncStatus || 'Uploading call history to server...'}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  headerCount: {
    fontSize: 14,
    color: '#8888AA',
  },
  deviceLabel: {
    fontSize: 12,
    color: '#6C63FF',
    fontWeight: '500',
    maxWidth: '65%',
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  syncText: {
    fontSize: 12,
    color: '#6C63FF',
    fontWeight: '500',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  activeTab: {
    backgroundColor: '#6C63FF',
  },
  tabIcon: {
    fontSize: 16,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8888AA',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  tabSyncedDot: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 2,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  card: {
    backgroundColor: '#16162a',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#242442',
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(76, 175, 80, 0.18)',
    borderWidth: 2,
    borderColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  checkIcon: {
    color: '#4CAF50',
    fontSize: 34,
    fontWeight: '900',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#8888AA',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  statsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#1f1f38',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a4c',
  },
  statLabel: {
    fontSize: 11,
    color: '#8888AA',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#242442',
    marginVertical: 14,
  },
  detailList: {
    width: '100%',
    gap: 10,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 13,
    color: '#8888AA',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    maxWidth: '60%',
    textAlign: 'right',
  },
  resyncButton: {
    width: '100%',
    backgroundColor: '#6C63FF',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resyncButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    color: '#8888AA',
    marginTop: 14,
    fontSize: 14,
    textAlign: 'center',
  },
  stateIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  stateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  stateSubtitle: {
    fontSize: 14,
    color: '#8888AA',
    textAlign: 'center',
    lineHeight: 20,
  },
  primaryButton: {
    marginTop: 20,
    backgroundColor: '#6C63FF',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default App;
