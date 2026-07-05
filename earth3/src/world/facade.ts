// The seam the UI talks to. Both the legacy ScaleManager and the new UnifiedWorld
// implement it, so the HUD, DefenseGame, and pointer picking work against either
// world without knowing which coordinate model is live. ScaleManager satisfies it
// structurally (its public surface predates this interface); UnifiedWorld declares
// `implements WorldFacade` so the compiler keeps the band-based port complete.
import type { Ray } from 'three';
import type { FocusTarget } from '../core/regime';
import type { DeflectResult, DefenseStats } from '../regimes/comets';

export interface Breadcrumb {
  id: string;
  label: string;
  active: boolean;
}

export interface CosmicInfo {
  atCosmos: boolean;
  forming: boolean;
  ageGyr: number;
}

export interface WorldFacade {
  /** the currently visible scale/band (the HUD reads `.label`) */
  readonly active: { readonly label: string };
  /** the currently focused body (the HUD reads `.info(clock)`) */
  readonly focus: FocusTarget;
  /** fired when the band or focus changes, so the HUD can rebuild structural UI */
  onChange?: (() => void) | null;

  breadcrumb(): Breadcrumb[];
  goTo(id: string): void;
  focusOn(target: FocusTarget): void;
  diveInto(target: FocusTarget): void;
  pickTargets(): FocusTarget[];
  cosmicInfo(): CosmicInfo;
  bigBang(): void;
  /** Layer 3 merger overlay (UnifiedWorld only; absent on the legacy path). */
  toggleMerger?(): void;
  readonly mergerActive?: boolean;
  /** fly to a 5-ly sector of the stellar grid and label its stars (UnifiedWorld only) */
  goToSector?(sx: number, sy: number, sz: number): void;

  // comet / defense
  launchComet(): void;
  threatDistance(): number | null;
  setDefenseMode(on: boolean): void;
  frameForDefense(): void;
  deflectComet(): DeflectResult;
  deflectCometAt(ray: Ray): DeflectResult;
  defenseStats(): DefenseStats;
}
