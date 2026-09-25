import { Component, inject, OnDestroy, OnInit, signal, effect } from "@angular/core";
import { Config } from "../../shared/config";
import { HttpClient } from "@angular/common/http";
import { ActivatedRoute } from "@angular/router";
import {
  StatsApiBroadcastInfo,
  StatsApiMatch,
  StatsApiMatchPlayer,
  StatsApiMatchResponse,
  StatsApiMatchTeam,
} from "../../components/breakdown/StatsApiMapping";
import { MvpPlayer } from "../../components/breakdown/mvp-player/mvp-player";
import { RegularPlayer } from "../../components/breakdown/regular-player/regular-player";
import { TranslateKeys } from "../../services/i18nHelper";
import { TranslatePipe } from "@ngx-translate/core";
import { Subscription } from "rxjs";
import { DataModelService } from "../../services/dataModel.service";

@Component({
  selector: "app-team-breakdown",
  imports: [MvpPlayer, RegularPlayer, TranslatePipe],
  templateUrl: "./team-breakdown.html",
  styleUrl: "./team-breakdown.css",
})
export class TeamBreakdown implements OnInit, OnDestroy {
  protected dataModel = inject(DataModelService);
  protected config = inject(Config);
  private leftTeamName = "Blue";
  private rightTeamName = "Red";

  protected http = inject(HttpClient);
  protected route = inject(ActivatedRoute);
  TranslateKeys = TranslateKeys;

  protected hideBg = false;

  protected statsData?: StatsApiMatch;
  protected roundsPlayed = 0;

  protected leftTeam?: StatsApiMatchTeam;
  protected rightTeam?: StatsApiMatchTeam;

  protected leftPlayers?: StatsApiMatchPlayer[];
  protected rightPlayers?: StatsApiMatchPlayer[];

  private currentGroupCode = "";
  private displayedMatchId: string | null = null;
  private pollTimerRef?: ReturnType<typeof setInterval>;
  private routeSubscription?: Subscription;
  private statsRequest?: Subscription;

  protected currentSponsorIndex = signal(0);
  private sponsorIntervalId?: number;

  constructor() {
    effect(() => {
      const sponsorInfo = this.dataModel.sponsorInfo();

      if (this.sponsorIntervalId) {
        clearInterval(this.sponsorIntervalId);
        this.sponsorIntervalId = undefined;
      }
      this.currentSponsorIndex.set(0);

      if (sponsorInfo.enabled && sponsorInfo.sponsors.length > 1) {
        const duration =
          sponsorInfo.duration > 100 ? sponsorInfo.duration : sponsorInfo.duration * 1000;
        this.sponsorIntervalId = window.setInterval(() => {
          this.currentSponsorIndex.update(
            (i) => (i + 1) % this.dataModel.sponsorInfo().sponsors.length,
          );
        }, duration);
      }
    });
  }

  ngOnInit() {
    this.routeSubscription = this.route.queryParams.subscribe((params) => {
      this.hideBg = params["hideBg"] === "true" || params["hideBg"] === "1";
      const groupCode = (params["groupCode"] || "").toUpperCase();
      this.currentGroupCode = groupCode;
      this.statsRequest?.unsubscribe();
      this.statsRequest = undefined;
      this.clearStats();
      this.stopPolling();
      if (groupCode) {
        this.fetchStats(groupCode);
        this.startPolling(groupCode);
      }
    });
  }

  ngOnDestroy() {
    this.stopPolling();
    this.statsRequest?.unsubscribe();
    this.routeSubscription?.unsubscribe();
    if (this.sponsorIntervalId) {
      clearInterval(this.sponsorIntervalId);
    }
  }

  private startPolling(groupCode: string) {
    this.pollTimerRef = setInterval(() => this.fetchStats(groupCode), 15000);
  }

  private stopPolling() {
    if (this.pollTimerRef) {
      clearInterval(this.pollTimerRef);
      this.pollTimerRef = undefined;
    }
  }

