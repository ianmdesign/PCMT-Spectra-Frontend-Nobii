import { Component, inject, Input, OnInit } from "@angular/core";
import { StatsApiMatchPlayer } from "../StatsApiMapping";
import { AgentNameService } from "../../../services/agentName.service";
import { AgentRoleService } from "../../../services/agentRole.service";
import { TranslatePipe } from "@ngx-translate/core";
import { TranslateKeys } from "../../../services/i18nHelper";
import { DataModelService } from "../../../services/dataModel.service";

@Component({
  selector: "app-mvp-player",
  imports: [TranslatePipe],
  templateUrl: "./mvp-player.html",
  styleUrl: "./mvp-player.css",
})
export class MvpPlayer implements OnInit {
  TranslateKeys = TranslateKeys;
  protected dataModel = inject(DataModelService);

  @Input({ required: true })
  player!: StatsApiMatchPlayer;

  @Input()
  isRight = false;

  agentInternalName = "";

  ngOnInit() {
    this.agentInternalName = AgentNameService.getAgentInternalName(this.player.agent.name ?? "");
  }

  displayName(): string {
    return this.dataModel.resolveNameOverride(
      `${this.player.name}#${this.player.tag}`,
      this.player.name,
    );
  }

  getAgentRole(name: string): string {
    return AgentRoleService.getAgentRole(name);
  }

  round(num: number) {
    return Math.round(num);
  }
}
