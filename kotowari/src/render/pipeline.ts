import * as THREE from 'three';
import { POST_FRAG, POST_VERT } from './post';

export interface PostParams {
  mosh: number;
  sort: number;
  lumaKey: number; // <0 で無効
  cinema: number;
  acid: number;
  flash: number;
  fade: number;
  fadeColor: THREE.Color;
}

/** 3D を低解像度へ描いて整数倍で拡大する。倍率は画面に合わせて決める。 */
export class PixelPipeline {
  readonly renderer: THREE.WebGLRenderer;
  width = 384;
  height = 216;
  scale = 1;
  private rtScene!: THREE.WebGLRenderTarget;
  private rtA!: THREE.WebGLRenderTarget;
  private rtB!: THREE.WebGLRenderTarget;
  private rtSnap!: THREE.WebGLRenderTarget;
  private post: THREE.ShaderMaterial;
  private blit: THREE.MeshBasicMaterial;
  private quad: THREE.Mesh;
  private postScene = new THREE.Scene();
  private orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly params: PostParams = { mosh: 0, sort: 0, lumaKey: -1, cinema: 0, acid: 0, flash: 0, fade: 0, fadeColor: new THREE.Color(0, 0, 0) };
  private seed = 0;
  /** 1 コマにかかった描画の時間（ms）の記録 */
  readonly frameMs: number[] = [];

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    // 後処理で sRGB に直してから量子化するので、画面へ写すときは変換しない
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.post = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        tPrev: { value: null },
        tSnap: { value: null },
        uRes: { value: new THREE.Vector2() },
        uTime: { value: 0 },
        uNear: { value: 0.1 },
        uFar: { value: 200 },
        uDither: { value: 0.045 },
        uOutline: { value: 1 },
        uMosh: { value: 0 },
        uSort: { value: 0 },
        uLumaKey: { value: -1 },
        uCinema: { value: 0 },
        uAcid: { value: 0 },
        uFlash: { value: 0 },
        uFade: { value: 0 },
        uFadeColor: { value: new THREE.Color() },
        uVignette: { value: 0.55 },
        uSeed: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.blit = new THREE.MeshBasicMaterial({ map: null, depthTest: false, depthWrite: false });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    this.quad.frustumCulled = false;
    this.postScene.add(this.quad);
    this.resize(window.innerWidth, window.innerHeight);
  }

  private makeRT(depth: boolean): THREE.WebGLRenderTarget {
    const rt = new THREE.WebGLRenderTarget(this.width, this.height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: depth,
      colorSpace: THREE.NoColorSpace,
    });
    if (depth) {
      rt.depthTexture = new THREE.DepthTexture(this.width, this.height);
      rt.depthTexture.type = THREE.UnsignedIntType;
    }
    return rt;
  }

  /** 倍率 s = floor(min(W/384, H/216)) 以上 1。内部解像度 = ceil(W/s) × ceil(H/s) */
  resize(w: number, h: number): void {
    this.resizeWithScale(w, h, Math.max(1, Math.floor(Math.min(w / 384, h / 216))));
  }

  /** 整数倍率 s を指定して作り直す（同じなら何もしない） */
  resizeWithScale(w: number, h: number, s: number): void {
    const nw = Math.ceil(w / s);
    const nh = Math.ceil(h / s);
    if (this.rtScene && nw === this.width && nh === this.height && s === this.scale) return;
    this.scale = s;
    this.width = Math.ceil(w / s);
    this.height = Math.ceil(h / s);
    this.renderer.setSize(this.width, this.height, false);
    this.canvas.style.width = this.width * s + 'px';
    this.canvas.style.height = this.height * s + 'px';
    for (const rt of [this.rtScene, this.rtA, this.rtB, this.rtSnap]) rt?.dispose();
    this.rtScene = this.makeRT(true);
    this.rtA = this.makeRT(false);
    this.rtB = this.makeRT(false);
    this.rtSnap = this.makeRT(false);
    (this.post.uniforms.uRes.value as THREE.Vector2).set(this.width, this.height);
  }

  /** 今の出力を保存（ルーマ・キー遷移・シネマグラフ用） */
  snapshot(): void {
    this.blit.map = this.rtA.texture;
    this.quad.material = this.blit;
    this.renderer.setRenderTarget(this.rtSnap);
    this.renderer.render(this.postScene, this.orthoCam);
    this.quad.material = this.post;
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, time: number): void {
    const t0 = performance.now();
    const u = this.post.uniforms;
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.render(scene, camera);
    u.tColor.value = this.rtScene.texture;
    u.tDepth.value = this.rtScene.depthTexture;
    u.tPrev.value = this.rtA.texture;
    u.tSnap.value = this.rtSnap.texture;
    u.uTime.value = time;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    const p = this.params;
    u.uMosh.value = p.mosh;
    u.uSort.value = p.sort;
    u.uLumaKey.value = p.lumaKey;
    u.uCinema.value = p.cinema;
    u.uAcid.value = p.acid;
    u.uFlash.value = p.flash;
    u.uFade.value = p.fade;
    (u.uFadeColor.value as THREE.Color).copy(p.fadeColor);
    if (p.mosh > 0) u.uSeed.value = this.seed = (this.seed + 0.37) % 100;
    // 出力は B へ描いてから画面へ写し、A と入れ替える（次のコマの「前のコマ」）
    this.quad.material = this.post;
    r.setRenderTarget(this.rtB);
    r.render(this.postScene, this.orthoCam);
    this.blit.map = this.rtB.texture;
    this.quad.material = this.blit;
    r.setRenderTarget(null);
    r.render(this.postScene, this.orthoCam);
    this.quad.material = this.post;
    const tmp = this.rtA;
    this.rtA = this.rtB;
    this.rtB = tmp;
    const ms = performance.now() - t0;
    this.frameMs.push(ms);
    if (this.frameMs.length > 600) this.frameMs.shift();
  }
}
