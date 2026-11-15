import { Injectable, signal } from "@angular/core";
import { IPlayercamsListenIn } from "./Types";

/**
 * In the main HUD only: the existing playercam iframe pool supplies video to
 * Listen-In. The separate Listen-In component owns the microphone receivers.
 */
@Injectable({ providedIn: "root" })
export class ListenInPresentationService {
  readonly reuseSide = signal<IPlayercamsListenIn>(false);
  readonly speaking = signal<ReadonlySet<string>>(new Set());

  hide(): void {
    this.reuseSide.set(false);
    this.speaking.set(new Set());
  }
}
