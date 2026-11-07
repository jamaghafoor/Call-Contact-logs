/**
 * Contacts & Call History Screen
 *
 * @format
 */

import React, {useState, useEffect, useCallback} from 'react';
import {
  StatusBar,
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
  NativeModules,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

const {ContactsCallLogModule} = NativeModules;

// ─── API Config ──────────────────────────────────────────────────────────────
// For Android emulator, 10.0.2.2 maps to the host machine's localhost.
// For a physical device, replace with your computer's local IP address.
const API_BASE_URL = Platform.select({
  android: 'http://10.0.2.2:3000',
  default: 'http://localhost:3000',
});

// A simple device identifier — in production use a real device ID library
const DEVICE_ID = 'android-device-001';

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
  type: 'INCOMING' | 'OUTGOING' | 'MISSED' | 'REJECTED' | 'BLOCKED' | 'VOICEMAIL' | 'UNKNOWN';
  dateTimestamp: number;
  duration: number;
}

type ActiveTab = 'contacts' | 'callHistory';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCallTypeIcon(type: CallLogEntry['type']): string {
  switch (type) {
    case 'INCOMING':
      return '📲';
    case 'OUTGOING':
      return '📤';
    case 'MISSED':
      return '📵';
    case 'REJECTED':
      return '🚫';
    case 'BLOCKED':
      return '⛔';
    case 'VOICEMAIL':
      return '📧';
    default:
      return '📞';
  }
}

function getCallTypeColor(type: CallLogEntry['type']): string {
  switch (type) {
    case 'INCOMING':
      return '#4CAF50';
    case 'OUTGOING':
      return '#2196F3';
    case 'MISSED':
      return '#F44336';
    case 'REJECTED':
      return '#FF9800';
    case 'BLOCKED':
      return '#9E9E9E';
    default:
      return '#757575';
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) {
    return `${mins}m ${secs}s`;
  }
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const oneDay = 86400000;

  if (diff < oneDay && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  }
  if (diff < 2 * oneDay) {
    return 'Yesterday';
  }
  if (diff < 7 * oneDay) {
    return date.toLocaleDateString([], {weekday: 'short'});
  }
  return date.toLocaleDateString([], {month: 'short', day: 'numeric'});
}

function getInitials(name: string): string {
  if (!name) {
    return '?';
  }
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name[0].toUpperCase();
}

// ─── Requesting Permissions ──────────────────────────────────────────────────

async function requestContactsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
      {
        title: 'Contacts Permission',
        message: 'This app needs access to your contacts to display them.',
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

// ─── API Upload Helpers ──────────────────────────────────────────────────────

async function syncContactsToServer(contacts: Contact[]): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/contacts/sync`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({deviceId: DEVICE_ID, contacts}),
    });
    const data = await response.json();
    if (!data.success) {
      console.warn('Contacts sync warning:', data.message);
    } else {
      console.log(`Contacts synced: ${data.upserted} new, ${data.updated} updated`);
    }
  } catch (error: any) {
    console.warn('Failed to sync contacts to server:', error.message);
  }
}

async function syncCallLogsToServer(callLogs: CallLogEntry[]): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/call-logs/sync`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({deviceId: DEVICE_ID, callLogs}),
    });
    const data = await response.json();
    if (!data.success) {
      console.warn('Call logs sync warning:', data.message);
    } else {
      console.log(`Call logs synced: ${data.upserted} new, ${data.updated} updated`);
    }
  } catch (error: any) {
    console.warn('Failed to sync call logs to server:', error.message);
  }
}

// ─── Components ──────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#E91E63',
  '#9C27B0',
  '#673AB7',
  '#3F51B5',
  '#2196F3',
  '#009688',
  '#4CAF50',
  '#FF9800',
  '#FF5722',
  '#795548',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function ContactItem({item}: {item: Contact}) {
  return (
    <View style={styles.listItem}>
      <View
        style={[styles.avatar, {backgroundColor: getAvatarColor(item.name)}]}>
        <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
      </View>
      <View style={styles.listItemContent}>
        <Text style={styles.listItemTitle} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.listItemSubtitle} numberOfLines={1}>
          {item.phoneNumber}
        </Text>
      </View>
    </View>
  );
}

