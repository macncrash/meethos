// The cross-scale event bus — how scales talk to each other. A comet detected
// striking Earth in the solar regime emits an impact here; the Earth regime
// (always subscribed, even when it isn't the visible scale) scars its surface
// and sets the civilization back. The HUD listens too, to toast the player.
import type { Vector3 } from 'three';

export interface ImpactEvent {
  /** incoming direction in the ecliptic frame (normalized) = where on the globe it struck */
  dir: Vector3;
  /** severity 0..1 */
  energy: number;
  /** absolute simulated time of impact (for un-spinning onto the rotating globe) */
  atSeconds: number;
}

export type ImpactListener = (e: ImpactEvent) => void;

export class WorldBus {
  private impactListeners: ImpactListener[] = [];

  onImpact(l: ImpactListener): () => void {
    this.impactListeners.push(l);
    return () => {
      this.impactListeners = this.impactListeners.filter((x) => x !== l);
    };
  }

  emitImpact(e: ImpactEvent): void {
    for (const l of this.impactListeners) l(e);
  }
}
