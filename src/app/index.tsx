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
  DisplayLabels,
  DisplayMedia,
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
const MEDIA_TOP_PULL = 82;
const TICKER_HEIGHT = 46;

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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
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
  const labels = useMemo(() => getDisplayLabels(tokenDisplay, organization), [organization, tokenDisplay]);
  const mediaItems = useMemo(() => tokenDisplay?.media ?? [], [tokenDisplay?.media]);
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
  const branchCardWidth = useMemo(() => getBranchCardWidth(width), [width]);
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

  if (selectedBranch) {
    return (
      <SafeAreaView
        style={[
          styles.page,
          {
            paddingHorizontal: PAGE_HORIZONTAL_PADDING * displayScale,
            paddingTop: hasMedia ? 0 : 20 * displayScale,
            paddingBottom: showBottomTicker ? 0 : 20 * displayScale,
          },
        ]}>
        <Header
          scale={displayScale}
          title={tokenDisplay?.branch.name ?? selectedBranch.name}
          subtitle={`${tokenDisplay?.organization?.name ?? organization?.name ?? labels.organization} - Live ${labels.counter} Display`}
          onBack={resetToBranches}
          centerContent={
            tokenDisplay?.last_updated ? (
              <Text
                style={[
                  styles.displayTimeText,
                  { fontSize: 18 * displayScale, lineHeight: 24 * displayScale },
                ]}>
                {formatTime(tokenDisplay.last_updated)}
              </Text>
            ) : null
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
                  <EmptyState message={`No active ${labels.counter.toLowerCase()} found for this branch.`} />
                )}
              </ScrollView>
              {currentMedia && (
                <MediaPanel
                  media={currentMedia}
                  onVideoEnd={advanceMedia}
                  scale={displayScale}
                />
              )}
            </View>
            {showBottomTicker && <TickerBanner ticker={ticker} scale={displayScale} width={width} />}
          </>
        )}

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
              <Pressable
                key={branch.id}
                style={[styles.branchCard, { width: branchCardWidth }]}
                onPress={() => selectBranch(branch)}>
                <Text style={styles.branchName}>{branch.name}</Text>
                {branch.address && <Text style={styles.branchAddress}>{branch.address}</Text>}
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
  const nextTokens = item.waitingTokens.slice(0, 5);
  const counterLabel = getCompactCounterLabel(labels.counter);

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
          <Text style={[styles.soundText, { fontSize: 26 * scale, lineHeight: 32 * scale }]}>
            {counterLabel}
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
          NOW SERVING {labels.token.toUpperCase()}
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
          NEXT IN {labels.queue.toUpperCase()}
        </Text>
        {nextTokens.length > 0 ? (
          nextTokens.map((token) => (
            <WaitingTokenRow key={token.ticket_number} token={token} scale={scale} />
          ))
        ) : (
          <Text style={[styles.emptyQueueText, { fontSize: 17 * scale, lineHeight: 23 * scale }]}>
            No {labels.token.toLowerCase()} waiting
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

function MediaPanel({
  media,
  onVideoEnd,
  scale,
}: {
  media: DisplayMedia;
  onVideoEnd: () => void;
  scale: number;
}) {
  const mediaKind = getMediaKind(media);
  const [slideX] = useState(() => new Animated.Value(0));
  const [slideOpacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    slideX.setValue(90 * scale);
    slideOpacity.setValue(0.35);

    Animated.parallel([
      Animated.timing(slideX, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(slideOpacity, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
    ]).start();
  }, [media.id, scale, slideOpacity, slideX]);

  return (
    <View
      style={[
        styles.mediaPanel,
        {
          marginTop: -MEDIA_TOP_PULL * scale,
          minHeight: 330 * scale,
        },
      ]}>
      <Animated.View
        style={[
          styles.mediaSlide,
          {
            opacity: slideOpacity,
            transform: [{ translateX: slideX }],
          },
        ]}>
        {mediaKind === 'image' && media.url ? (
          <Image source={{ uri: media.url }} style={styles.mediaContent} contentFit="cover" />
        ) : mediaKind === 'video' && media.url ? (
          <VideoMedia key={media.id} uri={media.url} onEnded={onVideoEnd} />
        ) : mediaKind === 'web' && media.url ? (
          <WebUrlMedia uri={media.url} onEnded={onVideoEnd} />
        ) : (
          <View style={styles.mediaTextContent}>
            <Text style={[styles.mediaTextTitle, { fontSize: 22 * scale, lineHeight: 30 * scale }]}>
              {media.name}
            </Text>
            {media.text_content && (
              <Text style={[styles.mediaTextBody, { fontSize: 18 * scale, lineHeight: 26 * scale }]}>
                {media.text_content}
              </Text>
            )}
          </View>
        )}
      </Animated.View>
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
    <VideoView
      player={player}
      style={styles.mediaContent}
      contentFit="cover"
      nativeControls={false}
      surfaceType="textureView"
    />
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
      <View style={styles.mediaContent}>
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
    <WebView
      source={youtubeHtml ? { html: youtubeHtml, baseUrl: 'https://www.youtube.com' } : { uri: displayUri }}
      style={styles.mediaContent}
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

function getCounterAreaWidth(screenWidth: number, scale: number, hasMedia: boolean) {
  const availableWidth = Math.max(0, screenWidth - PAGE_HORIZONTAL_PADDING * scale * 2);

  if (!hasMedia) {
    return availableWidth;
  }

  return Math.max(360 * scale, availableWidth * 0.58);
}

function getCounterCardWidth(screenWidth: number, scale: number, hasMedia: boolean) {
  const gap = COUNTER_GRID_GAP * scale;
  const availableWidth = Math.max(0, screenWidth);
  const minCardWidth = (hasMedia ? 320 : 230) * scale;
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

function getBranchCardWidth(screenWidth: number) {
  const gap = 18;
  const availableWidth = Math.max(0, screenWidth - PAGE_HORIZONTAL_PADDING * 2);
  const minCardWidth = 300;
  const columns = Math.max(1, Math.min(3, Math.floor((availableWidth + gap) / (minCardWidth + gap))));

  return Math.min(380, (availableWidth - gap * (columns - 1)) / columns);
}

function getDisplayLabels(
  displayResponse: PublicCounterTokenDisplayResponse | null,
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
  displayTimeText: {
    color: '#667085',
    fontWeight: '800',
  },
  branchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    alignItems: 'flex-start',
    paddingBottom: 24,
  },
  branchCard: {
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 132,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dce1ea',
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingVertical: 24,
    justifyContent: 'center',
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
    marginBottom: 10,
  },
  branchAddress: {
    color: '#667085',
    fontSize: 16,
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
    flex: 0.58,
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
  mediaPanel: {
    flex: 0.42,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    alignSelf: 'stretch',
    borderLeftWidth: 1,
    borderColor: '#d8dee8',
  },
  mediaSlide: {
    flex: 1,
  },
  mediaContent: {
    width: '100%',
    height: '100%',
  },
  webFrame: {
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
