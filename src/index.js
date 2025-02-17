import M3U8 from "./M3U8.js";

class XStreamPlayer {
  constructor(url) {
    if (!url) {
      throw new Error("URL is required");
    }
    this.url = url;
    this.video = null;
    this.container = null;
    this.isPlaying = false;
    this.volume = 1;
    this.currentSegmentIndex = 0;
    this.segments = [];
    this.icons = {};
    this.init();
  }

  async init() {
    try {
      // Load SVG icons
      await this.loadIcons();

      // Create player container
      this.container = document.createElement("div");
      this.container.className = "xstream-player";

      // Create video container
      const videoContainer = document.createElement("div");
      videoContainer.className = "video-container";
      this.container.appendChild(videoContainer);

      // Create video element
      this.video = document.createElement("video");
      this.video.controls = false; // Disable default controls
      videoContainer.appendChild(this.video);

      // Create custom controls
      const controls = this.createControls();
      videoContainer.appendChild(controls);

      // Add container to DOM
      const appDiv = document.getElementById("app");
      appDiv.innerHTML = "";
      appDiv.appendChild(this.container);

      // Add event listeners
      this.addEventListeners();

      // Check if HLS is supported
      if (window.Hls.isSupported()) {
        this.initWithHLS();
      } else {
        this.initWithCustomM3U8();
      }
    } catch (error) {
      console.error("Error initializing player:", error);
    }
  }

  async loadIcons() {
    const iconFiles = {
      play: '/assets/play.svg',
      pause: '/assets/pause.svg',
      volume: '/assets/volume.svg',
      mute: '/assets/mute.svg',
      fullscreen: '/assets/fullscreen.svg',
      quality: '/assets/quality.svg',
      check: '/assets/check.svg'
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
  }

  createPlayIcon() {
    return this.icons.play || '';
  }

  createPauseIcon() {
    return this.icons.pause || '';
  }

  createVolumeIcon() {
    return this.icons.volume || '';
  }

  createMutedIcon() {
    return this.icons.mute || '';
  }

  createFullscreenIcon() {
    return this.icons.fullscreen || '';
  }

  createQualityIcon() {
    return this.icons.quality || '';
  }

  createCheckIcon() {
    return this.icons.check || '';
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
    playButton.innerHTML = this.createPlayIcon();

    const volumeContainer = document.createElement("div");
    volumeContainer.className = "volume-container";
    
    const volumeButton = document.createElement("button");
    volumeButton.className = "control-button volume";
    volumeButton.innerHTML = this.createVolumeIcon();
    
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
    qualityButton.innerHTML = this.createQualityIcon() + '<span>Auto</span>';

    const qualityMenu = document.createElement("div");
    qualityMenu.className = "quality-menu";

    qualityContainer.appendChild(qualityButton);
    qualityContainer.appendChild(qualityMenu);

    const fullscreenButton = document.createElement("button");
    fullscreenButton.className = "control-button fullscreen";
    fullscreenButton.innerHTML = this.createFullscreenIcon();

    rightControls.appendChild(qualityContainer);
    rightControls.appendChild(fullscreenButton);

    // Assemble controls
    controlsRow.appendChild(leftControls);
    controlsRow.appendChild(rightControls);
    
    controls.appendChild(progressBar);
    controls.appendChild(controlsRow);

    return controls;
  }

  addEventListeners() {
    const video = this.video;
    const container = this.container;
    const playButton = container.querySelector(".play-pause");
    const volumeButton = container.querySelector(".volume");
    const volumeSlider = container.querySelector(".volume-slider");
    const fullscreenButton = container.querySelector(".fullscreen");
    const progressBar = container.querySelector(".progress-bar");
    const progress = container.querySelector(".progress");
    const buffered = container.querySelector(".buffered");
    const timeDisplay = container.querySelector(".time-display");
    let isSeeking = false;
    let seekDebounceTimeout;

    // Play/Pause
    playButton.addEventListener("click", () => this.togglePlay());
    video.addEventListener("click", () => this.togglePlay());

    // Update play button icon
    video.addEventListener("play", () => {
      playButton.innerHTML = this.createPauseIcon();
      this.isPlaying = true;
    });

    video.addEventListener("pause", () => {
      playButton.innerHTML = this.createPlayIcon();
      this.isPlaying = false;
    });

    // Volume
    volumeButton.addEventListener("click", () => this.toggleMute());
    volumeSlider.addEventListener("click", (e) => {
      const rect = volumeSlider.getBoundingClientRect();
      const volume = (e.clientX - rect.left) / rect.width;
      this.setVolume(volume);
    });

    // Fullscreen
    fullscreenButton.addEventListener("click", () => this.toggleFullscreen());

    // Progress bar
    video.addEventListener("timeupdate", () => {
      if (!isSeeking) {
        const percent = (video.currentTime / video.duration) * 100;
        progress.style.width = `${percent}%`;
        timeDisplay.textContent = `${this.formatTime(video.currentTime)} / ${this.formatTime(video.duration)}`;
      }
    });

    // Buffered progress
    video.addEventListener("progress", () => {
      if (video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const percent = (bufferedEnd / video.duration) * 100;
        buffered.style.width = `${percent}%`;
      }
    });

    // Click progress bar to seek
    let isMouseDown = false;
    
    progressBar.addEventListener("mousedown", (e) => {
      isMouseDown = true;
      isSeeking = true;
      handleSeek(e);
    });

    document.addEventListener("mousemove", (e) => {
      if (isMouseDown) {
        handleSeek(e);
      }
    });

    document.addEventListener("mouseup", () => {
      if (isMouseDown) {
        isMouseDown = false;
        isSeeking = false;
      }
    });

    const handleSeek = (e) => {
      const rect = progressBar.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const seekTime = pos * video.duration;
      
      // Update progress bar immediately for smooth visual feedback
      progress.style.width = `${pos * 100}%`;
      timeDisplay.textContent = `${this.formatTime(seekTime)} / ${this.formatTime(video.duration)}`;

      // Debounce the actual seek operation
      clearTimeout(seekDebounceTimeout);
      seekDebounceTimeout = setTimeout(() => {
        video.currentTime = seekTime;
      }, 50);
    };

    // Preload video data
    video.preload = "auto";
    
    // Add seeking state class for visual feedback
    video.addEventListener("seeking", () => {
      container.classList.add("is-seeking");
    });

    video.addEventListener("seeked", () => {
      container.classList.remove("is-seeking");
      isSeeking = false;
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      // Only handle shortcuts if the player is in focus
      const isPlayerFocused = e.target === document.body || container.contains(e.target);
      if (!isPlayerFocused) return;

      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          // Space or K: Play/Pause
          e.preventDefault();
          this.togglePlay();
          break;
        case "m":
          // M: Mute/Unmute
          e.preventDefault();
          this.toggleMute();
          break;
        case "f":
          // F: Toggle fullscreen
          e.preventDefault();
          this.toggleFullscreen();
          break;
        case "arrowleft":
          // Left arrow: Rewind 5 seconds
          e.preventDefault();
          this.seek(-5);
          break;
        case "arrowright":
          // Right arrow: Forward 5 seconds
          e.preventDefault();
          this.seek(5);
          break;
        case "arrowup":
          // Up arrow: Volume up
          e.preventDefault();
          this.adjustVolume(0.1);
          break;
        case "arrowdown":
          // Down arrow: Volume down
          e.preventDefault();
          this.adjustVolume(-0.1);
          break;
        case "0":
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9":
          // Number keys: Seek to percentage
          e.preventDefault();
          const percent = parseInt(e.key) * 10;
          this.seekToPercent(percent);
          break;
      }
    });
  }

