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

  readonly isOneVersusOne = computed(() =>
    this.oneVsOneService.isOneVersusOne(),
  );

  getStream(playerFullName: string): SafeResourceUrl | undefined {
    return this.streamService.getStream(playerFullName);
  }
}