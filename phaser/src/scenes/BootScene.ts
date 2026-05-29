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
      controller.state = state;
      if (!controller.isMultiplayer) {
        // Single-player: derive clientState from the player empire
        const player = getPlayerEmpire(state);
        controller.playerName = player?.empireName ?? 'Player Empire';
        controller.clientState = {
          empireId: player?.id ?? 0,
          selectedSystemId: state.selectedSystemId,
          selectedPlanetId: state.selectedPlanetId,
          selectedFleetId: state.selectedFleetId,
        };
      }
      // Multiplayer: clientState is already set by onJoined with the correct empireId
      controller.overlay.render();
      this.scene.start('GalaxyScene');
    };

    controller.overlay.showStartScreen();
  }
}
