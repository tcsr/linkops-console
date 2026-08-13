import type { Link, LinkId, LinkRepository, TelemetrySample } from '@linkops/domain';

/**
 * Tunable simulator constants. These are implementation decisions (plausible
 * radio ranges + drift magnitudes), NOT RADWIN device specifications. They are
 * exported so tests and documentation reference one source of truth.
 *
 * Units: dBm for RSSI, dB for SNR, Mbps for throughput. Throughput targets are
 * expressed as a fraction of each link's provisioned `capacityMbps`.
 */
export const SIMULATOR_DEFAULTS = {
  /** Fleet tick period. One sample per link per second. */
  intervalMs: 1_000,

  bounds: {
    rssiDbm: { min: -90, max: -40 },
    snrDb: { min: 0, max: 40 },
    // throughput bounds are [0, capacityMbps] per link.
  },

  /** Healthy operating point each link relaxes toward. */
  healthy: {
    rssiDbm: -55,
    snrDb: 28,
    throughputRatio: 0.85,
  },

  /**
   * Degraded operating point during an episode. Chosen to land in the domain's
   * DEGRADED band (snr in [10,18), throughput in [0.2,0.6)*capacity) so that
   * `deriveLinkStatus` naturally reports `degraded` — the simulator never writes
   * status itself.
   */
  degraded: {
    rssiDbm: -78,
    snrDb: 12,
    throughputRatio: 0.35,
  },

  /** Per-tick bounded drift toward the active target, plus jitter. */
  drift: {
    rssiStep: 4,
    rssiJitter: 1.0,
    snrStep: 3,
    snrJitter: 0.8,
    throughputStepRatio: 0.1,
    throughputJitterRatio: 0.03,
  },

  degradation: {
    /** Probability per eligible link per tick of starting an episode. */
    chancePerTick: 0.02,
    /** Episode length range (ticks). */
    minTicks: 6,
    maxTicks: 15,
    /** Ticks after an episode during which the link cannot degrade again. */
    cooldownTicks: 30,
  },
} as const;

export interface TelemetrySimulatorOptions {
  /** Injectable clock (epoch ms) for deterministic timestamps. Default Date.now. */
  readonly clock?: () => number;
  /** Injectable RNG in [0,1). Default Math.random. Inject for determinism. */
  readonly random?: () => number;
  /** Tick period in ms. Default 1000. */
  readonly intervalMs?: number;
  /**
   * Called when a scheduled tick throws/rejects, so the failure is contained
   * (no unhandled rejection) and later ticks continue. Default logs to stderr.
   */
  readonly onError?: (error: unknown) => void;
}

/** Per-link simulation state. Bounded to the current fleet; no sample history. */
interface LinkSimState {
  rssiDbm: number;
  snrDb: number;
  throughputMbps: number;
  /** >0 while a degradation episode is active. */
  degradeTicksRemaining: number;
  /** >0 while the link is recovering and ineligible for a new episode. */
  cooldownTicks: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Generates plausible telemetry for the whole fleet at 1 Hz and appends it to
 * the repository's bounded ring buffers.
 *
 * Design:
 *  - ONE global timer for the entire fleet (`start()` → single `setInterval`).
 *  - `tick()` is public and side-effecting but synchronous-to-invoke, so tests
 *    call it directly with no real-time sleeps.
 *  - Values evolve by bounded random-walk toward a target (healthy or, during
 *    an episode, degraded), so the fleet drifts gradually and stays plausible.
 *  - The simulator never writes `LinkStatus`; status stays derived from the
 *    latest sample via the domain's `deriveLinkStatus`.
 *  - It keeps only O(fleet) simulation state — no accumulated sample history.
 *
 * Method names `onModuleInit`/`onApplicationShutdown` intentionally match the
 * NestJS lifecycle interfaces so M3 can register this as a provider and have
 * start/stop wired automatically — without coupling this layer to NestJS now.
 */
export class TelemetrySimulatorService {
  private readonly clock: () => number;
  private readonly random: () => number;
  private readonly intervalMs: number;
  private readonly onError: (error: unknown) => void;
  private readonly state = new Map<LinkId, LinkSimState>();
  private handle: ReturnType<typeof setInterval> | undefined;
  /** True while a tick is executing — guards against overlapping ticks. */
  private inFlight = false;

  constructor(
    private readonly repository: LinkRepository,
    options: TelemetrySimulatorOptions = {},
  ) {
    this.clock = options.clock ?? (() => Date.now());
    this.random = options.random ?? (() => Math.random());
    this.intervalMs = options.intervalMs ?? SIMULATOR_DEFAULTS.intervalMs;
    this.onError =
      options.onError ??
      ((error) => {
        console.error('[telemetry-simulator] tick failed', error);
      });
  }

  /** True while the single global interval is active. */
  get running(): boolean {
    return this.handle !== undefined;
  }

  /** Number of links currently tracked by simulation state (for tests/metrics). */
  get trackedLinks(): number {
    return this.state.size;
  }

  /** True while a scheduled tick is currently executing. */
  get busy(): boolean {
    return this.inFlight;
  }

