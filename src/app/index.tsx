import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Branch,
  CounterTokenDisplayItem,
  FlatCounterTokenDisplayItem,
  DisplayLabels,
  DisplayMedia,
  HealthTip,
  Organization,
  PublicCounterTokenDisplayResponse,
  TokenDisplayTicker,
  WaitingToken,
} from '@/services/api-types';
import { publicBranchesApi } from '@/services/public-branches-api';
import { publicCounterTokenDisplayApi } from '@/services/public-counter-token-display-api';
import { DisplayLanguage, speechService } from '@/services/speech-service';

const POLL_INTERVAL_MS = 5000;
const MIN_DISPLAY_SCALE = 1;
const MAX_DISPLAY_SCALE = 2.4;
const PAGE_HORIZONTAL_PADDING = 24;
const COUNTER_GRID_GAP = 18;
const MAX_COUNTER_COLUMNS = 4;
const TICKER_HEIGHT = 46;
const STATIC_HEALTH_TIP =
  'Please drink enough water and avoid skipping your prescribed medicines.';

type NormalizedTokenDisplay = Omit<PublicCounterTokenDisplayResponse, 'counters'> & {
  counters: CounterTokenDisplayItem[];
};

const STATIC_TOKEN_DISPLAY: NormalizedTokenDisplay = {
  success: true,
  organization: {
    id: 'static-org',
    name: 'Noida Clinic',
    labels: {
      counter: 'Room / Chamber',
      customer: 'Patient',
      queue: 'Patient Queue',
      token: 'Token',
    },
  },
  labels: {
    counter: 'Room / Chamber',
    customer: 'Patient',
    queue: 'Patient Queue',
    token: 'Token',
  },
  branch: {
    id: 'static-branch',
    name: 'Noida Clinic',
  },
  counters: [
    {
      counter: {
        id: 'room-001',
        name: '001',
        number: 1,
        status: 'active',
      },
      assignedServices: [
        {
          id: 'doctor-amit',
          name: 'Dr. Amit Sharma',
          color: '#315bd6',
          code: 'DR-AMIT',
        },
      ],
      assignedDoctor: {
        id: 'doctor-amit',
        name: 'Dr. Amit Sharma',
      },
      currentToken: {
        ticket_number: 'A-102',
        status: 'serving',
        service_name: 'General Consultation',
        service_color: '#315bd6',
        called_at: '2026-06-12T12:26:04.000Z',
      },
      waitingTokens: [
        { ticket_number: 'A-103', service_name: 'General Consultation', service_color: '#315bd6' },
        { ticket_number: 'A-104', service_name: 'General Consultation', service_color: '#315bd6' },
        { ticket_number: 'A-105', service_name: 'General Consultation', service_color: '#315bd6' },
      ],
    },
    {
      counter: {
        id: 'room-002',
        name: '002',
        number: 2,
        status: 'active',
      },
      assignedServices: [
        {
          id: 'doctor-neha',
          name: 'Dr. Neha Verma',
          color: '#315bd6',
          code: 'DR-NEHA',
        },
      ],
      assignedDoctor: {
        id: 'doctor-neha',
        name: 'Dr. Neha Verma',
      },
      currentToken: {
        ticket_number: 'B-018',
        status: 'serving',
        service_name: 'Dental Care',
        service_color: '#315bd6',
        called_at: '2026-06-12T12:26:04.000Z',
      },
      waitingTokens: [
        { ticket_number: 'B-019', service_name: 'Dental Care', service_color: '#315bd6' },
        { ticket_number: 'B-020', service_name: 'Dental Care', service_color: '#315bd6' },
      ],
    },
  ],
  last_updated: '2026-06-12T12:26:04.000Z',
  displayAllowed: true,
  displayStatus: 'ONLINE',
  display: {
    id: 'static-display',
    name: 'Clinic Display',
    code: 'STATIC',
    status: 'online',
    ticker: {
      enabled: true,
      message:
        'Noida Clinic • Please wait for your token number • Emergency patients will be given priority • Thank you for your patience',
      speed: 'normal',
      position: 'bottom',
    },
  },
  media: [
    {
      id: 'static-carousel-placeholder',
      name: 'Image / Video Carousel Area',
      type: 'text',
      url: null,
      text_content: null,
      duration_seconds: 10,
    },
  ],
  healthTips: [
    {
      id: 'static-health-tip',
      title: 'Health Tip',
      message: STATIC_HEALTH_TIP,
      assignedDoctor: null,
      status: 'active',
    },
  ],
};

