import Phaser from 'phaser';
import { APP_CONTROLLER_KEY, type AppController } from '../app/appController';
import { UNITS } from '../core/data/units';
import { getEmpire, getPlanetsInSystem, getSystem, getSystemOwner, isSystemContested } from '../core/selectors/selectors';
import type { CombatUnitKey } from '../core/models/types';
import { displayColorNumber } from '../ui/displayColor';

const GODOT_SCALE = 20;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const NEUTRAL_COLOR = 0x70798a;
const CONTESTED_COLOR = 0xff8c00;
const HOME_MARKER_COLOR = 0xffffff;

export class GalaxyScene extends Phaser.Scene {
  private isPanning = false;
  private panStart = { x: 0, y: 0, scrollX: 0, scrollY: 0 };
  private tooltip: HTMLDivElement | null = null;

  constructor() {
    super('GalaxyScene');
  }

  create(): void {
    const controller = this.getController();
    this.requireState(controller);
    const camera = this.cameras.main;

    controller.activeScene = 'galaxy';
    controller.switchToGalaxy = () => this.scene.start('GalaxyScene');
    controller.navigateToSystem = (systemId: number) => {
      controller.clientState!.selectedSystemId = systemId;
      controller.clientState!.selectedPlanetId = null;
      this.scene.start('SystemScene');
    };
    controller.overlay.render();

    camera.setBackgroundColor('#030610');
    camera.setZoom(1);

    // Helper: center the camera on a world position.
    // We use this.scale.width/height (the live canvas size in the Scale.RESIZE
    // mode) rather than camera.width/height, which can still hold the original
    // 1280×720 config values when the window is larger.
    const centerOnWorld = (wx: number, wy: number, zoom: number) => {
      camera.scrollX = wx - this.scale.width / (2 * zoom);
      camera.scrollY = wy - this.scale.height / (2 * zoom);
    };

    // Center on player's home system if available, otherwise galaxy origin
    const state = controller.state!;
    const empireId = controller.clientState?.empireId ?? 0;
    const playerEmpire = getEmpire(state, empireId);
    const homeSystem = playerEmpire ? getSystem(state, playerEmpire.homeSystemId) : undefined;
    const focusX = homeSystem ? homeSystem.position.x * GODOT_SCALE : 0;
    const focusY = homeSystem ? homeSystem.position.y * GODOT_SCALE : 0;

    centerOnWorld(focusX, focusY, 1);

    // Keep view centered on the same point whenever the browser window resizes.
    const onResize = () => { centerOnWorld(focusX, focusY, camera.zoom); };
    this.scale.on('resize', onResize);

    const refreshScene = () => {
      this.children.removeAll(true);
      this.hideTooltip();
      this.addGalaxyBackdrop();
      this.drawSystems(controller);
      this.drawFleets(controller);
      this.addInstructions();
    };
    controller.refreshScene = refreshScene;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (controller.refreshScene === refreshScene) {
        controller.refreshScene = null;
      }
      this.scale.off('resize', onResize);
      this.hideTooltip();
    });

    this.addGalaxyBackdrop();
    this.drawSystems(controller);
    this.drawFleets(controller);
    this.addInstructions();

    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: unknown[], _dx: number, dy: number) => {
      const newZoom = Phaser.Math.Clamp(camera.zoom - dy * 0.001, MIN_ZOOM, MAX_ZOOM);
      if (newZoom === camera.zoom) return;
      // Zoom toward current camera center, not the initial focus point
      const cx = camera.scrollX + this.scale.width / (2 * camera.zoom);
      const cy = camera.scrollY + this.scale.height / (2 * camera.zoom);
      camera.setZoom(newZoom);
      centerOnWorld(cx, cy, newZoom);
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

    // No camera bounds — allows zoom to stay perfectly centered on the screen
    // without bounds clamping interfering with the scroll calculation after zoom
  }

  private drawSystems(controller: AppController): void {
    const state = this.requireState(controller);

    for (const system of state.systems) {
      const x = system.position.x * GODOT_SCALE;
      const y = system.position.y * GODOT_SCALE;
      const ownerId = getSystemOwner(state, system.id);
      const owner = ownerId >= 0 ? getEmpire(state, ownerId) : undefined;
      const contested = isSystemContested(state, system.id);
      const playerEmpireId = controller.clientState?.empireId ?? 0;
      const color = contested ? CONTESTED_COLOR : owner ? displayColorNumber(owner, playerEmpireId) : NEUTRAL_COLOR;
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
      marker.input!.cursor = 'pointer';

      const hoverRing = this.add.graphics({ x, y });
      hoverRing.setAlpha(0);

      marker.on('pointerover', (pointer: Phaser.Input.Pointer) => {
        hoverRing.clear();
        hoverRing.lineStyle(2, 0xffffff, 0.35);
        hoverRing.strokeCircle(0, 0, 14);
        hoverRing.setAlpha(1);
        this.showSystemTooltip(state, system.id, system.systemName, pointer.x, pointer.y);
      });
      marker.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        this.moveTooltip(pointer.x, pointer.y);
      });
      marker.on('pointerout', () => {
        hoverRing.setAlpha(0);
        this.hideTooltip();
      });

      marker.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (this.isCanvasTopTarget(pointer) && pointer.leftButtonReleased() && pointer.getDistance() < 8) {
          this.hideTooltip();
          controller.clientState!.selectedSystemId = system.id;
          controller.clientState!.selectedPlanetId = null;
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

  private drawFleets(controller: AppController): void {
    const state = this.requireState(controller);
    const playerEmpireId = controller.clientState?.empireId ?? 0;
    const empire = getEmpire(state, playerEmpireId);
    if (!empire) return;
    const color = displayColorNumber(empire, playerEmpireId);
    const fleetKeys: CombatUnitKey[] = ['fighter', 'bomber', 'transport', 'soldier', 'droid'];

    for (const fleet of state.fleets) {
      if (fleet.ownerId !== playerEmpireId || fleet.isExploration) continue;
      if (fleet.originSystemId === fleet.targetSystemId) continue; // intra-system, 1-tick

      const fromSystem = state.systems.find((s) => s.id === fleet.originSystemId);
      const toSystem = state.systems.find((s) => s.id === fleet.targetSystemId);
      if (!fromSystem || !toSystem) continue;

      const dx = toSystem.position.x - fromSystem.position.x;
      const dy = toSystem.position.y - fromSystem.position.y;
      const totalTicks = Math.max(Math.ceil(Math.hypot(dx, dy)), 1);
      const progress = Math.max(0.1, Math.min(0.9, 1 - fleet.ticksRemaining / totalTicks));

      const fromX = fromSystem.position.x * GODOT_SCALE;
      const fromY = fromSystem.position.y * GODOT_SCALE;
      const toX = toSystem.position.x * GODOT_SCALE;
      const toY = toSystem.position.y * GODOT_SCALE;

      const fx = fromX + (toX - fromX) * progress;
      const fy = fromY + (toY - fromY) * progress;

      // Rotate triangle toward destination
      const angle = Math.atan2(toY - fromY, toX - fromX) + Math.PI / 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const icon = this.add.graphics({ x: fx, y: fy });
      icon.fillStyle(color, 0.9);
      icon.fillTriangle(
        0 * cos - (-6) * sin, 0 * sin + (-6) * cos,
        (-4) * cos - 4 * sin, (-4) * sin + 4 * cos,
        4 * cos - 4 * sin, 4 * sin + 4 * cos,
      );

      icon.setInteractive(new Phaser.Geom.Rectangle(-8, -8, 16, 16), Phaser.Geom.Rectangle.Contains);
      icon.input!.cursor = 'pointer';

      const unitLines = fleetKeys
        .filter((k) => (fleet.units[k] ?? 0) > 0)
        .map((k) => `${fleet.units[k]} ${UNITS[k].name}`)
        .join('<br>');
      const targetSys = state.systems.find((s) => s.id === fleet.targetSystemId);

      icon.on('pointerover', (pointer: Phaser.Input.Pointer) => {
        this.showFleetTooltip(
          `<strong>Fleet → ${targetSys?.systemName ?? '?'}</strong><br>${unitLines}<br>${fleet.ticksRemaining} tick${fleet.ticksRemaining !== 1 ? 's' : ''} remaining`,
          pointer.x,
          pointer.y,
        );
      });
      icon.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        this.moveTooltip(pointer.x, pointer.y);
      });
      icon.on('pointerout', () => {
        this.hideTooltip();
      });
    }
  }

  private showFleetTooltip(html: string, px: number, py: number): void {
    this.hideTooltip();
    const tip = document.createElement('div');
    tip.className = 'galaxy-tooltip';
    tip.innerHTML = html;
    document.getElementById('ui-root')?.append(tip);
    this.tooltip = tip;
    this.moveTooltip(px, py);
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

  private showSystemTooltip(
    state: ReturnType<GalaxyScene['requireState']>,
    systemId: number,
    systemName: string,
    px: number,
    py: number,
  ): void {
    this.hideTooltip();
    const planets = getPlanetsInSystem(state, systemId);
    const contested = isSystemContested(state, systemId);
    const owners = new Map<number, string>();
    let neutralCount = 0;
    for (const p of planets) {
      if (p.ownerId >= 0) {
        if (!owners.has(p.ownerId)) {
          const empire = getEmpire(state, p.ownerId);
          owners.set(p.ownerId, empire?.empireName ?? 'Unknown');
        }
      } else {
        neutralCount++;
      }
    }

    const lines = [`<strong>${systemName}</strong>`, `${planets.length} planet${planets.length !== 1 ? 's' : ''}`];
    if (owners.size > 0) {
      lines.push([...owners.values()].join(', '));
    }
    if (neutralCount > 0) {
      lines.push(`${neutralCount} uncolonized`);
    }
    if (contested) {
      lines.push('<span class="galaxy-tooltip-contested">Contested</span>');
    }

    const tip = document.createElement('div');
    tip.className = 'galaxy-tooltip';
    tip.innerHTML = lines.join('<br>');
    document.getElementById('ui-root')?.append(tip);
    this.tooltip = tip;
    this.moveTooltip(px, py);
  }

  private moveTooltip(px: number, py: number): void {
    if (!this.tooltip) return;
    const pad = 12;
    const maxX = window.innerWidth - 200;
    const maxY = window.innerHeight - 100;
    this.tooltip.style.left = `${Math.min(px + pad, maxX)}px`;
    this.tooltip.style.top = `${Math.min(py + pad, maxY)}px`;
  }

  private hideTooltip(): void {
    this.tooltip?.remove();
    this.tooltip = null;
  }

  private getController(): AppController {
    return this.registry.get(APP_CONTROLLER_KEY) as AppController;
  }

  private isCanvasTopTarget(pointer: Phaser.Input.Pointer): boolean {
    const topElement = document.elementFromPoint(pointer.x, pointer.y);
    return topElement instanceof HTMLCanvasElement;
  }

  private requireState(controller: AppController) {
    if (!controller.state) {
      throw new Error('Game state has not been initialized.');
    }

    return controller.state;
  }

}
