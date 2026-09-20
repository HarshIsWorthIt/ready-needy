import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { clampRequestCount, computeNextSignalState } from './src/logic';
import { defaultRequest, helperProfiles, seedSignals, userName } from './src/mockData';
import {
  acceptHelperForRequestRemote,
  createNeedRequestRemote,
  subscribeToRequest,
  updateUserModeRemote,
  updateUserPreferencesRemote,
} from './src/repository';
import { RequestFormState, Screen, Signal, UserMode } from './src/types';
import { registerForPushNotifications, requestCurrentLocation } from './src/device';
import { getAuthSession, signOut, subscribeToAuthChanges } from './src/auth';
import { requestCameraPermission, requestNotificationPermission } from './src/permissions';

function LiveBackground() {
  const drift = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 7000, useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 7000, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [drift]);

  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [-90, 70] });
  const translateY = drift.interpolate({ inputRange: [0, 1], outputRange: [30, -20] });

  return (
    <View pointerEvents="none" style={styles.liveBackground}>
      <View style={styles.backgroundGrid} />
      <Animated.View style={[styles.liveBand, styles.liveBandOne, { transform: [{ translateX }, { translateY }] }]} />
      <Animated.View style={[styles.liveBand, styles.liveBandTwo, { transform: [{ translateX: translateY }, { translateY: translateX }] }]} />
      <View style={styles.backgroundScanLine} />
    </View>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userMode, setUserMode] = useState<UserMode>('OFFLINE');
  const [requestForm, setRequestForm] = useState<RequestFormState>(defaultRequest);
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
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [locationSharingEnabled, setLocationSharingEnabled] = useState(true);
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [requirementsAccepted, setRequirementsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busySignalId, setBusySignalId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const readyMode = userMode === 'READY';
  const readyCount = useMemo(() => Math.max(18, 20 + (readyMode ? 6 : 0)), [readyMode]);

  const selectMode = (mode: UserMode) => {
    setUserMode(mode);
    void updateUserModeRemote(mode, currentLocation).catch(() => setFeedback('Mode changed locally. Connect your account to sync it.'));
    if (mode === 'NEEDY') {
      setScreen('need');
    } else if (mode === 'READY') {
      setScreen('ready');
      void requestCurrentLocation().then((location) => {
        if (location) {
          setCurrentLocation(location);
          return updateUserModeRemote('READY', location).catch(() => setFeedback('Location is active locally but could not sync to your account.'));
        }
        return undefined;
      }).catch(() => setFeedback('Location is unavailable. Ready mode can still be used without live coordinates.'));
    } else {
      setScreen('home');
    }
  };

  useEffect(() => {
    if (!activeRequest) {
      return undefined;
    }

    return subscribeToRequest(activeRequest.id, (nextSignal) => {
      setActiveRequest(nextSignal);
      setSignals((previous) =>
        previous.map((signal) => (signal.id === nextSignal.id ? nextSignal : signal)),
      );
    });
  }, [activeRequest?.id]);

  useEffect(() => {
    if (!feedback) {
      return undefined;
    }

    const timeout = setTimeout(() => setFeedback(null), 4500);
    return () => clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    void getAuthSession().then((session) => {
      if (session) {
        setIsLoggedIn(true);
        setScreen('home');
      }
    }).catch(() => setFeedback('We could not restore your account session.'));
  }, []);

  useEffect(() => subscribeToAuthChanges(
    () => setIsLoggedIn(true),
    () => {
      setIsLoggedIn(false);
      setScreen('welcome');
    },
  ), []);

  const handleLogin = () => {
    setIsLoggedIn(true);
    setScreen('verification');
  };

  const finishOnboarding = () => {
    void registerForPushNotifications().catch(() => undefined);
    setScreen('home');
  };

  const handleIdUpload = async () => {
    try {
      const granted = await requestCameraPermission();
      if (!granted) {
        setFeedback('Camera access is needed to capture your ID securely.');
        return;
      }
      setVerificationComplete(true);
      setFeedback('Camera access granted. ID capture is ready.');
    } catch {
      setFeedback('Camera permission could not be requested on this device.');
    }
  };

  const handleNotificationToggle = async () => {
    if (notificationsEnabled) {
      const next = false;
      setNotificationsEnabled(next);
      void updateUserPreferencesRemote({ notificationsEnabled: next, locationSharingEnabled }).catch(() => setFeedback('Notifications paused on this device but could not sync.'));
      setFeedback('Notifications paused.');
      return;
    }

    try {
      const granted = await requestNotificationPermission();
      setNotificationsEnabled(granted);
      if (granted) {
        void updateUserPreferencesRemote({ notificationsEnabled: true, locationSharingEnabled }).catch(() => setFeedback('Notifications enabled locally but could not sync.'));
      }
      setFeedback(granted ? 'Notifications enabled for nearby requests.' : 'Notification access was not granted.');
    } catch {
      setFeedback('Notification permission could not be requested on this device.');
    }
  };

  const handleLocationToggle = async () => {
    if (!locationSharingEnabled) {
      try {
        const location = await requestCurrentLocation();
        if (!location) {
          setFeedback('Location permission is needed to share your live position.');
          return;
        }
      } catch {
        setFeedback('Location permission could not be requested on this device.');
        return;
      }
    }
    const next = !locationSharingEnabled;
    setLocationSharingEnabled(next);
    void updateUserPreferencesRemote({ notificationsEnabled, locationSharingEnabled: next }).catch(() => setFeedback('Location preference changed locally but could not sync.'));
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setIsLoggedIn(false);
      setUserMode('OFFLINE');
      setScreen('welcome');
    } catch {
      setFeedback('Could not sign out from the server. Please try again.');
    }
  };

  const handleBroadcastNeed = async () => {
    const helperCount = Number(requestForm.helpers);
    const reward = Number(requestForm.reward);
    const radius = Number.parseFloat(requestForm.radius);

    if (!requestForm.task.trim()) {
      setFeedback('Add a short description so nearby helpers know what you need.');
      return;
    }
    if (!Number.isFinite(helperCount) || helperCount < 1 || helperCount > 20) {
      setFeedback('Choose between 1 and 20 helpers.');
      return;
    }
    if (!Number.isFinite(reward) || reward < 1) {
      setFeedback('Add a valid reward per helper.');
      return;
    }
    if (!Number.isFinite(radius) || radius <= 0 || radius > 25) {
      setFeedback('Use a search radius between 0.1 and 25 km.');
      return;
    }

    setIsSubmitting(true);
    let incoming: Signal;

    try {
      incoming = await createNeedRequestRemote(requestForm);
      setFeedback('Your request is live. Nearby Ready people can see it now.');
    } catch {
      incoming = {
        id: 'new-request',
        task: requestForm.task,
        distance: '650 m away',
        helpersRequired: clampRequestCount(requestForm.helpers),
        reward: Number(requestForm.reward) || 300,
        duration: requestForm.duration || 'Approximately 1 hour',
        accepted: 0,
        status: 'SEARCHING',
      };
      setFeedback('Request started offline. Connect your account to dispatch live.');
    } finally {
      setIsSubmitting(false);
    }

    setSignals((previous) => [incoming, ...previous]);
    setActiveRequest(incoming);
    setScreen('active');
  };

  const handleAcceptSignal = async (signalId: string) => {
    if (userMode !== 'READY') {
      return;
    }

    const selectedSignal = signals.find((signal) => signal.id === signalId) ?? null;
    if (busySignalId) {
      return;
    }
    setBusySignalId(signalId);

    try {
      const acceptedSignal = await acceptHelperForRequestRemote(signalId, 'u2');
      if (acceptedSignal) {
        setSignals((previous) =>
          previous.map((signal) => (signal.id === signalId ? acceptedSignal : signal)),
        );
        setActiveRequest(acceptedSignal);
        setScreen('active');
        setFeedback('You are matched to this request.');
        setBusySignalId(null);
        return;
      }
    } catch {
      setFeedback('Dispatch service unavailable. Showing the local match state.');
    }

    setSignals((previous) =>
      previous.map((signal) => {
        if (signal.id !== signalId) {
          return signal;
        }

        const nextAccepted = Math.min(signal.accepted + 1, signal.helpersRequired);
        const nextStatus: Signal['status'] =
          nextAccepted >= signal.helpersRequired ? 'MATCHED' : 'PARTIALLY_MATCHED';

        return { ...signal, accepted: nextAccepted, status: nextStatus };
      }),
    );

    if (selectedSignal) {
      const matched: Signal = computeNextSignalState(selectedSignal);
      setActiveRequest(matched);
    }

    setScreen('active');
    setBusySignalId(null);
  };

  const handleDeclineSignal = (signalId: string) => {
    setSignals((previous) => previous.filter((signal) => signal.id !== signalId));
    setScreen('home');
  };

  const handleCancelRequest = () => {
    if (!activeRequest) {
      return;
    }

    setSignals((previous) => previous.filter((signal) => signal.id !== activeRequest.id));
    setActiveRequest(null);
    setUserMode('OFFLINE');
    setScreen('home');
    setFeedback('Request cancelled. You are now offline.');
  };

  const renderHeader = (title: string) => (
    <View style={styles.headerRow}>
      <View style={styles.headerTitleGroup}>
        <Text style={styles.headerIcon}>{title === 'Home' ? '🏠' : title === 'Ready Mode' ? '🟢' : '📍'}</Text>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      <Pressable style={styles.headerBadge} onPress={() => setScreen('home')}>
        <Text style={styles.headerBadgeText}>⌂ Home</Text>
      </Pressable>
    </View>
  );

  const renderWelcome = () => (
    <ScrollView contentContainerStyle={styles.landingContainer}>
      <View style={styles.landingTopRow}>
        <Text style={styles.logo}>🤝 READY/NEEDY</Text>
        <View style={styles.networkPill}>
          <Text style={styles.networkDot}>●</Text>
          <Text style={styles.networkText}>LIVE NETWORK</Text>
        </View>
      </View>
      <View style={styles.heroOrb}>
        <Text style={styles.heroOrbEmoji}>🛵</Text>
        <Text style={styles.heroOrbSignal}>↗ 24 nearby</Text>
      </View>
      <Text style={styles.heroEyebrow}>THE HUMAN NETWORK ⚡</Text>
      <Text style={styles.heroTitle}>Help is closer than you think.</Text>
      <Text style={styles.subtleText}>One tap to help someone. One tap to ask. Real people, real time, right around you.</Text>
      <View style={styles.liveTicker}>
        <Text style={styles.liveTickerEmoji}>📡</Text>
        <Text style={styles.liveTickerText}>Rohan just accepted a furniture request</Text>
        <Text style={styles.liveTickerTime}>now</Text>
      </View>
      <View style={styles.landingStats}>
        <View style={styles.landingStat}><Text style={styles.landingStatValue}>24</Text><Text style={styles.landingStatLabel}>people ready 🟢</Text></View>
        <View style={styles.landingStatDivider} />
        <View style={styles.landingStat}><Text style={styles.landingStatValue}>650m</Text><Text style={styles.landingStatLabel}>average match 📍</Text></View>
        <View style={styles.landingStatDivider} />
        <View style={styles.landingStat}><Text style={styles.landingStatValue}>4.9★</Text><Text style={styles.landingStatLabel}>community rating</Text></View>
      </View>
      <Text style={styles.chooseModeTitle}>How are you showing up today?</Text>
      <View style={styles.landingModeRow}>
        <Pressable style={[styles.landingModeCard, styles.landingReadyCard]} onPress={() => selectMode('READY')}>
          <Text style={styles.landingModeEmoji}>🟢</Text><Text style={styles.landingModeTitle}>Ready</Text><Text style={styles.landingModeHint}>I can help</Text>
        </Pressable>
        <Pressable style={[styles.landingModeCard, styles.landingNeedyCard]} onPress={() => selectMode('NEEDY')}>
          <Text style={styles.landingModeEmoji}>🆘</Text><Text style={styles.landingModeTitle}>Needy</Text><Text style={styles.landingModeHint}>I need help</Text>
        </Pressable>
      </View>
      <Pressable style={styles.primaryButton} onPress={handleLogin}><Text style={styles.primaryButtonText}>🚀 Get Started</Text></Pressable>
      <Text style={styles.landingTrust}>🔒 Verified people · 💳 Transparent rewards · 🛡️ Safety first</Text>
    </ScrollView>
  );

  const renderLogin = () => (
    <ScrollView contentContainerStyle={styles.onboardingContent}>
      <View style={styles.onboardingBrand}><Text style={styles.onboardingBrandEmoji}>🤝</Text><Text style={styles.onboardingBrandText}>READY/NEEDY</Text></View>
      <View style={styles.onboardingProgress}><View style={[styles.progressDot, styles.progressDotActive]} /><View style={styles.progressLine} /><View style={styles.progressDot} /><View style={styles.progressLine} /><View style={styles.progressDot} /></View>
      <Text style={styles.onboardingEyebrow}>STEP 1 OF 3 · CREATE ACCOUNT</Text>
      <Text style={styles.onboardingTitle}>Let’s get you connected 👋</Text>
      <Text style={styles.onboardingText}>Your account keeps requests, rewards, and people you meet in one safe place.</Text>
      <View style={styles.onboardingCard}>
        <Text style={styles.formIcon}>🧑‍💻</Text>
        <Text style={styles.label}>Full name</Text><TextInput style={styles.input} value={userName} editable={false} />
        <Text style={styles.label}>📱 Phone number</Text><TextInput style={styles.input} value="+91 98765 43210" editable={false} />
        <Text style={styles.label}>✉️ Email address</Text><TextInput style={styles.input} value="aman@studenthostel.com" editable={false} />
      </View>
      <Text style={styles.privacyNote}>🔒 Your details are encrypted and never sold.</Text>
      <Pressable style={styles.primaryButton} onPress={handleLogin}><Text style={styles.primaryButtonText}>Continue to verification →</Text></Pressable>
    </ScrollView>
  );

  const renderVerification = () => (
    <ScrollView contentContainerStyle={styles.onboardingContent}>
      <View style={styles.onboardingBrand}><Text style={styles.onboardingBrandEmoji}>🛡️</Text><Text style={styles.onboardingBrandText}>TRUST CHECK</Text></View>
      <View style={styles.onboardingProgress}><View style={[styles.progressDot, styles.progressDotActive]} /><View style={[styles.progressLine, styles.progressLineActive]} /><View style={[styles.progressDot, styles.progressDotActive]} /><View style={styles.progressLine} /><View style={styles.progressDot} /></View>
      <Text style={styles.onboardingEyebrow}>STEP 2 OF 3 · IDENTITY</Text>
      <Text style={styles.onboardingTitle}>Build trust before the first match 🪪</Text>
      <Text style={styles.onboardingText}>Verified profiles make the READY/NEEDY community safer for everyone.</Text>
      <View style={styles.verificationCard}><Text style={styles.verificationBigEmoji}>🪪</Text><Text style={styles.verificationCardTitle}>Government ID verification</Text><Text style={styles.verificationCardText}>Use your camera to capture a valid ID and unlock Ready mode, receive signals, and accept requests.</Text><View style={styles.verificationChecks}><Text style={styles.checkRow}>✅ Name matches your profile</Text><Text style={styles.checkRow}>✅ Details stay private</Text><Text style={styles.checkRow}>✅ Usually takes less than a minute</Text></View><Pressable style={styles.uploadButton} onPress={handleIdUpload}><Text style={styles.uploadButtonText}>{verificationComplete ? '✅ Camera ready' : '📷 Allow camera & scan ID'}</Text></Pressable></View>
      <Pressable style={[styles.primaryButton, !verificationComplete && styles.disabledButton]} disabled={!verificationComplete} onPress={() => setScreen('requirements')}><Text style={styles.primaryButtonText}>Continue to preferences →</Text></Pressable>
      <Text style={styles.privacyNote}>🔐 Documents are encrypted and reviewed securely.</Text>
    </ScrollView>
  );

  const renderRequirements = () => (
    <ScrollView contentContainerStyle={styles.onboardingContent}>
      <View style={styles.onboardingBrand}><Text style={styles.onboardingBrandEmoji}>⚙️</Text><Text style={styles.onboardingBrandText}>YOUR SETUP</Text></View>
      <View style={styles.onboardingProgress}><View style={[styles.progressDot, styles.progressDotActive]} /><View style={[styles.progressLine, styles.progressLineActive]} /><View style={[styles.progressDot, styles.progressDotActive]} /><View style={[styles.progressLine, styles.progressLineActive]} /><View style={[styles.progressDot, styles.progressDotActive]} /></View>
      <Text style={styles.onboardingEyebrow}>STEP 3 OF 3 · PREFERENCES</Text>
      <Text style={styles.onboardingTitle}>Make the app work for you ✨</Text>
      <Text style={styles.onboardingText}>Choose the basics now. You can change them any time from Account.</Text>
      <View style={styles.requirementPanel}><Text style={styles.requirementPanelTitle}>📍 Your usual area</Text><Text style={styles.requirementPanelText}>Helps us find the closest people and requests.</Text><View style={styles.preferenceChoice}><Text style={styles.preferenceChoiceIcon}>📍</Text><Text style={styles.preferenceChoiceText}>New Delhi, India</Text><Text style={styles.preferenceCheck}>✓</Text></View></View>
      <View style={styles.requirementPanel}><Text style={styles.requirementPanelTitle}>🔔 Stay in the loop</Text><Text style={styles.requirementPanelText}>Get alerts for nearby requests and match updates.</Text><Pressable style={styles.preferenceChoice} onPress={handleNotificationToggle}><Text style={styles.preferenceChoiceIcon}>🔔</Text><Text style={styles.preferenceChoiceText}>Request notifications</Text><Text style={styles.preferenceCheck}>{notificationsEnabled ? '✓' : '○'}</Text></Pressable></View>
      <View style={styles.requirementPanel}><Text style={styles.requirementPanelTitle}>📜 Community promise</Text><Text style={styles.requirementPanelText}>I will be respectful, honest, and show up when I accept.</Text><Pressable style={styles.preferenceChoice} onPress={() => setRequirementsAccepted((value) => !value)}><Text style={styles.preferenceChoiceIcon}>🤝</Text><Text style={styles.preferenceChoiceText}>I agree to the community rules</Text><Text style={styles.preferenceCheck}>{requirementsAccepted ? '✓' : '○'}</Text></Pressable></View>
      <Pressable style={[styles.primaryButton, !requirementsAccepted && styles.disabledButton]} disabled={!requirementsAccepted} onPress={finishOnboarding}><Text style={styles.primaryButtonText}>🚀 Enter READY/NEEDY</Text></Pressable>
    </ScrollView>
  );

  const renderHome = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {renderHeader('Home')}
      <Text style={styles.greeting}>Hello, {userName} 👋</Text>
      {userMode === 'OFFLINE' && (
        <View style={styles.offlineHero}>
          <View style={styles.offlineMoon}><Text style={styles.offlineMoonEmoji}>🌙</Text></View>
          <View style={styles.actionCopy}><Text style={styles.offlineTitle}>You are taking a breather</Text><Text style={styles.offlineText}>No requests, no pressure. Your community is here when you are ready.</Text></View>
        </View>
      )}
      <View style={styles.modePanel}>
        <View style={styles.panelHeadingRow}><Text style={styles.panelTitle}>Choose your mode</Text><Text style={styles.livePill}>{userMode === 'OFFLINE' ? '○ OFFLINE' : '● LIVE'}</Text></View>
        <Text style={styles.modeValue}>{userMode === 'READY' ? '🟢 READY' : userMode === 'NEEDY' ? '🆘 NEEDY' : '⚪ OFFLINE'}</Text>
        <Text style={styles.mutedText}>Switch your role anytime, just like a ride app 🚦</Text>
        <View style={styles.modeSelector}>
          {([['READY', '🟢', 'Help others', '#166534'], ['NEEDY', '🆘', 'Ask for help', '#9a3412'], ['OFFLINE', '⚪', 'Take a break', '#334155']] as const).map(([mode, emoji, label, color]) => (
            <Pressable key={mode} style={[styles.modeOption, userMode === mode && { backgroundColor: color }, userMode === mode && styles.modeOptionActive]} onPress={() => selectMode(mode)}>
              <Text style={styles.modeOptionEmoji}>{emoji}</Text><Text style={styles.modeOptionLabel}>{mode}</Text><Text style={styles.modeOptionHint}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Pressable style={styles.actionCard} onPress={() => selectMode('NEEDY')}><Text style={styles.actionIcon}>🆘</Text><View style={styles.actionCopy}><Text style={styles.actionTitle}>Need Help</Text><Text style={styles.actionSubtitle}>Broadcast a request to nearby users</Text></View><Text style={styles.actionArrow}>›</Text></Pressable>
      {userMode === 'READY' ? (
        <Pressable style={styles.actionCard} onPress={() => setScreen('signal')}><Text style={styles.actionIcon}>📡</Text><View style={styles.actionCopy}><Text style={styles.actionTitle}>Incoming Signal</Text><Text style={styles.actionSubtitle}>{signals.length} nearby request(s) waiting</Text></View><Text style={styles.actionArrow}>›</Text></Pressable>
      ) : (
        <View style={styles.statusCard}>
          <Text style={styles.statusCardIcon}>{userMode === 'NEEDY' ? '🚚' : '🌙'}</Text>
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>{userMode === 'NEEDY' ? 'Your request is live' : 'You are offline'}</Text>
            <Text style={styles.actionSubtitle}>{userMode === 'NEEDY' ? 'Nearby Ready people can see your need' : 'Go Ready to receive nearby requests'}</Text>
          </View>
        </View>
      )}
      <View style={styles.metricsGrid}><View style={styles.metricCard}><Text style={styles.metricValue}>{readyCount}</Text><Text style={styles.metricLabel}>Ready users nearby</Text></View><View style={styles.metricCard}><Text style={styles.metricValue}>1 km</Text><Text style={styles.metricLabel}>Search radius</Text></View></View>
    </ScrollView>
  );

  const renderReady = () => (
    <ScrollView contentContainerStyle={styles.modeScreenContent}>
      {renderHeader('Ready Control Room')}
      <View style={styles.readyHero}>
        <View style={styles.readyHeroTop}><Text style={styles.readyEyebrow}>🟢 YOU ARE LIVE</Text><Text style={styles.readyPulse}>● LIVE</Text></View>
        <Text style={styles.readyHeroTitle}>Ready to help, {userName}?</Text>
        <Text style={styles.readyHeroText}>Nearby requests are being matched to you in real time.</Text>
        <View style={styles.readyLocation}><Text style={styles.readyLocationIcon}>📍</Text><Text style={styles.readyLocationText}>{currentLocation ? `${currentLocation.latitude.toFixed(3)}, ${currentLocation.longitude.toFixed(3)} · 1 km radius` : 'Location permission needed · 1 km radius'}</Text><Text style={styles.readyLocationCheck}>{currentLocation ? '✓' : '!'}</Text></View>
      </View>
      <View style={styles.readyStatsRow}>
        <View style={styles.readyStat}><Text style={styles.readyStatValue}>{signals.length}</Text><Text style={styles.readyStatLabel}>signals nearby 📡</Text></View>
        <View style={styles.readyStat}><Text style={styles.readyStatValue}>₹300</Text><Text style={styles.readyStatLabel}>typical reward 💰</Text></View>
        <View style={styles.readyStat}><Text style={styles.readyStatValue}>4.8★</Text><Text style={styles.readyStatLabel}>your rating ⭐</Text></View>
      </View>
      <Text style={styles.modeSectionTitle}>Your helper toolkit 🧰</Text>
      <View style={styles.toolGrid}>
        <Pressable style={styles.toolCard} onPress={() => setScreen('signal')}><Text style={styles.toolEmoji}>📡</Text><Text style={styles.toolTitle}>Find signals</Text><Text style={styles.toolText}>See nearby needs</Text></Pressable>
        <Pressable style={styles.toolCard} onPress={() => setScreen('account')}><Text style={styles.toolEmoji}>💰</Text><Text style={styles.toolTitle}>Earnings</Text><Text style={styles.toolText}>₹2,450 this month</Text></Pressable>
        <Pressable style={styles.toolCard} onPress={() => setScreen('account')}><Text style={styles.toolEmoji}>🛡️</Text><Text style={styles.toolTitle}>Trust score</Text><Text style={styles.toolText}>Verified helper</Text></Pressable>
        <Pressable style={styles.toolCard} onPress={() => setScreen('settings')}><Text style={styles.toolEmoji}>⚙️</Text><Text style={styles.toolTitle}>Settings</Text><Text style={styles.toolText}>Radius & alerts</Text></Pressable>
      </View>
      <Pressable style={styles.readyStopButton} onPress={() => { setUserMode('OFFLINE'); setScreen('home'); }}><Text style={styles.readyStopText}>🌙 Pause Ready mode</Text></Pressable>
    </ScrollView>
  );

  const renderNeed = () => (
    <ScrollView contentContainerStyle={styles.modeScreenContent}>
      {renderHeader('Request Help')}
      <View style={styles.needyHero}>
        <Text style={styles.needyEyebrow}>🆘 NEEDY MODE</Text>
        <Text style={styles.needyTitle}>What do you need a hand with?</Text>
        <Text style={styles.needyText}>Tell nearby Ready people what is happening. Clear details get faster matches.</Text>
      </View>
      <View style={styles.needStepRow}><View style={styles.needStepActive}><Text style={styles.needStepNumber}>1</Text></View><Text style={styles.needStepText}>Describe it</Text><View style={styles.needStepLine} /><View style={styles.needStep}><Text style={styles.needStepNumber}>2</Text></View><Text style={styles.needStepMuted}>Match nearby</Text></View>
      <Text style={styles.label}>📝 Task description</Text>
      <TextInput
        style={styles.largeInput}
        multiline
        numberOfLines={3}
        placeholder="e.g. Help me move a table upstairs"
        placeholderTextColor="#64748b"
        value={requestForm.task}
        onChangeText={(value) => setRequestForm((previous) => ({ ...previous, task: value }))}
      />
      <View style={styles.needInputRow}><View style={styles.needInputHalf}><Text style={styles.label}>👥 Helpers</Text><TextInput keyboardType="numeric" style={styles.input} value={requestForm.helpers} onChangeText={(value) => setRequestForm((previous) => ({ ...previous, helpers: value }))} /></View><View style={styles.needInputHalf}><Text style={styles.label}>💰 Reward each</Text><TextInput keyboardType="numeric" style={styles.input} value={requestForm.reward} onChangeText={(value) => setRequestForm((previous) => ({ ...previous, reward: value }))} /></View></View>
      <Text style={styles.label}>⏱️ How long will it take?</Text>
      <TextInput style={styles.input} value={requestForm.duration} onChangeText={(value) => setRequestForm((previous) => ({ ...previous, duration: value }))} />
      <Text style={styles.label}>📍 Search radius</Text>
      <TextInput style={styles.input} value={requestForm.radius} onChangeText={(value) => setRequestForm((previous) => ({ ...previous, radius: value }))} />
      <View style={styles.needSummary}><Text style={styles.needSummaryIcon}>⚡</Text><View style={styles.actionCopy}><Text style={styles.needSummaryTitle}>Fast matching enabled</Text><Text style={styles.needSummaryText}>Ready people nearby will receive your signal instantly.</Text></View></View>
      <Pressable style={styles.needyBroadcastButton} disabled={isSubmitting} onPress={handleBroadcastNeed}>
        {isSubmitting ? <ActivityIndicator color="#431407" /> : <Text style={styles.primaryButtonText}>📣 Broadcast my need</Text>}
      </Pressable>
    </ScrollView>
  );

  const renderSignal = () => (
    userMode !== 'READY' ? (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {renderHeader('Signals')}
        <View style={styles.emptyStateCard}>
          <Text style={styles.emptyStateEmoji}>🟢</Text>
          <Text style={styles.emptyStateTitle}>Ready mode required</Text>
          <Text style={styles.emptyStateText}>Incoming help requests are only shown to people who are Ready to help.</Text>
          <Pressable style={styles.primaryButton} onPress={() => selectMode('READY')}><Text style={styles.primaryButtonText}>🟢 Go Ready</Text></Pressable>
        </View>
      </ScrollView>
    ) : (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {renderHeader('Incoming Signal')}
      {signals.length === 0 ? (
        <View style={styles.emptyStateCard}>
          <Text style={styles.emptyStateEmoji}>📡</Text>
          <Text style={styles.emptyStateTitle}>Scanning nearby</Text>
          <Text style={styles.emptyStateText}>New requests will appear here as soon as someone needs a hand.</Text>
        </View>
      ) : signals.map((signal) => (
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
              {busySignalId === signal.id ? <ActivityIndicator color="#082f49" /> : <Text style={styles.primaryButtonText}>Accept</Text>}
            </Pressable>
            <Pressable style={styles.secondaryButtonSmall} onPress={() => handleDeclineSignal(signal.id)}>
              <Text style={styles.secondaryButtonText}>Decline</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
    )
  );

  const renderActive = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {renderHeader(userMode === 'NEEDY' ? 'Your Live Request' : 'Active Request')}
      <Text style={styles.sectionLabel}>Task</Text>
      <Text style={styles.noticeTask}>{activeRequest?.task ?? 'Move furniture'}</Text>
      {userMode === 'NEEDY' && (
        <View style={styles.requestLiveBanner}>
          <Text style={styles.requestLiveIcon}>📡</Text>
          <View style={styles.actionCopy}><Text style={styles.requestLiveTitle}>{activeRequest?.accepted ? 'Helpers are joining' : 'Searching nearby Ready people'}</Text><Text style={styles.requestLiveText}>Your request is broadcasting in a {activeRequest?.distance ?? '1 km'} radius</Text></View>
        </View>
      )}
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
        <Text style={styles.sectionLabel}>{activeRequest?.accepted ? 'HELPERS JOINED' : 'SEARCHING'}</Text>
      </View>
      <Pressable style={styles.primaryButton} onPress={() => setScreen('complete')}>
        <Text style={styles.primaryButtonText}>{userMode === 'NEEDY' ? '✅ Confirm arrival' : '📍 Mark as arrived'}</Text>
      </Pressable>
      {userMode === 'NEEDY' && <Pressable style={styles.cancelButton} onPress={handleCancelRequest}><Text style={styles.cancelButtonText}>Cancel this request</Text></Pressable>}
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

  const renderAccount = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {renderHeader('My Account')}
      <View style={styles.profileHero}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarEmoji}>🧑🏽‍💻</Text>
        </View>
        <View style={styles.profileIdentity}>
          <Text style={styles.profileName}>{userName} 👋</Text>
          <Text style={styles.profileHandle}>@aman.ready · New Delhi 📍</Text>
          <Text style={styles.profileStatus}>✅ Identity verified</Text>
        </View>
        <Pressable style={styles.editButton} onPress={() => setScreen('settings')}>
          <Text style={styles.editButtonText}>✏️</Text>
        </Pressable>
      </View>

      <View style={styles.accountStatsRow}>
        <View style={styles.accountStat}>
          <Text style={styles.accountStatEmoji}>⭐</Text>
          <Text style={styles.accountStatValue}>4.8</Text>
          <Text style={styles.accountStatLabel}>Rating</Text>
        </View>
        <View style={styles.accountStat}>
          <Text style={styles.accountStatEmoji}>🤝</Text>
          <Text style={styles.accountStatValue}>27</Text>
          <Text style={styles.accountStatLabel}>Helps given</Text>
        </View>
        <View style={styles.accountStat}>
          <Text style={styles.accountStatEmoji}>🏆</Text>
          <Text style={styles.accountStatValue}>₹8.4k</Text>
          <Text style={styles.accountStatLabel}>Earned</Text>
        </View>
      </View>

      <Text style={styles.accountSectionTitle}>⚡ Your activity</Text>
      <View style={styles.accountPanel}>
        <View style={styles.accountRow}>
          <Text style={styles.accountRowIcon}>🟢</Text>
          <View style={styles.accountRowCopy}>
            <Text style={styles.accountRowTitle}>Ready streak</Text>
            <Text style={styles.accountRowSubtitle}>You have helped 6 days in a row 🔥</Text>
          </View>
          <Text style={styles.accountRowValue}>6 days</Text>
        </View>
        <View style={styles.accountDivider} />
        <View style={styles.accountRow}>
          <Text style={styles.accountRowIcon}>💰</Text>
          <View style={styles.accountRowCopy}>
            <Text style={styles.accountRowTitle}>This month</Text>
            <Text style={styles.accountRowSubtitle}>Keep showing up, keep earning 🚀</Text>
          </View>
          <Text style={styles.accountRowValue}>₹2,450</Text>
        </View>
      </View>

      <Text style={styles.accountSectionTitle}>🛡️ Trust & safety</Text>
      <View style={styles.accountPanel}>
        <View style={styles.accountRow}>
          <Text style={styles.accountRowIcon}>🪪</Text>
          <View style={styles.accountRowCopy}>
            <Text style={styles.accountRowTitle}>Identity verification</Text>
            <Text style={styles.accountRowSubtitle}>Government ID and phone confirmed</Text>
          </View>
          <Text style={styles.verifiedText}>Verified ✅</Text>
        </View>
        <View style={styles.accountDivider} />
        <View style={styles.accountRow}>
          <Text style={styles.accountRowIcon}>📍</Text>
          <View style={styles.accountRowCopy}>
            <Text style={styles.accountRowTitle}>Live location sharing</Text>
            <Text style={styles.accountRowSubtitle}>Only shared during an active request</Text>
          </View>
          <Pressable
            style={[styles.toggle, locationSharingEnabled && styles.toggleOn]}
            onPress={handleLocationToggle}
          >
            <Text style={styles.toggleKnob}>{locationSharingEnabled ? '●' : '○'}</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.accountSectionTitle}>⚙️ Preferences</Text>
      <View style={styles.accountPanel}>
        <Pressable style={styles.accountRow} onPress={handleNotificationToggle}>
          <Text style={styles.accountRowIcon}>🔔</Text>
          <View style={styles.accountRowCopy}>
            <Text style={styles.accountRowTitle}>Request notifications</Text>
            <Text style={styles.accountRowSubtitle}>Get alerted when help is needed nearby</Text>
          </View>
          <Text style={styles.preferenceValue}>{notificationsEnabled ? 'ON 🔔' : 'OFF 🔕'}</Text>
        </Pressable>
        <View style={styles.accountDivider} />
        <View style={styles.accountRow}>
          <Text style={styles.accountRowIcon}>🌐</Text>
          <View style={styles.accountRowCopy}>
            <Text style={styles.accountRowTitle}>Language</Text>
            <Text style={styles.accountRowSubtitle}>Choose how READY/NEEDY speaks to you</Text>
          </View>
          <Text style={styles.accountRowValue}>English ›</Text>
        </View>
      </View>

      <Pressable style={styles.logoutButton} onPress={handleSignOut}>
        <Text style={styles.logoutButtonText}>🚪 Log out</Text>
      </Pressable>
      <Text style={styles.accountFooter}>READY/NEEDY v1.0 · Made for people who show up 💙</Text>
    </ScrollView>
  );

  const renderSettings = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {renderHeader('Settings')}
      <View style={styles.settingsHero}>
        <Text style={styles.settingsHeroEmoji}>⚙️</Text>
        <View style={styles.actionCopy}><Text style={styles.settingsHeroTitle}>Your controls, your call</Text><Text style={styles.settingsHeroText}>Manage privacy, alerts, and how READY/NEEDY connects you.</Text></View>
      </View>
      <Text style={styles.accountSectionTitle}>🔔 Notifications</Text>
      <View style={styles.accountPanel}><View style={styles.accountRow}><Text style={styles.accountRowIcon}>📡</Text><View style={styles.accountRowCopy}><Text style={styles.accountRowTitle}>Nearby dispatch alerts</Text><Text style={styles.accountRowSubtitle}>Get notified when a request matches your radius.</Text></View><Pressable style={[styles.toggle, notificationsEnabled && styles.toggleOn]} onPress={handleNotificationToggle}><Text style={styles.toggleKnob}>{notificationsEnabled ? '●' : '○'}</Text></Pressable></View></View>
      <Text style={styles.accountSectionTitle}>🔐 Privacy & location</Text>
      <View style={styles.accountPanel}><View style={styles.accountRow}><Text style={styles.accountRowIcon}>📍</Text><View style={styles.accountRowCopy}><Text style={styles.accountRowTitle}>Share location while Ready</Text><Text style={styles.accountRowSubtitle}>Only used to match you with nearby people.</Text></View><Pressable style={[styles.toggle, locationSharingEnabled && styles.toggleOn]} onPress={handleLocationToggle}><Text style={styles.toggleKnob}>{locationSharingEnabled ? '●' : '○'}</Text></Pressable></View><View style={styles.accountDivider} /><View style={styles.accountRow}><Text style={styles.accountRowIcon}>🛡️</Text><View style={styles.accountRowCopy}><Text style={styles.accountRowTitle}>Identity & data</Text><Text style={styles.accountRowSubtitle}>Your ID and account data are protected.</Text></View><Text style={styles.verifiedText}>Secure ✓</Text></View></View>
      <Text style={styles.accountSectionTitle}>📱 App</Text>
      <View style={styles.accountPanel}><View style={styles.accountRow}><Text style={styles.accountRowIcon}>🌐</Text><View style={styles.accountRowCopy}><Text style={styles.accountRowTitle}>Language</Text><Text style={styles.accountRowSubtitle}>The app currently uses English.</Text></View><Text style={styles.accountRowValue}>English ›</Text></View><View style={styles.accountDivider} /><View style={styles.accountRow}><Text style={styles.accountRowIcon}>ℹ️</Text><View style={styles.accountRowCopy}><Text style={styles.accountRowTitle}>Version</Text><Text style={styles.accountRowSubtitle}>READY/NEEDY production build</Text></View><Text style={styles.accountRowValue}>1.0.0</Text></View></View>
      <Pressable style={styles.secondaryButton} onPress={() => setScreen('account')}><Text style={styles.secondaryButtonText}>← Back to account</Text></Pressable>
    </ScrollView>
  );

  const renderBottomNav = () => (
    <View style={styles.bottomNav}>
      <Pressable style={styles.navItem} onPress={() => setScreen('home')}>
        <Text style={styles.navEmoji}>🏠</Text>
        <Text style={[styles.navLabel, screen === 'home' && styles.navLabelActive]}>Home</Text>
      </Pressable>
      <Pressable style={styles.navItem} onPress={() => selectMode('READY')}>
        <Text style={styles.navEmoji}>🟢</Text>
        <Text style={[styles.navLabel, screen === 'ready' && styles.navLabelActive]}>Ready</Text>
      </Pressable>
      <Pressable style={styles.navCenterButton} onPress={() => selectMode('NEEDY')}>
        <Text style={styles.navCenterEmoji}>＋</Text>
      </Pressable>
      {userMode === 'READY' && (
        <Pressable style={styles.navItem} onPress={() => setScreen('signal')}>
          <Text style={styles.navEmoji}>📡</Text>
          <Text style={[styles.navLabel, screen === 'signal' && styles.navLabelActive]}>Signals</Text>
        </Pressable>
      )}
      <Pressable style={styles.navItem} onPress={() => setScreen('account')}>
        <Text style={styles.navEmoji}>👤</Text>
        <Text style={[styles.navLabel, screen === 'account' && styles.navLabelActive]}>Account</Text>
      </Pressable>
    </View>
  );

  const renderCurrentScreen = () => {
    switch (screen) {
      case 'welcome':
        return renderWelcome();
      case 'login':
        return renderLogin();
      case 'verification':
        return renderVerification();
      case 'requirements':
        return renderRequirements();
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
      case 'account':
        return renderAccount();
      case 'settings':
        return renderSettings();
      default:
        return renderHome();
    }
  };

  const showBottomNav = !['welcome', 'login', 'verification', 'requirements'].includes(screen);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.appShell}>
        <LiveBackground />
        {feedback && <View style={styles.feedbackBanner}><Text style={styles.feedbackIcon}>✦</Text><Text style={styles.feedbackText}>{feedback}</Text><Pressable onPress={() => setFeedback(null)}><Text style={styles.feedbackClose}>×</Text></Pressable></View>}
        {renderCurrentScreen()}
        {showBottomNav && renderBottomNav()}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  appShell: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: 'transparent',
  },
  feedbackBanner: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 13,
    borderRadius: 14,
    backgroundColor: '#082f49',
    borderWidth: 1,
    borderColor: '#0e7490',
  },
  feedbackIcon: { color: '#67e8f9', fontSize: 18, marginRight: 8 },
  feedbackText: { flex: 1, color: '#e0f2fe', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  feedbackClose: { color: '#bae6fd', fontSize: 24, marginLeft: 8 },
  liveBackground: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    backgroundColor: '#08111f',
  },
  backgroundGrid: {
    ...StyleSheet.absoluteFill,
    opacity: 0.28,
    backgroundColor: '#0b1c2e',
    borderWidth: 1,
    borderColor: '#12324a',
  },
  liveBand: {
    position: 'absolute',
    width: 520,
    height: 170,
    borderRadius: 120,
    opacity: 0.2,
  },
  liveBandOne: {
    top: 90,
    left: -160,
    backgroundColor: '#0891b2',
    transform: [{ rotate: '-14deg' }],
  },
  liveBandTwo: {
    top: 430,
    left: -100,
    backgroundColor: '#2563eb',
    transform: [{ rotate: '18deg' }],
  },
  backgroundScanLine: {
    position: 'absolute',
    top: '42%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#38bdf8',
    opacity: 0.22,
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
  landingContainer: {
    padding: 20,
    paddingTop: 32,
    paddingBottom: 42,
  },
  landingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 26,
  },
  networkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#052e2b',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#166534',
  },
  networkDot: {
    color: '#4ade80',
    fontSize: 10,
    marginRight: 5,
  },
  networkText: {
    color: '#86efac',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  heroOrb: {
    height: 190,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
    backgroundColor: '#0c2840',
    borderWidth: 1,
    borderColor: '#155e75',
  },
  heroOrbEmoji: {
    fontSize: 78,
  },
  heroOrbSignal: {
    color: '#67e8f9',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  heroEyebrow: {
    color: '#67e8f9',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  liveTicker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 11,
    marginBottom: 18,
    borderLeftWidth: 3,
    borderLeftColor: '#4ade80',
  },
  liveTickerEmoji: {
    fontSize: 17,
    marginRight: 8,
  },
  liveTickerText: {
    flex: 1,
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '600',
  },
  liveTickerTime: {
    color: '#4ade80',
    fontSize: 10,
    fontWeight: '800',
  },
  landingStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#243b53',
  },
  landingStat: {
    flex: 1,
    alignItems: 'center',
  },
  landingStatValue: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '900',
  },
  landingStatLabel: {
    color: '#94a3b8',
    fontSize: 9,
    textAlign: 'center',
    marginTop: 4,
  },
  landingStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#334155',
  },
  chooseModeTitle: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 10,
  },
  landingModeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 2,
  },
  landingModeCard: {
    flex: 1,
    minHeight: 108,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 17,
    borderWidth: 1,
  },
  landingReadyCard: {
    backgroundColor: '#123524',
    borderColor: '#166534',
  },
  landingNeedyCard: {
    backgroundColor: '#3a2118',
    borderColor: '#9a3412',
  },
  landingModeEmoji: {
    fontSize: 27,
    marginBottom: 5,
  },
  landingModeTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '900',
  },
  landingModeHint: {
    color: '#cbd5e1',
    fontSize: 11,
    marginTop: 3,
  },
  landingTrust: {
    color: '#64748b',
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 17,
    marginTop: 20,
  },
  formContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: '#0f172a',
  },
  onboardingContent: {
    padding: 24,
    paddingTop: 34,
    paddingBottom: 48,
  },
  onboardingBrand: { flexDirection: 'row', alignItems: 'center', marginBottom: 25 },
  onboardingBrandEmoji: { fontSize: 25, marginRight: 9 },
  onboardingBrandText: { color: '#67e8f9', fontSize: 14, fontWeight: '900', letterSpacing: 1.1 },
  onboardingProgress: { flexDirection: 'row', alignItems: 'center', marginBottom: 27 },
  progressDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#334155' },
  progressDotActive: { backgroundColor: '#38bdf8' },
  progressLine: { height: 2, flex: 1, marginHorizontal: 6, backgroundColor: '#334155' },
  progressLineActive: { backgroundColor: '#38bdf8' },
  onboardingEyebrow: { color: '#67e8f9', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 10 },
  onboardingTitle: { color: '#f8fafc', fontSize: 29, lineHeight: 35, fontWeight: '900' },
  onboardingText: { color: '#94a3b8', fontSize: 14, lineHeight: 21, marginTop: 10, marginBottom: 22 },
  onboardingCard: { backgroundColor: '#111827', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#334155' },
  formIcon: { fontSize: 33, marginBottom: 3 },
  privacyNote: { color: '#64748b', textAlign: 'center', fontSize: 11, lineHeight: 17, marginTop: 15 },
  verificationCard: { alignItems: 'center', backgroundColor: '#102238', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#155e75' },
  verificationBigEmoji: { fontSize: 53, marginBottom: 8 },
  verificationCardTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  verificationCardText: { color: '#94a3b8', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7 },
  verificationChecks: { alignSelf: 'stretch', marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#1e3a5f' },
  checkRow: { color: '#bae6fd', fontSize: 12, marginBottom: 8 },
  uploadButton: { alignSelf: 'stretch', alignItems: 'center', borderRadius: 13, paddingVertical: 14, marginTop: 7, backgroundColor: '#164e63', borderWidth: 1, borderColor: '#0891b2' },
  uploadButtonText: { color: '#cffafe', fontSize: 14, fontWeight: '800' },
  disabledButton: { opacity: 0.42 },
  requirementPanel: { backgroundColor: '#111827', borderRadius: 17, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  requirementPanelTitle: { color: '#f8fafc', fontSize: 15, fontWeight: '900' },
  requirementPanelText: { color: '#94a3b8', fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 12 },
  preferenceChoice: { flexDirection: 'row', alignItems: 'center', minHeight: 45, paddingHorizontal: 11, borderRadius: 11, backgroundColor: '#1e293b' },
  preferenceChoiceIcon: { fontSize: 19, marginRight: 9 },
  preferenceChoiceText: { flex: 1, color: '#e2e8f0', fontSize: 12, fontWeight: '700' },
  preferenceCheck: { color: '#4ade80', fontSize: 21, fontWeight: '900' },
  modeScreenContent: {
    padding: 20,
    paddingBottom: 52,
  },
  readyHero: {
    backgroundColor: '#123524',
    borderRadius: 22,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#166534',
  },
  readyHeroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  readyEyebrow: {
    color: '#86efac',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  readyPulse: {
    color: '#4ade80',
    fontSize: 11,
    fontWeight: '900',
  },
  readyHeroTitle: {
    color: '#f0fdf4',
    fontSize: 26,
    fontWeight: '900',
    marginTop: 18,
  },
  readyHeroText: {
    color: '#bbf7d0',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
  },
  readyLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: '#166534',
  },
  readyLocationIcon: { fontSize: 17, marginRight: 7 },
  readyLocationText: { flex: 1, color: '#dcfce7', fontSize: 12, fontWeight: '700' },
  readyLocationCheck: { color: '#4ade80', fontSize: 16, fontWeight: '900' },
  readyStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderRadius: 17,
    paddingVertical: 15,
    marginBottom: 23,
    borderWidth: 1,
    borderColor: '#243b53',
  },
  readyStat: { flex: 1, alignItems: 'center' },
  readyStatValue: { color: '#f8fafc', fontSize: 17, fontWeight: '900' },
  readyStatLabel: { color: '#94a3b8', fontSize: 10, textAlign: 'center', marginTop: 4 },
  modeSectionTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: '900', marginBottom: 11 },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  toolCard: { width: '48%', backgroundColor: '#111827', borderRadius: 16, padding: 15, borderWidth: 1, borderColor: '#334155' },
  toolEmoji: { fontSize: 25, marginBottom: 10 },
  toolTitle: { color: '#f8fafc', fontSize: 14, fontWeight: '800' },
  toolText: { color: '#94a3b8', fontSize: 11, marginTop: 4 },
  readyStopButton: { alignItems: 'center', paddingVertical: 15, borderRadius: 14, borderWidth: 1, borderColor: '#365314', backgroundColor: '#172312' },
  readyStopText: { color: '#bef264', fontSize: 14, fontWeight: '800' },
  needyHero: { backgroundColor: '#3a2118', borderRadius: 22, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#9a3412' },
  needyEyebrow: { color: '#fdba74', fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  needyTitle: { color: '#fff7ed', fontSize: 26, fontWeight: '900', lineHeight: 31, marginTop: 13 },
  needyText: { color: '#fed7aa', fontSize: 13, lineHeight: 19, marginTop: 8 },
  needStepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  needStep: { width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155' },
  needStepActive: { width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f97316' },
  needStepNumber: { color: '#fff', fontSize: 12, fontWeight: '900' },
  needStepText: { color: '#fed7aa', fontSize: 11, fontWeight: '800', marginLeft: 6 },
  needStepMuted: { color: '#64748b', fontSize: 11, marginLeft: 6 },
  needStepLine: { height: 1, flex: 1, marginHorizontal: 8, backgroundColor: '#475569' },
  needInputRow: { flexDirection: 'row', gap: 10 },
  needInputHalf: { flex: 1 },
  largeInput: { minHeight: 100, backgroundColor: '#111827', color: '#f8fafc', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#9a3412', textAlignVertical: 'top' },
  needSummary: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#102238', borderRadius: 15, padding: 14, marginTop: 18, borderWidth: 1, borderColor: '#155e75' },
  needSummaryIcon: { fontSize: 24, marginRight: 11 },
  needSummaryTitle: { color: '#bae6fd', fontSize: 13, fontWeight: '800' },
  needSummaryText: { color: '#94a3b8', fontSize: 11, marginTop: 3 },
  needyBroadcastButton: { backgroundColor: '#f97316', borderRadius: 15, paddingVertical: 17, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  cancelButton: { alignItems: 'center', paddingVertical: 14, marginTop: 5 },
  cancelButtonText: { color: '#fca5a5', fontSize: 13, fontWeight: '800' },
  offlineHero: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#172033', borderRadius: 20, padding: 18, marginBottom: 17, borderWidth: 1, borderColor: '#334155' },
  offlineMoon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: '#273449', marginRight: 14 },
  offlineMoonEmoji: { fontSize: 30 },
  offlineTitle: { color: '#e2e8f0', fontSize: 17, fontWeight: '900' },
  offlineText: { color: '#94a3b8', fontSize: 12, lineHeight: 17, marginTop: 4 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 20,
    marginRight: 8,
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
  panelHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  livePill: {
    color: '#7dd3fc',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  modeOption: {
    flex: 1,
    minHeight: 92,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modeOptionActive: {
    borderColor: '#7dd3fc',
  },
  modeOptionEmoji: {
    fontSize: 22,
    marginBottom: 4,
  },
  modeOptionLabel: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  modeOptionHint: {
    color: '#cbd5e1',
    fontSize: 9,
    marginTop: 3,
    textAlign: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  actionIcon: {
    fontSize: 28,
    marginRight: 14,
  },
  actionCopy: {
    flex: 1,
  },
  actionArrow: {
    color: '#7dd3fc',
    fontSize: 30,
    marginLeft: 8,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#102238',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#155e75',
  },
  statusCardIcon: {
    fontSize: 28,
    marginRight: 14,
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
  emptyStateCard: {
    alignItems: 'center',
    backgroundColor: '#102238',
    borderRadius: 20,
    padding: 28,
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#155e75',
  },
  emptyStateEmoji: {
    fontSize: 44,
    marginBottom: 12,
  },
  emptyStateTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyStateText: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
  },
  requestLiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3a2118',
    borderRadius: 15,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#9a3412',
  },
  requestLiveIcon: {
    fontSize: 25,
    marginRight: 11,
  },
  requestLiveTitle: {
    color: '#fed7aa',
    fontSize: 14,
    fontWeight: '800',
  },
  requestLiveText: {
    color: '#fdba74',
    fontSize: 11,
    marginTop: 3,
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
  profileHero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  avatarCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#164e63',
    borderWidth: 2,
    borderColor: '#38bdf8',
  },
  avatarEmoji: {
    fontSize: 36,
  },
  profileIdentity: {
    flex: 1,
    marginLeft: 14,
  },
  profileName: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
  },
  profileHandle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
  profileStatus: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 7,
  },
  editButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
  },
  editButtonText: {
    fontSize: 17,
  },
  accountStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#082f49',
    borderRadius: 18,
    paddingVertical: 16,
    marginBottom: 20,
  },
  accountStat: {
    flex: 1,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#155e75',
  },
  accountStatEmoji: {
    fontSize: 19,
    marginBottom: 3,
  },
  accountStatValue: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '800',
  },
  accountStatLabel: {
    color: '#bae6fd',
    fontSize: 11,
    marginTop: 3,
  },
  accountSectionTitle: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
    marginTop: 4,
  },
  accountPanel: {
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingHorizontal: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#334155',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    paddingVertical: 10,
  },
  accountRowIcon: {
    fontSize: 23,
    width: 38,
  },
  accountRowCopy: {
    flex: 1,
    paddingRight: 8,
  },
  accountRowTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  accountRowSubtitle: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  accountRowValue: {
    color: '#7dd3fc',
    fontSize: 12,
    fontWeight: '800',
  },
  verifiedText: {
    color: '#4ade80',
    fontSize: 11,
    fontWeight: '800',
  },
  preferenceValue: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '800',
  },
  accountDivider: {
    height: 1,
    backgroundColor: '#1e293b',
  },
  toggle: {
    width: 42,
    height: 25,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#334155',
  },
  toggleOn: {
    backgroundColor: '#166534',
  },
  toggleKnob: {
    color: '#bbf7d0',
    fontSize: 18,
    lineHeight: 20,
  },
  logoutButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    backgroundColor: '#1c1917',
  },
  logoutButtonText: {
    color: '#fca5a5',
    fontSize: 15,
    fontWeight: '800',
  },
  accountFooter: {
    color: '#64748b',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  settingsHero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#102238',
    borderRadius: 18,
    padding: 18,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: '#155e75',
  },
  settingsHeroEmoji: { fontSize: 32, marginRight: 13 },
  settingsHeroTitle: { color: '#f8fafc', fontSize: 17, fontWeight: '900' },
  settingsHeroText: { color: '#94a3b8', fontSize: 12, lineHeight: 17, marginTop: 4 },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    minHeight: 72,
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: '#111827',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
    paddingTop: 8,
  },
  navEmoji: {
    fontSize: 18,
    marginBottom: 3,
  },
  navLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
  },
  navLabelActive: {
    color: '#7dd3fc',
  },
  navCenterButton: {
    width: 52,
    height: 52,
    marginTop: -22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: '#38bdf8',
    borderWidth: 5,
    borderColor: '#0f172a',
  },
  navCenterEmoji: {
    color: '#082f49',
    fontSize: 30,
    fontWeight: '400',
    lineHeight: 32,
  },
});