export default function HomeScreen() {
  const { height, width } = useWindowDimensions();
  const [branchCode, setBranchCode] = useState('');
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [tokenDisplay, setTokenDisplay] = useState<PublicCounterTokenDisplayResponse | null>(null);
  const [language] = useState<DisplayLanguage>('en');
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isLoadingDisplay, setIsLoadingDisplay] = useState(false);
  const [, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [clockTime, setClockTime] = useState(() => new Date());
  const previousServingTokensRef = useRef<Map<string, string>>(new Map());
  const displayData = useMemo(
    () => (tokenDisplay ? mergeTokenDisplayWithFallback(tokenDisplay) : null),
    [tokenDisplay],
  );
  const selectedDisplayBranch = selectedBranch;

  const activeCounters = useMemo(
    () => displayData?.counters.filter((item) => isDisplayableCounter(item.counter.status)) ?? [],
    [displayData],
  );
  const displayScale = useMemo(() => getDisplayScale(width, height), [height, width]);
  const displayIssue = displayData ? getDisplayIssue(displayData) : null;
  const ticker = displayData?.display?.ticker;
  const showTopTicker = shouldShowTicker(ticker, 'top');
  const showBottomTicker = shouldShowTicker(ticker, 'bottom');
  const labels = useMemo(() => getDisplayLabels(displayData, organization), [displayData, organization]);
  const mediaItems = useMemo(() => displayData?.media ?? [], [displayData?.media]);
  const activeHealthTip = useMemo(() => getActiveHealthTip(displayData), [displayData]);
  const hasMedia = mediaItems.length > 0;
  const currentMediaIndex = mediaItems.length ? Math.min(activeMediaIndex, mediaItems.length - 1) : 0;
  const currentMedia = mediaItems[currentMediaIndex];
  const currentMediaDuration = currentMedia?.duration_seconds;
  const currentMediaId = currentMedia?.id;
  const currentMediaType = currentMedia?.type;
  const currentMediaKind = currentMedia ? getMediaKind(currentMedia) : null;
  const counterAreaWidth = useMemo(
    () => getCounterAreaWidth(width, displayScale, hasMedia),
    [displayScale, hasMedia, width],
  );
  const counterCardWidth = useMemo(
    () => getCounterCardWidth(counterAreaWidth, displayScale, hasMedia),
    [counterAreaWidth, displayScale, hasMedia],
  );
  const displayShellWidth = Math.max(0, width - PAGE_HORIZONTAL_PADDING * displayScale * 2);
  const branchCardWidth = useMemo(() => getBranchSelectionCardWidth(width), [width]);
  const advanceMedia = useCallback(() => {
    if (mediaItems.length <= 1) {
      return;
    }

    setActiveMediaIndex((currentIndex) => (currentIndex + 1) % mediaItems.length);
  }, [mediaItems.length]);

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

      display.counters.forEach((rawItem, index) => {
        const item = normalizeCounterItem(rawItem, index);
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
    setActiveMediaIndex(0);
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
    if (mediaItems.length <= 1) {
      return;
    }

    if (currentMediaKind === 'video' || currentMediaKind === 'web') {
      return;
    }

    const durationMs = Math.max(3, currentMediaDuration ?? 10) * 1000;
    const timeout = setTimeout(advanceMedia, durationMs);

    return () => clearTimeout(timeout);
  }, [
    advanceMedia,
    currentMediaIndex,
    currentMediaDuration,
    currentMediaId,
    currentMediaKind,
    currentMediaType,
    mediaItems.length,
  ]);

  useEffect(() => {
    return () => speechService.stop();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setClockTime(new Date()), 1000);

    return () => clearInterval(interval);
  }, []);

  if (selectedDisplayBranch) {
    return (
      <SafeAreaView
        style={[
          styles.page,
          {
            paddingHorizontal: PAGE_HORIZONTAL_PADDING * displayScale,
            paddingTop: 22 * displayScale,
            paddingBottom: showBottomTicker ? 0 : 20 * displayScale,
          },
        ]}>
        <View style={styles.displayShell}>
          <Header
            scale={displayScale}
            title={displayData?.branch.name ?? selectedDisplayBranch.name}
            subtitle={`Live ${labels.counter} Display`}
            onBack={resetToBranches}
            centerContent={
              <View
                style={[
                  styles.clockPill,
                  {
                    borderRadius: 11 * displayScale,
                    paddingHorizontal: 18 * displayScale,
                    paddingVertical: 9 * displayScale,
                  },
                ]}>
                <Text
                  style={[
                    styles.displayTimeText,
                    { fontSize: 23 * displayScale, lineHeight: 30 * displayScale },
                  ]}>
                  {formatClockTime(clockTime)}
                </Text>
              </View>
            }
          />

          {error && <StatusMessage message={error} type="error" />}

          {isLoadingDisplay && !displayData ? (
            <LoadingState label="Loading counter display..." />
          ) : displayIssue ? (
            <DisplayStatusCard issue={displayIssue} onBack={resetToBranches} scale={displayScale} />
          ) : (
            <>
              {showTopTicker && <TickerBanner ticker={ticker} scale={displayScale} width={displayShellWidth} />}
              <View
                style={[
                  hasMedia ? styles.displayContentWithMedia : styles.displayContent,
                  hasMedia && { gap: COUNTER_GRID_GAP * displayScale },
                  showBottomTicker && { marginBottom: TICKER_HEIGHT * displayScale },
                ]}>
                <ScrollView
                  style={hasMedia && styles.counterPane}
                  contentContainerStyle={[
                    styles.counterGrid,
                    { gap: COUNTER_GRID_GAP * displayScale },
                  ]}>
                  {activeCounters.length > 0 ? (
                    activeCounters.map((item) => (
                      <CounterCard
                        key={item.counter.id}
                        item={item}
                        labels={labels}
                        scale={displayScale}
                        width={counterCardWidth}
                      />
                    ))
                  ) : (
                    <EmptyState message={`No ${labels.counter.toLowerCase()} found for this branch.`} />
                  )}
                </ScrollView>
                {currentMedia && (
                  <ClinicUpdatesPanel
                    healthTip={activeHealthTip}
                    media={currentMedia}
                    onVideoEnd={advanceMedia}
                    scale={displayScale}
                  />
                )}
              </View>
              {showBottomTicker && <TickerBanner ticker={ticker} scale={displayScale} width={displayShellWidth} />}
            </>
          )}
        </View>

      </SafeAreaView>
    );
  }

  if (organization) {
    return (
      <SafeAreaView style={[styles.page, styles.branchPage]}>
        <ScrollView
          contentContainerStyle={styles.branchPageContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.branchSelectionShell}>
            <View style={styles.branchTopBar}>
              <Pressable
                style={({ pressed }) => [styles.branchBackPill, pressed && styles.pressed]}
                onPress={resetToBranchCode}>
                <Text style={styles.branchBackArrow}>{'<'}</Text>
                <Text style={styles.branchBackText}>Back</Text>
              </Pressable>

              <View style={styles.branchLivePill}>
                <View style={styles.branchLiveDot} />
                <Text style={styles.branchLiveText}>Live • Counter Display</Text>
              </View>
            </View>

            <View style={styles.branchHeaderBlock}>
              <View style={styles.branchWelcomePill}>
                <Text style={styles.branchWelcomeText}>WELCOME</Text>
              </View>
              <Text style={styles.branchOrgTitle}>{organization.name}</Text>
              <Text style={styles.branchOrgSubtitle}>Select a branch to continue</Text>
            </View>

            {error && <StatusMessage message={error} type="error" />}

            <View style={styles.branchGrid}>
              {branches.length > 0 ? (
                branches.map((branch) => (
                  <BranchSelectionCard
                    key={branch.id}
                    branch={branch}
                    onPress={() => selectBranch(branch)}
                    width={branchCardWidth}
                  />
                ))
              ) : (
                <EmptyState message="No active branches found for this code." />
              )}
            </View>
          </View>
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
  onBack?: () => void;
  centerContent?: ReactNode;
  rightContent?: ReactNode;
};

function Header({ scale, title, subtitle, onBack, centerContent, rightContent }: HeaderProps) {
  return (
    <View style={[styles.header, { marginBottom: 26 * scale }]}>
      {centerContent && (
        <View pointerEvents="none" style={styles.headerCenter}>
          {centerContent}
        </View>
      )}
      <View style={[styles.headerLeft, { gap: 18 * scale }]}>
        {onBack && (
          <Pressable style={[styles.backButton, { gap: 10 * scale }]} onPress={onBack}>
            <Text style={[styles.backArrow, { fontSize: 24 * scale }]}>{'<'}</Text>
            <Text style={[styles.backText, { fontSize: 16 * scale }]}>Back</Text>
          </Pressable>
        )}
        <View>
          <Text style={[styles.headerTitle, { fontSize: 30 * scale, lineHeight: 36 * scale }]}>
            {title}
          </Text>
          <Text style={[styles.headerSubtitle, { fontSize: 15 * scale, lineHeight: 21 * scale }]}>
            {subtitle}
          </Text>
        </View>
      </View>
      {rightContent}
    </View>
  );
}

function getBranchSelectionCardWidth(screenWidth: number) {
  const gap = 20;
  const availableWidth = Math.max(0, screenWidth - PAGE_HORIZONTAL_PADDING * 2);
  const minCardWidth = 300;
  const maxCardWidth = 360;
  const columns = Math.max(1, Math.min(2, Math.floor((availableWidth + gap) / (minCardWidth + gap))));

  return Math.min(maxCardWidth, (availableWidth - gap * (columns - 1)) / columns);
}

function BranchSelectionCard({
  branch,
  onPress,
  width,
}: {
  branch: Branch;
  onPress: () => void;
  width: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.branchCard,
        { width },
        pressed && styles.branchCardPressed,
      ]}>
      <View style={styles.branchCardBody}>
        <Text style={styles.branchName}>{branch.name}</Text>

        {branch.address ? (
          <View style={styles.branchLocationRow}>
            <Text style={styles.branchLocationIcon}>📍</Text>
            <Text style={styles.branchAddress}>{branch.address}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.branchCardFooter}>
        <Text style={styles.branchTapText}>TAP TO ENTER</Text>
        <View style={styles.branchArrowButton}>
          <Text style={styles.branchArrowText}>→</Text>
        </View>
      </View>
    </Pressable>
  );
}