  private fetchStats(groupCode: string) {
    if (this.statsRequest && !this.statsRequest.closed) return;
    this.statsRequest = this.http
      .get<StatsApiMatchResponse>(`${this.config.statsEndpoint}/getStats`, {
        params: {
          code: groupCode,
          spectraEndpoint: this.config.serverEndpoint,
        },
      })
      .subscribe({
        next: (response: StatsApiMatchResponse) => {
          if (groupCode !== this.currentGroupCode) return;
          if (!response.data?.players?.length || !response.broadcast) {
            this.clearStats();
            return;
          }

          const matchId = response.data.metadata?.match_id;
          if (matchId && matchId === this.displayedMatchId) return;
          this.clearStats();
          this.displayedMatchId = matchId || null;
          this.processStatsDataIncoming(response);
        },
        error: (error) => console.warn("Team stats request failed; will retry", error),
      });
  }

  private clearStats() {
    this.displayedMatchId = null;
    this.statsData = undefined;
    this.leftTeam = undefined;
    this.rightTeam = undefined;
    this.leftPlayers = undefined;
    this.rightPlayers = undefined;
    this.leftTeamName = "Blue";
    this.rightTeamName = "Red";
    this.roundsPlayed = 0;
  }

  processStatsDataIncoming(response: StatsApiMatchResponse) {
    this.statsData = response.data;
    this.roundsPlayed = this.statsData.rounds.length;

    const broadcast = response.broadcast!;
    if (broadcast.tournamentInfo) this.dataModel.setTournamentInfo(broadcast.tournamentInfo);
    if (broadcast.sponsorInfo) this.dataModel.setSponsorInfo(broadcast.sponsorInfo);
    this.processTeamInfo(broadcast);
  }

  processStatsDataFully() {
    this.leftTeam = this.statsData!.teams.find((team) => team.team_id === this.leftTeamName);
    this.rightTeam = this.statsData!.teams.find((team) => team.team_id === this.rightTeamName);

    // Do this here so that when the players get distributed they definitely have the info
    this.calculateFirstKills();

    this.leftPlayers = this.statsData!.players.filter(
      (player) => player.team_id === this.leftTeamName,
    );
    this.rightPlayers = this.statsData!.players.filter(
      (player) => player.team_id === this.rightTeamName,
    );

    this.leftPlayers.forEach((player) => {
      player.stats.acs = Math.round(player.stats.score / (this.roundsPlayed || 1));
    });
    this.rightPlayers.forEach((player) => {
      player.stats.acs = Math.round(player.stats.score / (this.roundsPlayed || 1));
    });

    this.leftPlayers.sort((a, b) => (b.stats.acs || 0) - (a.stats.acs || 0));
    this.rightPlayers.sort((a, b) => (b.stats.acs || 0) - (a.stats.acs || 0));
  }

  calculateFirstKills() {
    const fkById: Record<string, number> = {};
    this.statsData?.players.forEach((player) => {
      fkById[player.puuid] = 0;
    });

    let currentRound = -1;
    for (const kill of this.statsData?.kills || []) {
      if (kill.round !== currentRound) {
        currentRound = kill.round;
        fkById[kill.killer.puuid] = (fkById[kill.killer.puuid] || 0) + 1;
      }
    }

    for (const player of this.statsData?.players || []) {
      player.stats.firstKills = fkById[player.puuid] || 0;
    }
  }

  processTeamInfo(teamInfo: StatsApiBroadcastInfo) {
    const leftWon = teamInfo.higherScore === 0 ? true : false;
    const winningTeam = this.statsData!.teams.find((team) => team.won === true);
    if (leftWon) {
      this.leftTeamName = winningTeam?.team_id || "Red";
      this.rightTeamName = winningTeam?.team_id === "Red" ? "Blue" : "Red";
    } else {
      this.rightTeamName = winningTeam?.team_id || "Red";
      this.leftTeamName = winningTeam?.team_id === "Red" ? "Blue" : "Red";
    }

    this.processStatsDataFully();

    this.leftTeam = {
      ...this.leftTeam!,
      name: teamInfo.leftTeam.name,
      tricode: teamInfo.leftTeam.tricode,
      url: teamInfo.leftTeam.url,
    };
    this.rightTeam = {
      ...this.rightTeam!,
      name: teamInfo.rightTeam.name,
      tricode: teamInfo.rightTeam.tricode,
      url: teamInfo.rightTeam.url,
    };
  }

  numSequence(n: number): number[] {
    return Array(n);
  }
}
