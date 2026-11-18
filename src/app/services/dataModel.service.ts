import { computed, inject, Injectable, signal } from "@angular/core";
import { SocketService } from "./SocketService";
import { IMapbanSessionData, IMatchData, ISponsorInfo, ITournamentInfo } from "./Types";
import { ActivatedRoute } from "@angular/router";
import { Config } from "../shared/config";
import { isEqual } from "lodash";
import { i18nHelper } from "./i18nHelper";
import { TranslateService } from "@ngx-translate/core";

@Injectable({
  providedIn: "root",
})
export class DataModelService {
  protected route = inject(ActivatedRoute);
  protected config = inject(Config);
  protected translate = inject(TranslateService);

  // Preserve the latest values received directly from Spectra. PCMT data is
  // layered over these values instead of mutating the upstream source of truth.
  private spectraNameOverrides = new Map<string, string>();
  private spectraPlayercamsInfo: any = { enable: false };

  // A null PCMT playercam value means "no PCMT session for this group code" and
  // intentionally falls back to whatever the stock Spectra Server supplied.
  private pcmtNameOverrides = new Map<string, string>();
  private pcmtPlayercamsInfo: any | null = null;

  // PCMT Stats keeps a server-side Socket.IO watch registered for this group.
  // Re-registering periodically makes the watch recover automatically if the
  // stats service is restarted while the OBS/frontend browser remains open.
  private statsWatchUnsupported = false;
  private lastSpectraMatch: IMatchData | null = null;
  private offlineBaseMatch: IMatchData = initialMatchData;
  private manualHud: any = null;
  private manualHudShowCode = "";
  private manualHudPollSequence = 0;

  constructor() {
    this.route.queryParams.subscribe((params) => {
      this.groupCode.set(((params["groupCode"] as string) || "").toUpperCase());
      this.sessionId.set(params["sessionId"] || "");
      const paramLang = params["lang"]?.toLowerCase() || "en";
      console.log("Setting language to", paramLang);
      this.language.set(i18nHelper.resolveLanguageAlias(paramLang));
      this.translate.use(this.language());
      // Use the active locale for CJK font fallbacks, including Chinese variants.
      document.documentElement.lang = this.language().replace("_", "-");
      this.hideAuxiliary.set(params["hideAuxiliary"] === "true");
      this.hideAuxiliaryText.set(params["hideAuxiliaryText"] === "true");
      const show = String(params["pcmtShow"] || "").trim().toUpperCase();
      if (show !== this.manualHudShowCode) {
        this.manualHudShowCode = show;
        this.manualHud = null;
        this.publishEffectiveMatch();
      }
    });

    if (this.route.firstChild && this.route.firstChild.firstChild) {
      this.route.firstChild!.firstChild!.data.subscribe((data) => {
        this.minimalMode.set(data["minimal"]);
      });
    }

    // Producer state is independent of Spectra observer registration.
    void this.pollManualHud();
    window.setInterval(() => void this.pollManualHud(), 1000);
    if (!this.config.serverEndpoint || this.config.serverEndpoint.length === 0) {
      console.error("No server endpoint configured, cannot connect to match data");
      return;
    }

    if (!this.groupCode() || this.groupCode().length === 0) {
      console.error("No group code provided, cannot connect to match data");
    } else {
      SocketService.getInstance().subscribeMatch(this.onMatchUpdate.bind(this));
      SocketService.getInstance().connectMatch(this.config.serverEndpoint, this.groupCode());

      this.registerStatsWatch();
      window.setInterval(() => this.registerStatsWatch(), 60_000);

      if (this.config.pcmtToolsEndpoint && this.config.pcmtToolsEndpoint.length > 0) {
        SocketService.getInstance().subscribePcmtTools(this.onPcmtToolsUpdate.bind(this));
        SocketService.getInstance().connectPcmtTools(this.config.pcmtToolsEndpoint, this.groupCode());
      }
    }

    if (this.sessionId() && this.sessionId().length > 0) {
      if (!this.config.mapbanEndpoint || this.config.mapbanEndpoint.length === 0) {
        console.error("No mapban endpoint configured, cannot connect to mapban data");
      } else {
        SocketService.getInstance().subscribeMapban(this.onMapbanUpdate.bind(this));
        SocketService.getInstance().connectMapban(this.config.mapbanEndpoint, {
          sessionId: this.sessionId(),
        });
      }
    }
  }

