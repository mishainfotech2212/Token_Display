import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Branch,
  CounterTokenDisplayItem,
  Organization,
  PublicCounterTokenDisplayResponse,
  TokenDisplayTicker,
  WaitingToken,
} from '@/services/api-types';
import { publicBranchesApi } from '@/services/public-branches-api';
import { publicCounterTokenDisplayApi } from '@/services/public-counter-token-display-api';
import { DisplayLanguage, LANGUAGE_OPTIONS, speechService } from '@/services/speech-service';

const POLL_INTERVAL_MS = 5000;
const MIN_DISPLAY_SCALE = 1;
const MAX_DISPLAY_SCALE = 2.4;
const PAGE_HORIZONTAL_PADDING = 24;
const COUNTER_GRID_GAP = 18;
const MAX_COUNTER_COLUMNS = 4;

export default function HomeScreen() {
  const { height, width } = useWindowDimensions();
  const [branchCode, setBranchCode] = useState('');
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [tokenDisplay, setTokenDisplay] = useState<PublicCounterTokenDisplayResponse | null>(null);
  const [language, setLanguage] = useState<DisplayLanguage>('en');
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isLoadingDisplay, setIsLoadingDisplay] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousServingTokensRef = useRef<Map<string, string>>(new Map());

  const activeCounters = useMemo(
    () => tokenDisplay?.counters.filter((item) => item.counter.status === 'active') ?? [],
    [tokenDisplay],
  );
  const displayScale = useMemo(() => getDisplayScale(width, height), [height, width]);
  const displayIssue = tokenDisplay ? getDisplayIssue(tokenDisplay) : null;
  const ticker = tokenDisplay?.display?.ticker;
  const showTopTicker = shouldShowTicker(ticker, 'top');
  const showBottomTicker = shouldShowTicker(ticker, 'bottom');
  const counterCardWidth = useMemo(
    () => getCounterCardWidth(width, displayScale),
    [displayScale, width],
  );

  const handleBranchCodeChange = (value: string) => {
    setBranchCode(value.toUpperCase());
  };

  const loadBranches = async () => {
    const normalizedCode = branchCode.trim();

    if (!normalizedCode) {
      setError('Please enter branch code.');
      return;
    }

    setError(null);
    setIsLoadingBranches(true);
    setSelectedBranch(null);
    setTokenDisplay(null);
    previousServingTokensRef.current = new Map();

    try {
      const response = await publicBranchesApi.getBranches({ branchCode: normalizedCode });
      setOrganization(response.organization);
      setBranches(response.branches);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load branches.');
    } finally {
      setIsLoadingBranches(false);
    }
  };

  const announceChangedTokens = useCallback(
    (display: PublicCounterTokenDisplayResponse, isInitialLoad: boolean) => {
      const nextServingTokens = new Map<string, string>();

      display.counters.forEach((item) => {
        const token = item.currentToken;

        if (!token) {
          return;
        }

        const signature = `${token.ticket_number}-${token.called_at}`;
        const previousSignature = previousServingTokensRef.current.get(item.counter.id);
        nextServingTokens.set(item.counter.id, signature);

        if (!isInitialLoad && previousSignature !== signature) {
          void speechService.announceToken(token, item.counter.name, language);
        }
      });

      previousServingTokensRef.current = nextServingTokens;
    },
    [language],
  );

  const loadTokenDisplay = useCallback(
    async (branch: Branch, isInitialLoad = false) => {
      if (isInitialLoad) {
        setIsLoadingDisplay(true);
      } else {
        setIsRefreshing(true);
      }

      setError(null);

      try {
        const response = await publicCounterTokenDisplayApi.getTokenDisplay({ branch_id: branch.id });
        setTokenDisplay(response);
        if (!getDisplayIssue(response)) {
          announceChangedTokens(response, isInitialLoad);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load token display.');
      } finally {
        setIsLoadingDisplay(false);
        setIsRefreshing(false);
      }
    },
    [announceChangedTokens],
  );

  const selectBranch = (branch: Branch) => {
    setSelectedBranch(branch);
    setTokenDisplay(null);
    previousServingTokensRef.current = new Map();
    void loadTokenDisplay(branch, true);
  };

  const resetToBranchCode = () => {
    setOrganization(null);
    setBranches([]);
    setSelectedBranch(null);
    setTokenDisplay(null);
    setError(null);
    previousServingTokensRef.current = new Map();
    speechService.stop();
  };

  const resetToBranches = () => {
    setSelectedBranch(null);
    setTokenDisplay(null);
    setError(null);
    previousServingTokensRef.current = new Map();
    speechService.stop();
  };

  useEffect(() => {
    if (!selectedBranch) {
      return;
    }

    const interval = setInterval(() => {
      void loadTokenDisplay(selectedBranch);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [loadTokenDisplay, selectedBranch]);

  useEffect(() => {
    return () => speechService.stop();
  }, []);

  if (selectedBranch) {
    return (
      <SafeAreaView
        style={[
          styles.page,
          {
            paddingHorizontal: PAGE_HORIZONTAL_PADDING * displayScale,
            paddingVertical: 20 * displayScale,
          },
        ]}>
        <Header
          scale={displayScale}
          title={tokenDisplay?.branch.name ?? selectedBranch.name}
          subtitle={`${organization?.name ?? 'Organization'} - Live Counter Display`}
          onBack={resetToBranches}
          rightContent={
            <View style={[styles.headerRight, { gap: 8 * displayScale }]}>
              <LanguageSelector scale={displayScale} value={language} onChange={setLanguage} />
              <Text
                style={[
                  styles.refreshText,
                  { fontSize: 14 * displayScale, lineHeight: 20 * displayScale },
                ]}>
                Refresh every 5s
                {tokenDisplay?.last_updated ? ` - Updated ${formatTime(tokenDisplay.last_updated)}` : ''}
              </Text>
            </View>
          }
        />

        {error && <StatusMessage message={error} type="error" />}

        {isLoadingDisplay && !tokenDisplay ? (
          <LoadingState label="Loading counter display..." />
        ) : displayIssue ? (
          <DisplayStatusCard issue={displayIssue} onBack={resetToBranches} scale={displayScale} />
        ) : (
          <>
            {showTopTicker && <TickerBanner ticker={ticker} scale={displayScale} width={width} />}
            <ScrollView
              contentContainerStyle={[
                styles.counterGrid,
                { gap: COUNTER_GRID_GAP * displayScale },
              ]}>
              {activeCounters.length > 0 ? (
                activeCounters.map((item) => (
                  <CounterCard
                    key={item.counter.id}
                    item={item}
                    scale={displayScale}
                    width={counterCardWidth}
                  />
                ))
              ) : (
                <EmptyState message="No active counters found for this branch." />
              )}
            </ScrollView>
            {showBottomTicker && <TickerBanner ticker={ticker} scale={displayScale} width={width} />}
          </>
        )}

        {isRefreshing && <Text style={styles.refreshingText}>Updating live display...</Text>}
      </SafeAreaView>
    );
  }

  if (organization) {
    return (
      <SafeAreaView style={styles.page}>
        <Header
          scale={1}
          title={organization.name}
          subtitle="Select a branch"
          onBack={resetToBranchCode}
        />
        {error && <StatusMessage message={error} type="error" />}

        <ScrollView contentContainerStyle={styles.branchGrid}>
          {branches.length > 0 ? (
            branches.map((branch) => (
              <Pressable key={branch.id} style={styles.branchCard} onPress={() => selectBranch(branch)}>
                <Text style={styles.branchName}>{branch.name}</Text>
                <Text style={styles.branchAddress}>{branch.address}</Text>
              </Pressable>
            ))
          ) : (
            <EmptyState message="No active branches found for this code." />
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.page, styles.centerPage]}>
      <View style={styles.loginCard}>
        <View style={styles.displayIconBox}>
          <View style={styles.displayIconScreen} />
          <View style={styles.displayIconStand} />
        </View>
        <Text style={styles.loginTitle}>Token Display</Text>
        <Text style={styles.loginSubtitle}>Enter your branch code to continue</Text>
        <TextInput
          autoCapitalize="characters"
          autoCorrect={false}
          onChangeText={handleBranchCodeChange}
          onSubmitEditing={loadBranches}
          placeholder="E.G. BR001"
          placeholderTextColor="#747b88"
          returnKeyType="go"
          style={styles.input}
          value={branchCode}
        />
        <Pressable
          disabled={isLoadingBranches || !branchCode.trim()}
          onPress={loadBranches}
          style={({ pressed }) => [
            styles.primaryButton,
            (!branchCode.trim() || isLoadingBranches) && styles.disabledButton,
            pressed && styles.pressed,
          ]}>
          {isLoadingBranches ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>Continue</Text>
          )}
        </Pressable>
        {error && <StatusMessage message={error} type="error" />}
      </View>
    </SafeAreaView>
  );
}

type HeaderProps = {
  scale: number;
  title: string;
  subtitle: string;
  onBack: () => void;
  rightContent?: ReactNode;
};

function Header({ scale, title, subtitle, onBack, rightContent }: HeaderProps) {
  return (
    <View style={[styles.header, { marginBottom: 26 * scale }]}>
      <View style={[styles.headerLeft, { gap: 18 * scale }]}>
        <Pressable style={[styles.backButton, { gap: 10 * scale }]} onPress={onBack}>
          <Text style={[styles.backArrow, { fontSize: 24 * scale }]}>{'<'}</Text>
          <Text style={[styles.backText, { fontSize: 16 * scale }]}>Back</Text>
        </Pressable>
        <View>
          <Text style={[styles.headerTitle, { fontSize: 22 * scale, lineHeight: 28 * scale }]}>
            {title}
          </Text>
          <Text style={[styles.headerSubtitle, { fontSize: 16 * scale, lineHeight: 22 * scale }]}>
            {subtitle}
          </Text>
        </View>
      </View>
      {rightContent}
    </View>
  );
}

type LanguageSelectorProps = {
  scale: number;
  value: DisplayLanguage;
  onChange: (language: DisplayLanguage) => void;
};

function LanguageSelector({ scale, value, onChange }: LanguageSelectorProps) {
  return (
    <View style={[styles.languageSelector, { padding: 3 * scale }]}>
      {LANGUAGE_OPTIONS.map((option) => (
        <Pressable
          key={option.value}
          onPress={() => onChange(option.value)}
          style={[
            styles.languageButton,
            { paddingHorizontal: 14 * scale, paddingVertical: 7 * scale },
            value === option.value && styles.activeLanguageButton,
          ]}>
          <Text
            style={[
              styles.languageText,
              { fontSize: 13 * scale, lineHeight: 18 * scale },
              value === option.value && styles.activeLanguageText,
            ]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function CounterCard({
  item,
  scale,
  width,
}: {
  item: CounterTokenDisplayItem;
  scale: number;
  width: number;
}) {
  const currentToken = item.currentToken;
  const nextTokens = item.waitingTokens.slice(0, 5);

  return (
    <View
      style={[
        styles.counterCard,
        {
          borderRadius: 12 * scale,
          width,
          minHeight: 330 * scale,
          paddingHorizontal: 32 * scale,
          paddingVertical: 30 * scale,
        },
      ]}>
      <View style={styles.cardTopRow}>
        <View style={[styles.counterLabelRow, { gap: 10 * scale }]}>
          <Text style={[styles.soundText, { fontSize: 16 * scale, lineHeight: 22 * scale }]}>
            Counter
          </Text>
          <Text style={[styles.counterName, { fontSize: 26 * scale, lineHeight: 32 * scale }]}>
            {item.counter.name}
          </Text>
        </View>
        <View
          style={[
            styles.servingBadge,
            { paddingHorizontal: 18 * scale, paddingVertical: 9 * scale },
          ]}>
          <Text style={[styles.servingBadgeText, { fontSize: 15 * scale, lineHeight: 20 * scale }]}>
            Now Serving
          </Text>
        </View>
      </View>

      <View style={[styles.divider, { marginVertical: 24 * scale }]} />

      <View style={styles.currentTokenBlock}>
        <Text style={[styles.sectionLabel, { fontSize: 18 * scale, lineHeight: 24 * scale }]}>
          NOW SERVING
        </Text>
        <Text style={[styles.currentToken, { fontSize: 82 * scale, lineHeight: 94 * scale }]}>
          {currentToken?.ticket_number ?? '--'}
        </Text>
        {currentToken && (
          <View
            style={[
              styles.servicePill,
              {
                borderColor: currentToken.service_color,
                paddingHorizontal: 16 * scale,
                paddingVertical: 7 * scale,
              },
            ]}>
            <Text
              style={[
                styles.servicePillText,
                { color: currentToken.service_color, fontSize: 17 * scale, lineHeight: 23 * scale },
              ]}>
              {currentToken.service_name}
            </Text>
          </View>
        )}
      </View>

      <View style={[styles.divider, { marginVertical: 24 * scale }]} />

      <View>
        <Text style={[styles.sectionLabel, { fontSize: 18 * scale, lineHeight: 24 * scale }]}>
          NEXT IN QUEUE
        </Text>
        {nextTokens.length > 0 ? (
          nextTokens.map((token) => (
            <WaitingTokenRow key={token.ticket_number} token={token} scale={scale} />
          ))
        ) : (
          <Text style={[styles.emptyQueueText, { fontSize: 17 * scale, lineHeight: 23 * scale }]}>
            No waiting tokens
          </Text>
        )}
      </View>
    </View>
  );
}

function WaitingTokenRow({ token, scale }: { token: WaitingToken; scale: number }) {
  return (
    <View style={[styles.waitingTokenRow, { marginTop: 12 * scale }]}>
      <Text
        style={[styles.waitingTokenNumber, { fontSize: 18 * scale, lineHeight: 25 * scale }]}>
        {token.ticket_number}
      </Text>
      <Text
        style={[styles.waitingTokenService, { fontSize: 18 * scale, lineHeight: 25 * scale }]}>
        {token.service_name}
      </Text>
    </View>
  );
}

function StatusMessage({ message, type }: { message: string; type: 'error' }) {
  return (
    <View style={[styles.statusMessage, type === 'error' && styles.errorMessage]}>
      <Text style={styles.errorMessageText}>{message}</Text>
    </View>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <View style={styles.stateContainer}>
      <ActivityIndicator color="#2f5bd3" />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.stateContainer}>
      <Text style={styles.stateText}>{message}</Text>
    </View>
  );
}

type DisplayIssue = 'offline' | 'missing';

function DisplayStatusCard({
  issue,
  onBack,
  scale,
}: {
  issue: DisplayIssue;
  onBack: () => void;
  scale: number;
}) {
  const isOffline = issue === 'offline';

  return (
    <View style={styles.displayStatusWrapper}>
      <View
        style={[
          styles.displayStatusCard,
          {
            borderRadius: 14 * scale,
            paddingHorizontal: 48 * scale,
            paddingVertical: 52 * scale,
          },
        ]}>
        <View
          style={[
            styles.displayStatusIcon,
            isOffline ? styles.offlineIcon : styles.missingDisplayIcon,
            {
              width: 58 * scale,
              height: 58 * scale,
              borderRadius: 29 * scale,
              marginBottom: 24 * scale,
            },
          ]}>
          <Text
            style={[
              styles.displayStatusIconText,
              isOffline ? styles.offlineIconText : styles.missingDisplayIconText,
              { fontSize: 34 * scale, lineHeight: 44 * scale },
            ]}>
            {isOffline ? 'x' : '!'}
          </Text>
        </View>

        <Text
          style={[
            styles.displayStatusTitle,
            { fontSize: 24 * scale, lineHeight: 32 * scale, marginBottom: 22 * scale },
          ]}>
          {isOffline ? 'This display is currently offline.' : 'No display added for this branch.'}
        </Text>
        <Text
          style={[
            styles.displayStatusSubtitle,
            { fontSize: 17 * scale, lineHeight: 25 * scale, marginBottom: 24 * scale },
          ]}>
          {isOffline
            ? 'Please contact administrator.'
            : 'Please ask your administrator to add a Token Display in Admin -> Displays.'}
        </Text>

        <Pressable
          onPress={onBack}
          style={({ pressed }) => [
            styles.displayStatusButton,
            {
              borderRadius: 7 * scale,
              paddingHorizontal: 22 * scale,
              paddingVertical: 13 * scale,
            },
            pressed && styles.pressed,
          ]}>
          <Text style={[styles.displayStatusButtonText, { fontSize: 16 * scale }]}>
            {'<  Back to branches'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function TickerBanner({
  ticker,
  scale,
  width,
}: {
  ticker: TokenDisplayTicker;
  scale: number;
  width: number;
}) {
  const [translateX] = useState(() => new Animated.Value(0));
  const [containerWidth, setContainerWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);

  useEffect(() => {
    if (!containerWidth || !textWidth) {
      return;
    }

    let isActive = true;
    const distance = containerWidth + textWidth;
    const animate = () => {
      translateX.setValue(containerWidth);
      Animated.timing(translateX, {
        toValue: -textWidth,
        duration: getTickerDuration(distance, ticker.speed),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && isActive) {
          animate();
        }
      });
    };

    animate();

    return () => {
      isActive = false;
      translateX.stopAnimation();
    };
  }, [containerWidth, textWidth, ticker.message, ticker.speed, translateX]);

  return (
    <View
      style={[
        styles.tickerBanner,
        {
          height: 46 * scale,
          marginHorizontal: -PAGE_HORIZONTAL_PADDING * scale,
          marginBottom: ticker.position === 'top' ? 18 * scale : 0,
          marginTop: ticker.position === 'bottom' ? 18 * scale : 0,
          width,
        },
      ]}
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width || width)}>
      <Animated.Text
        numberOfLines={1}
        onLayout={(event) => setTextWidth(event.nativeEvent.layout.width)}
        style={[
          styles.tickerText,
          {
            fontSize: 18 * scale,
            lineHeight: 46 * scale,
            transform: [{ translateX }],
          },
        ]}>
        {ticker.message}
      </Animated.Text>
    </View>
  );
}

function formatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getDisplayScale(width: number, height: number) {
  const scale = Math.min(width / 1200, height / 720);
  return Math.max(MIN_DISPLAY_SCALE, Math.min(scale, MAX_DISPLAY_SCALE));
}

function getCounterCardWidth(screenWidth: number, scale: number) {
  const horizontalPadding = PAGE_HORIZONTAL_PADDING * scale * 2;
  const gap = COUNTER_GRID_GAP * scale;
  const availableWidth = Math.max(0, screenWidth - horizontalPadding);
  const minCardWidth = 230 * scale;
  const columns = Math.max(
    1,
    Math.min(MAX_COUNTER_COLUMNS, Math.floor((availableWidth + gap) / (minCardWidth + gap))),
  );

  return (availableWidth - gap * (columns - 1)) / columns;
}

function getDisplayIssue(displayResponse: PublicCounterTokenDisplayResponse): DisplayIssue | null {
  if (!displayResponse.display) {
    return 'missing';
  }

  const displayStatus = displayResponse.displayStatus?.toLowerCase();
  const displayDeviceStatus = displayResponse.display.status?.toLowerCase();

  if (
    displayResponse.displayAllowed === false ||
    (displayStatus && displayStatus !== 'online') ||
    (displayDeviceStatus && displayDeviceStatus !== 'online')
  ) {
    return 'offline';
  }

  return null;
}

function shouldShowTicker(
  ticker: TokenDisplayTicker | null | undefined,
  position: 'top' | 'bottom',
): ticker is TokenDisplayTicker {
  return Boolean(
    ticker?.enabled && ticker.message.trim() && ticker.position.toLowerCase() === position,
  );
}

function getTickerDuration(distance: number, speed: string) {
  const pixelsPerSecond = speed === 'fast' ? 120 : speed === 'slow' ? 45 : 75;
  return Math.max(6000, (distance / pixelsPerSecond) * 1000);
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f5f7fb',
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  centerPage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginCard: {
    width: '100%',
    maxWidth: 840,
    minHeight: 560,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#dce1ea',
    backgroundColor: '#ffffff',
    paddingHorizontal: 60,
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#162033',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 5,
  },
  displayIconBox: {
    width: 104,
    height: 104,
    borderRadius: 22,
    backgroundColor: '#dfe6f8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  displayIconScreen: {
    width: 48,
    height: 34,
    borderWidth: 4,
    borderColor: '#2453ca',
    borderRadius: 5,
  },
  displayIconStand: {
    width: 28,
    height: 10,
    borderBottomWidth: 4,
    borderBottomColor: '#2453ca',
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderColor: '#2453ca',
    marginTop: 4,
  },
  loginTitle: {
    fontSize: 36,
    lineHeight: 44,
    fontWeight: '800',
    color: '#101522',
    marginBottom: 22,
    textAlign: 'center',
  },
  loginSubtitle: {
    fontSize: 24,
    color: '#6d7583',
    marginBottom: 48,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    minHeight: 76,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#dde1e8',
    backgroundColor: '#f9fafc',
    color: '#111827',
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 5,
    paddingHorizontal: 24,
    textAlign: 'center',
    marginBottom: 22,
  },
  primaryButton: {
    width: '100%',
    minHeight: 76,
    borderRadius: 9,
    backgroundColor: '#315bd6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    backgroundColor: '#91a4e5',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.75,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 26,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingRight: 8,
  },
  backArrow: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
  },
  backText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  headerTitle: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#667085',
    fontSize: 16,
    marginTop: 3,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  refreshText: {
    color: '#667085',
    fontSize: 14,
  },
  languageSelector: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#dce2ef',
    borderRadius: 999,
    backgroundColor: '#ffffff',
    padding: 3,
  },
  languageButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  activeLanguageButton: {
    backgroundColor: '#315bd6',
  },
  languageText: {
    color: '#667085',
    fontSize: 13,
    fontWeight: '700',
  },
  activeLanguageText: {
    color: '#ffffff',
  },
  branchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    paddingBottom: 24,
  },
  branchCard: {
    flexGrow: 1,
    flexBasis: 360,
    minHeight: 100,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dce1ea',
    backgroundColor: '#ffffff',
    paddingHorizontal: 22,
    paddingVertical: 24,
    shadowColor: '#162033',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  branchName: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 14,
  },
  branchAddress: {
    color: '#667085',
    fontSize: 16,
  },
  counterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 18,
    paddingBottom: 26,
  },
  counterCard: {
    flexGrow: 0,
    flexShrink: 0,
    borderWidth: 2,
    borderColor: '#6d88f2',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    paddingHorizontal: 26,
    paddingVertical: 26,
    shadowColor: '#315bd6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  counterLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  soundText: {
    color: '#315bd6',
    fontSize: 13,
    fontWeight: '800',
  },
  counterName: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  servingBadge: {
    backgroundColor: '#315bd6',
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 7,
  },
  servingBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: '#dfe3eb',
    marginVertical: 20,
  },
  currentTokenBlock: {
    alignItems: 'center',
  },
  sectionLabel: {
    color: '#777f8c',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  currentToken: {
    color: '#20232d',
    fontSize: 54,
    lineHeight: 62,
    fontWeight: '900',
    letterSpacing: 2,
  },
  servicePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 6,
  },
  servicePillText: {
    fontSize: 14,
    fontWeight: '700',
  },
  waitingTokenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 10,
  },
  waitingTokenNumber: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  waitingTokenService: {
    color: '#667085',
    fontSize: 14,
    textAlign: 'right',
  },
  emptyQueueText: {
    color: '#98a2b3',
    fontSize: 14,
    marginTop: 10,
  },
  statusMessage: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
  },
  errorMessage: {
    backgroundColor: '#fff1f0',
    borderWidth: 1,
    borderColor: '#ffccc7',
  },
  errorMessageText: {
    color: '#b42318',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  stateContainer: {
    flex: 1,
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  stateText: {
    color: '#667085',
    fontSize: 16,
  },
  displayStatusWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  displayStatusCard: {
    width: '100%',
    maxWidth: 980,
    borderWidth: 1,
    borderColor: '#dce1ea',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#162033',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 4,
  },
  displayStatusIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
  },
  offlineIcon: {
    borderColor: '#c32f2f',
  },
  missingDisplayIcon: {
    borderColor: '#6f7785',
  },
  displayStatusIconText: {
    fontWeight: '900',
  },
  offlineIconText: {
    color: '#c32f2f',
  },
  missingDisplayIconText: {
    color: '#6f7785',
  },
  displayStatusTitle: {
    color: '#0f172a',
    fontWeight: '900',
    textAlign: 'center',
  },
  displayStatusSubtitle: {
    color: '#667085',
    textAlign: 'center',
    maxWidth: 680,
  },
  displayStatusButton: {
    borderWidth: 1,
    borderColor: '#d6dbe5',
    backgroundColor: '#ffffff',
  },
  displayStatusButtonText: {
    color: '#0f172a',
    fontWeight: '800',
  },
  tickerBanner: {
    overflow: 'hidden',
    backgroundColor: '#315bd6',
  },
  tickerText: {
    position: 'absolute',
    color: '#ffffff',
    fontWeight: '900',
    letterSpacing: 0.4,
    paddingHorizontal: 12,
  },
  refreshingText: {
    position: 'absolute',
    right: 24,
    bottom: 18,
    color: '#667085',
    fontSize: 12,
  },
});
