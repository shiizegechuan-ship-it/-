export interface Theme {
  skyTop: string;
  skyBottom: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  moon: string;
  moonIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  lamp: string;
  lampIntensity: number;
  stars: number;
  moonDir: [number, number, number];
  dust: string; // 漂う粒の色
}

export const THEMES: Record<string, Theme> = {
  festival: {
    skyTop: '#0d0c18',
    skyBottom: '#33467a',
    fog: '#1c2138',
    fogNear: 22,
    fogFar: 70,
    moon: '#cfe3e8',
    moonIntensity: 0.95,
    hemiSky: '#4a64a6',
    hemiGround: '#15111c',
    hemiIntensity: 0.55,
    lamp: '#ffab5c',
    lampIntensity: 14,
    stars: 1,
    moonDir: [-0.45, 0.8, 0.35],
    dust: '#eab6c0',
  },
  cedar: {
    skyTop: '#0d0c18',
    skyBottom: '#26473d',
    fog: '#1d2c3a',
    fogNear: 14,
    fogFar: 55,
    moon: '#bfe0dc',
    moonIntensity: 0.9,
    hemiSky: '#5f8fbf',
    hemiGround: '#15111c',
    hemiIntensity: 0.5,
    lamp: '#ffb36b',
    lampIntensity: 12,
    stars: 0.6,
    moonDir: [0.4, 0.75, -0.5],
    dust: '#a9d4d3',
  },
  bamboo: {
    skyTop: '#0d0c18',
    skyBottom: '#2c5a46',
    fog: '#1b3330',
    fogNear: 12,
    fogFar: 50,
    moon: '#d6ecd6',
    moonIntensity: 0.95,
    hemiSky: '#6fa35e',
    hemiGround: '#15111c',
    hemiIntensity: 0.5,
    lamp: '#ffc77a',
    lampIntensity: 10,
    stars: 0.5,
    moonDir: [0.55, 0.7, 0.3],
    dust: '#a9d4a0',
  },
  town: {
    skyTop: '#0d0c18',
    skyBottom: '#5a3a78',
    fog: '#241a33',
    fogNear: 14,
    fogFar: 52,
    moon: '#c9b8e8',
    moonIntensity: 0.55,
    hemiSky: '#9283c8',
    hemiGround: '#15111c',
    hemiIntensity: 0.45,
    lamp: '#ff9a4a',
    lampIntensity: 12,
    stars: 0.2,
    moonDir: [-0.3, 0.8, -0.4],
    dust: '#e5793b',
  },
  falls: {
    skyTop: '#0d0c18',
    skyBottom: '#33467a',
    fog: '#1f2e48',
    fogNear: 14,
    fogFar: 58,
    moon: '#d8eef4',
    moonIntensity: 1.0,
    hemiSky: '#79b8c4',
    hemiGround: '#15111c',
    hemiIntensity: 0.55,
    lamp: '#ffc77a',
    lampIntensity: 10,
    stars: 0.9,
    moonDir: [-0.2, 0.85, 0.5],
    dust: '#a9d4d3',
  },
  summit: {
    skyTop: '#0d0c18',
    skyBottom: '#5e1c2c',
    fog: '#2a1424',
    fogNear: 18,
    fogFar: 70,
    moon: '#f0d8d0',
    moonIntensity: 0.8,
    hemiSky: '#a3223a',
    hemiGround: '#15111c',
    hemiIntensity: 0.45,
    lamp: '#ff8a5a',
    lampIntensity: 12,
    stars: 1,
    moonDir: [0.3, 0.75, 0.6],
    dust: '#eab6c0',
  },
};
