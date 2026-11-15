import { Component, computed, effect, inject, input, OnDestroy, signal, untracked } from "@angular/core";
import { DataModelService } from "../../services/dataModel.service";
import { PlayercamStreamService } from "../../services/playercamStream.service";
import { IPlayercamsListenIn } from "../../services/Types";
import { ListenInIframeComponent } from "../../components/listen-in-iframe/listen-in-iframe.component";
import { ListenInPresentationService } from "../../services/listenInPresentation.service";

@Component({
  selector: "app-listen-in-overlay",
  imports: [ListenInIframeComponent],
  templateUrl: "./listen-in-overlay.component.html",
  styleUrl: "./listen-in-overlay.component.css",
  host: {
    "(document:visibilitychange)": "onVisibilityChange()",
    "(window:obsSourceVisibleChanged)": "onObsVisibility($event)",
  },
})
export class ListenInOverlayComponent implements OnDestroy {
  readonly dataModel = inject(DataModelService);
  private readonly streams = inject(PlayercamStreamService);
  private readonly presentation = inject(ListenInPresentationService);
  readonly reusePlayercams = input(false);
  private readonly pageVisible = signal(!document.hidden);
  private readonly obsVisible = signal(true);
  private readonly requestedSide = computed<IPlayercamsListenIn>(() => {
    if (!this.pageVisible() || !this.obsVisible()) return false;
    // Query parameters must never override production Off / team selection.
    const side = this.dataModel.playercamsInfo().listenIn;
    return side === "left" || side === "right" ? side : false;
  });
  readonly renderedSide = signal<IPlayercamsListenIn>(false);
  readonly exiting = signal(false);
  readonly revealed = signal(false);
  readonly audioEnabled = signal(false);
  readonly generation = signal(0);
  readonly connectedPlayers = signal<ReadonlySet<string>>(new Set());
  readonly speaking = this.presentation.speaking;
  private readonly speakingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private revealTimer?: ReturnType<typeof setTimeout>;
  private exitTimer?: ReturnType<typeof setTimeout>;
  private readonly renderedTeam = computed(() => {
    const side = this.renderedSide();
    return side ? this.dataModel.teams()[side === "left" ? 0 : 1] : undefined;
  });
  readonly teamUrl = computed(() => this.renderedTeam()?.teamUrl || "");
  readonly teamColor = computed(() =>
    this.renderedTeam()?.isAttacking ? "var(--attacker-color)" : "var(--defender-color)",
  );
  readonly listenInPlayers = computed(() => (this.renderedTeam()?.players ?? []).slice(0, 5));
  // Only identity changes recreate feeds; 100ms match updates must not reconnect them.
  private readonly selectionKey = computed(() => {
    const side = this.requestedSide();
    const info = this.dataModel.playercamsInfo();
    const team = side ? this.dataModel.teams()[side === "left" ? 0 : 1] : undefined;
    return JSON.stringify([
      side,
      info.identifier,
      Object.entries(info.streamMappings || {}).sort(),
      team?.players.slice(0, 5).map((p) => p.fullName),
    ]);
  });

  constructor() {
    // Microphone mappings arrive through regular PCMT state only for the
    // producer-selected team. No separate listen-in token or socket is needed.
    effect(() => {
      this.selectionKey();
      untracked(() => {
        clearTimeout(this.revealTimer);
        clearTimeout(this.exitTimer);
        this.audioEnabled.set(false);
        this.clearSpeaking();
        const side = this.requestedSide();
        this.presentation.reuseSide.set(this.reusePlayercams() ? side : false);
        if (!side) {
          if (!this.renderedSide()) return;
          this.exiting.set(true);
          // Keep the decorative shell for exit, but destroy audio feeds immediately.
          this.exitTimer = setTimeout(() => this.finishExit(), 400);
          return;
        }
        this.exiting.set(false);
        this.revealed.set(false);
        this.connectedPlayers.set(new Set());
        this.generation.update((value) => value + 1);
        this.renderedSide.set(side);
        // Primary HUD video is already mounted; do not wait for new video
        // connections. Standalone Listen-In retains its connection fallback.
        if (this.reusePlayercams()) this.revealed.set(true);
        else this.revealTimer = setTimeout(() => this.revealed.set(true), 2500);
      });
    });
    effect(() => {
      const players = this.listenInPlayers();
      const connected = this.connectedPlayers();
      if (!this.reusePlayercams() && players.length && players.every((player) => connected.has(player.fullName))) {
        this.revealed.set(true);
        clearTimeout(this.revealTimer);
      }
    });
  }

  onVisibilityChange(): void {
    this.pageVisible.set(!document.hidden);
  }
  onObsVisibility(event: CustomEvent<{ visible: boolean }>): void {
    this.obsVisible.set(event.detail?.visible !== false);
  }
  onAnimationEnd(event: AnimationEvent): void {
    if (event.target !== event.currentTarget) return;
    if (event.animationName.endsWith("exit")) this.finishExit();
    if (event.animationName.endsWith("enter") && !this.exiting() && this.requestedSide())
      this.audioEnabled.set(true);
  }
  private finishExit(): void {
    if (!this.exiting()) return;
    this.renderedSide.set(false);
    this.exiting.set(false);
    this.revealed.set(false);
  }
  onConnectedChange(player: string, connected: boolean): void {
    this.connectedPlayers.update((current) => {
      const next = new Set(current);
      if (connected) next.add(player);
      else next.delete(player);
      return next;
    });
    if (!connected) this.stopSpeaking(player);
  }
  onLoudness(player: string, loudness: number): void {
    if (!this.audioEnabled() || (!this.reusePlayercams() && !this.connectedPlayers().has(player)) || loudness <= 10) return;
    clearTimeout(this.speakingTimers.get(player));
    this.speaking.update((current) => new Set(current).add(player));
    this.speakingTimers.set(
      player,
      setTimeout(() => this.stopSpeaking(player), 400),
    );
  }
  private stopSpeaking(player: string): void {
    clearTimeout(this.speakingTimers.get(player));
    this.speakingTimers.delete(player);
    this.speaking.update((current) => {
      const next = new Set(current);
      next.delete(player);
      return next;
    });
  }
  private clearSpeaking(): void {
    this.speakingTimers.forEach(clearTimeout);
    this.speakingTimers.clear();
    this.speaking.set(new Set());
  }
  getStream(player: string) {
    // Camera viewer is intentionally video-only. The microphone is a separate
    // authorized feed and must never be mixed into normal playercam viewers.
    return this.streams.getStream(player, false);
  }
  getAudioStream(player: string) {
    return this.streams.getListenInAudioStream(player);
  }
  getDisplayName(player: string, fallback: string): string {
    return this.dataModel.resolveNameOverride(player, fallback);
  }
  ngOnDestroy(): void {
    clearTimeout(this.revealTimer);
    clearTimeout(this.exitTimer);
    this.clearSpeaking();
    if (this.reusePlayercams()) this.presentation.hide();
  }
}