function getAssignedDoctorDisplayText(item: CounterTokenDisplayItem) {
  const doctorName = item.assignedDoctor?.name?.trim();

  if (!doctorName) {
    return null;
  }

  const serviceNames = item.assignedServices
    .map((service) => service.name.trim())
    .filter(Boolean)
    .join(', ');

  return serviceNames ? `${doctorName} - ${serviceNames}` : doctorName;
}

function CounterCard({
  item,
  labels,
  scale,
  width,
}: {
  item: CounterTokenDisplayItem;
  labels: Required<DisplayLabels>;
  scale: number;
  width: number;
}) {
  const currentToken = item.currentToken;
  const nextTokens = item.waitingTokens.slice(0, 3);
  const counterLabel = getCompactCounterLabel(labels.counter);
  const counterName = item.counter.name?.trim() ?? '';
  const showLabelPrefix = shouldPrefixCounterLabel(counterName);
  const staffName = getAssignedDoctorDisplayText(item);

  return (
    <View
      style={[
        styles.counterCard,
        {
          borderRadius: 12 * scale,
          width,
          minHeight: 354 * scale,
          paddingHorizontal: 20 * scale,
          paddingVertical: 22 * scale,
        },
      ]}>
      <View style={styles.cardTopRow}>
        <View style={styles.cardHeaderTextBlock}>
          <View style={[styles.counterLabelRow, { gap: 8 * scale }]}>
            {showLabelPrefix && (
              <Text style={[styles.soundText, { fontSize: 26 * scale, lineHeight: 32 * scale }]}>
                {counterLabel}
              </Text>
            )}
            <Text style={[styles.counterName, { fontSize: 25 * scale, lineHeight: 32 * scale }]}>
              {counterName}
            </Text>
          </View>
          {staffName && (
            <Text
              numberOfLines={1}
              style={[styles.staffName, { fontSize: 17 * scale, lineHeight: 24 * scale }]}>
              {staffName}
            </Text>
          )}
        </View>
        <View
          style={[
            styles.servingBadge,
            { paddingHorizontal: 17 * scale, paddingVertical: 8 * scale },
          ]}>
          <Text style={[styles.servingBadgeText, { fontSize: 15 * scale, lineHeight: 20 * scale }]}>
            Now Serving
          </Text>
        </View>
      </View>

      <View style={[styles.divider, { marginVertical: 16 * scale }]} />

      <View style={styles.currentTokenBlock}>
        <Text style={[styles.sectionLabel, { fontSize: 18 * scale, lineHeight: 25 * scale }]}>
          NOW SERVING {labels.customer.toUpperCase()}
        </Text>
        <Text style={[styles.sectionLabel, { fontSize: 18 * scale, lineHeight: 25 * scale }]}>
          {labels.token.toUpperCase()}
        </Text>
        <Text style={[styles.currentToken, { fontSize: 72 * scale, lineHeight: 86 * scale }]}>
          {currentToken?.ticket_number ?? '--'}
        </Text>
      </View>

      <View style={[styles.divider, { marginVertical: 14 * scale }]} />

      <View>
        <Text style={[styles.sectionLabel, { fontSize: 16 * scale, lineHeight: 22 * scale, textAlign: 'left' }]}>
          NEXT IN {labels.queue.toUpperCase()}
        </Text>
        {nextTokens.length > 0 ? (
          <View style={[styles.waitingTokenRow, { gap: 10 * scale, marginTop: 8 * scale }]}>
            {nextTokens.map((token) => (
              <WaitingTokenChip key={token.ticket_number} token={token} scale={scale} />
            ))}
          </View>
        ) : (
          <Text style={[styles.emptyQueueText, { fontSize: 17 * scale, lineHeight: 23 * scale }]}>
            No {labels.token.toLowerCase()} waiting
          </Text>
        )}
      </View>
    </View>
  );
}

