import { Component, computed, inject } from "@angular/core";
import { SafeResourceUrl } from "@angular/platform-browser";
import { DataModelService } from "../../../services/dataModel.service";
import { DisplayNameService } from "../../../services/displayName.service";
import { PlayercamStreamService } from "../../../services/playercamStream.service";
import { OneVersusOneService } from "../../../services/1v1.service";

@Component({
  selector: "app-playercams",
  imports: [],
  templateUrl: "./playercams.component.html",
  styleUrl: "./playercams.component.css",
})
export class PlayercamsComponent {
  readonly dataModel = inject(DataModelService);
  readonly streamService = inject(PlayercamStreamService);
  readonly oneVsOneService = inject(OneVersusOneService);
  readonly getDisplayName = inject(DisplayNameService).getDisplayName;

  // /overlay-freecam reuses this same persistent iframe pool, but suppresses
  // the normal observed-player camera. The two 1v1 survivor feeds are still
  // allowed to become visible below.
  readonly isFreecamOverlay = window.location.pathname
    .replace(/\/+$/, "")
    .endsWith("/overlay-freecam");

  readonly isOneVersusOne = computed(() =>
    this.oneVsOneService.isOneVersusOne(),
  );

  readonly isOneVersusOneActive = computed(
    () =>
      this.isOneVersusOne() &&
      (this.dataModel.match().roundPhase === "combat" ||
        this.dataModel.match().roundPhase === "end"),
  );

  isLeftOneVersusOnePlayer(playerFullName: string): boolean {
    return (
      this.isOneVersusOneActive() &&
      this.oneVsOneService.leftPlayer()?.fullName === playerFullName
    );
  }

  isRightOneVersusOnePlayer(playerFullName: string): boolean {
    return (
      this.isOneVersusOneActive() &&
      this.oneVsOneService.rightPlayer()?.fullName === playerFullName
    );
  }

  getStream(playerFullName: string): SafeResourceUrl | undefined {
    return this.streamService.getStream(playerFullName);
  }
}
