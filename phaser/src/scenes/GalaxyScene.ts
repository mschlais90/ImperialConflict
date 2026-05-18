import Phaser from 'phaser';
import { getEmpire, getSystemOwner } from '../core/selectors/selectors';
import { APP_CONTROLLER_KEY, type AppController } from '../main';

const GODOT_SCALE = 20;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const NEUTRAL_COLOR = 0x70798a;
const HOME_MARKER_COLOR = 0xffffff;

export class GalaxyScene extends Phaser.Scene {
  private isPanning = false;
  private panStart = { x: 0, y: 0, scrollX: 0, scrollY: 0 };

  constructor() {
    super('GalaxyScene');
  }

  create(): void {
    const controller = this.getController();
    const state = this.requireState(controller);
    const camera = this.cameras.main;

    camera.setBackgroundColor('#030610');
    camera.setZoom(1);
    camera.centerOn(0, 0);

    this.addGalaxyBackdrop();
    this.drawSystems(controller);
    this.addInstructions();

    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: unknown[], _dx: number, dy: number) => {
      const nextZoom = Phaser.Math.Clamp(camera.zoom - dy * 0.001, MIN_ZOOM, MAX_ZOOM);
      camera.setZoom(nextZoom);
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
        this.isPanning = true;
        this.panStart = {
          x: pointer.x,
          y: pointer.y,
          scrollX: camera.scrollX,
          scrollY: camera.scrollY,
        };
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isPanning || (!pointer.rightButtonDown() && !pointer.middleButtonDown())) {
        return;
      }

      camera.setScroll(
        this.panStart.scrollX + (this.panStart.x - pointer.x) / camera.zoom,
        this.panStart.scrollY + (this.panStart.y - pointer.y) / camera.zoom,
      );
    });

    this.input.on('pointerup', () => {
      this.isPanning = false;
    });

    const bounds = this.calculateGalaxyBounds(state.systems);
    camera.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  private drawSystems(controller: AppController): void {
    const state = this.requireState(controller);

    for (const system of state.systems) {
      const x = system.position.x * GODOT_SCALE;
      const y = system.position.y * GODOT_SCALE;
      const ownerId = getSystemOwner(state, system.id);
      const owner = ownerId >= 0 ? getEmpire(state, ownerId) : undefined;
      const color = owner ? this.toColorNumber(owner.color) : NEUTRAL_COLOR;
      const isHomeSystem = state.empires.some((empire) => empire.homeSystemId === system.id);

      const marker = this.add.graphics({ x, y });
      marker.fillStyle(color, 1);
      marker.fillCircle(0, 0, 9);
      marker.lineStyle(2, 0x101724, 1);
      marker.strokeCircle(0, 0, 9);

      if (isHomeSystem) {
        marker.fillStyle(HOME_MARKER_COLOR, 1);
        marker.fillCircle(0, -14, 3);
      }

      marker.setInteractive(new Phaser.Geom.Circle(0, 0, 14), Phaser.Geom.Circle.Contains);
      marker.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (pointer.leftButtonReleased() && pointer.getDistance() < 8) {
          state.selectedSystemId = system.id;
          state.selectedPlanetId = null;
          controller.overlay.render();
          this.scene.start('SystemScene');
        }
      });

      this.add
        .text(x + 12, y - 6, system.systemName, {
          color: '#dbe6ff',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '12px',
        })
        .setResolution(2);
    }
  }

  private addGalaxyBackdrop(): void {
    const rings = this.add.graphics();
    rings.lineStyle(1, 0x1e2a44, 0.55);
    for (const radius of [240, 480, 720, 960, 1200]) {
      rings.strokeCircle(0, 0, radius);
    }

    rings.lineStyle(1, 0x263756, 0.45);
    rings.lineBetween(-1250, 0, 1250, 0);
    rings.lineBetween(0, -1250, 0, 1250);
  }

  private addInstructions(): void {
    this.add
      .text(18, 18, 'Galaxy - wheel zoom, right/middle drag pan, click a system', {
        color: '#aebbd4',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '14px',
      })
      .setScrollFactor(0)
      .setResolution(2);
  }

  private calculateGalaxyBounds(systems: Array<{ position: { x: number; y: number } }>): Phaser.Geom.Rectangle {
    const points = systems.map((system) => ({
      x: system.position.x * GODOT_SCALE,
      y: system.position.y * GODOT_SCALE,
    }));
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs) - 360;
    const maxX = Math.max(...xs) + 360;
    const minY = Math.min(...ys) - 260;
    const maxY = Math.max(...ys) + 260;

    return new Phaser.Geom.Rectangle(minX, minY, maxX - minX, maxY - minY);
  }

  private getController(): AppController {
    return this.registry.get(APP_CONTROLLER_KEY) as AppController;
  }

  private requireState(controller: AppController) {
    if (!controller.state) {
      throw new Error('Game state has not been initialized.');
    }

    return controller.state;
  }

  private toColorNumber(color: string): number {
    return Number.parseInt(color.replace('#', ''), 16);
  }
}
