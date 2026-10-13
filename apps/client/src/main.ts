import './style.css';
import { createScene } from './scene';
import { connect } from './network';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;
const pingEl = document.querySelector<HTMLElement>('#ping')!;

createScene(canvas);

connect({
  onStatus(state, text) {
    statusEl.dataset.state = state;
    statusEl.textContent = text;
  },
  onPing(rttMs) {
    pingEl.textContent = `ping ${Math.round(rttMs)} ms`;
  },
});
