import {
  Component,
  ElementRef,
  effect,
  inject,
  InjectionToken,
  input,
  OnDestroy,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { SafeResourceUrl } from "@angular/platform-browser";

export const LISTEN_IN_MOCK = new InjectionToken<boolean>("Listen-in mock feeds", {
  providedIn: "root",
  factory: () => false,
});

@Component({
  selector: "app-listen-in-iframe",
  templateUrl: "./listen-in-iframe.component.html",
  styleUrl: "./listen-in-iframe.component.css",
  host: { class: "contents", "(window:message)": "onMessage($event)" },
})
export class ListenInIframeComponent implements OnDestroy {
  readonly src = input<SafeResourceUrl>();
  readonly audible = input(false);
  readonly connectedChange = output<boolean>();
  readonly loudness = output<number>();
  readonly connected = signal(false);
  private readonly mock = inject(LISTEN_IN_MOCK);
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>("frame");
  constructor() {
    effect(() => {
      this.src();
      this.connected.set(false);
    });
    effect(() => this.connectedChange.emit(this.connected()));
    effect(() => {
      this.audible();
      this.connected();
      this.syncAudio();
    });
  }
  syncAudio(): void {
    this.frame()?.nativeElement.contentWindow?.postMessage(
      { mute: !(this.audible() && this.connected()) },
      this.mock ? "*" : "https://vdo.ninja",
    );
  }
  onMessage(event: MessageEvent): void {
    if (event.source !== this.frame()?.nativeElement.contentWindow) return;
    if (event.origin !== (this.mock ? "null" : "https://vdo.ninja")) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.action === "view-connection") {
      this.connected.set(data.value === true);
      this.syncAudio();
    } else if (data.action === "loudness" && data.loudness && typeof data.loudness === "object") {
      const values = Object.values(data.loudness).filter(
        (value): value is number => typeof value === "number" && Number.isFinite(value),
      );
      this.loudness.emit(Math.max(0, ...values));
    }
  }
  ngOnDestroy(): void {
    const frame = this.frame()?.nativeElement;
    frame?.contentWindow?.postMessage({ mute: true }, this.mock ? "*" : "https://vdo.ninja");
    // Navigation also stops audio if the remote API is unresponsive.
    if (frame) frame.src = "about:blank";
  }
}
