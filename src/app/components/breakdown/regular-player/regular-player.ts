import { Component, inject, Input, OnInit } from "@angular/core";
import { AgentNameService } from "../../../services/agentName.service";
import { AgentRoleService } from "../../../services/agentRole.service";
import { DataModelService } from "../../../services/dataModel.service";
import { StatsApiMatchPlayer } from "../StatsApiMapping";

@Component({
  selector: "app-regular-player",
  imports: [],
  templateUrl: "./regular-player.html",
  styleUrl: "./regular-player.css",
})
export class RegularPlayer implements OnInit {
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
