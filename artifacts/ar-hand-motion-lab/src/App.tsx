import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  Bug,
  Camera,
  CircleHelp,
  EyeOff,
  Hand,
  LockKeyhole,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Waves,
  Zap,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

type CameraState = 'idle' | 'requesting' | 'active' | 'denied';

type Telemetry = {
  x: number;
  y: number;
  velocity: number;
  confidence: number;
};

type Landmark = { x: number; y: number; z?: number };
type Gesture = 'none' | 'raised' | 'hold' | 'pinch' | 'open' | 'wave' | 'smoking' | 'blowing';

const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

function landmarkDistance(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

function isFingerExtended(landmarks: Landmark[], tip: number, pip: number) {
  return landmarks[tip].y < landmarks[pip].y;
}

function classifyGesture(landmarks: Landmark[]): Gesture {
  const palmSize = Math.max(landmarkDistance(landmarks[0], landmarks[9]), 0.05);
  const indexPinchDistance = landmarkDistance(landmarks[4], landmarks[8]) / palmSize;
  const indexPinch = indexPinchDistance < 0.78;
  const tightIndexPinch = indexPinchDistance < 0.48;
  const middlePinch = landmarkDistance(landmarks[4], landmarks[12]) / palmSize < 0.78;
  const indexExtended = isFingerExtended(landmarks, 8, 6);
  const middleExtended = isFingerExtended(landmarks, 12, 10);
  const ringExtended = isFingerExtended(landmarks, 16, 14);
  const pinkyExtended = isFingerExtended(landmarks, 20, 18);

  if (indexExtended && middleExtended && ringExtended && pinkyExtended) return 'open';
  if (tightIndexPinch) return 'pinch';
  if (middlePinch && indexExtended && !ringExtended && !pinkyExtended) return 'pinch';
  if (indexPinch && !middleExtended && !ringExtended && !pinkyExtended) return 'hold';
  if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) return 'raised';
  return 'none';
}

function Wordmark() {
  return (
    <div className="flex items-center gap-3" data-testid="brand-wordmark">
      <div className="relative flex size-9 items-center justify-center rounded-full border border-[#f58b4f]/50 bg-[#f58b4f]/10">
        <div className="size-2.5 rounded-full bg-[#f58b4f] shadow-[0_0_16px_rgba(245,139,79,.8)]" />
        <div className="absolute inset-[5px] rounded-full border border-[#b7f3d7]/40" />
      </div>
      <div>
        <p className="display text-[15px] font-semibold leading-none tracking-[-.04em] text-[#f5eee3]">AR Hand Motion Lab</p>
        <p className="mono mt-1 text-[8px] uppercase tracking-[.24em] text-[#90869e]">Private lens playground</p>
      </div>
    </div>
  );
}

function StatusPill({ cameraState, tracking }: { cameraState: CameraState; tracking: boolean }) {
  const active = cameraState === 'active';
  const label = cameraState === 'requesting' ? 'Opening lens' : active && tracking ? 'Hand in frame' : active ? 'Lens ready' : cameraState === 'denied' ? 'Permission needed' : 'Standby';
  return (
    <div className="flex items-center gap-2 rounded-full border border-[#d5c6ef]/10 bg-[#16141d]/80 px-3 py-1.5" data-testid="status-camera">
      <span className={`relative flex size-2 ${active ? '' : 'opacity-60'}`}>
        <span className={`absolute inline-flex size-full rounded-full ${active ? 'animate-ping bg-[#b7f3d7]' : 'bg-[#90869e]'}`} />
        <span className={`relative inline-flex size-2 rounded-full ${active ? 'bg-[#b7f3d7]' : 'bg-[#90869e]'}`} />
      </span>
      <span className="mono text-[10px] uppercase tracking-[.13em] text-[#c8bfd0]">{label}</span>
    </div>
  );
}

function Toggle({ label, icon, checked, onChange, testId }: { label: string; icon: ReactNode; checked: boolean; onChange: () => void; testId: string }) {
  return (
    <button type="button" onClick={onChange} className="toggle flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#2a2538]/70" data-testid={testId} aria-pressed={checked}>
      <span className="flex items-center gap-2.5 text-[12px] text-[#d2c9d9]">{icon}{label}</span>
      <span className={`relative h-5 w-9 rounded-full border transition-colors ${checked ? 'border-[#f58b4f] bg-[#f58b4f]' : 'border-[#786f80] bg-transparent'}`}>
        <span className={`absolute top-[3px] size-3 rounded-full transition-transform ${checked ? 'translate-x-[17px] bg-[#1a1519]' : 'translate-x-[3px] bg-[#9d93a5]'}`} />
      </span>
    </button>
  );
}