  private onMatchUpdate(data: any) {
    // Spectra now reports Gekko as AggroBot, but the existing assets use Aggrobot.
    // Normalize once so every overlay uses the same on-disk asset names.
    for (const team of data?.teams || []) {
      for (const player of team?.players || []) {
        if (player?.agentInternal === "AggroBot") {
          player.agentInternal = "Aggrobot";
        }
      }
    }

    // Capture the stock Spectra tools data before layering PCMT state over it.
    this.spectraNameOverrides = this.toOverrideMap(data?.tools?.nameOverrides?.overrides);
    this.spectraPlayercamsInfo = { ...(data?.tools?.playercamsInfo || { enable: false }) };

    this.applyPcmtToolsToMatch(data);
    this.lastSpectraMatch = data as IMatchData;
    this.publishEffectiveMatch();
    this.reportRosterToPcmt(data);
  }

  private onPcmtToolsUpdate(data: any) {
    this.pcmtNameOverrides = this.toOverrideMap(data?.nameOverrides);
    this.pcmtPlayercamsInfo = data?.playercamsInfo ?? null;

    // Re-emit the current match signal immediately so a name edit or camera
    // session change updates the live overlay without waiting for Spectra's next
    // match_data packet.
    // Never copy manual scores/rounds into the genuine Spectra state.
    const current = this.lastSpectraMatch ?? this.offlineBaseMatch;
    const next: any = {
      ...current,
      tools: {
        ...current.tools,
        playercamsInfo: { ...(current.tools?.playercamsInfo || { enable: false }) },
        nameOverrides: { ...(current.tools?.nameOverrides || {}) },
      },
    };
    this.applyPcmtToolsToMatch(next);
    if (this.lastSpectraMatch) this.lastSpectraMatch = next as IMatchData;
    else this.offlineBaseMatch = next as IMatchData;
    this.publishEffectiveMatch();
  }

  private applyPcmtToolsToMatch(data: any) {
    if (!data?.tools) return;

    const mergedOverrides = new Map<string, string>(this.spectraNameOverrides);

    // PCMT is authoritative for a Riot ID when a persistent override exists.
    // Remove any differently-cased Spectra key before adding the PCMT value.
    for (const [riotId, displayName] of this.pcmtNameOverrides.entries()) {
      const normalized = this.normalizeRiotId(riotId);
      for (const existingKey of Array.from(mergedOverrides.keys())) {
        if (this.normalizeRiotId(existingKey) === normalized) {
          mergedOverrides.delete(existingKey);
        }
      }
      mergedOverrides.set(riotId, displayName);

      // Existing display components use exact Map.get(fullName). Add the exact
      // casing currently reported by Spectra so persistent matching remains
      // case-insensitive without changing every presentation component.
      for (const team of data?.teams || []) {
        for (const player of team?.players || []) {
          if (
            typeof player?.fullName === "string" &&
            this.normalizeRiotId(player.fullName) === normalized
          ) {
            mergedOverrides.set(player.fullName, displayName);
          }
        }
      }
    }

    data.tools.nameOverrides = {
      ...(data.tools.nameOverrides || {}),
      overrides: mergedOverrides,
    };

    data.tools.playercamsInfo =
      this.pcmtPlayercamsInfo === null
        ? { ...this.spectraPlayercamsInfo }
        : { ...this.spectraPlayercamsInfo, ...this.pcmtPlayercamsInfo };
  }

