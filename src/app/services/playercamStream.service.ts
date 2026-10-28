import { effect, inject, Injectable, signal } from "@angular/core";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { DataModelService } from "./dataModel.service";

@Injectable({
  providedIn: "root",
})
export class PlayercamStreamService {
  private readonly dataModel = inject(DataModelService);
  private readonly sanitizer = inject(DomSanitizer);

  /*
   * Camera URLs are stored by the player's complete Riot ID.
   */
  private readonly streams = new Map<string, SafeResourceUrl>();

  /*
   * Tracks which player-camera session and stream mapping were used to
   * generate the currently cached VDO.Ninja URLs.
   */
  private readonly audioStreams = new Map<string, SafeResourceUrl>();
  private readonly revision = signal(0);
  private currentIdentifier = "";
  private currentStreamMappingSignature = "";

  constructor() {
    effect(() => {
      const teams = this.dataModel.teams();
      const playercamsInfo = this.dataModel.playercamsInfo();
      const identifier = playercamsInfo.identifier || "";
      const streamMappings: Record<string, string> = playercamsInfo.streamMappings || {};
      const normalizedStreamMappings = new Map<string, string>(
        Object.entries(streamMappings).map(([riotId, streamId]) => [
          this.normalizeRiotId(riotId),
          streamId,
        ]),
      );
      const streamMappingSignature = JSON.stringify(
        Array.from(normalizedStreamMappings.entries()).sort(([a], [b]) => a.localeCompare(b)),
      );

      /*
       * If Spectra creates a different player-camera session, or PCMT changes
       * a session-only Riot ID correction, the old room/stream URLs may no
       * longer be valid. Clear them and rebuild the player feed URLs.
       */
      if (
        identifier !== this.currentIdentifier ||
        streamMappingSignature !== this.currentStreamMappingSignature
      ) {
        this.currentIdentifier = identifier;
        this.currentStreamMappingSignature = streamMappingSignature;
        this.streams.clear();
        this.audioStreams.clear();
      }

      /*
       * A VDO.Ninja room URL cannot be created until Spectra supplies a valid
       * session identifier.
       */
      if (!identifier) {
        this.revision.update((value) => value + 1);
        return;
      }

      /*
       * Create a VDO.Ninja viewer for every player on both teams.
       *
       * This intentionally does not inspect:
       *
       * - playercamsInfo.enable
       * - playercamsInfo.enabledPlayers
       *
       * PCMT can optionally provide an effective Riot ID -> stream ID mapping.
       * This is what lets a producer correct a mistyped Riot ID without
       * changing the player's already-live VDO.Ninja publisher stream.
       */
      for (const team of teams) {
        for (const player of team.players) {
          if (this.streams.has(player.fullName)) {
            continue;
          }

          const mappedStreamId = normalizedStreamMappings.get(
            this.normalizeRiotId(player.fullName),
          );
          const streamId = mappedStreamId || this.streamIdFromRiotId(player.fullName);

          if (!streamId) {
            console.warn(`Cannot create player-camera URL for invalid Riot ID: ${player.fullName}`);
            continue;
          }

          this.audioStreams.set(player.fullName, this.createStreamUrl(identifier, streamId, true));
          this.streams.set(player.fullName, this.createStreamUrl(identifier, streamId));
        }
      }
      this.revision.update((value) => value + 1);
    });
  }

  getStream(playerFullName: string, audio = false): SafeResourceUrl | undefined {
    this.revision();
    return (audio ? this.audioStreams : this.streams).get(playerFullName);
  }

  hasStream(playerFullName: string): boolean {
    return this.streams.has(playerFullName);
  }

  initializeFromEnabledPlayers(_enabledPlayers: string[]): void {
    // Compatibility method for older player-camera components.
    // Reading the value avoids an unused-parameter lint failure while preserving
    // the previous public method signature.
    void _enabledPlayers;
  }

  initializeFromTeams(): void {
    // Compatibility method for the 1v1 component. The service already watches
    // team data automatically through its Angular effect.
  }

  private normalizeRiotId(riotId: string): string {
    return (riotId || "").trim().toLocaleLowerCase();
  }

  private streamIdFromRiotId(playerFullName: string): string | undefined {
    const separatorIndex = playerFullName.lastIndexOf("#");

    if (separatorIndex <= 0 || separatorIndex === playerFullName.length - 1) {
      return undefined;
    }

    const name = playerFullName.substring(0, separatorIndex);
    const tagline = playerFullName.substring(separatorIndex + 1);
    return `${name.replaceAll(" ", "_")}_H_${tagline}`;
  }

  private createStreamUrl(identifier: string, streamId: string, audio = false): SafeResourceUrl {
    const url =
      `https://vdo.ninja/` +
      `?room=${encodeURIComponent(identifier)}` +
      `&view=${encodeURIComponent(streamId)}` +
      `&scene=0` +
      `&cleanoutput` +
      `&vb=2500` +
      `&transparent` +
      `&disablehotkeys` +
      (audio ? `&getloudness&mutespeaker` : `&noaudio`) +
      `&codec=h265,av1,h264,vp8`;

    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }
}
