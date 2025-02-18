export class Controls {
  constructor(container, video, icons) {
    this.container = container;
    this.video = video;
    this.icons = icons;
    this.isPlaying = false;
    this.onQualityChange = null;
    this.element = this.createControls();
  }

  createControls() {
    const controls = document.createElement("div");
    controls.className = "video-controls";

    // Progress bar
    const progressBar = document.createElement("div");
    progressBar.className = "progress-bar";

    const buffered = document.createElement("div");
    buffered.className = "buffered";

    const progress = document.createElement("div");
    progress.className = "progress";

    progressBar.appendChild(buffered);
    progressBar.appendChild(progress);

    // Controls row
    const controlsRow = document.createElement("div");
    controlsRow.className = "controls-row";

    // Left controls
    const leftControls = document.createElement("div");
    leftControls.className = "left-controls";

    const playButton = document.createElement("button");
    playButton.className = "control-button play-pause";
    playButton.innerHTML = this.icons.play || "";

    const volumeContainer = document.createElement("div");
    volumeContainer.className = "volume-container";

    const volumeButton = document.createElement("button");
    volumeButton.className = "control-button volume";
    volumeButton.innerHTML = this.icons.volume || "";

    const volumeSlider = document.createElement("div");
    volumeSlider.className = "volume-slider";

    const volumeLevel = document.createElement("div");
    volumeLevel.className = "volume-level";

    volumeSlider.appendChild(volumeLevel);
    volumeContainer.appendChild(volumeButton);
    volumeContainer.appendChild(volumeSlider);

    const timeDisplay = document.createElement("div");
    timeDisplay.className = "time-display";
    timeDisplay.textContent = "0:00 / 0:00";

    leftControls.appendChild(playButton);
    leftControls.appendChild(volumeContainer);
    leftControls.appendChild(timeDisplay);

    // Right controls
    const rightControls = document.createElement("div");
    rightControls.className = "right-controls";

    // Quality selector
    const qualityContainer = document.createElement("div");
    qualityContainer.className = "quality-container";

    const qualityButton = document.createElement("button");
    qualityButton.className = "control-button quality-button";
    qualityButton.innerHTML = this.icons.quality + "<span>Auto</span>";

    const qualityMenu = document.createElement("div");
    qualityMenu.className = "quality-menu";

    qualityContainer.appendChild(qualityButton);
    qualityContainer.appendChild(qualityMenu);

    // Add click handler for quality button
    qualityButton.addEventListener("click", (e) => {
      e.stopPropagation();
      qualityContainer.classList.toggle("active");
    });

    // Close quality menu when clicking outside
    document.addEventListener("click", () => {
      qualityContainer.classList.remove("active");
    });

    const fullscreenButton = document.createElement("button");
    fullscreenButton.className = "control-button fullscreen";
    fullscreenButton.innerHTML = this.icons.fullscreen || "";

    rightControls.appendChild(qualityContainer);
    rightControls.appendChild(fullscreenButton);

    // Assemble controls
    controlsRow.appendChild(leftControls);
    controlsRow.appendChild(rightControls);

    controls.appendChild(progressBar);
    controls.appendChild(controlsRow);

    return controls;
  }

  setupControlsVisibility() {
    let mouseMovementTimer;

    // Show/hide controls on hover
    this.container.addEventListener("mouseenter", () => {
      this.container.classList.remove("controls-hidden");
    });

    this.container.addEventListener("mouseleave", () => {
      if (this.isPlaying) {
        this.container.classList.add("controls-hidden");
      }
    });

    // Keep controls visible while interacting with them
    this.element.addEventListener("mouseenter", () => {
      this.container.classList.remove("controls-hidden");
    });

    // Show controls on mouse move
    this.container.addEventListener("mousemove", () => {
      this.container.classList.remove("controls-hidden");
      clearTimeout(mouseMovementTimer);
      if (this.isPlaying) {
        mouseMovementTimer = setTimeout(() => {
          if (!this.container.matches(":hover")) {
            this.container.classList.add("controls-hidden");
          }
        }, 2000);
      }
    });
  }

  updatePlayState(isPlaying) {
    this.isPlaying = isPlaying;
    const playButton = this.element.querySelector(".play-pause");
    playButton.innerHTML = isPlaying ? this.icons.pause : this.icons.play;

    if (isPlaying) {
      setTimeout(() => {
        if (this.isPlaying && !this.container.matches(":hover")) {
          this.container.classList.add("controls-hidden");
        }
      }, 2000);
    } else {
      this.container.classList.remove("controls-hidden");
    }
  }

  updateProgress(currentTime, duration) {
    if (!this.element) return;
    
    const progress = this.element.querySelector(".progress");
    const timeDisplay = this.element.querySelector(".time-display");
    const percent = (currentTime / duration) * 100;
    
    progress.style.width = `${percent}%`;
    timeDisplay.textContent = `${this.formatTime(currentTime)} / ${this.formatTime(duration)}`;
  }

  updateBuffered(bufferedEnd, duration) {
    if (!this.element) return;
    
    const buffered = this.element.querySelector(".buffered");
    const percent = (bufferedEnd / duration) * 100;
    buffered.style.width = `${percent}%`;
  }

  updateQualityLevels(qualityData) {
    const { levels, currentLevel, autoMode } = qualityData;
    const qualityMenu = this.element.querySelector(".quality-menu");
    const qualityButton = this.element.querySelector(".quality-button span");

    // Clear existing menu items
    qualityMenu.innerHTML = "";

    // Add Auto quality option
    const autoItem = document.createElement("div");
    autoItem.className = "quality-menu-item" + (autoMode ? " active" : "");
    autoItem.innerHTML = `${this.icons.check}<span>Auto</span>`;
    autoItem.addEventListener("click", () => {
      if (this.onQualityChange) {
        this.onQualityChange(-1);
      }
    });
    qualityMenu.appendChild(autoItem);

    // Add available qualities
    levels.forEach(level => {
      const item = document.createElement("div");
      item.className = "quality-menu-item" + (currentLevel === level.index && !autoMode ? " active" : "");
      item.innerHTML = `${this.icons.check}<span>${level.name}</span>`;
      item.addEventListener("click", () => {
        if (this.onQualityChange) {
          this.onQualityChange(level.index);
        }
      });
      qualityMenu.appendChild(item);
    });

    // Update quality button text
    qualityButton.textContent = autoMode ? "Auto" : levels[currentLevel]?.name || "Auto";
  }

  formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
}