  private async pollManualHud() {
    const show = this.manualHudShowCode;
    if (!show || !this.config.pcmtProductionEndpoint) return;
    const sequence = ++this.manualHudPollSequence;
    try {
      const endpoint = this.config.pcmtProductionEndpoint.replace(/\/+$/, "");
      const response = await fetch(endpoint + "/api/hud/manual-state?show=" + encodeURIComponent(show), {
        cache: "no-store", mode: "cors",
      });
      if (!response.ok) throw new Error("HUD HTTP " + response.status);
      const state: any = await response.json();
      if (show !== this.manualHudShowCode || sequence < this.manualHudPollSequence) return;
      this.manualHud = state;
      this.publishEffectiveMatch();
    } catch (error) {
      console.warn("PCMT manual HUD state unavailable", error);
    }
  }

  private publishEffectiveMatch() {
    // The observer client remains authoritative for team identity, attack/defense
    // assignments, player telemetry and round phase, even during producer override.
    const original = this.lastSpectraMatch ?? this.offlineBaseMatch;
    const state = this.manualHud;

    // Timeout/tech-pause controls are always available: unlike score and spike
    // overrides, they do not depend on manual HUD mode being enabled. When
    // set to "client", all timeout data comes from the original Spectra feed.
    const timeout = state?.timeoutControl;
    const panelOwnsTimeout = timeout?.source === "panel";
    const mode = panelOwnsTimeout ? timeout.mode : "off";
    const countdown = (mode === "left" || mode === "right") && typeof timeout.endsAt === "number"
      ? Math.max(0, Math.ceil((timeout.endsAt - Date.now()) / 1000)) : 0;
    const activeMode = countdown === 0 && (mode === "left" || mode === "right") ? "off" : mode;
    const base: IMatchData = !panelOwnsTimeout ? original : {
      ...original,
      timeoutState: {
        techPause: activeMode === "tech",
        leftTeam: activeMode === "left",
        rightTeam: activeMode === "right",
        timeRemaining: countdown,
      },
      tools: {
        ...original.tools,
        timeoutDuration: timeout.durationSeconds,
      },
    };
    if (!state?.enabled) {
      this.match.set(base);
      return;
    }

    const round = Number.isInteger(state.round) ? state.round : base.roundNumber;
    const planted = state.spike === "planted" && typeof state.plantedAt === "number" &&
      Date.now() - state.plantedAt < 45000;
    const event = state.winBox && typeof state.winBox.id === "string"
      ? state.winBox : null;
    const leftAttacks = base.teams[0]?.isAttacking ?? false;

    this.match.set({
      ...base,
      roundNumber: round,
      // Scores only; no mutation of client sides, names, agents or player stats.
      teams: base.teams.map((team, index) => ({
        ...team,
        roundsWon: index === 0 ? state.leftScore : index === 1 ? state.rightScore : team.roundsWon,
      })),
      manualHudEnabled: true,
      manualScoreboardVisible: state.scoreboardVisible === true,
      manualWinBoxEvent: event,
      manualSpikePlantedAt: planted ? state.plantedAt : null,
      // Only the spike event itself is producer-driven; the match phase remains live.
      spikeState: {
        planted,
        detonated: state.spike === "detonated" || (state.spike === "planted" && !planted),
        defused: state.spike === "defused",
      },
      // The round winbox takes the winner's *current client-side* assignment.
      attackersWon: event ? (event.winner === "left" ? leftAttacks : !leftAttacks) : base.attackersWon,
    });
  }

