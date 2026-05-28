import Phaser from 'phaser';
import { APP_CONTROLLER_KEY, type AppController } from '../app/appController';
import { getEmpire, getPlanetsInSystem, getSystem } from '../core/selectors/selectors';
import type { GameState } from '../core/galaxy/galaxyData';
import type { Planet } from '../core/models/types';
import { ensurePlanetTexture } from './planetRenderer';

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
    const controller = this.getController();
    controller.activeScene = 'system';
    controller.switchToGalaxy = () => this.scene.start('GalaxyScene');
    const refreshScene = () => this.renderSystem();
    controller.refreshScene = refreshScene;
    this.cameras.main.setBackgroundColor('#050914');
    this.renderSystem();

    this.input.keyboard?.on('keydown-ESC', () => {
      this.scene.start('GalaxyScene');
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, this.renderSystem, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.renderSystem, this);
      if (controller.refreshScene === refreshScene) {
        controller.refreshScene = null;
      }
    });
  }

  private renderSystem(): void {
    this.children.removeAll(true);

    const controller = this.getController();
    const state = this.requireState(controller);
    const clientState = controller.clientState;
    const selectedSystemId = clientState?.selectedSystemId ?? null;
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
    const sideMargin = width >= 900 ? 460 : width < 520 ? 18 : 36;
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
    const selected = controller.clientState?.selectedPlanetId === planet.id;

    // Procedural planet texture
    const texDiameter = Math.round(radius * 2);
    const textureKey = ensurePlanetTexture(this, planet, texDiameter);
    const sprite = this.add.image(x, y, textureKey);
    sprite.setDisplaySize(texDiameter, texDiameter);

    // Owner ring (only for colonized planets)
    const ring = this.add.graphics({ x, y });
    if (owner) {
      ring.lineStyle(selected ? 5 : 3, ownerColor, 1);
      ring.strokeCircle(0, 0, radius + 4);
    } else if (selected) {
      ring.lineStyle(3, 0xffffff, 0.4);
      ring.strokeCircle(0, 0, radius + 4);
    }

    if (planet.hasPortal) {
      ring.fillStyle(0xfff3a1, 1);
      ring.fillTriangle(radius + 12, -8, radius + 22, 0, radius + 12, 8);
    }

    // Hit area for click and hover detection
    const hitZone = this.add.zone(x, y, (radius + 12) * 2, (radius + 12) * 2);
    hitZone.setInteractive({ useHandCursor: true });

    const hoverRing = this.add.graphics({ x, y });
    hoverRing.setAlpha(0);

    hitZone.on('pointerover', () => {
      hoverRing.clear();
      hoverRing.lineStyle(2, 0xffffff, 0.35);
      hoverRing.strokeCircle(0, 0, radius + 8);
      hoverRing.setAlpha(1);
    });
    hitZone.on('pointerout', () => {
      hoverRing.setAlpha(0);
    });

    hitZone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!this.isCanvasTopTarget(pointer) || !pointer.leftButtonReleased() || pointer.getDistance() >= 8) {
        return;
      }

      controller.clientState!.selectedPlanetId = planet.id;
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
      .text(18, 18, '< Galaxy', {
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
    const owner = planet.ownerId >= 0 ? `\n${ownerName}` : '';

    return `${planet.planetName}${owner}\nSize ${planet.size}  Pop ${Math.floor(planet.population)}${portal}`;
  }

  private getController(): AppController {
    return this.registry.get(APP_CONTROLLER_KEY) as AppController;
  }

  private isCanvasTopTarget(pointer: Phaser.Input.Pointer): boolean {
    const topElement = document.elementFromPoint(pointer.x, pointer.y);
    return topElement instanceof HTMLCanvasElement;
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
