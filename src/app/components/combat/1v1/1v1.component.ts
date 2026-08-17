import { Component, computed, inject } from "@angular/core";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { DataModelService } from "../../../services/dataModel.service";
import { PlayerCombatCardComponent } from "../player-combat-card/player-combat-card.component";
import { DisplayNameService } from "../../../services/displayName.service";
import { OneVersusOneService } from "../../../services/1v1.service";

@Component({
  selector: "app-1v1",
  imports: [PlayerCombatCardComponent],
  templateUrl: "./1v1.component.html",
  styleUrls: ["./1v1.component.css"],
})
export class OneVersusOneComponent {
  dataModel = inject(DataModelService);
  getDisplayName = inject(DisplayNameService).getDisplayName;
  readonly oneVsOneService = inject(OneVersusOneService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly blankPlayercamUrl =
    this.sanitizer.bypassSecurityTrustResourceUrl("about:blank");

  isOneVersusOne = computed(() => this.oneVsOneService.isOneVersusOne());
  leftPlayer = computed(() => this.oneVsOneService.leftPlayer());
  rightPlayer = computed(() => this.oneVsOneService.rightPlayer());

  leftPlayerAnimationClass = computed(() => {
    const index = this.oneVsOneService.leftPlayerIndex();
    if (index === 0) {
      return "animate-1v1-stay";
    }
    return `animate-1v1-from-slot-${index}`;
  });

  rightPlayerAnimationClass = computed(() => {
    const index = this.oneVsOneService.rightPlayerIndex();
    if (index === 0) {
      return "animate-1v1-stay";
    }
    return `animate-1v1-from-slot-${index}`;
  });

  isOneVersusOneActive = computed(
    () =>
      this.isOneVersusOne() &&
      (this.dataModel.match().roundPhase === "combat" ||
        this.dataModel.match().roundPhase === "end"),
  );

  leftTeam = computed(() => this.dataModel.teams()[0]);
  rightTeam = computed(() => this.dataModel.teams()[1]);

  leftTeamDeadPlayers = computed(() => {
    const team = this.leftTeam();
    if (!team) return [];
    const oneVsOnePlayer = this.leftPlayer();
    return team.players.filter(
      (p: any) => !p.isAlive && p.fullName !== oneVsOnePlayer?.fullName,
    );
  });

  rightTeamDeadPlayers = computed(() => {
    const team = this.rightTeam();
    if (!team) return [];
    const oneVsOnePlayer = this.rightPlayer();
    return team.players.filter(
      (p: any) => !p.isAlive && p.fullName !== oneVsOnePlayer?.fullName,
    );
  });

  // The 1v1 shell is still shown when playercams are configured, but it no
  // longer creates its own VDO.Ninja viewers. The live video comes from the
  // persistent PlayercamsComponent iframe pool.
  shouldShowPlayercams = computed(() => {
    const identifier = this.dataModel.playercamsInfo().identifier;

    return !!identifier && !!this.leftPlayer() && !!this.rightPlayer();
  });

  // Keep the existing legacy template iframe pinned to about:blank. The real
  // live feed is the already-mounted iframe from PlayercamsComponent, so the
  // 1v1 shell cannot open a second VDO.Ninja/WebRTC viewer.
  getStream(_playerFullName: string): SafeResourceUrl {
    return this.blankPlayercamUrl;
  }
}
