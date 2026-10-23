import type { PixelPipeline } from './pipeline';

/** 時間で動く画面効果。設定（特殊効果を控えめ・点滅を抑える）をここで反映する */
export class ScreenFx {
  private mosh = { t: 0, dur: 0, amp: 0 };
  private sort = { t: 0, dur: 0, amp: 0 };
  private luma = { t: 0, dur: 0, on: false };
  private flash = { t: 0, dur: 0 };
  private fade = { from: 0, to: 0, t: 0, dur: 0 };
  acid = 0;
  cinema = false;
  reduced = false;
  flashReduce = false;

  constructor(private pipe: PixelPipeline) {}

  datamosh(dur = 1.0, amp = 1): void {
    const k = this.reduced ? 0.5 : 1;
    this.mosh = { t: 0, dur: dur * k, amp: amp * (this.reduced ? 0.6 : 1) };
  }
  pixelSort(dur = 1.2, amp = 1): void {
    this.sort = { t: 0, dur: dur * (this.reduced ? 0.6 : 1), amp: amp * (this.reduced ? 0.6 : 1) };
  }
  /** 保存した画の暗い所から先に、今の画へ入れ替わる */
  lumaKey(dur = 1.2): void {
    this.pipe.snapshot();
    this.luma = { t: 0, dur, on: true };
  }
  textureFlash(dur = 0.25): void {
    if (this.flashReduce) return;
    this.flash = { t: 0, dur };
  }
  fadeTo(to: number, dur: number): void {
    this.fade = { from: this.pipe.params.fade, to, t: 0, dur };
  }
  get busy(): boolean {
    return this.luma.on || this.mosh.t < this.mosh.dur;
  }

  update(dt: number): void {
    const p = this.pipe.params;
    // データモッシュ：立ち上がりは速く、ゆっくり抜ける
    if (this.mosh.t < this.mosh.dur) {
      this.mosh.t += dt;
      const u = this.mosh.t / this.mosh.dur;
      p.mosh = Math.max(0, this.mosh.amp * (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85));
    } else p.mosh = 0;
    if (this.sort.t < this.sort.dur) {
      this.sort.t += dt;
      const u = this.sort.t / this.sort.dur;
      p.sort = this.sort.amp * Math.sin(Math.min(1, u) * Math.PI);
    } else p.sort = 0;
    if (this.luma.on) {
      this.luma.t += dt;
      const u = Math.min(1, this.luma.t / this.luma.dur);
      p.lumaKey = -0.05 + u * 1.15;
      if (u >= 1) {
        this.luma.on = false;
        p.lumaKey = -1;
      }
    }
    if (this.flash.t < this.flash.dur && !this.flashReduce) {
      this.flash.t += dt;
      p.flash = 1 - this.flash.t / this.flash.dur;
    } else p.flash = 0;
    if (this.fade.t < this.fade.dur) {
      this.fade.t += dt;
      const u = Math.min(1, this.fade.t / this.fade.dur);
      p.fade = this.fade.from + (this.fade.to - this.fade.from) * u;
    }
    p.acid = this.acid;
    p.cinema = this.cinema ? 1 : 0;
  }
}
