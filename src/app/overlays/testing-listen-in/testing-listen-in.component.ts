import { Component, computed, inject, Injectable, signal } from "@angular/core";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { PlayercamStreamService } from "../../services/playercamStream.service";
import { ListenInOverlayComponent } from "../listen-in-overlay/listen-in-overlay.component";
import { IPlayercamsListenIn, IPlayerData } from "../../services/Types";
import { DataModelService, initialMatchData } from "../../services/dataModel.service";
import { LISTEN_IN_MOCK } from "../../components/listen-in-iframe/listen-in-iframe.component";

// Local providers ensure even a supplied groupCode cannot connect this test to a match.
@Injectable()
class MockDataModel {
  readonly match = signal({
    ...initialMatchData,
    teams: ["Alpha", "Omega"].map((name, teamIndex) => ({
      ...initialMatchData.teams[teamIndex],
      teamName: `Team ${name}`,
      teamUrl: "assets/misc/logo.webp",
      isAttacking: teamIndex === 1,
      players: Array.from(
        { length: 5 },
        (_, index) =>
          ({
            name: `${name}${index + 1}`,
            fullName: `${name}${index + 1}#MOCK`,
            playerId: teamIndex * 5 + index,
          }) as IPlayerData,
      ),
    })),
    tools: {
      ...initialMatchData.tools,
      playercamsInfo: { enable: true, identifier: "MOCK", listenIn: "left" as IPlayercamsListenIn },
    },
  });
  readonly teams = computed(() => this.match().teams);
  readonly playercamsInfo = computed(() => this.match().tools.playercamsInfo);
  resolveNameOverride(_riotId: string, fallback: string): string {
    return fallback;
  }
}

@Injectable()
class MockPlayercamStreams {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly cache = new Map<string, SafeResourceUrl>();
  readonly disconnected = signal(false);
  getStream(player: string): SafeResourceUrl {
    const disconnected = this.disconnected() && player.includes("3#");
    const key = `${player}:${disconnected}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const hue = [...player].reduce((sum, char) => (sum + char.charCodeAt(0) * 7) % 360, 0);
    const name = player.split("#")[0].replace(/[^a-z0-9]/gi, "");
    const html = `<body style="margin:0;background:linear-gradient(135deg,hsl(${hue},60%,30%),#101720);color:white;font-family:sans-serif;display:grid;place-items:center;height:100vh"><div style="font-size:26px">${name}<br><small>SIMULATED FEED</small></div><script>
      setTimeout(() => {
        parent.postMessage({action:'view-connection',value:${!disconnected}}, '*');
        ${disconnected ? "" : `setInterval(() => parent.postMessage({action:'loudness',loudness:{mock:Math.sin(Date.now()/650+${hue})>0.25?35:0}}, '*'),100);`}
      }, 500);
    </script></body>`;
    const url = this.sanitizer.bypassSecurityTrustResourceUrl(
      "data:text/html;charset=utf-8," + encodeURIComponent(html),
    );
    this.cache.set(key, url);
    return url;
  }
}

@Component({
  selector: "app-testing-listen-in",
  imports: [ListenInOverlayComponent],
  templateUrl: "./testing-listen-in.component.html",
  styleUrl: "./testing-listen-in.component.css",
  providers: [
    { provide: DataModelService, useClass: MockDataModel },
    { provide: PlayercamStreamService, useClass: MockPlayercamStreams },
    { provide: LISTEN_IN_MOCK, useValue: true },
  ],
})
export class TestingListenInComponent {
  private readonly dataModel = inject(DataModelService);
  readonly streams = inject(PlayercamStreamService) as unknown as MockPlayercamStreams;
  setListenIn(listenIn: IPlayercamsListenIn): void {
    this.dataModel.match.update((match) => ({
      ...match,
      tools: { ...match.tools, playercamsInfo: { ...match.tools.playercamsInfo, listenIn } },
    }));
  }
  toggleDisconnected(): void {
    this.streams.disconnected.update((value) => !value);
  }
}
