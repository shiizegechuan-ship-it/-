import { App } from './app';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const app = new App(canvas, ui);
(window as unknown as { __k: ReturnType<App['debugApi']> }).__k = app.debugApi();
const loop = (t: number) => {
  app.frame(t);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
