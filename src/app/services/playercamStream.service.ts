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
  private readonly authorizedAudioMappings = new Map<string, string>();
  private readonly authorizedAudioStreams = new Map<string, SafeResourceUrl>();
  private currentAudioMappingSignature = "";
  private readonly revision = signal(0);
  private readonly streamKeys = new Map<string, string>();
  private currentIdentifier = "";

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
      /*
       * A session change invalidates all existing VDO.Ninja URLs. A Riot ID
       * correction does not: the actual publisher still uses its original
       * stream ID. Leave unaffected viewers mounted during corrections.
       */
      if (identifier !== this.currentIdentifier) {
        this.currentIdentifier = identifier;
        this.streams.clear();
        this.audioStreams.clear();
        this.streamKeys.clear();
        this.authorizedAudioMappings.clear();
        this.authorizedAudioStreams.clear();
        this.currentAudioMappingSignature = "";
      }

      // The selected-team audio mappings are now part of ordinary PCMT tools
      // state. Changes only rebuild mic viewers when identities actually change.
      this.setListenInAudioMappings(playercamsInfo.audioStreamMappings || {});

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
          const mappedStreamId = normalizedStreamMappings.get(
            this.normalizeRiotId(player.fullName),
          );
          const streamId = mappedStreamId || this.streamIdFromRiotId(player.fullName);

          if (!streamId) {
            console.warn(`Cannot create player-camera URL for invalid Riot ID: ${player.fullName}`);
            continue;
          }

          const streamKey = identifier + ":" + streamId;
          if (this.streams.has(player.fullName) && this.streamKeys.get(player.fullName) === streamKey) {
            continue;
          }

          this.streamKeys.set(player.fullName, streamKey);
          this.audioStreams.set(player.fullName, this.createStreamUrl(identifier, streamId, true));
          this.streams.set(player.fullName, this.createStreamUrl(identifier, streamId));
        }
      }
      // Remove feeds for players who are no longer in the Spectra roster.
      const rosterNames = new Set(teams.flatMap((team) => team.players.map((p) => p.fullName)));
      for (const name of this.streamKeys.keys()) {
        if (!rosterNames.has(name)) {
          this.streamKeys.delete(name);
          this.audioStreams.delete(name);
          this.streams.delete(name);
        }
      }
      this.revision.update((value) => value + 1);
    });
  }

  getStream(playerFullName: string, audio = false): SafeResourceUrl | undefined {
    this.revision();
    return (audio ? this.audioStreams : this.streams).get(playerFullName);
  }

  /**
   * Audio is exposed to this HUD via PCMT selected-team mappings. Only
   * explicitly opted-in players on the selected team should be present.
   */
  setListenInAudioMappings(raw: Record<string, string>): void {
    const valid = Object.entries(raw || {})
      .filter(([, id]) => typeof id === "string" && /^pcmtmic_[a-f0-9]{40}$/.test(id))
      .map(([riotId, id]) => [this.normalizeRiotId(riotId), id] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    const signature = JSON.stringify(valid);
    if (signature === this.currentAudioMappingSignature) return;
    this.currentAudioMappingSignature = signature;
    this.authorizedAudioMappings.clear();
    // Cache is keyed by the actual room and microphone stream ID, not by the
    // editable Riot ID. Preserve active SafeResourceUrl identities so a
    // correction doesn't reconnect unrelated Listen-In receivers.
    for (const [riotId, id] of Object.entries(raw || {})) {
      if (typeof id === "string" && /^pcmtmic_[a-f0-9]{40}$/.test(id)) {
        this.authorizedAudioMappings.set(this.normalizeRiotId(riotId), id);
      }
    }
    this.revision.update((v) => v + 1);
  }

  getListenInAudioStream(playerFullName: string): SafeResourceUrl | undefined {
    this.revision();
    const info = this.dataModel.playercamsInfo();
    const identifier = info.identifier;
    const room = info.listenInRoom || (identifier ? identifier + "_li" : "");
    const streamId = this.authorizedAudioMappings.get(this.normalizeRiotId(playerFullName));
    if (!room || !streamId) return undefined;
    const key = room + ":" + streamId;
    let url = this.authorizedAudioStreams.get(key);
    if (!url) {
      url = this.sanitizer.bypassSecurityTrustResourceUrl(
        "https://vdo.ninja/?" +
        "room=" + encodeURIComponent(room) +
        "&view=" + encodeURIComponent(streamId) +
        "&solo&cleanoutput&getloudness&mutespeaker&disablehotkeys"
      );
      this.authorizedAudioStreams.set(key, url);
    }
    return url;
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