function CallLogItem({item}: {item: CallLogEntry}) {
  const displayName = item.name || item.phoneNumber;
  return (
    <View style={styles.listItem}>
      <View
        style={[
          styles.avatar,
          {backgroundColor: getAvatarColor(displayName)},
        ]}>
        <Text style={styles.avatarText}>{getInitials(displayName)}</Text>
      </View>
      <View style={styles.listItemContent}>
        <View style={styles.callLogHeader}>
          <Text style={styles.listItemTitle} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.callLogDate}>
            {formatDate(item.dateTimestamp)}
          </Text>
        </View>
        <View style={styles.callLogDetails}>
          <Text style={styles.callTypeIcon}>
            {getCallTypeIcon(item.type)}
          </Text>
          <Text
            style={[
              styles.callTypeLabel,
              {color: getCallTypeColor(item.type)},
            ]}>
            {item.type}
          </Text>
          {item.duration > 0 && (
            <Text style={styles.callDuration}>
              {' · '}
              {formatDuration(item.duration)}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );
}

function PermissionDenied({
  onRetry,
  message,
}: {
  onRetry: () => void;
  message: string;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>🔒</Text>
      <Text style={styles.emptyTitle}>Permission Required</Text>
      <Text style={styles.emptySubtitle}>{message}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryButtonText}>Grant Permission</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<ActiveTab>('contacts');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [callLog, setCallLog] = useState<CallLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [contactsPermission, setContactsPermission] = useState(false);
  const [callLogPermission, setCallLogPermission] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>('');

  const loadContacts = useCallback(async () => {
    try {
      const granted = await requestContactsPermission();
      setContactsPermission(granted);
      if (granted) {
        const data = await ContactsCallLogModule.getContacts();
        setContacts(data);
        // Upload contacts to server in background
        setSyncStatus('Syncing contacts...');
        syncContactsToServer(data).then(() => setSyncStatus(''));
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to load contacts: ' + error.message);
    }
  }, []);

  const loadCallLog = useCallback(async () => {
    try {
      const granted = await requestCallLogPermission();
      setCallLogPermission(granted);
      if (granted) {
        const data = await ContactsCallLogModule.getCallLog(100);
        setCallLog(data);
        // Upload call logs to server in background
        setSyncStatus('Syncing call history...');
        syncCallLogsToServer(data).then(() => setSyncStatus(''));
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to load call history: ' + error.message);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadContacts(), loadCallLog()]);
    setLoading(false);
  }, [loadContacts, loadCallLog]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadContacts(), loadCallLog()]);
    setRefreshing(false);
  }, [loadContacts, loadCallLog]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const renderContactItem = useCallback(
    ({item}: {item: Contact}) => <ContactItem item={item} />,
    [],
  );

  const renderCallLogItem = useCallback(
    ({item}: {item: CallLogEntry}) => <CallLogItem item={item} />,
    [],
  );

  const contactKeyExtractor = useCallback((item: Contact) => item.id, []);
  const callLogKeyExtractor = useCallback(
    (item: CallLogEntry, index: number) => `${item.id}-${index}`,
    [],
  );

  return (
    <View style={[styles.container, {paddingTop: insets.top}]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {activeTab === 'contacts' ? 'Contacts' : 'Call History'}
        </Text>
        <Text style={styles.headerCount}>
          {activeTab === 'contacts'
            ? `${contacts.length} contacts`
            : `${callLog.length} calls`}
        </Text>
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
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6C63FF" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : activeTab === 'contacts' ? (
        !contactsPermission ? (
          <PermissionDenied
            message="We need access to your contacts to display them here."
            onRetry={loadContacts}
          />
        ) : contacts.length === 0 ? (
          <EmptyState
            icon="📭"
            title="No Contacts"
            subtitle="Your contacts list is empty."
          />
        ) : (
          <FlatList
            data={contacts}
            renderItem={renderContactItem}
            keyExtractor={contactKeyExtractor}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#6C63FF']}
                tintColor="#6C63FF"
              />
            }
          />
        )
      ) : !callLogPermission ? (
        <PermissionDenied
          message="We need access to your call log to display your call history."
          onRetry={loadCallLog}
        />
      ) : callLog.length === 0 ? (
        <EmptyState
          icon="📵"
          title="No Call History"
          subtitle="Your call log is empty."
        />
      ) : (
        <FlatList
          data={callLog}
          renderItem={renderCallLogItem}
          keyExtractor={callLogKeyExtractor}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#6C63FF']}
              tintColor="#6C63FF"
            />
          }
        />
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
  headerCount: {
    fontSize: 14,
    color: '#8888AA',
    marginTop: 4,
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
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  listItemContent: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
  },
  listItemSubtitle: {
    fontSize: 13,
    color: '#8888AA',
    marginTop: 3,
  },
  callLogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  callLogDate: {
    fontSize: 12,
    color: '#8888AA',
    marginLeft: 8,
  },
  callLogDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  callTypeIcon: {
    fontSize: 13,
    marginRight: 4,
  },
  callTypeLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  callDuration: {
    fontSize: 12,
    color: '#8888AA',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2a2a3e',
    marginLeft: 66,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#8888AA',
    marginTop: 12,
    fontSize: 14,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#8888AA',
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#6C63FF',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default App;
