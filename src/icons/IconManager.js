export class IconManager {
  constructor() {
    this.icons = {};
  }

  async loadIcons() {
    const iconFiles = {
      play: "/assets/play.svg",
      pause: "/assets/pause.svg",
      volume: "/assets/volume.svg",
      mute: "/assets/mute.svg",
      fullscreen: "/assets/fullscreen.svg",
      quality: "/assets/quality.svg",
      check: "/assets/check.svg",
      spinner: "/assets/spinner.svg",
    };

    for (const [name, path] of Object.entries(iconFiles)) {
      try {
        const response = await fetch(path);
        const svg = await response.text();
        this.icons[name] = svg;
      } catch (error) {
        console.error(`Error loading icon ${name}:`, error);
      }
    }

    return this.icons;
  }

  getIcon(name) {
    return this.icons[name] || "";
  }
}
