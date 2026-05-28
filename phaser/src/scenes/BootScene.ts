import Phaser from 'phaser';
import { APP_CONTROLLER_KEY, type AppController } from '../app/appController';
import { createNewGame } from '../core/engines/gameManager';
import { getPlayerEmpire } from '../core/selectors/selectors';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    const controller = this.registry.get(APP_CONTROLLER_KEY) as AppController;

    this.cameras.main.setBackgroundColor('#030610');
    controller.startNewGame = (empireName: string) => {
      controller.playerName = empireName;
      const state = createNewGame({ empireName });
      controller.state = state;
      const player = getPlayerEmpire(state);
      controller.clientState = {
        empireId: player!.id,
        selectedSystemId: state.selectedSystemId,
        selectedPlanetId: state.selectedPlanetId,
        selectedFleetId: state.selectedFleetId,
      };
      controller.overlay.render();
      this.scene.start('GalaxyScene');
    };

    controller.loadGame = (state) => {
      const player = getPlayerEmpire(state);
      controller.playerName = player?.empireName ?? 'Player Empire';
      controller.state = state;
      controller.clientState = {
        empireId: player?.id ?? 0,
        selectedSystemId: state.selectedSystemId,
        selectedPlanetId: state.selectedPlanetId,
        selectedFleetId: state.selectedFleetId,
      };
      controller.overlay.render();
      this.scene.start('GalaxyScene');
    };

    controller.overlay.showStartScreen();
  }
}
