// Entry for the Phase 1 true-scale zoom proof (separate page: /zoom.html), so the
// game stays untouched while the meethos floating-origin engine is built out.
import { startZoomDemo } from './scenes/zoomDemo';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const readout = document.getElementById('readout')!;
startZoomDemo(canvas, readout);
