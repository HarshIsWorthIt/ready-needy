import React, { useMemo, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Screen =
  | 'welcome'
  | 'login'
  | 'home'
  | 'ready'
  | 'need'
  | 'signal'
  | 'active'
  | 'complete';

type ReadyUser = {
  name: string;
  rating: string;
  verified: boolean;
};

type Signal = {
  id: string;
  task: string;
  distance: string;
  helpersRequired: number;
  reward: number;
  duration: string;
  accepted: number;
  status: 'SEARCHING' | 'PARTIALLY_MATCHED' | 'MATCHED';
};

const defaultRequest = {
  task: 'Move furniture',
  helpers: '3',
  reward: '300',
  duration: 'Approximately 1 hour',
  radius: '1 km',
};

const helperProfiles: ReadyUser[] = [
  { name: 'Aman', rating: '4.2', verified: true },
  { name: 'Rohan', rating: '4.8', verified: true },
  { name: 'Kunal', rating: '4.5', verified: true },
  { name: 'Rahul', rating: '4.7', verified: true },
  { name: 'Vikas', rating: '4.4', verified: false },
];

const seedSignals: Signal[] = [
  {
    id: 'sig-1',
    task: 'Hostel shifting help',
    distance: '650 m away',
    helpersRequired: 3,
    reward: 300,
    duration: 'Approximately 1 hour',
    accepted: 1,
    status: 'PARTIALLY_MATCHED',
  },
  {
    id: 'sig-2',
    task: 'Event setup',
    distance: '820 m away',
    helpersRequired: 2,
    reward: 250,
    duration: 'Approximately 45 mins',
    accepted: 0,
    status: 'SEARCHING',
  },
];

const userName = 'Aman';

export default function App() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [readyMode, setReadyMode] = useState(false);
  const [requestForm, setRequestForm] = useState(defaultRequest);
  const [signals, setSignals] = useState(seedSignals);
  const [activeRequest, setActiveRequest] = useState<Signal | null>({
    id: 'sig-1',
    task: 'Move furniture',
    distance: '650 m away',
    helpersRequired: 3,
    reward: 300,
    duration: 'Approximately 1 hour',
    accepted: 3,
    status: 'MATCHED',
  });
  const [selectedRating, setSelectedRating] = useState(0);

  const readyCount = useMemo(() => Math.max(18, 20 + (readyMode ? 6 : 0)), [readyMode]);

  const handleLogin = () => {
    setIsLoggedIn(true);
    setScreen('home');
  };

  const handleBroadcastNeed = () => {
    const incoming: Signal = {
      id: 'new-request',
      task: requestForm.task,
      distance: '650 m away',
      helpersRequired: Number(requestForm.helpers) || 3,
      reward: Number(requestForm.reward) || 300,
      duration: requestForm.duration || 'Approximately 1 hour',
      accepted: 0,
      status: 'SEARCHING',
    };

    setSignals((previous) => [incoming, ...previous]);
    setActiveRequest(incoming);
    setScreen('signal');
  };

  const handleAcceptSignal = (signalId: string) => {
    setSignals((previous) =>
      previous.map((signal) => {
        if (signal.id !== signalId) {
          return signal;
        }

        const nextAccepted = Math.min(signal.accepted + 1, signal.helpersRequired);
        const nextStatus =
          nextAccepted >= signal.helpersRequired ? 'MATCHED' : 'PARTIALLY_MATCHED';

        return { ...signal, accepted: nextAccepted, status: nextStatus };
      }),
    );

    const selectedSignal = signals.find((signal) => signal.id === signalId) ?? null;
    if (selectedSignal) {
      const nextAccepted = Math.min(selectedSignal.accepted + 1, selectedSignal.helpersRequired);
      const matched = {
        ...selectedSignal,
        accepted: nextAccepted,
        status: nextAccepted >= selectedSignal.helpersRequired ? 'MATCHED' : 'PARTIALLY_MATCHED',
      };
      setActiveRequest(matched);
    }

    setScreen('active');
  };

  const handleDeclineSignal = (signalId: string) => {
    setSignals((previous) => previous.filter((signal) => signal.id !== signalId));
    setScreen('home');
  };

  const renderHeader = (title: string) => (
    <View style={styles.headerRow}>
      <Text style={styles.headerTitle}>{title}</Text>
      <Pressable style={styles.headerBadge} onPress={() => setScreen('home')}>
        <Text style={styles.headerBadgeText}>Home</Text>
      </Pressable>
    </View>
  );

  const renderWelcome = () => (
    <View style={styles.centeredContainer}>
      <Text style={styles.logo}>READY/NEEDY</Text>
      <Text style={styles.heroTitle}>Dispatch manpower in real time.</Text>
      <Text style={styles.subtleText}>
        Nearby users receive signals, accept requests, and get matched instantly.
      </Text>
      <Pressable style={styles.primaryButton} onPress={handleLogin}>
        <Text style={styles.primaryButtonText}>Get Started</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={() => setScreen('home')}>
        <Text style={styles.secondaryButtonText}>Demo App</Text>
      </Pressable>
    </View>
  );

  const renderLogin = () => (
    <View style={styles.formContainer}>
      {renderHeader('Login / Register')}
      <Text style={styles.label}>Full name</Text>
      <TextInput style={styles.input} value={userName} editable={false} />
      <Text style={styles.label}>Phone number</Text>
      <TextInput style={styles.input} value='+91 98765 43210' editable={false} />
      <Text style={styles.label}>Email</Text>
      <TextInput style={styles.input} value=' aman@studenthostel.com' editable={false} />
      <Pressable style={styles.primaryButton} onPress={handleLogin}>
        <Text style={styles.primaryButtonText}>Continue</Text>
      </Pressable>
    </View>
  );

  const renderHome = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {renderHeader('Home')}
      <Text style={styles.greeting}>Hello, {userName}</Text>
      <View style={styles.modePanel}>
        <Text style={styles.panelTitle}>Current mode</Text>
        <Text style={styles.modeValue}>{readyMode ? 'READY' : 'OFFLINE'}</Text>
        <Text style={styles.mutedText}>Approx. location: 28.6°, 77.4°</Text>
        <Pressable
          style={[styles.primaryButton, readyMode && styles.okButton]}
          onPress={() => {
            setReadyMode((previous) => !previous);
            setScreen('ready');
          }}
        >
          <Text style={styles.primaryButtonText}>{readyMode ? 'Stop being Ready' : 'Go Ready'}</Text>
        </Pressable>
      </View>

      <Pressable style={styles.actionCard} onPress={() => setScreen('need')}>
        <Text style={styles.actionTitle}>Need Help</Text>
        <Text style={styles.actionSubtitle}>Broadcast a request to nearby users</Text>
      </Pressable>

      <Pressable style={styles.actionCard} onPress={() => setScreen('signal')}>
        <Text style={styles.actionTitle}>Incoming Signal</Text>
        <Text style={styles.actionSubtitle}>{signals.length} active request(s) near you</Text>
      </Pressable>

      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{readyCount}</Text>
          <Text style={styles.metricLabel}>Ready users nearby</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>1 km</Text>
          <Text style={styles.metricLabel}>Search radius</Text>
        </View>
      </View>
    </ScrollView>
  );

  const renderReady = () => (
    <View style={styles.formContainer}>
      {renderHeader('Ready Mode')}
      <Text style={styles.greeting}>Current status: {readyMode ? 'READY' : 'OFFLINE'}</Text>
      <Text style={styles.mutedText}>Available radius: 1 km</Text>
      <Text style={styles.mutedText}>Current approximate location: 28.6, 77.4</Text>
      <Text style={styles.mutedText}>Last update: 5 seconds ago</Text>
      <Pressable
        style={[styles.primaryButton, !readyMode && styles.okButton]}
        onPress={() => {
          setReadyMode(true);
          setScreen('home');
        }}
      >
        <Text style={styles.primaryButtonText}>Activate Ready</Text>
      </Pressable>
      <Pressable
        style={styles.secondaryButton}
        onPress={() => {
          setReadyMode(false);
          setScreen('home');
        }}
      >
        <Text style={styles.secondaryButtonText}>Stop being Ready</Text>
      </Pressable>
    </View>
  );

  const renderNeed = () => (
    <ScrollView contentContainerStyle={styles.formContainer}>
      {renderHeader('Create Need')}
      <Text style={styles.label}>Task description</Text>
      <TextInput
        style={styles.input}
        value={requestForm.task}
        onChangeText={(value) => setRequestForm((previous) => ({ ...previous, task: value }))}
      />
      <Text style={styles.label}>Number of helpers</Text>
      <TextInput
        keyboardType="numeric"
        style={styles.input}
        value={requestForm.helpers}
        onChangeText={(value) => setRequestForm((previous) => ({ ...previous, helpers: value }))}
      />
      <Text style={styles.label}>Reward per helper</Text>
      <TextInput
        keyboardType="numeric"
        style={styles.input}
        value={requestForm.reward}
        onChangeText={(value) => setRequestForm((previous) => ({ ...previous, reward: value }))}
      />
      <Text style={styles.label}>Approximate duration</Text>
      <TextInput
        style={styles.input}
        value={requestForm.duration}
        onChangeText={(value) => setRequestForm((previous) => ({ ...previous, duration: value }))}
      />
      <Text style={styles.label}>Search radius</Text>
      <TextInput
        style={styles.input}
        value={requestForm.radius}
        onChangeText={(value) => setRequestForm((previous) => ({ ...previous, radius: value }))}
      />
      <Pressable style={styles.primaryButton} onPress={handleBroadcastNeed}>
        <Text style={styles.primaryButtonText}>Broadcast Need</Text>
      </Pressable>
    </ScrollView>
  );

  const renderSignal = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {renderHeader('Incoming Signal')}
      {signals.map((signal) => (
        <View key={signal.id} style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>HELP REQUEST</Text>
          <Text style={styles.noticeTask}>{signal.task}</Text>
          <Text style={styles.noticeMeta}>{signal.distance}</Text>
          <Text style={styles.noticeMeta}>{signal.helpersRequired} helpers needed</Text>
          <Text style={styles.noticeMeta}>₹{signal.reward} per helper</Text>
          <Text style={styles.noticeMeta}>{signal.duration}</Text>
          <Text style={styles.noticeMeta}>Current status: {signal.status}</Text>
          <View style={styles.buttonRow}>
            <Pressable style={styles.primaryButtonSmall} onPress={() => handleAcceptSignal(signal.id)}>
              <Text style={styles.primaryButtonText}>Accept</Text>
            </Pressable>
            <Pressable style={styles.secondaryButtonSmall} onPress={() => handleDeclineSignal(signal.id)}>
              <Text style={styles.secondaryButtonText}>Decline</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );

  const renderActive = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {renderHeader('Active Request')}
      <Text style={styles.sectionLabel}>Task</Text>
      <Text style={styles.noticeTask}>{activeRequest?.task ?? 'Move furniture'}</Text>
      <Text style={styles.sectionLabel}>Matched helpers</Text>
      <View style={styles.helperList}>
        {helperProfiles.slice(0, 3).map((user) => (
          <View key={user.name} style={styles.helperRow}>
            <View>
              <Text style={styles.helperName}>{user.name}</Text>
              <Text style={styles.helperMeta}>{user.verified ? 'Verified' : 'Unverified'} • {user.rating} rating</Text>
            </View>
            <Text style={styles.helperBadge}>{activeRequest?.accepted ?? 3}/{activeRequest?.helpersRequired ?? 3}</Text>
          </View>
        ))}
      </View>
      <View style={styles.matchSummary}>
        <Text style={styles.matchSummaryText}>{activeRequest?.accepted ?? 3}/{activeRequest?.helpersRequired ?? 3}</Text>
        <Text style={styles.sectionLabel}>MATCHED</Text>
      </View>
      <Pressable style={styles.primaryButton} onPress={() => setScreen('complete')}>
        <Text style={styles.primaryButtonText}>Mark as Arrived</Text>
      </Pressable>
    </ScrollView>
  );

  const renderComplete = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {renderHeader('Completion & Rating')}
      <Text style={styles.greeting}>Work completed</Text>
      <Text style={styles.mutedText}>Rate the helpers after arrival and completion.</Text>
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable key={star} onPress={() => setSelectedRating(star)}>
            <Text style={[styles.star, star <= selectedRating && styles.starFilled]}>{star <= selectedRating ? '★' : '☆'}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.textArea}
        multiline
        numberOfLines={4}
        placeholder="Optional comment"
      />
      <Pressable style={styles.primaryButton} onPress={() => setScreen('home')}>
        <Text style={styles.primaryButtonText}>Submit rating</Text>
      </Pressable>
    </ScrollView>
  );

  const renderCurrentScreen = () => {
    switch (screen) {
      case 'welcome':
        return renderWelcome();
      case 'login':
        return renderLogin();
      case 'home':
        return renderHome();
      case 'ready':
        return renderReady();
      case 'need':
        return renderNeed();
      case 'signal':
        return renderSignal();
      case 'active':
        return renderActive();
      case 'complete':
        return renderComplete();
      default:
        return renderHome();
    }
  };

  return <SafeAreaView style={styles.safeArea}>{renderCurrentScreen()}</SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#0f172a',
  },
  formContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: '#0f172a',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTitle: {
    color: '#e2e8f0',
    fontSize: 22,
    fontWeight: '700',
  },
  headerBadge: {
    backgroundColor: '#1d4ed8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  headerBadgeText: {
    color: 'white',
    fontWeight: '700',
  },
  logo: {
    color: '#38bdf8',
    fontWeight: '800',
    letterSpacing: 1.5,
    fontSize: 26,
    marginBottom: 12,
  },
  heroTitle: {
    color: '#f8fafc',
    fontSize: 30,
    textAlign: 'center',
    fontWeight: '700',
    marginBottom: 12,
  },
  subtleText: {
    color: '#cbd5e1',
    textAlign: 'center',
    fontSize: 16,
    marginBottom: 24,
  },
  greeting: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: '#38bdf8',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  primaryButtonSmall: {
    backgroundColor: '#38bdf8',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  primaryButtonText: {
    color: '#082f49',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#1e293b',
    borderColor: '#38bdf8',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  secondaryButtonSmall: {
    backgroundColor: '#1e293b',
    borderColor: '#38bdf8',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
    flex: 1,
  },
  secondaryButtonText: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '700',
  },
  okButton: {
    backgroundColor: '#22c55e',
  },
  modePanel: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#334155',
  },
  panelTitle: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 6,
  },
  modeValue: {
    color: '#f8fafc',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 8,
  },
  mutedText: {
    color: '#cbd5e1',
    fontSize: 15,
    marginBottom: 10,
  },
  actionCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  actionTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  actionSubtitle: {
    color: '#cbd5e1',
    fontSize: 14,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 18,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 18,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  metricValue: {
    color: '#38bdf8',
    fontSize: 26,
    fontWeight: '800',
  },
  metricLabel: {
    color: '#cbd5e1',
    fontSize: 13,
    marginTop: 8,
  },
  label: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 18,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#111827',
    color: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  noticeCard: {
    backgroundColor: '#111827',
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#1d4ed8',
  },
  noticeTitle: {
    color: '#7dd3fc',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1,
    marginBottom: 8,
  },
  noticeTask: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 22,
    marginBottom: 8,
  },
  noticeMeta: {
    color: '#cbd5e1',
    fontSize: 15,
    marginBottom: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  helperList: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 14,
  },
  helperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  helperName: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  helperMeta: {
    color: '#cbd5e1',
    fontSize: 13,
    marginTop: 4,
  },
  helperBadge: {
    color: '#7dd3fc',
    fontSize: 18,
    fontWeight: '800',
  },
  sectionLabel: {
    color: '#94a3b8',
    marginTop: 12,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  matchSummary: {
    backgroundColor: '#082f49',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginVertical: 18,
  },
  matchSummaryText: {
    color: '#7dd3fc',
    fontSize: 32,
    fontWeight: '800',
  },
  starsRow: {
    flexDirection: 'row',
    marginTop: 18,
    marginBottom: 18,
    justifyContent: 'center',
  },
  star: {
    fontSize: 34,
    color: '#94a3b8',
    marginHorizontal: 4,
  },
  starFilled: {
    color: '#fbbf24',
  },
  textArea: {
    backgroundColor: '#111827',
    color: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    minHeight: 120,
    textAlignVertical: 'top',
  },
});