function WaitingTokenChip({ token, scale }: { token: WaitingToken; scale: number }) {
  return (
    <View
      style={[
        styles.waitingTokenChip,
        {
          borderRadius: 8 * scale,
          paddingHorizontal: 14 * scale,
          paddingVertical: 9 * scale,
        },
      ]}>
      <Text style={[styles.waitingTokenNumber, { fontSize: 18 * scale, lineHeight: 24 * scale }]}>
        {token.ticket_number}
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

function ClinicUpdatesPanel({
  healthTip,
  media,
  onVideoEnd,
  scale,
}: {
  healthTip: HealthTip | null;
  media: DisplayMedia;
  onVideoEnd: () => void;
  scale: number;
}) {
  const mediaKind = getMediaKind(media);
  const showPlaceholder = !media.url && !media.text_content;
  const healthTipTitle = healthTip?.title?.trim() || 'Health Tip';
  const healthTipMessage = healthTip?.message?.trim() || STATIC_HEALTH_TIP;

  return (
    <View style={styles.clinicUpdatesPanel}>
      <View style={[styles.clinicUpdatesHeader, { minHeight: 60 * scale }]}>
        <Text
          style={[
            styles.clinicUpdatesTitle,
            { fontSize: 25 * scale, lineHeight: 32 * scale },
          ]}>
          Clinic Updates
        </Text>
      </View>

      <View style={[styles.clinicUpdatesBody, { padding: 20 * scale, gap: 18 * scale }]}>
        <View
          style={[
            styles.carouselCard,
            {
              borderRadius: 12 * scale,
              minHeight: 200 * scale,
            },
          ]}>
          {showPlaceholder ? (
            <Text
              style={[
                styles.carouselPlaceholderText,
                { fontSize: 23 * scale, lineHeight: 29 * scale },
              ]}>
              Image / Video{'\n'}Carousel Area
            </Text>
          ) : mediaKind === 'image' && media.url ? (
            <View style={styles.mediaFrame}>
              <Image source={{ uri: media.url }} style={styles.mediaFill} contentFit="cover" />
            </View>
          ) : mediaKind === 'video' && media.url ? (
            <VideoMedia key={media.id} uri={media.url} onEnded={onVideoEnd} />
          ) : mediaKind === 'web' && media.url ? (
            <WebUrlMedia uri={media.url} onEnded={onVideoEnd} />
          ) : (
            <View style={styles.mediaTextContent}>
              <Text style={[styles.carouselPlaceholderText, { fontSize: 21 * scale }]}>
                {media.name}
              </Text>
              {media.text_content && (
                <Text style={[styles.mediaTextBody, { fontSize: 16 * scale, lineHeight: 24 * scale }]}>
                  {media.text_content}
                </Text>
              )}
            </View>
          )}
        </View>

        <View
          style={[
            styles.healthTipCard,
            {
              borderRadius: 12 * scale,
              paddingHorizontal: 18 * scale,
              paddingVertical: 16 * scale,
            },
          ]}>
          <Text style={[styles.healthTipTitle, { fontSize: 19 * scale, lineHeight: 25 * scale }]}>
            {healthTipTitle}
          </Text>
          <Text style={[styles.healthTipText, { fontSize: 16 * scale, lineHeight: 24 * scale }]}>
            {healthTipMessage}
          </Text>
        </View>
      </View>
    </View>
  );
}

function VideoMedia({ uri, onEnded }: { uri: string; onEnded: () => void }) {
  const hasEndedRef = useRef(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.loop = false;
    videoPlayer.muted = true;
    videoPlayer.play();
  });

  useEffect(() => {
    hasEndedRef.current = false;
  }, [uri]);

  useEventListener(player, 'statusChange', ({ status, error }) => {
    if (status === 'readyToPlay') {
      player.play();
    }

    if (status === 'error') {
      setPlayerError(error?.message ?? 'Unable to play video.');
    }
  });

  useEventListener(player, 'playToEnd', () => {
    if (!hasEndedRef.current) {
      hasEndedRef.current = true;
      onEnded();
    }
  });

  if (playerError) {
    return (
      <View style={styles.mediaTextContent}>
        <Text style={styles.mediaTextTitle}>Video unavailable</Text>
        <Text style={styles.mediaTextBody}>{playerError}</Text>
      </View>
    );
  }

  return (
    <View style={styles.mediaFrame}>
      <VideoView
        player={player}
        style={styles.mediaFill}
        contentFit="cover"
        nativeControls={false}
        surfaceType="textureView"
      />
    </View>
  );
}

function WebUrlMedia({ uri, onEnded }: { uri: string; onEnded: () => void }) {
  const displayUri = getEmbeddableUrl(uri);
  const youtubeVideoId = getYouTubeVideoId(uri);
  const youtubeHtml = youtubeVideoId ? getYouTubeEmbedHtml(youtubeVideoId) : null;

  useEffect(() => {
    if (Platform.OS !== 'web' || !youtubeHtml) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data === 'TOKEN_DISPLAY_MEDIA_ENDED') {
        onEnded();
      }
    };

    window.addEventListener('message', handleMessage);

    return () => window.removeEventListener('message', handleMessage);
  }, [onEnded, youtubeHtml]);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.mediaFrame}>
        {createElement('iframe', {
          src: youtubeHtml ? undefined : displayUri,
          srcDoc: youtubeHtml,
          style: styles.webFrame,
          allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture',
          allowFullScreen: true,
          title: 'Online media',
        })}
      </View>
    );
  }

  return (
    <View style={styles.mediaFrame}>
      <WebView
        source={youtubeHtml ? { html: youtubeHtml, baseUrl: 'https://www.youtube.com' } : { uri: displayUri }}
        style={styles.mediaFill}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        onMessage={(event) => {
          if (event.nativeEvent.data === 'TOKEN_DISPLAY_MEDIA_ENDED') {
            onEnded();
          }
        }}
      />
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
          height: TICKER_HEIGHT * scale,
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

function formatClockTime(value: Date) {
  return value.toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getDisplayScale(width: number, height: number) {
  const scale = Math.min(width / 1200, height / 720);
  return Math.max(MIN_DISPLAY_SCALE, Math.min(scale, MAX_DISPLAY_SCALE));
}

function getCounterAreaWidth(screenWidth: number, scale: number, hasMedia: boolean) {
  const availableWidth = Math.max(0, screenWidth - PAGE_HORIZONTAL_PADDING * scale * 2);

  if (!hasMedia) {
    return availableWidth;
  }

  return Math.max(620 * scale, availableWidth * 0.7);
}

function getCounterCardWidth(screenWidth: number, scale: number, hasMedia: boolean) {
  const gap = COUNTER_GRID_GAP * scale;
  const availableWidth = Math.max(0, screenWidth);
  const minCardWidth = (hasMedia ? 300 : 230) * scale;
  const maxColumns = hasMedia ? 2 : MAX_COUNTER_COLUMNS;
  const columns = Math.max(
    1,
    Math.min(maxColumns, Math.floor((availableWidth + gap) / (minCardWidth + gap))),
  );

  return (availableWidth - gap * (columns - 1)) / columns;
}

function getCompactCounterLabel(label: string) {
  return label.split('/')[0].trim() || label;
}

function shouldPrefixCounterLabel(counterName: string) {
  const trimmed = counterName.trim();

  if (!trimmed) {
    return true;
  }

  // API already sends a full name like "Cabin 001" or "Room No. 1".
  return !/[a-zA-Z]/.test(trimmed);
}

function getDisplayLabels(
  displayResponse: NormalizedTokenDisplay | PublicCounterTokenDisplayResponse | null,
  branchOrganization: Organization | null,
): Required<DisplayLabels> {
  const labels = displayResponse?.labels ?? displayResponse?.organization?.labels ?? branchOrganization?.labels;

  return {
    organization: labels?.organization ?? 'Organization',
    branch: labels?.branch ?? 'Branch',
    customer: labels?.customer ?? 'Customer',
    staff: labels?.staff ?? 'Staff',
    department: labels?.department ?? 'Department',
    service: labels?.service ?? 'Service',
    counter: labels?.counter ?? 'Counter',
    appointment: labels?.appointment ?? 'Appointment',
    queue: labels?.queue ?? 'Queue',
    token: labels?.token ?? 'Token',
  };
}

function getActiveHealthTip(displayResponse: NormalizedTokenDisplay | PublicCounterTokenDisplayResponse | null) {
  const healthTips = displayResponse?.healthTips ?? STATIC_TOKEN_DISPLAY.healthTips ?? [];
  return healthTips.find((tip) => tip.status?.toLowerCase() === 'active') ?? healthTips[0] ?? null;
}

function mergeTokenDisplayWithFallback(
  response: PublicCounterTokenDisplayResponse,
): NormalizedTokenDisplay {
  const fallbackDisplay = STATIC_TOKEN_DISPLAY.display;
  const fallbackTicker = STATIC_TOKEN_DISPLAY.display?.ticker ?? null;
  const responseTicker = response.display?.ticker;
  const fallbackMedia = STATIC_TOKEN_DISPLAY.media ?? [];
  const hasResponseMedia = Array.isArray(response.media) && response.media.length > 0;
  const hasResponseCounters = Array.isArray(response.counters) && response.counters.length > 0;
  const hasResponseHealthTips = Array.isArray(response.healthTips) && response.healthTips.length > 0;

  return {
    ...STATIC_TOKEN_DISPLAY,
    ...response,
    organization: {
      id: response.organization?.id ?? STATIC_TOKEN_DISPLAY.organization?.id ?? 'static-org',
      name: response.organization?.name ?? STATIC_TOKEN_DISPLAY.organization?.name ?? 'Noida Clinic',
      ...response.organization,
      labels: {
        ...STATIC_TOKEN_DISPLAY.organization?.labels,
        ...response.organization?.labels,
      },
    },
    labels: {
      ...STATIC_TOKEN_DISPLAY.labels,
      ...response.labels,
    },
    branch: {
      ...STATIC_TOKEN_DISPLAY.branch,
      ...response.branch,
    },
    counters: hasResponseCounters
      ? response.counters.map((item, index) => normalizeCounterItem(item, index))
      : STATIC_TOKEN_DISPLAY.counters,
    displayAllowed: response.displayAllowed ?? STATIC_TOKEN_DISPLAY.displayAllowed,
    displayStatus: response.displayStatus ?? STATIC_TOKEN_DISPLAY.displayStatus,
    display:
      response.display === null
        ? fallbackDisplay
        : {
            ...(fallbackDisplay ?? {
              id: 'display',
              name: 'Clinic Display',
              code: 'DISPLAY',
              status: 'online',
              ticker: fallbackTicker,
            }),
            ...response.display,
            ticker: responseTicker
              ? {
                  ...(fallbackTicker ?? {
                    enabled: true,
                    message: '',
                    position: 'bottom',
                    speed: 'normal',
                  }),
                  ...responseTicker,
                  message: responseTicker.message?.trim() || fallbackTicker?.message || '',
                  position: responseTicker.position || fallbackTicker?.position || 'bottom',
                  speed: responseTicker.speed || fallbackTicker?.speed || 'normal',
                  enabled: responseTicker.enabled ?? fallbackTicker?.enabled ?? true,
                }
              : fallbackTicker,
          },
    media: hasResponseMedia
      ? response.media?.map((item, index) => ({
          ...fallbackMedia[index % fallbackMedia.length],
          ...item,
          id: item.id || fallbackMedia[index % fallbackMedia.length]?.id || `media-${index}`,
          name: item.name || fallbackMedia[index % fallbackMedia.length]?.name || 'Clinic Update',
          type: item.type || fallbackMedia[index % fallbackMedia.length]?.type || 'text',
          duration_seconds:
            item.duration_seconds ?? fallbackMedia[index % fallbackMedia.length]?.duration_seconds ?? 10,
        }))
      : fallbackMedia,
    healthTips: hasResponseHealthTips ? response.healthTips : STATIC_TOKEN_DISPLAY.healthTips,
  };
}

function isFlatCounterItem(item: unknown): item is FlatCounterTokenDisplayItem {
  if (typeof item !== 'object' || item === null) {
    return false;
  }

  const record = item as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.name === 'string' && !('counter' in record);
}

function normalizeCounterItem(
  item: CounterTokenDisplayItem | FlatCounterTokenDisplayItem,
  index: number,
): CounterTokenDisplayItem {
  if (isFlatCounterItem(item)) {
    return {
      counter: {
        id: item.id,
        name: item.name,
        number: item.number,
        status: item.status,
      },
      assignedDoctor: item.assignedDoctor ?? null,
      assignedServices: item.assignedServices ?? [],
      currentToken: item.currentToken ?? null,
      waitingTokens: item.waitingTokens ?? [],
    };
  }

  return mergeCounterWithFallback(item, index);
}

function isDisplayableCounter(status: string | undefined) {
  const normalized = status?.toLowerCase();

  return normalized !== 'inactive' && normalized !== 'disabled' && normalized !== 'offline';
}

function mergeCounterWithFallback(item: CounterTokenDisplayItem, index: number): CounterTokenDisplayItem {
  const fallback = STATIC_TOKEN_DISPLAY.counters[index % STATIC_TOKEN_DISPLAY.counters.length];
  const assignedServices = Array.isArray(item.assignedServices) ? item.assignedServices : [];
  const waitingTokens = Array.isArray(item.waitingTokens) ? item.waitingTokens : [];
  const counter = item.counter ?? fallback.counter;

  return {
    ...fallback,
    ...item,
    counter: {
      ...fallback.counter,
      ...counter,
      id: counter.id || fallback.counter.id,
      name: counter.name || fallback.counter.name,
      status: counter.status || fallback.counter.status,
    },
    assignedDoctor: item.assignedDoctor ?? null,
    assignedServices: assignedServices.length > 0 ? assignedServices : fallback.assignedServices,
    currentToken: item.currentToken
      ? {
          ...fallback.currentToken,
          ...item.currentToken,
          ticket_number: item.currentToken.ticket_number || fallback.currentToken?.ticket_number || '--',
          service_name: item.currentToken.service_name || fallback.currentToken?.service_name || '',
          service_color: item.currentToken.service_color || fallback.currentToken?.service_color || '#315bd6',
          called_at: item.currentToken.called_at || fallback.currentToken?.called_at || new Date().toISOString(),
        }
      : item.currentToken,
    waitingTokens,
  };
}

function getMediaKind(media: DisplayMedia): 'image' | 'video' | 'web' | 'text' {
  const normalizedType = normalizeMediaType(media.type);

  if (normalizedType === 'image' || normalizedType === 'video' || normalizedType === 'text') {
    return normalizedType;
  }

  if (normalizedType === 'onlineurl' || normalizedType === 'htmlurl' || normalizedType === 'url') {
    if (isVideoUrl(media.url)) {
      return 'video';
    }

    if (isImageUrl(media.url)) {
      return 'image';
    }

    if (media.url) {
      return 'web';
    }
  }

  return media.text_content ? 'text' : 'image';
}

function normalizeMediaType(type: string) {
  return type.toLowerCase().replace(/[\s_-]/g, '');
}

function isImageUrl(url: string | null) {
  return Boolean(url?.split('?')[0].match(/\.(apng|avif|gif|jpe?g|png|svg|webp)$/i));
}

function isVideoUrl(url: string | null) {
  return Boolean(url?.split('?')[0].match(/\.(m3u8|mov|mp4|m4v|webm)$/i));
}

function getEmbeddableUrl(url: string) {
  const youtubeVideoId = getYouTubeVideoId(url);

  if (!youtubeVideoId) {
    return url;
  }

  return `https://www.youtube.com/embed/${youtubeVideoId}?autoplay=1&mute=1&playsinline=1&rel=0`;
}

function getYouTubeEmbedHtml(videoId: string) {
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body, #player {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        overflow: hidden;
        background: transparent;
      }
    </style>
  </head>
  <body>
    <div id="player"></div>
    <script src="https://www.youtube.com/iframe_api"></script>
    <script>
      var player;
      function notifyEnded() {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage('TOKEN_DISPLAY_MEDIA_ENDED');
        }
        window.parent.postMessage('TOKEN_DISPLAY_MEDIA_ENDED', '*');
      }
      function onYouTubeIframeAPIReady() {
        player = new YT.Player('player', {
          width: '100%',
          height: '100%',
          videoId: '${videoId}',
          playerVars: {
            autoplay: 1,
            controls: 0,
            mute: 1,
            playsinline: 1,
            rel: 0
          },
          events: {
            onReady: function(event) {
              event.target.mute();
              event.target.playVideo();
            },
            onStateChange: function(event) {
              if (event.data === YT.PlayerState.ENDED) {
                notifyEnded();
              }
            }
          }
        });
      }
    </script>
  </body>
</html>`;
}

function getYouTubeVideoId(url: string) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.replace(/^www\./, '');

    if (hostname === 'youtu.be') {
      return parsedUrl.pathname.split('/').filter(Boolean)[0];
    }

    if (hostname.endsWith('youtube.com')) {
      if (parsedUrl.pathname.startsWith('/embed/')) {
        return parsedUrl.pathname.split('/').filter(Boolean)[1];
      }

      if (parsedUrl.pathname.startsWith('/live/') || parsedUrl.pathname.startsWith('/shorts/')) {
        return parsedUrl.pathname.split('/').filter(Boolean)[1];
      }

      return parsedUrl.searchParams.get('v');
    }
  } catch {
    return null;
  }

  return null;
}

function getDisplayIssue(displayResponse: NormalizedTokenDisplay | PublicCounterTokenDisplayResponse): DisplayIssue | null {
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
    backgroundColor: '#eef2f8',
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  displayShell: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dde3ee',
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingTop: 18,
    shadowColor: '#14213d',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 5,
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
    marginBottom: 18,
    position: 'relative',
  },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
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
    fontWeight: '900',
  },
  headerSubtitle: {
    color: '#5f6673',
    fontSize: 16,
    marginTop: 3,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  displayTimeText: {
    color: '#315bd6',
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  clockPill: {
    backgroundColor: '#ffffff',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 4,
  },
  branchPage: {
    backgroundColor: '#eef5ff',
  },
  branchPageContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  branchSelectionShell: {
    width: '100%',
    maxWidth: 920,
    alignItems: 'stretch',
  },
  branchTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
    gap: 16,
  },
  branchBackPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dbe4f2',
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#162033',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  branchBackArrow: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '700',
  },
  branchBackText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
  },
  branchLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dbe4f2',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  branchLiveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22c55e',
  },
  branchLiveText: {
    color: '#475467',
    fontSize: 16,
    fontWeight: '800',
  },
  branchHeaderBlock: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 34,
  },
  branchWelcomePill: {
    backgroundColor: '#ffffff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dbe4f2',
    paddingHorizontal: 22,
    paddingVertical: 11,
    marginBottom: 18,
  },
  branchWelcomeText: {
    color: '#667085',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  branchOrgTitle: {
    color: '#0f172a',
    fontSize: 42,
    lineHeight: 50,
    fontWeight: '900',
    textAlign: 'center',
    maxWidth: 760,
  },
  branchOrgSubtitle: {
    color: '#667085',
    fontSize: 18,
    lineHeight: 26,
    marginTop: 10,
    textAlign: 'center',
  },
  branchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    justifyContent: 'center',
    alignItems: 'stretch',
    width: '100%',
  },
  branchCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e4ebf5',
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingVertical: 24,
    shadowColor: '#162033',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  branchCardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  branchCardBody: {
    alignItems: 'center',
    marginBottom: 24,
  },
  branchName: {
    color: '#0f172a',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    marginBottom: 10,
    textAlign: 'center',
  },
  branchLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  branchLocationIcon: {
    fontSize: 16,
    lineHeight: 20,
  },
  branchAddress: {
    color: '#667085',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'center',
  },
  branchCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#edf1f7',
    paddingTop: 18,
  },
  branchTapText: {
    color: '#98a2b3',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  branchArrowButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  branchArrowText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 22,
  },
  displayContent: {
    flex: 1,
  },
  displayContentWithMedia: {
    flex: 1,
    flexDirection: 'row',
    gap: COUNTER_GRID_GAP,
    alignItems: 'stretch',
  },
  counterPane: {
    flex: 0.7,
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
    borderColor: '#2f68d8',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingHorizontal: 26,
    paddingVertical: 26,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  cardHeaderTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  counterLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  soundText: {
    color: '#315bd6',
    fontSize: 13,
    fontWeight: '800',
  },
  counterName: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
  },
  staffName: {
    color: '#4b5563',
    fontWeight: '700',
    marginTop: 6,
  },
  servingBadge: {
    backgroundColor: '#315bd6',
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 7,
    flexShrink: 0,
  },
  servingBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e4ec',
    marginVertical: 20,
  },
  currentTokenBlock: {
    alignItems: 'center',
  },
  sectionLabel: {
    color: '#687280',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 0,
    textAlign: 'center',
  },
  currentToken: {
    color: '#111827',
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
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 12,
    marginTop: 10,
  },
  waitingTokenChip: {
    backgroundColor: '#f0f5ff',
    shadowColor: '#315bd6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  waitingTokenNumber: {
    color: '#315bd6',
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
  mediaPanel: {
    flex: 0.42,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    alignSelf: 'stretch',
    borderLeftWidth: 1,
    borderColor: '#d8dee8',
  },
  clinicUpdatesPanel: {
    flex: 0.3,
    overflow: 'hidden',
    alignSelf: 'stretch',
    borderLeftWidth: 1,
    borderColor: '#e1e5ed',
    backgroundColor: '#ffffff',
    marginTop: -18,
    marginRight: -24,
    marginBottom: -46,
  },
  clinicUpdatesHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e8ef',
  },
  clinicUpdatesTitle: {
    color: '#111827',
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  clinicUpdatesBody: {
    flex: 1,
  },
  carouselCard: {
    width: '100%',
    aspectRatio: 1.45,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#91bfd6',
    backgroundColor: '#eaf6ff',
  },
  carouselPlaceholderText: {
    color: '#315bd6',
    fontWeight: '900',
    textAlign: 'center',
  },
  healthTipCard: {
    borderWidth: 1,
    borderColor: '#e2e6ee',
    backgroundColor: '#ffffff',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  healthTipTitle: {
    color: '#111827',
    fontWeight: '900',
    marginBottom: 8,
  },
  healthTipText: {
    color: '#374151',
    fontWeight: '500',
  },
  mediaSlide: {
    flex: 1,
  },
  mediaFrame: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: '#eaf6ff',
  },
  mediaFill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  webFrame: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
    borderWidth: 0,
  },
  mediaTextContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 24,
  },
  mediaTextTitle: {
    color: '#0f172a',
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 12,
  },
  mediaTextBody: {
    color: '#475467',
    textAlign: 'center',
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
});
