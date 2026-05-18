import Phaser from 'phaser';
import { APP_CONTROLLER_KEY, type AppController } from '../app/appController';
import { getEmpire, getPlanetsInSystem, getSystem } from '../core/selectors/selectors';
import type { GameState } from '../core/galaxy/galaxyData';
import type { Planet } from '../core/models/types';

const NEUTRAL_RING = 0x7d8796;

interface SystemGridLayout {
  cellHeight: number;
  cellWidth: number;
  columns: number;
  fontSize: number;
  labelWidth: number;
  maxPlanetRadius: number;
  startX: number;
  startY: number;
}

export class SystemScene extends Phaser.Scene {
  constructor() {
    super('SystemScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#050914');
    this.renderSystem();

    this.input.keyboard?.on('keydown-ESC', () => {
      this.scene.start('GalaxyScene');
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, this.renderSystem, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.renderSystem, this);
    });
  }

  private renderSystem(): void {
    this.children.removeAll(true);

    const controller = this.getController();
    const state = this.requireState(controller);
    const selectedSystemId = state.selectedSystemId;
    const system = selectedSystemId === null ? undefined : getSystem(state, selectedSystemId);

    if (!system) {
      this.addCenteredText('No system selected.');
      this.addBackButton();
      return;
    }

    const planets = getPlanetsInSystem(state, system.id);
    const width = this.scale.width;
    const height = this.scale.height;
    const layout = this.calculateGridLayout(planets.length, width, height);

    this.addHeader(system.systemName);
    this.addBackButton();

    planets.forEach((planet, index) => {
      const column = index % layout.columns;
      const row = Math.floor(index / layout.columns);
      this.drawPlanetCard(
        state,
        controller,
        planet,
        layout.startX + column * layout.cellWidth,
        layout.startY + row * layout.cellHeight,
        layout,
      );
    });
  }

  private calculateGridLayout(planetCount: number, width: number, height: number): SystemGridLayout {
    const topMargin = height < 560 ? 92 : 116;
    const bottomMargin = 20;
    const sideMargin = width < 520 ? 18 : 36;
    const availableWidth = Math.max(width - sideMargin * 2, 160);
    const availableHeight = Math.max(height - topMargin - bottomMargin, 180);
    const maxColumns = Math.min(5, Math.max(1, planetCount));
    let best = { columns: 1, cellWidth: availableWidth, cellHeight: availableHeight / Math.max(planetCount, 1) };

    for (let columns = 1; columns <= maxColumns; columns += 1) {
      const rows = Math.ceil(planetCount / columns);
      const cellWidth = availableWidth / columns;
      const cellHeight = availableHeight / rows;
      const score = Math.min(cellWidth / 150, cellHeight / 112);
      const bestScore = Math.min(best.cellWidth / 150, best.cellHeight / 112);

      if (score > bestScore) {
        best = { columns, cellWidth, cellHeight };
      }
    }

    const rows = Math.ceil(planetCount / best.columns);

    return {
      ...best,
      fontSize: best.cellWidth < 122 || best.cellHeight < 104 ? 10 : 12,
      labelWidth: Phaser.Math.Clamp(best.cellWidth - 14, 84, 156),
      maxPlanetRadius: Phaser.Math.Clamp(Math.min(best.cellWidth, best.cellHeight) * 0.22, 10, 40),
      startX: width / 2 - ((best.columns - 1) * best.cellWidth) / 2,
      startY: topMargin + best.cellHeight / 2 + Math.max(availableHeight - rows * best.cellHeight, 0) / 2,
    };
  }

  private drawPlanetCard(
    state: GameState,
    controller: AppController,
    planet: Planet,
    x: number,
    y: number,
    layout: SystemGridLayout,
  ): void {
    const owner = planet.ownerId >= 0 ? getEmpire(state, planet.ownerId) : undefined;
    const ownerName = owner?.empireName ?? 'Neutral';
    const ownerColor = owner ? this.toColorNumber(owner.color) : NEUTRAL_RING;
    const radius = Phaser.Math.Clamp(Math.sqrt(planet.size) * 2.1, 8, layout.maxPlanetRadius);
    const selected = state.selectedPlanetId === planet.id;

    const body = this.add.graphics({ x, y });
    body.lineStyle(selected ? 5 : 3, ownerColor, 1);
    body.fillStyle(0x182034, 1);
    body.fillCircle(0, 0, radius);
    body.strokeCircle(0, 0, radius + 4);

    if (planet.hasPortal) {
      body.fillStyle(0xfff3a1, 1);
      body.fillTriangle(radius + 12, -8, radius + 22, 0, radius + 12, 8);
    }

    body.setInteractive(new Phaser.Geom.Circle(0, 0, radius + 12), Phaser.Geom.Circle.Contains);
    body.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonReleased() || pointer.getDistance() >= 8) {
        return;
      }

      state.selectedPlanetId = planet.id;
      controller.overlay.render();
      this.renderSystem();
    });

    const labelX = x - layout.labelWidth / 2;
    const labelY = y + radius + 14;
    this.add
      .text(labelX, labelY, this.formatPlanetLabel(planet, ownerName), {
        color: '#e8edf7',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: `${layout.fontSize}px`,
        lineSpacing: layout.fontSize <= 10 ? 1 : 3,
        wordWrap: { width: layout.labelWidth },
      })
      .setResolution(2);
  }

  private addHeader(systemName: string): void {
    this.add
      .text(this.scale.width / 2, 24, systemName, {
        color: '#ffffff',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '24px',
      })
      .setOrigin(0.5, 0)
      .setResolution(2);

    this.add
      .text(this.scale.width / 2, 56, 'System - click a planet, press Escape or Back for galaxy', {
        color: '#aebbd4',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '13px',
      })
      .setOrigin(0.5, 0)
      .setResolution(2);
  }

  private addBackButton(): void {
    const back = this.add
      .text(18, 18, '< Back', {
        backgroundColor: '#182034',
        color: '#ffffff',
        fixedWidth: 82,
        fixedHeight: 34,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '15px',
        padding: { x: 12, y: 8 },
      })
      .setInteractive({ useHandCursor: true })
      .setResolution(2);

    back.on('pointerup', () => {
      this.scene.start('GalaxyScene');
    });
  }

  private addCenteredText(message: string): void {
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, message, {
        color: '#ffffff',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '18px',
      })
      .setOrigin(0.5)
      .setResolution(2);
  }

  private formatPlanetLabel(planet: Planet, ownerName: string): string {
    const portal = planet.hasPortal ? '\nPortal' : '';

    return `${planet.planetName}\n${ownerName}\nSize ${planet.size}  Pop ${Math.floor(planet.population)}${portal}`;
  }

  private getController(): AppController {
    return this.registry.get(APP_CONTROLLER_KEY) as AppController;
  }

  private requireState(controller: AppController): GameState {
    if (!controller.state) {
      throw new Error('Game state has not been initialized.');
    }

    return controller.state;
  }

  private toColorNumber(color: string): number {
    return Number.parseInt(color.replace('#', ''), 16);
  }
}
