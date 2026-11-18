import { Component, computed, inject, effect, signal, OnDestroy } from "@angular/core";
import { DataModelService } from "../../../../services/dataModel.service";

@Component({
  selector: "app-spike-icon",
  imports: [],
  templateUrl: "./spike-planted.component.html",
  styleUrl: "./spike-planted.component.css",
})
export class SpikePlantedComponent implements OnDestroy {
  dataModel = inject(DataModelService);

  readonly show = computed(() => {
    return (
      (this.dataModel.match().manualHudEnabled ||
        this.dataModel.match().roundPhase === "combat") &&
      this.dataModel.spikeState().planted &&
      !this.dataModel.spikeState().detonated &&
      !this.dataModel.spikeState().defused
    );
  });

  // Signals ensure the pulse actually renders on each timer tick, even if
  // Spectra packets are stalled and no other Angular change detection runs.
  readonly pulseState = signal(false);
  blinkTimerRef?: ReturnType<typeof setTimeout>;
  pulseTimerRef?: ReturnType<typeof setTimeout>;
  isBlinking = false;
  private activePlantAt: number | null | undefined = undefined;
  private plantEndAt = 0;

  readonly effectRef = effect(() => {
    const shown = this.show();
    const plantedAt = this.dataModel.match().manualSpikePlantedAt ?? null;
    if (!shown) {
      if (this.isBlinking || this.activePlantAt !== undefined) this.endBlink();
      this.activePlantAt = undefined;
      return;
    }
    // A second Plant press generates a new timestamp while already visible.
    // Restart the 45s cadence instead of incorrectly leaving the old timer.
    if (this.activePlantAt !== plantedAt) {
      this.endBlink();
      this.activePlantAt = plantedAt;
      this.startBlink(plantedAt);
    }
  });

  private startBlink(plantedAt: number | null) {
    const now = Date.now();
    this.plantEndAt = (typeof plantedAt === "number" ? plantedAt : now) + 45000;
    if (this.plantEndAt <= now) return;
    this.isBlinking = true;
    this.pulse();
  }

  private pulse() {
    if (!this.isBlinking) return;
    const remaining = this.plantEndAt - Date.now();
    if (remaining <= 0) {
      this.endBlink();
      return;
    }
    this.pulseState.set(true);
    this.pulseTimerRef = setTimeout(() => this.pulseState.set(false), 200);
    const interval = remaining > 20000 ? 1000 : remaining > 10000 ? 500 : 250;
    this.blinkTimerRef = setTimeout(() => this.pulse(), Math.min(interval, remaining));
  }

  private endBlink() {
    clearTimeout(this.blinkTimerRef);
    clearTimeout(this.pulseTimerRef);
    this.blinkTimerRef = undefined;
    this.pulseTimerRef = undefined;
    this.pulseState.set(false);
    this.isBlinking = false;
  }

  ngOnDestroy() {
    this.endBlink();
  }
}
