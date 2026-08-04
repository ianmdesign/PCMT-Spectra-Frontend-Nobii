import { Component, computed, inject, OnInit } from "@angular/core";
import { SafeResourceUrl } from "@angular/platform-browser";
import { DataModelService } from "../../../services/dataModel.service";
import { PlayerCombatCardComponent } from "../player-combat-card/player-combat-card.component";
import { DisplayNameService } from "../../../services/displayName.service";
import { PlayercamStreamService } from "../../../services/playercamStream.service";
import { OneVersusOneService } from "../../../services/1v1.service";

@Component({
  selector: "app-1v1",
  imports: [PlayerCombatCardComponent],
  templateUrl: "./1v1.component.html",
  styleUrls: ["./1v1.component.css"],
})
export class OneVersusOneComponent implements OnInit {
  dataModel = inject(DataModelService);
  getDisplayName = inject(DisplayNameService).getDisplayName;
  readonly streamService = inject(PlayercamStreamService);
  readonly oneVsOneService = inject(OneVersusOneService);

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
    return team.players.filter((p: any) => !p.isAlive && p.fullName !== oneVsOnePlayer?.fullName);
  });

  rightTeamDeadPlayers = computed(() => {
    const team = this.rightTeam();
    if (!team) return [];
    const oneVsOnePlayer = this.rightPlayer();
    return team.players.filter((p: any) => !p.isAlive && p.fullName !== oneVsOnePlayer?.fullName);
  });

  // Check if playercams should be shown for both players in the 1v1
  shouldShowPlayercams = computed(() => {
  const identifier =
    this.dataModel.playercamsInfo().identifier;

  return (
    !!identifier &&
    !!this.leftPlayer() &&
    !!this.rightPlayer()
  );
});

  ngOnInit() {
    // Initialize streams for all players via shared service
    this.streamService.initializeFromTeams();
  }

  getStream(playerFullName: string): SafeResourceUrl | undefined {
    return this.streamService.getStream(playerFullName);
  }
}