  private registerStatsWatch() {
    if (this.statsWatchUnsupported) return;
    if (!this.groupCode() || !this.config.statsEndpoint || !this.config.serverEndpoint) return;

    // Keep compatibility with the hosted Spectra stats service while a deployment
    // is being migrated. It does not expose the PCMT /api/watch endpoint.
    try {
      const hostname = new URL(this.config.statsEndpoint).hostname.toLowerCase();
      if (hostname === "stats.valospectra.com") return;
    } catch {
      // Relative/custom URLs are still allowed and are handled by fetch below.
    }

    const statsEndpoint = this.config.statsEndpoint.replace(/\/+$/, "");
    fetch(`${statsEndpoint}/api/watch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupCode: this.groupCode(),
        spectraEndpoint: this.config.serverEndpoint,
      }),
    })
      .then((response) => {
        // A different/legacy stats implementation can coexist with this frontend.
        // If it definitively does not support watching, do not spam it every minute.
        if (response.status === 404 || response.status === 405) {
          this.statsWatchUnsupported = true;
          return;
        }
        if (!response.ok) {
          console.warn(`PCMT Stats watch registration returned HTTP ${response.status}`);
        }
      })
      .catch((error) => {
        // Do not disable retries for network/temporary service failures.
        console.warn("PCMT Stats watch registration failed; will retry", error);
      });
  }

  public resolveNameOverride(fullRiotId: string, fallback: string): string {
    const value = this.match().tools?.nameOverrides?.overrides;
    if (!(value instanceof Map)) return fallback;

    const exact = value.get(fullRiotId);
    if (typeof exact === "string" && exact.trim().length > 0) return exact;

    const normalized = this.normalizeRiotId(fullRiotId);
    for (const [riotId, displayName] of value.entries()) {
      if (
        this.normalizeRiotId(riotId) === normalized &&
        typeof displayName === "string" &&
        displayName.trim().length > 0
      ) {
        return displayName;
      }
    }

    return fallback;
  }

  private reportRosterToPcmt(data: any) {
    if (!this.config.pcmtToolsEndpoint || this.config.pcmtToolsEndpoint.length === 0) return;

    const teams = (data?.teams || []).map((team: any) => ({
      teamName: team?.teamName || "",
      teamTricode: team?.teamTricode || "",
      players: (team?.players || [])
        .filter((player: any) => typeof player?.fullName === "string" && player.fullName.length > 0)
        .map((player: any) => ({
          riotId: player.fullName,
          fallbackName: player.name || "",
        })),
    }));

    SocketService.getInstance().sendPcmtRoster(this.groupCode(), teams);
  }

  private normalizeRiotId(riotId: string): string {
    return (riotId || "").trim().toLocaleLowerCase();
  }

  private toOverrideMap(value: any): Map<string, string> {
    if (value instanceof Map) {
      return new Map(value);
    }

    if (typeof value === "string") {
      return this.jsonToMap(value);
    }

    if (Array.isArray(value)) {
      try {
        return new Map(value);
      } catch (error) {
        console.error("Failed to convert override array to Map:", error);
        return new Map();
      }
    }

    if (value && typeof value === "object") {
      return new Map(Object.entries(value).map(([key, item]) => [key, String(item)]));
    }

    return new Map();
  }

  private jsonToMap(json: string): Map<string, string> {
    try {
      const obj = JSON.parse(json);
      if (Array.isArray(obj)) {
        return new Map(obj);
      } else {
        throw new Error("Invalid JSON format for Map");
      }
    } catch (error) {
      console.error("Failed to parse JSON to Map:", error);
      return new Map();
    }
  }

  public numberFormatter = computed<Intl.NumberFormat>(() => {
    try {
      return new Intl.NumberFormat([this.language(), "en"], { useGrouping: true });
    } catch (error) {
      console.warn(`Invalid locale "${this.language()}", falling back to "en"`, error);
      return new Intl.NumberFormat("en", { useGrouping: true });
    }
  });

  private onMapbanUpdate(data: any) {
    this.mapban.set(data);
  }

  public groupCode = signal("");
  public sessionId = signal("");
  public language = signal("en");
  public minimalMode = signal(false);
  public hideAuxiliary = signal(false);
  public hideAuxiliaryText = signal(false);

  private _tournamentInfoOverride = signal<ITournamentInfo | null>(null);
  private _sponsorInfoOverride = signal<ISponsorInfo | null>(null);

  public setTournamentInfo(info: ITournamentInfo) {
    this._tournamentInfoOverride.set(info);
  }

  public setSponsorInfo(info: ISponsorInfo) {
    this._sponsorInfoOverride.set(info);
  }

  public match = signal<IMatchData>(initialMatchData, { equal: () => false });
  public teams = computed(() => this.match().teams, { equal: () => false });
  public timeoutState = computed(() => this.match().timeoutState, {
    equal: () => false,
  });
  public timeoutCounter = computed(() => this.match().tools.timeoutCounter, {
    equal: isEqual,
  });
  public timeoutCancellationGracePeriod = computed(
    () => this.match().tools.timeoutCancellationGracePeriod,
  );

  public spikeState = computed(() => this.match().spikeState, {
    equal: isEqual,
  });
  public seriesInfo = computed(() => this.match().tools.seriesInfo);
  public seedingInfo = computed(() => this.match().tools.seedingInfo);
  public sponsorInfo = computed(
    () => this._sponsorInfoOverride() ?? this.match().tools.sponsorInfo,
  );
  public watermarkInfo = computed(() => this.match().tools.watermarkInfo);
  public tournamentInfo = computed(
    () => this._tournamentInfoOverride() ?? this.match().tools.tournamentInfo,
  );
  public toastInfo = computed(() => this.match().toastInfo, { equal: () => false });
  public playercamsInfo = computed(() => this.match().tools.playercamsInfo, {
    equal: () => false,
  });
  public readonly roundWinBox = computed(() => {
    const box = this.match().tools.roundWinBox;
    // The producer can trigger the normal winbox animation even when Spectra's
    // own round-win box is disabled. Keep configured sponsor graphics otherwise.
    return this.match().manualHudEnabled && this.match().manualWinBoxEvent &&
      box.type === "disabled"
      ? { ...box, type: "tournamentInfo" as const } : box;
  });

  public mapban = signal<IMapbanSessionData>(initialMapbanData, { equal: () => false });
}

//setting up with empty match state so certain ui parts dont complain
export const initialMatchData: IMatchData = {
  groupCode: "A",
  isRanked: false,
  isRunning: true,
  roundNumber: 0,
  roundPhase: "LOBBY",
  agentSelectStartTime: 0,
  teams: [
    {
      teamName: "",
      teamUrl: "",
      teamTricode: "",
      spentThisRound: 0,
      isAttacking: false,
      roundsWon: 0,
      players: [],
    },
    {
      teamName: "",
      teamUrl: "",
      teamTricode: "",
      spentThisRound: 0,
      isAttacking: false,
      roundsWon: 0,
      players: [],
    },
  ],
  spikeState: { planted: false, defused: false, detonated: false },
  map: "Ascent",
  tools: {
    seriesInfo: {
      needed: 1,
      wonLeft: 0,
      wonRight: 0,
      mapInfo: [],
    },
    seedingInfo: {
      left: "",
      right: "",
    },
    tournamentInfo: {
      name: "",
      logoUrl: "",
      backdropUrl: "",
    },
    timeoutDuration: 60,
    timeoutCancellationGracePeriod: 10,
    timeoutCounter: {
      max: 2,
      left: 2,
      right: 2,
    },
    sponsorInfo: {
      enabled: false,
      duration: 5000,
      sponsors: [],
    },
    // Disabling the watermark/setting a custom text without Spectra Plus is against the License terms and strictly forbidden
    watermarkInfo: {
      spectraWatermark: true,
      customTextEnabled: false,
      customText: "",
    },
    playercamsInfo: { enable: false },
    nameOverrides: { overrides: [] },
    roundWinBox: {
      type: "disabled",
      sponsors: [],
    },
    agentSelectActive: false,
  },
  toastInfo: {
    active: false,
    duration: 10000,
    title: "",
    message: "",
    eventLogoEnabled: true,
    selectedTeam: "none",
  },
  timeoutState: {
    techPause: false,
    leftTeam: false,
    rightTeam: false,
    timeRemaining: 0,
  },
  showAliveKDA: false,
  switchRound: 12,
  firstOtRound: 25,
  attackersWon: false,
};

const initialMapbanData: IMapbanSessionData = {
  sessionIdentifier: "",
  organizationName: "",
  isSupporter: false,
  teams: [],
  format: undefined,
  availableMaps: [],
  selectedMaps: [],
  stage: "ban",
  actingTeamCode: "",
  actingTeam: 0,
};