  togglePlay() {
    if (this.video.paused) {
      this.video.play();
    } else {
      this.video.pause();
    }
  }

  toggleMute() {
    this.video.muted = !this.video.muted;
    const volumeButton = this.container.querySelector(".volume");
    volumeButton.innerHTML = this.video.muted ? this.createMutedIcon() : this.createVolumeIcon();
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    this.video.volume = this.volume;
    this.container.querySelector(".volume-level").style.width = `${this.volume * 100}%`;
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      this.container.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  initWithHLS() {
    const hls = new window.Hls({
      debug: false,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      maxBufferSize: 60 * 1000 * 1000, // 60MB
      maxBufferHole: 0.5,
      highBufferWatchdogPeriod: 2,
      nudgeOffset: 0.2,
      nudgeMaxRetry: 5,
      startPosition: -1,
      manifestLoadingTimeOut: 10000,
      manifestLoadingMaxRetry: 3,
      manifestLoadingRetryDelay: 500,
      levelLoadingTimeOut: 10000,
      levelLoadingMaxRetry: 3,
      levelLoadingRetryDelay: 500,
      fragLoadingTimeOut: 20000,
      fragLoadingMaxRetry: 3,
      fragLoadingRetryDelay: 500,
      startFragPrefetch: true,
      testBandwidth: true,
      progressive: true,
      lowLatencyMode: false,
    });

    hls.loadSource(this.url);
    hls.attachMedia(this.video);

    hls.on(window.Hls.Events.MANIFEST_PARSED, (event, data) => {
      console.log("HLS: Manifest loaded, beginning playback");
      this.updateQualityLevels(hls);
    });

    hls.on(window.Hls.Events.LEVEL_SWITCHED, (event, data) => {
      this.updateActiveQuality(hls, data.level);
    });

    hls.on(window.Hls.Events.ERROR, (event, data) => {
      console.error("HLS error:", data);
      if (data.fatal) {
        switch (data.type) {
          case window.Hls.ErrorTypes.NETWORK_ERROR:
            console.log("Network error, trying to recover...");
            hls.startLoad();
            break;
          case window.Hls.ErrorTypes.MEDIA_ERROR:
            console.log("Media error, trying to recover...");
            hls.recoverMediaError();
            break;
          default:
            console.error("Fatal error, destroying HLS instance");
            hls.destroy();
            this.initWithCustomM3U8();
            break;
        }
      }
    });

    // Store hls instance
    this.hls = hls;
  }

  updateQualityLevels(hls) {
    const qualityMenu = this.container.querySelector(".quality-menu");
    const levels = hls.levels;
    const currentLevel = hls.currentLevel;
    
    // Clear existing menu items
    qualityMenu.innerHTML = "";

    // Add Auto quality option
    const autoItem = document.createElement("div");
    autoItem.className = "quality-menu-item" + (currentLevel === -1 ? " active" : "");
    autoItem.innerHTML = this.createCheckIcon() + '<span>Auto</span>';
    autoItem.addEventListener("click", () => this.setQuality(hls, -1));
    qualityMenu.appendChild(autoItem);

    // Add available qualities
    levels.forEach((level, index) => {
      const quality = this.formatQuality(level.height);
      const item = document.createElement("div");
      item.className = "quality-menu-item" + (currentLevel === index ? " active" : "");
      item.innerHTML = this.createCheckIcon() + `<span>${quality}</span>`;
      item.addEventListener("click", () => this.setQuality(hls, index));
      qualityMenu.appendChild(item);
    });

    // Update quality button text
    this.updateQualityButtonText(hls, currentLevel);

    // Add click handler for quality button
    const qualityContainer = this.container.querySelector(".quality-container");
    const qualityButton = qualityContainer.querySelector(".quality-button");
    
    qualityButton.addEventListener("click", (e) => {
      e.stopPropagation();
      qualityContainer.classList.toggle("active");
    });

    // Close quality menu when clicking outside
    document.addEventListener("click", () => {
      qualityContainer.classList.remove("active");
    });
  }

  setQuality(hls, levelIndex) {
    hls.currentLevel = levelIndex;
    this.updateActiveQuality(hls, levelIndex);
    this.container.querySelector(".quality-container").classList.remove("active");
  }

  updateActiveQuality(hls, levelIndex) {
    const items = this.container.querySelectorAll(".quality-menu-item");
    items.forEach((item, index) => {
      item.classList.toggle("active", index === 0 ? levelIndex === -1 : index - 1 === levelIndex);
    });
    this.updateQualityButtonText(hls, levelIndex);
  }

  updateQualityButtonText(hls, levelIndex) {
    const qualityButton = this.container.querySelector(".quality-button");
    const span = qualityButton.querySelector("span");
    
    if (levelIndex === -1) {
      span.textContent = "Auto";
    } else {
      const level = hls.levels[levelIndex];
      span.textContent = this.formatQuality(level.height);
    }
  }

  formatQuality(height) {
    return height + "p";
  }

  initWithCustomM3U8() {
    console.log("Using custom M3U8 implementation");
    M3U8.load(
      this.url,
      (playlist, url) => {
        console.log("M3U8: Playlist loaded:", playlist);
        if (playlist.type === "MASTER") {
          // Handle master playlist - select first stream
          const stream = playlist.streams[0];
          if (stream) {
            M3U8.load(
              stream.url,
              (mediaPlaylist) => {
                console.log("M3U8: Media playlist loaded:", mediaPlaylist);
                this.handleMediaPlaylist(mediaPlaylist);
              },
              (error) => console.error("Error loading media playlist:", error)
            );
          }
        } else {
          // Handle media playlist directly
          this.handleMediaPlaylist(playlist);
        }
      },
      (error) => console.error("Error loading playlist:", error)
    );
  }

  handleMediaPlaylist(playlist) {
    this.segments = playlist.segments || [];
    if (this.segments.length > 0) {
      this.loadNextSegment();
    } else {
      console.error("No segments found in playlist");
    }
  }

  loadNextSegment() {
    if (this.currentSegmentIndex >= this.segments.length) {
      console.log("All segments played");
      return;
    }

    const segment = this.segments[this.currentSegmentIndex];
    console.log("Loading segment:", segment);

    // Set the video source to the current segment
    this.video.src = segment.url;
    
    // When the current segment ends, play the next one
    const onEnded = () => {
      this.currentSegmentIndex++;
      this.video.removeEventListener("ended", onEnded);
      this.loadNextSegment();
    };

    this.video.addEventListener("ended", onEnded);
    
    // Play the segment
    this.video.play().catch(e => {
      console.error("Error playing segment:", e);
      // Try to auto-recover by moving to next segment
      this.currentSegmentIndex++;
      this.loadNextSegment();
    });
  }

  seek(seconds) {
    const newTime = this.video.currentTime + seconds;
    this.video.currentTime = Math.max(0, Math.min(newTime, this.video.duration));
  }

  adjustVolume(delta) {
    const newVolume = Math.max(0, Math.min(1, this.volume + delta));
    this.setVolume(newVolume);
  }

  seekToPercent(percent) {
    this.video.currentTime = (percent / 100) * this.video.duration;
  }
}

// Initialize the player with a test HLS stream
new XStreamPlayer("https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8");