  /** Start the single fleet timer. Idempotent: never creates a second interval. */
  start(): void {
    if (this.handle !== undefined) {
      return;
    }
    this.handle = setInterval(() => {
      // Fire-and-forget, but errors are contained inside runTick (no unhandled
      // rejection) and overlapping ticks are skipped.
      void this.runTick();
    }, this.intervalMs);
  }

  /** Stop the timer and release the handle. Safe to call when not running. */
  stop(): void {
    if (this.handle !== undefined) {
      clearInterval(this.handle);
      this.handle = undefined;
    }
  }

  /** NestJS-compatible lifecycle hook (structural; no NestJS import). */
  onModuleInit(): void {
    this.start();
  }

  /** NestJS-compatible lifecycle hook (structural; no NestJS import). */
  onApplicationShutdown(): void {
    this.stop();
  }

  /**
   * Scheduler-facing tick used by the interval (and callable by tests).
   *
   * Guarantees:
   *  - **No overlap:** if a tick is already running, this call is skipped, so at
   *    most one tick executes at any time (important once the repository can be
   *    asynchronous/durable).
   *  - **Error containment:** a throwing/rejecting `tick()` is caught and routed
   *    to `onError`; it never becomes an unhandled rejection and never blocks
   *    later ticks. The in-flight flag is always cleared.
   */
  async runTick(): Promise<void> {
    if (this.inFlight) {
      return;
    }
    this.inFlight = true;
    try {
      await this.tick();
    } catch (error) {
      this.onError(error);
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * Execute one fleet tick: generate exactly one sample per current link and
   * append it to the repository. All samples in a tick share one timestamp.
   *
   * This is the raw pass (may throw). Scheduling uses {@link runTick}, which
   * adds overlap protection and error containment.
   */
  async tick(): Promise<void> {
    const links = await this.repository.list({});
    const ts = new Date(this.clock()).toISOString();
    const alive = new Set<LinkId>();

    for (const link of links) {
      alive.add(link.id);
      const sample = this.advance(link, ts);
      this.repository.appendSample(sample);
    }

    // Prune simulation state for links that left the fleet (bounded memory).
    for (const id of this.state.keys()) {
      if (!alive.has(id)) {
        this.state.delete(id);
      }
    }
  }

  /** Advance one link's simulation state by a tick and produce its sample. */
  private advance(link: Link, ts: string): TelemetrySample {
    const s = this.state.get(link.id) ?? this.initState(link);

    // --- degradation state machine ---
    if (s.degradeTicksRemaining > 0) {
      s.degradeTicksRemaining--;
      if (s.degradeTicksRemaining === 0) {
        s.cooldownTicks = SIMULATOR_DEFAULTS.degradation.cooldownTicks;
      }
    } else if (s.cooldownTicks > 0) {
      s.cooldownTicks--;
    } else if (this.random() < SIMULATOR_DEFAULTS.degradation.chancePerTick) {
      const { minTicks, maxTicks } = SIMULATOR_DEFAULTS.degradation;
      const span = maxTicks - minTicks;
      s.degradeTicksRemaining = minTicks + Math.floor(this.random() * (span + 1));
    }

    const degrading = s.degradeTicksRemaining > 0;
    const target = degrading
      ? SIMULATOR_DEFAULTS.degraded
      : SIMULATOR_DEFAULTS.healthy;
    const { drift, bounds } = SIMULATOR_DEFAULTS;
    const capacity = link.capacityMbps;

    s.rssiDbm = clamp(
      this.step(s.rssiDbm, target.rssiDbm, drift.rssiStep, drift.rssiJitter),
      bounds.rssiDbm.min,
      bounds.rssiDbm.max,
    );
    s.snrDb = clamp(
      this.step(s.snrDb, target.snrDb, drift.snrStep, drift.snrJitter),
      bounds.snrDb.min,
      bounds.snrDb.max,
    );
    s.throughputMbps = clamp(
      this.step(
        s.throughputMbps,
        target.throughputRatio * capacity,
        drift.throughputStepRatio * capacity,
        drift.throughputJitterRatio * capacity,
      ),
      0,
      capacity,
    );

    this.state.set(link.id, s);

    return {
      linkId: link.id,
      ts,
      rssiDbm: round(s.rssiDbm),
      snrDb: round(s.snrDb),
      throughputMbps: round(s.throughputMbps),
    };
  }

  /** Bounded random-walk: move toward `target` by up to `maxStep`, plus jitter. */
  private step(current: number, target: number, maxStep: number, jitter: number): number {
    const towards = clamp(target - current, -maxStep, maxStep);
    const noise = (this.random() - 0.5) * 2 * jitter;
    return current + towards + noise;
  }

  private initState(link: Link): LinkSimState {
    const { healthy } = SIMULATOR_DEFAULTS;
    return {
      rssiDbm: healthy.rssiDbm,
      snrDb: healthy.snrDb,
      throughputMbps: healthy.throughputRatio * link.capacityMbps,
      degradeTicksRemaining: 0,
      cooldownTicks: 0,
    };
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
