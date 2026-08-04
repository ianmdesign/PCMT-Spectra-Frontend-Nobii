import { effect, inject, Injectable } from "@angular/core";
import {
  DomSanitizer,
  SafeResourceUrl,
} from "@angular/platform-browser";
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
   * Tracks which player-camera session was used to generate the currently
   * cached VDO.Ninja URLs.
   */
  private currentIdentifier = "";

  constructor() {
    effect(() => {
      const teams = this.dataModel.teams();
      const identifier =
        this.dataModel.playercamsInfo().identifier || "";

      /*
       * If Spectra creates a different player-camera session, the old room
       * URLs are no longer valid. Clear them and rebuild every player feed.
       */
      if (identifier !== this.currentIdentifier) {
        this.currentIdentifier = identifier;
        this.streams.clear();
      }

      /*
       * A VDO.Ninja room URL cannot be created until Spectra supplies a valid
       * session identifier.
       */
      if (!identifier) {
        return;
      }

      /*
       * Create a VDO.Ninja viewer for every player on both teams.
       *
       * This intentionally does not inspect:
       *
       * - playercamsInfo.enable
       * - playercamsInfo.enabledPlayers
       */
      for (const team of teams) {
        for (const player of team.players) {
          if (this.streams.has(player.fullName)) {
            continue;
          }

          const parsedRiotId = this.parseRiotId(player.fullName);

          if (!parsedRiotId) {
            console.warn(
              `Cannot create player-camera URL for invalid Riot ID: ${player.fullName}`,
            );
            continue;
          }

          this.streams.set(
            player.fullName,
            this.createStreamUrl(
              identifier,
              parsedRiotId.name,
              parsedRiotId.tagline,
            ),
          );
        }
      }
    });
  }

  getStream(playerFullName: string): SafeResourceUrl | undefined {
    return this.streams.get(playerFullName);
  }

  hasStream(playerFullName: string): boolean {
    return this.streams.has(playerFullName);
  }

  initializeFromEnabledPlayers(_enabledPlayers: string[]): void {
  /*
   * Compatibility method for older player-camera components.
   *
   * The updated service automatically creates streams for every player through
   * its Angular effect, so no explicit initialization is required anymore.
   */
  }
  
  initializeFromTeams(): void {
  /*
   * Compatibility method for the 1v1 component.
   *
   * The updated service already watches team data and automatically creates
   * streams for every player, so no manual initialization is required.
   */
}

  /*
   * Split the Riot ID at the final # character.
   *
   * A normal Riot ID resembles:
   *
   * Player Name#TAG
   */
  private parseRiotId(
    playerFullName: string,
  ): { name: string; tagline: string } | undefined {
    const separatorIndex = playerFullName.lastIndexOf("#");

    if (
      separatorIndex <= 0 ||
      separatorIndex === playerFullName.length - 1
    ) {
      return undefined;
    }

    return {
      name: playerFullName.substring(0, separatorIndex),
      tagline: playerFullName.substring(separatorIndex + 1),
    };
  }

  private createStreamUrl(
    identifier: string,
    name: string,
    tagline: string,
  ): SafeResourceUrl {
    /*
     * Spectra's player-camera publishing IDs replace spaces in the player's
     * Riot name with underscores and use "_H_" between the name and tagline.
     *
     * Example:
     *
     * Player Name#NA1
     *
     * becomes:
     *
     * Player_Name_H_NA1
     */
    const streamName =
      `${name.replaceAll(" ", "_")}_H_${tagline}`;

    const url =
      `https://vdo.ninja/` +
      `?room=${encodeURIComponent(identifier)}` +
      `&view=${encodeURIComponent(streamName)}` +
      `&scene=0` +
      `&cleanoutput` +
      `&vb=2500` +
      `&transparent` +
      `&disablehotkeys` +
      `&noaudio` +
      `&codec=h265,av1,h264,vp8`;

    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }
}