function MotionReadout({ telemetry }: { telemetry: Telemetry }) {
  const values = [
    ['X POSITION', `${String(Math.round(telemetry.x)).padStart(3, '0')}%`],
    ['Y POSITION', `${String(Math.round(telemetry.y)).padStart(3, '0')}%`],
    ['VELOCITY', `${telemetry.velocity.toFixed(1)} px/f`],
    ['CONFIDENCE', telemetry.confidence > 0 ? `${Math.round(telemetry.confidence)}%` : '—'],
  ];
  return (
    <section className="rounded-xl border border-[#d5c6ef]/10 bg-[#14121b]/55 p-4" data-testid="panel-motion-readout">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="size-3.5 text-[#b7f3d7]" />
          <h2 className="mono text-[10px] uppercase tracking-[.18em] text-[#c8bfd0]">Motion Lab</h2>
        </div>
        <span className="mono text-[9px] text-[#756d7d]">LOCAL / 01</span>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
        {values.map(([name, value]) => (
          <div key={name}>
            <p className="mono text-[8px] tracking-[.12em] text-[#756d7d]">{name}</p>
            <p className="mono mt-1.5 text-[14px] text-[#eee6dc]" data-testid={`telemetry-${name.toLowerCase().replace(' ', '-')}`}>{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 h-1 overflow-hidden rounded-full bg-[#2b2632]">
        <div className="h-full rounded-full bg-gradient-to-r from-[#b7f3d7] via-[#f58b4f] to-[#f58b4f] transition-all duration-500" style={{ width: `${Math.max(8, telemetry.confidence)}%` }} />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[#81788a]">A tiny readout for a tiny experiment. Nothing leaves this tab.</p>
    </section>
  );
}

function Stage({
  cameraState,
  videoRef,
  canvasRef,
  trackingDebug,
  gesture,
  onPointerMove,
  onStart,
  onReset,
}: {
  cameraState: CameraState;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  trackingDebug: boolean;
  gesture: Gesture;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onStart: () => void;
  onReset: () => void;
}) {
  const active = cameraState === 'active';
  return (
    <section className="relative flex min-h-[520px] flex-1 flex-col overflow-hidden rounded-2xl border border-[#d5c6ef]/15 bg-[#121019] shadow-[0_26px_90px_rgba(0,0,0,.35)] md:min-h-[630px]" data-testid="camera-stage">
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_50%_42%,rgba(245,139,79,.1),transparent_28%),linear-gradient(120deg,rgba(255,255,255,.02),transparent_40%)]" />
      <video ref={videoRef} className={`absolute inset-0 size-full object-cover opacity-70 [transform:scaleX(-1)] ${active ? 'block' : 'hidden'}`} autoPlay playsInline muted data-testid="video-feed" />
      <div className={`absolute inset-0 ${active ? 'opacity-30' : 'opacity-100'} transition-opacity duration-700`} style={{ backgroundImage: 'radial-gradient(ellipse at center, rgba(51,40,64,.15) 0%, rgba(10,9,13,.92) 74%)' }} />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[2] size-full [transform:scaleX(-1)]" data-testid="overlay-canvas" />
      <div className="pointer-events-none absolute inset-0 z-[3] opacity-[.12]" style={{ backgroundImage: 'linear-gradient(rgba(210,200,225,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(210,200,225,.08) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
      <div className="scan-line pointer-events-none absolute left-0 right-0 top-0 z-[4] h-px bg-gradient-to-r from-transparent via-[#b7f3d7]/60 to-transparent" />

      <div className="relative z-[5] flex items-center justify-between p-4 md:p-5">
          <div className="flex items-center gap-2 rounded-full border border-[#d5c6ef]/10 bg-[#100e15]/65 px-3 py-1.5 backdrop-blur-md">
          <ScanLine className="size-3.5 text-[#b7f3d7]" />
            <span className="mono text-[9px] uppercase tracking-[.15em] text-[#b7f3d7]">{trackingDebug ? 'Debug overlay on' : gesture === 'hold' || gesture === 'smoking' || gesture === 'pinch' ? 'Object anchor live' : 'Looking for gesture'}</span>
        </div>
        <button type="button" onClick={onReset} className="lab-button flex items-center gap-2 rounded-full border border-[#d5c6ef]/10 bg-[#100e15]/65 px-3 py-1.5 text-[11px] text-[#b8aeba] backdrop-blur-md hover:border-[#f58b4f]/50 hover:text-[#f5eee3]" data-testid="button-reset-stage">
          <RotateCcw className="size-3.5" /> Reset
        </button>
      </div>

      <div className="relative z-[5] flex flex-1 items-center justify-center px-7 text-center" onPointerMove={onPointerMove} data-testid="interaction-surface">
        {!active && (
          <div className="enter-up max-w-[310px]">
            <div className="breathe mx-auto mb-5 flex size-16 items-center justify-center rounded-full border border-[#f58b4f]/35 bg-[#f58b4f]/[.07]">
              {cameraState === 'denied' ? <EyeOff className="size-6 text-[#f58b4f]" /> : <Camera className="size-6 text-[#f58b4f]" />}
            </div>
            <p className="mono mb-3 text-[9px] uppercase tracking-[.24em] text-[#b7f3d7]">{cameraState === 'denied' ? 'Lens paused' : 'Your private viewport'}</p>
            <h2 className="display text-3xl font-semibold leading-[.98] text-[#f5eee3] md:text-4xl">{cameraState === 'denied' ? 'The lens is waiting.' : 'Give the experiment a frame.'}</h2>
            <p className="mt-4 text-[13px] leading-relaxed text-[#938a9a]">{cameraState === 'denied' ? 'Camera access was not available. You can still explore the anchor by moving your pointer across this stage.' : 'Nothing is recorded or uploaded. Start the camera, then move one hand into view.'}</p>
            <button type="button" onClick={onStart} disabled={cameraState === 'requesting'} className="lab-button mt-7 inline-flex items-center gap-2 rounded-full bg-[#f58b4f] px-5 py-3 text-[12px] font-semibold text-[#191318] shadow-[0_8px_26px_rgba(245,139,79,.2)] hover:bg-[#ff9a5e] disabled:cursor-wait disabled:opacity-60" data-testid="button-start-camera">
              <Camera className="size-4" /> {cameraState === 'requesting' ? 'Opening lens…' : cameraState === 'denied' ? 'Try camera again' : 'Start camera'}
            </button>
            <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-[#756d7d]"><LockKeyhole className="size-3" /> Local only · no recording</div>
          </div>
        )}
        {active && (
          <div className="pointer-events-none absolute bottom-5 left-1/2 z-[6] -translate-x-1/2 whitespace-nowrap rounded-full border border-[#d5c6ef]/10 bg-[#100e15]/60 px-4 py-2 backdrop-blur-md">
            <p className="mono max-w-[calc(100vw-3rem)] text-center text-[10px] tracking-[.11em] text-[#d1c8d6]"><span className="mr-2 text-[#b7f3d7]">●</span>{gesture === 'smoking' ? 'Near your lips — open your mouth or pull away to blow out smoke.' : gesture === 'pinch' ? 'Cigarette held. Bring the ember to your lips, then open your mouth to puff.' : gesture === 'hold' ? 'Hold steady, bring the tip to your lips, then open your mouth to release smoke.' : gesture === 'open' ? 'Open palm detected. The object is resting.' : 'Move your hand. Watch the ember follow.'}</p>
          </div>
        )}
      </div>

      <div className="relative z-[5] flex items-center justify-between border-t border-[#d5c6ef]/10 bg-[#100e15]/45 px-4 py-3 backdrop-blur-md md:px-5">
        <div className="flex items-center gap-2">
          <div className={`size-1.5 rounded-full ${active ? 'bg-[#b7f3d7]' : 'bg-[#756d7d]'}`} />
          <span className="mono text-[9px] uppercase tracking-[.15em] text-[#887e91]">{active ? 'Camera feed' : 'Preview mode'}</span>
        </div>
        <span className="mono text-[9px] tracking-[.1em] text-[#625a68]">720 × 540 / MIRRORED</span>
      </div>
    </section>
  );
}

function Home() {
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [trackingDebug, setTrackingDebug] = useState(false);
  const [smokeEffects, setSmokeEffects] = useState(true);
  const [tracking, setTracking] = useState(false);
  const [gesture, setGesture] = useState<Gesture>('none');
  const [telemetry, setTelemetry] = useState<Telemetry>({ x: 50, y: 48, velocity: 0, confidence: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handsRef = useRef<any>(null);
  const faceMeshRef = useRef<any>(null);
  const detectionFrameRef = useRef<number | null>(null);
  const detectionBusyRef = useRef(false);
  const trackingDisposedRef = useRef(false);
  const smokeFadeRef = useRef(0);
  const blowPulseRef = useRef(0);
  const blowUntilRef = useRef(0);
  const mouthPositionRef = useRef({ x: 50, y: 30 });
  const lastMouthOpenRef = useRef(0);
  const wasSmokingRef = useRef(false);
  const mouthOpenRef = useRef(0); // 0..1 how open the mouth is
  const landmarksRef = useRef<Landmark[]>([]);
  const anchorRef = useRef({ x: 50, y: 48, angle: -0.17, scale: 1.35 });
  const trackingRef = useRef(false);
  const gestureRef = useRef<Gesture>('none');
  const lastPoint = useRef({ x: 50, y: 48, time: performance.now() });
  const telemetryRef = useRef(telemetry);
  telemetryRef.current = telemetry;
  trackingRef.current = tracking;
  gestureRef.current = gesture;

  const processResults = useCallback((results: { multiHandLandmarks?: Landmark[][] }) => {
    const landmarks = results.multiHandLandmarks?.[0];
    if (!landmarks) {
      landmarksRef.current = [];
      trackingRef.current = false;
      gestureRef.current = 'none';
      setTracking(false);
      setGesture('none');
      setTelemetry((current) => ({ ...current, velocity: 0, confidence: 0 }));
      return;
    }

    const rawX = ((landmarks[4].x + landmarks[8].x) / 2) * 100;
    const rawY = ((landmarks[4].y + landmarks[8].y) / 2) * 100;
    const palmAngle = Math.atan2(landmarks[8].y - landmarks[5].y, landmarks[8].x - landmarks[5].x);
    const previous = anchorRef.current;
    const nextX = previous.x + (rawX - previous.x) * 0.3;
    const nextY = previous.y + (rawY - previous.y) * 0.3;
    const nextAngle = previous.angle + (palmAngle - previous.angle) * 0.2;
    const now = performance.now();
    const elapsed = Math.max(16, now - lastPoint.current.time);
    const velocity = Math.min(18, Math.hypot(nextX - lastPoint.current.x, nextY - lastPoint.current.y) / elapsed * 1000 / 60);
    const nextGesture = classifyGesture(landmarks);
    const mouth = mouthPositionRef.current;
    const mouthDistance = Math.hypot(nextX - mouth.x, nextY - mouth.y);
    const palmWidth = landmarkDistance(landmarks[5], landmarks[17]);
    const handRelativeScale = Math.max(1.12, Math.min(2.35, palmWidth / 0.085));
    const depthScale = Math.max(0.9, Math.min(1.22, 1 + ((landmarks[0].z ?? 0) + 0.05) * -0.85));
    const nextScale = handRelativeScale * depthScale;
    // Smoking when holding / pinching near the actual detected mouth
    const nearMouth = mouthDistance < 22;
    const smoking = (nextGesture === 'hold' || nextGesture === 'pinch') && nearMouth;

    // Also treat as smoking if we are already smoking and still reasonably close
    const stillSmoking = wasSmokingRef.current && nearMouth && (nextGesture === 'hold' || nextGesture === 'pinch' || nextGesture === 'none');

    const isSmokingNow = smoking || stillSmoking;

    if (wasSmokingRef.current && !isSmokingNow) {
      // The ember just left the lips after a held puff — release a lingering
      // exhale that drifts from the mouth rather than cutting off instantly.
      blowUntilRef.current = now + 1400;
      blowPulseRef.current = 1.15;
      lastMouthOpenRef.current = now;
    }
    wasSmokingRef.current = isSmokingNow;

    landmarksRef.current = landmarks;
    anchorRef.current = { x: nextX, y: nextY, angle: nextAngle, scale: nextScale };
    lastPoint.current = { x: nextX, y: nextY, time: now };
    trackingRef.current = true;
    gestureRef.current = isSmokingNow ? 'smoking' : nextGesture;
    setTracking(true);
    setGesture(isSmokingNow ? 'smoking' : nextGesture);
    setTelemetry({
      x: nextX,
      y: nextY,
      velocity,
      confidence: Math.max(60, Math.min(99, 100 - velocity * 1.6)),
    });
  }, []);

  const processFaceResults = useCallback((results: { multiFaceLandmarks?: Landmark[][] }) => {
    const face = results.multiFaceLandmarks?.[0];
    if (!face || face.length < 15) return;

    // MediaPipe Face Mesh: upper lip center ~13, lower lip center ~14
    // Also use outer mouth corners 61 / 291 for width reference
    const upper = face[13];
    const lower = face[14];
    if (!upper || !lower) return;

    const mouthX = ((upper.x + lower.x) / 2) * 100;
    const mouthY = ((upper.y + lower.y) / 2) * 100;
    mouthPositionRef.current = { x: mouthX, y: mouthY };

    // Normalized mouth openness (vertical distance relative to face scale)
    const openDist = Math.hypot(upper.x - lower.x, upper.y - lower.y);
    // Typical closed ~0.01-0.02, open ~0.04-0.08
    const openness = Math.max(0, Math.min(1, (openDist - 0.018) / 0.055));
    mouthOpenRef.current = openness;

    const now = performance.now();
    // Strong open mouth while holding cig near lips → active blow / puff release
    if (openness > 0.32 && wasSmokingRef.current) {
      blowUntilRef.current = Math.max(blowUntilRef.current, now + 900 + openness * 700);
      blowPulseRef.current = Math.max(blowPulseRef.current, 0.85 + openness * 0.6);
      lastMouthOpenRef.current = now;
    } else if (openness > 0.45) {
      // Even without recent smoking, a clear blow can release a short puff from the mouth
      if (now - lastMouthOpenRef.current > 400) {
        blowUntilRef.current = Math.max(blowUntilRef.current, now + 700);
        blowPulseRef.current = Math.max(blowPulseRef.current, 0.55 + openness * 0.4);
        lastMouthOpenRef.current = now;
      }
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('denied');
      return;
    }
    setCameraState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState('active');

      const HandsConstructor = (window as any).Hands;
      const FaceMeshConstructor = (window as any).FaceMesh;
      if (HandsConstructor && videoRef.current) {
        trackingDisposedRef.current = false;
        const hands = new HandsConstructor({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });
        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.62,
          minTrackingConfidence: 0.62,
        });
        hands.onResults(processResults);
        handsRef.current = hands;

        if (FaceMeshConstructor) {
          const faceMesh = new FaceMeshConstructor({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
          });
          faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.55,
            minTrackingConfidence: 0.55,
          });
          faceMesh.onResults(processFaceResults);
          faceMeshRef.current = faceMesh;
        }

        const detect = async () => {
          const video = videoRef.current;
          const activeHands = handsRef.current;
          const activeFace = faceMeshRef.current;
          if (video && activeHands && video.readyState >= 2 && !detectionBusyRef.current) {
            detectionBusyRef.current = true;
            try {
              await activeHands.send({ image: video });
              if (activeFace) {
                await activeFace.send({ image: video });
              }
            } catch {
              if (!trackingDisposedRef.current) {
                landmarksRef.current = [];
                trackingRef.current = false;
                gestureRef.current = 'none';
                setTracking(false);
                setGesture('none');
              }
            } finally {
              detectionBusyRef.current = false;
              if (trackingDisposedRef.current && handsRef.current === activeHands) {
                handsRef.current = null;
                activeHands.close?.();
                faceMeshRef.current?.close?.();
                faceMeshRef.current = null;
              }
            }
          }
          if (!trackingDisposedRef.current) {
            detectionFrameRef.current = requestAnimationFrame(detect);
          }
        };
        detectionFrameRef.current = requestAnimationFrame(detect);
      }
    } catch {
      setCameraState('denied');
      setTracking(false);
    }
  }, [processResults, processFaceResults]);

  const resetLab = useCallback(() => {
    setTracking(false);
    setGesture('none');
    setTelemetry({ x: 50, y: 48, velocity: 0, confidence: cameraState === 'active' ? 92 : 0 });
    anchorRef.current = { x: 50, y: 48, angle: -0.17, scale: 1.35 };
    smokeFadeRef.current = 0;
    blowUntilRef.current = 0;
    blowPulseRef.current = 0;
    mouthOpenRef.current = 0;
    landmarksRef.current = [];
    trackingRef.current = false;
    gestureRef.current = 'none';
    lastPoint.current = { x: 50, y: 48, time: performance.now() };
  }, [cameraState]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (cameraState === 'active' && trackingRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(96, Math.max(4, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(88, Math.max(12, ((event.clientY - rect.top) / rect.height) * 100));
    const now = performance.now();
    const distance = Math.hypot(x - lastPoint.current.x, y - lastPoint.current.y);
    const velocity = Math.min(14, (distance / Math.max(16, now - lastPoint.current.time)) * 10);
    lastPoint.current = { x, y, time: now };
    anchorRef.current = { ...anchorRef.current, x, y };
    setTracking(true);
    setGesture('hold');
    gestureRef.current = 'hold';
    setTelemetry((current) => ({ x, y, velocity, confidence: cameraState === 'active' ? Math.min(99, Math.max(86, current.confidence || 92)) : 72 }));
  }, [cameraState]);

  useEffect(() => {
    return () => {
      trackingDisposedRef.current = true;
      if (detectionFrameRef.current) cancelAnimationFrame(detectionFrameRef.current);
      if (!detectionBusyRef.current) {
        handsRef.current?.close?.();
        handsRef.current = null;
        faceMeshRef.current?.close?.();
        faceMeshRef.current = null;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const stage = stageRef.current;
      if (canvas && stage) {
        const rect = stage.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
          canvas.width = rect.width * dpr;
          canvas.height = rect.height * dpr;
        }
        const context = canvas.getContext('2d');
        if (context) {
          context.setTransform(dpr, 0, 0, dpr, 0, 0);
          context.clearRect(0, 0, rect.width, rect.height);
          const point = telemetryRef.current;
          const x = rect.width * (point.x / 100);
          const y = rect.height * (point.y / 100);
          const anchor = anchorRef.current;
          const activeGesture = gestureRef.current;
          const objectVisible = trackingRef.current && (activeGesture === 'hold' || activeGesture === 'smoking' || activeGesture === 'pinch');
           const now = performance.now();
           const smoking = activeGesture === 'smoking';
           smokeFadeRef.current += ((smoking ? 1 : objectVisible ? 0.62 : 0) - smokeFadeRef.current) * 0.1;
          const pulse = 1 + Math.sin(performance.now() / 420) * .06;
          context.save();
          context.translate(x, y);
          context.scale(pulse, pulse);
          context.strokeStyle = tracking ? 'rgba(183,243,215,.85)' : 'rgba(183,243,215,.42)';
          context.lineWidth = 1;
          context.setLineDash([3, 5]);
          context.beginPath();
          context.arc(0, 0, 36, 0, Math.PI * 2);
          context.stroke();
          context.setLineDash([]);
          context.strokeStyle = 'rgba(183,243,215,.35)';
          context.beginPath();
          context.moveTo(-47, 0); context.lineTo(-27, 0); context.moveTo(27, 0); context.lineTo(47, 0);
          context.moveTo(0, -47); context.lineTo(0, -27); context.moveTo(0, 27); context.lineTo(0, 47);
          context.stroke();
          if (objectVisible) {
            context.rotate(anchor.angle);
            context.scale(anchor.scale, anchor.scale);
            // Bigger cigarette body + glowing ember
            context.shadowColor = activeGesture === 'smoking' ? 'rgba(245,139,79,1)' : 'rgba(245,139,79,.8)';
            context.shadowBlur = activeGesture === 'smoking' ? 32 : 20;
            context.fillStyle = '#f58b4f';
            context.beginPath();
            context.arc(58, -12, activeGesture === 'smoking' ? 9.5 : 7.8, 0, Math.PI * 2);
            context.fill();
            context.shadowBlur = 0;
            // Main white/cream paper body (longer & thicker)
            context.fillStyle = 'rgba(242, 236, 225, .97)';
            context.roundRect(-52, -9, 108, 15, 7);
            context.fill();
            // Filter / tip
            context.fillStyle = '#c49a6c';
            context.roundRect(-52, -9, 24, 15, 7);
            context.fill();
            // Filter lines
            context.strokeStyle = 'rgba(255, 245, 225, .32)';
            context.lineWidth = 1.2;
            context.beginPath();
            context.moveTo(-46, -7); context.lineTo(-46, 6);
            context.moveTo(-40, -7); context.lineTo(-40, 6);
            context.moveTo(-34, -7); context.lineTo(-34, 6);
            context.stroke();
            // Ember glow band
            context.fillStyle = 'rgba(245, 139, 79, .78)';
            context.fillRect(38, -9, 16, 15);
            // Ash / burn ring
            context.fillStyle = 'rgba(70, 52, 40, .55)';
            context.fillRect(44, -7, 3, 11);
          }
          context.restore();
          if (smokeEffects && objectVisible) {
             // Tip of the bigger cigarette (ember position)
             const tipX = x + anchor.scale * (58 * Math.cos(anchor.angle) + 12 * Math.sin(anchor.angle));
             const tipY = y + anchor.scale * (58 * Math.sin(anchor.angle) - 12 * Math.cos(anchor.angle));
             const smokeStrength = Math.max(0.38, smokeFadeRef.current);
             // Continuous rising smoke from the ember
             for (let index = 0; index < 9; index += 1) {
               const phase = now / (1200 + index * 170) + index * 0.75;
               const turbulence = Math.min(2.6, 0.9 + point.velocity / 5.5);
               const rise = (now / (12 + index * 1.4) + index * 28) % (120 + index * 10);
               const smokeX = tipX + Math.sin(phase) * (14 + index * 4) * turbulence + Math.sin(index * 2.6) * 5;
               const smokeY = tipY - 18 - rise;
               const radius = (12 + index * 2.8) * (0.92 + smokeStrength * 0.32);
               const cloudGradient = context.createRadialGradient(smokeX, smokeY, 0, smokeX, smokeY, radius);
               cloudGradient.addColorStop(0, `rgba(239, 235, 247, ${smokeStrength * (0.18 - index * .011)})`);
               cloudGradient.addColorStop(0.6, `rgba(212, 205, 230, ${smokeStrength * (0.12 - index * .008)})`);
               cloudGradient.addColorStop(1, 'rgba(212, 205, 230, 0)');
               context.fillStyle = cloudGradient;
               context.beginPath();
               context.arc(smokeX, smokeY, radius, 0, Math.PI * 2);
               context.fill();
             }
             // Stronger inhale/puff smoke while actively smoking near lips
             if (smoking) {
               const puffProgress = (now % 1400) / 1400;
               const puffEnvelope = Math.pow(Math.sin(puffProgress * Math.PI), 0.68);
               const puffDrift = Math.sin(now / 450) * 18 + point.velocity * 4;
               const puffX = tipX + puffDrift + Math.sin(anchor.angle) * 18;
               const puffY = tipY - 18 - puffProgress * 55;
               context.save();
               context.globalCompositeOperation = 'screen';
               for (let blob = 0; blob < 11; blob += 1) {
                 const offsetX = Math.sin(blob * 2.05 + now / 680) * (7 + blob * 2.6);
                 const offsetY = Math.cos(blob * 1.65 + now / 820) * (6 + blob * 1.5);
                 const radius = (13 + blob * 3.1) * (0.78 + puffProgress * 1.25);
                 const gradient = context.createRadialGradient(
                   puffX + offsetX,
                   puffY + offsetY,
                   0,
                   puffX + offsetX,
                   puffY + offsetY,
                   radius,
                 );
                 gradient.addColorStop(0, `rgba(248, 245, 255, ${0.34 * puffEnvelope})`);
                 gradient.addColorStop(0.58, `rgba(214, 207, 232, ${0.18 * puffEnvelope})`);
                 gradient.addColorStop(1, 'rgba(206, 199, 224, 0)');
                 context.fillStyle = gradient;
                 context.beginPath();
                 context.arc(puffX + offsetX, puffY + offsetY, radius, 0, Math.PI * 2);
                 context.fill();
               }
               for (let spark = 0; spark < 8; spark += 1) {
                 const sparkPhase = now / 420 + spark * 1.7;
                 const sparkX = puffX + Math.sin(sparkPhase) * (20 + spark * 3.5);
                 const sparkY = puffY + Math.cos(sparkPhase * 0.85) * (14 + spark * 2.2);
                 context.fillStyle = `rgba(247, 240, 255, ${0.48 * puffEnvelope})`;
                 context.beginPath();
                 context.arc(sparkX, sparkY, 1.4 + (spark % 2) * 0.6, 0, Math.PI * 2);
                 context.fill();
               }
               context.restore();
             }
          }
          const blowRemaining = blowUntilRef.current - now;
          if (smokeEffects && blowRemaining > 0) {
             const duration = 1400;
             const blowT = 1 - Math.max(0, Math.min(1, blowRemaining / duration));
             const fadeOut = Math.pow(1 - blowT, 1.05) * Math.max(0.55, blowPulseRef.current);
             const originX = rect.width * (mouthPositionRef.current.x / 100);
             const originY = rect.height * (mouthPositionRef.current.y / 100);
             // Extra strength from current mouth openness
             const openBoost = 0.75 + mouthOpenRef.current * 0.85;
             context.save();
             context.globalCompositeOperation = 'screen';
             // Dense cloud of smoke coming out of the mouth when you blow / open lips
             for (let cloud = 0; cloud < 14; cloud += 1) {
               const driftPhase = now / 580 + cloud * 1.22;
               const spread = 12 + blowT * (42 + cloud * 6.5) * openBoost;
               const forward = blowT * (55 + cloud * 9) * openBoost;
               const cloudX = originX + Math.sin(driftPhase) * spread * 0.55 + (cloud % 3 - 1) * 4;
               const cloudY = originY - forward + Math.cos(driftPhase * 0.65) * 6;
               const radius = (11 + cloud * 3.2) * (0.8 + blowT * 1.05) * openBoost;
               const cloudGradient = context.createRadialGradient(cloudX, cloudY, 0, cloudX, cloudY, radius);
               cloudGradient.addColorStop(0, `rgba(248, 245, 255, ${0.38 * fadeOut})`);
               cloudGradient.addColorStop(0.55, `rgba(220, 214, 238, ${0.2 * fadeOut})`);
               cloudGradient.addColorStop(1, 'rgba(214, 207, 232, 0)');
               context.fillStyle = cloudGradient;
               context.beginPath();
               context.arc(cloudX, cloudY, radius, 0, Math.PI * 2);
               context.fill();
             }
             // Soft wisps
             for (let wisp = 0; wisp < 6; wisp += 1) {
               const phase = now / 720 + wisp * 2.1;
               const wx = originX + Math.sin(phase) * (18 + blowT * 35);
               const wy = originY - blowT * (70 + wisp * 12) - 8;
               const wr = (8 + wisp * 2.5) * (0.9 + blowT);
               const g = context.createRadialGradient(wx, wy, 0, wx, wy, wr);
               g.addColorStop(0, `rgba(255, 252, 255, ${0.22 * fadeOut})`);
               g.addColorStop(1, 'rgba(230, 225, 245, 0)');
               context.fillStyle = g;
               context.beginPath();
               context.arc(wx, wy, wr, 0, Math.PI * 2);
               context.fill();
             }
             context.restore();
          }
          if (trackingDebug) {
            context.save();
            context.translate(-x, -y);
            context.strokeStyle = 'rgba(183,243,215,.55)';
            context.lineWidth = 1;
            HAND_CONNECTIONS.forEach(([from, to]) => {
              const start = landmarksRef.current[from];
              const end = landmarksRef.current[to];
              if (!start || !end) return;
              context.beginPath();
              context.moveTo(start.x * rect.width, start.y * rect.height);
              context.lineTo(end.x * rect.width, end.y * rect.height);
              context.stroke();
            });
            landmarksRef.current.forEach((landmark, index) => {
              context.fillStyle = index === 4 || index === 8 ? '#f58b4f' : '#b7f3d7';
              context.beginPath();
              context.arc(landmark.x * rect.width, landmark.y * rect.height, index === 4 || index === 8 ? 3 : 2, 0, Math.PI * 2);
              context.fill();
            });
            context.restore();
            context.fillStyle = 'rgba(183,243,215,.8)';
            context.font = '10px Space Mono';
            context.fillText(`ANCHOR ${Math.round(point.x)}:${Math.round(point.y)}`, x + 50, y - 35);
            context.strokeStyle = 'rgba(183,243,215,.2)';
            context.beginPath(); context.moveTo(x, y); context.lineTo(x + 72, y - 36); context.stroke();
          }
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [smokeEffects, tracking, trackingDebug]);

  return (
    <main className="lab-app">
      <div className="mx-auto flex min-h-[100dvh] max-w-[1480px] flex-col px-4 pb-5 sm:px-6 lg:px-8">
        <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-[#d5c6ef]/10">
          <Wordmark />
          <div className="flex items-center gap-3">
            <StatusPill cameraState={cameraState} tracking={tracking} />
            <button type="button" className="lab-button hidden size-9 items-center justify-center rounded-full border border-[#d5c6ef]/10 text-[#8d8393] hover:border-[#f58b4f]/50 hover:text-[#f5eee3] sm:flex" data-testid="button-help" aria-label="About this experiment">
              <CircleHelp className="size-4" />
            </button>
          </div>
        </header>

        <div className="grid flex-1 gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6 lg:py-6">
          <div ref={stageRef} className="flex min-w-0">
           <Stage cameraState={cameraState} videoRef={videoRef} canvasRef={canvasRef} trackingDebug={trackingDebug} gesture={gesture} onPointerMove={onPointerMove} onStart={startCamera} onReset={resetLab} />
          </div>

          <aside className="flex flex-col gap-4" data-testid="control-panel">
            <div className="enter-up rounded-2xl border border-[#d5c6ef]/12 bg-[#14121b]/65 p-5" style={{ animationDelay: '80ms' }}>
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <p className="mono text-[9px] uppercase tracking-[.2em] text-[#f58b4f]">Experiment 001</p>
                  <h1 className="display mt-2 text-[27px] font-semibold leading-[.97] tracking-[-.06em] text-[#f5eee3]">Hold the moment.</h1>
                </div>
                <Sparkles className="mt-1 size-4 text-[#b7f3d7]" />
              </div>
              <p className="text-[12px] leading-[1.6] text-[#978e9d]">A tiny AR study in hand, smoke, and keeping an ember exactly where you left it.</p>
              <div className="mt-5 flex items-center gap-2 border-t border-[#d5c6ef]/10 pt-4">
                <Hand className="size-4 text-[#b7f3d7]" />
                <span className="text-[11px] text-[#c8bfd0]">Hold → bring to lips → puff</span>
                <ArrowUpRight className="ml-auto size-3.5 text-[#756d7d]" />
              </div>
              <div className="mt-4 space-y-2.5 border-t border-[#d5c6ef]/10 pt-4">
                <p className="mono text-[9px] uppercase tracking-[.18em] text-[#756d7d]">How to puff</p>
                <div className="flex gap-2.5 text-[11px] leading-relaxed text-[#a69cab]">
                  <span className="mono shrink-0 text-[#f58b4f]">01</span>
                  <span>Make a relaxed hold with your thumb and index finger.</span>
                </div>
                <div className="flex gap-2.5 text-[11px] leading-relaxed text-[#a69cab]">
                  <span className="mono shrink-0 text-[#f58b4f]">02</span>
                  <span>Move the ember toward the center of your lips.</span>
                </div>
                <div className="flex gap-2.5 text-[11px] leading-relaxed text-[#a69cab]">
                  <span className="mono shrink-0 text-[#f58b4f]">03</span>
                  <span>Pause for a beat. The smoke releases automatically.</span>
                </div>
                <div className="flex gap-2.5 text-[11px] leading-relaxed text-[#a69cab]">
                  <span className="mono shrink-0 text-[#f58b4f]">04</span>
                  <span>Pull the ember back — a puff lingers and drifts from your lips.</span>
                </div>
              </div>
            </div>

            <MotionReadout telemetry={telemetry} />

            <div className="rounded-xl border border-[#d5c6ef]/10 bg-[#14121b]/55 p-2" data-testid="panel-controls">
              <Toggle label="Tracking debug" icon={<Bug className="size-3.5 text-[#c0a9ec]" />} checked={trackingDebug} onChange={() => setTrackingDebug((value) => !value)} testId="toggle-tracking-debug" />
              <Toggle label="Smoke effects" icon={<Waves className="size-3.5 text-[#c0a9ec]" />} checked={smokeEffects} onChange={() => setSmokeEffects((value) => !value)} testId="toggle-smoke-effects" />
            </div>

            <div className="mt-auto rounded-xl border border-[#b7f3d7]/15 bg-[#b7f3d7]/[.045] p-4" data-testid="panel-local-note">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#b7f3d7]" />
                <div>
                  <p className="text-[12px] font-medium text-[#dceee5]">A private little lab</p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[#8f9f96]">The camera stays in your browser. No frames, gestures, or motion data are sent anywhere.</p>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <footer className="flex flex-col gap-2 border-t border-[#d5c6ef]/10 py-4 text-[10px] text-[#756d7d] sm:flex-row sm:items-center sm:justify-between">
          <p className="mono tracking-[.08em]">MOVE SLOWLY · THE OBJECT WILL CATCH UP</p>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><Zap className="size-3 text-[#f58b4f]" /> Browser-local experiment</span>
            <span className="hidden text-[#514b58] sm:inline">v0.1.0</span>
          </div>
        </footer>
      </div>
    </main>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;