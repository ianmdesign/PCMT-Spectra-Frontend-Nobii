import { Component, computed, effect, inject, signal } from "@angular/core";
import { DataModelService } from "../../services/dataModel.service";

@Component({
  selector: "app-live-toast",
  imports: [],
  templateUrl: "./toast-component.html",
  styleUrl: "./toast-component.css",
})
export class LiveToastComponent {
  dataModel = inject(DataModelService);

  // Local copy held so the out-animation still renders the previous content
  toastInfo = signal(Object.assign({}, this.dataModel.toastInfo()));

  tournamentIconUrl = computed(() => {
    const logo = this.dataModel.tournamentInfo().logoUrl;
    if (logo && logo !== "") return logo;
    else return "assets/misc/logo.webp";
  });

  hide = true;
  inAnimation = false;
  outAnimation = false;
  cardExpanding = false;
  cardCollapsing = false;

  hideEffect = effect(() => {
    const active =
      this.dataModel.toastInfo().active && this.dataModel.match().roundPhase === "shopping";

    if (!active) {
      this.cardCollapsing = true;
      this.outAnimation = true;
      setTimeout(() => {
        this.outAnimation = false;
        this.cardCollapsing = false;
        this.hide = true;
      }, 667);
    } else {
      this.hide = false;
      this.inAnimation = true;
      this.cardExpanding = true;
      setTimeout(() => {
        this.inAnimation = false;
      }, 283);
      setTimeout(() => {
        this.cardExpanding = false;
      }, 667);
    }
  });

  // Delay data update so the slide-out animation still shows the old content
  delayUpdateEffect = effect(() => {
    if (!this.dataModel.toastInfo().active) {
      setTimeout(() => {
        this.toastInfo.set(Object.assign({}, this.dataModel.toastInfo()));
      }, 700);
    } else {
      this.toastInfo.set(Object.assign({}, this.dataModel.toastInfo()));
    }
  });
}
