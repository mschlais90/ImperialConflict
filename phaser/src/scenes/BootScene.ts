import Phaser from 'phaser';
import { APP_CONTROLLER_KEY, type AppController } from '../app/appController';
import { createNewGame } from '../core/engines/gameManager';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    const controller = this.registry.get(APP_CONTROLLER_KEY) as AppController;

    this.cameras.main.setBackgroundColor('#030610');
    controller.state = createNewGame({ empireName: controller.playerName });
    controller.overlay.render();

    this.scene.start('GalaxyScene');
  }
}
