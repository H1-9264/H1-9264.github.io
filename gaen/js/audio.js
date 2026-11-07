/**
 * GARGANTUA — optional ambient audio.
 * Playback only ever starts from an explicit user gesture.
 */
export class AmbientAudio {
  constructor(source, { volume = 0.42, fadeMs = 1400 } = {}) {
    this.source = source;
    this.targetVolume = volume;
    this.fadeMs = fadeMs;
    this.playing = false;
    this.available = true;
    this.fadeHandle = 0;
    this._fadeToken = 0;
    this.element = new Audio();
    this.element.src = source;
    this.element.loop = true;
    this.element.preload = 'metadata';
    this.element.volume = 0;
    this.element.setAttribute('aria-hidden', 'true');
    this.element.addEventListener('error', () => {
      this.available = false;
      this.playing = false;
    });
  }

  async play() {
    if (!this.available) {
      throw new Error('Ambient audio asset unavailable.');
    }
    try {
      await this.element.play();
      this.playing = true;
      this._fadeTo(this.targetVolume);
      return true;
    } catch (error) {
      this.playing = false;
      throw new Error(`Audio playback was blocked or failed: ${error?.message || error}`);
    }
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    this._fadeTo(0, () => {
      try {
        this.element.pause();
      } catch {
        /* noop */
      }
    });
  }

  async toggle() {
    if (this.playing) {
      this.pause();
      return false;
    }
    await this.play();
    return true;
  }

  setVolume(volume) {
    this.targetVolume = Math.min(1, Math.max(0, Number(volume) || 0));
    if (this.playing) this._fadeTo(this.targetVolume, null, 400);
  }

  _fadeTo(target, done, duration = this.fadeMs) {
    const token = ++this._fadeToken;
    const startValue = this.element.volume;
    const start = performance.now();
    cancelAnimationFrame(this.fadeHandle);

    const step = (now) => {
      if (token !== this._fadeToken) return;
      const t = Math.min(1, (now - start) / Math.max(1, duration));
      const eased = 1 - Math.pow(1 - t, 3);
      this.element.volume = Math.min(1, Math.max(0, startValue + (target - startValue) * eased));
      if (t < 1) {
        this.fadeHandle = requestAnimationFrame(step);
      } else {
        this.element.volume = target;
        done?.();
      }
    };
    this.fadeHandle = requestAnimationFrame(step);
  }

  onVisibilityChange(hidden) {
    if (!this.playing) return;
    if (hidden) {
      this.element.volume = 0;
    } else {
      this.element.volume = this.targetVolume;
    }
  }

  dispose() {
    cancelAnimationFrame(this.fadeHandle);
    this.element.pause();
    this.element.removeAttribute('src');
    try {
      this.element.load();
    } catch {
      /* noop */
    }
  }
}
