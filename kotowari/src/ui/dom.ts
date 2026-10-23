export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** キーボード／パッドでも操作できる縦の項目リスト。描画とクリックで同じ要素を使う */
export class NavList {
  sel = 0;
  constructor(
    public items: HTMLElement[],
    private onPick: (i: number) => void,
    private selClass = 'sel',
  ) {
    items.forEach((it, i) => {
      it.addEventListener('mouseenter', () => this.select(i));
      it.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select(i);
        this.pick();
      });
    });
    this.select(0);
  }
  select(i: number): void {
    if (!this.items.length) return;
    this.sel = (i + this.items.length) % this.items.length;
    this.items.forEach((it, j) => it.classList.toggle(this.selClass, j === this.sel));
    this.items[this.sel].scrollIntoView?.({ block: 'nearest' });
  }
  move(d: number): void {
    this.select(this.sel + d);
  }
  pick(): void {
    const it = this.items[this.sel];
    if (it && !(it as HTMLButtonElement).disabled) this.onPick(this.sel);
  }
}
