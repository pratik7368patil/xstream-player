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
    this.loadingTimeout = null;
    this.loadingStates = new Set();
    this.init();
  }

  setLoadingState(state, isLoading) {
    if (isLoading) {
      // Don't show loading if video is already playing
      if (state !== "seeking" && this.video && !this.video.paused) {
        return;
      }
      this.loadingStates.add(state);
    } else {
      this.loadingStates.delete(state);
    }

    // Clear any existing timeout
    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
    }

    // Add a longer delay before showing loading state to prevent flickering
    this.loadingTimeout = setTimeout(() => {
      if (
        this.loadingStates.size > 0 &&
        (!this.video || this.video.paused || this.loadingStates.has("seeking"))
      ) {
        this.container.classList.add("is-loading");
      } else {
        this.container.classList.remove("is-loading");
      }
    }, 300); // Increased delay to prevent flickering
  }

  async init() {
    try {
      // Load SVG icons
      await this.loadIcons();

      // Create player container and insert HTML structure
      this.container = document.createElement("div");
      this.container.className = "xstream-player";
      
      // Create controls first so we can reference them
      const controls = this.createControls();
      
      const playerTemplate = `
        <div class="video-container">
          <div class="loading-spinner">${this.icons.spinner || ""}</div>
          <video></video>
        </div>
      `;
      
      this.container.innerHTML = playerTemplate;

      // Get reference to video element and video container
      this.video = this.container.querySelector("video");
      const videoContainer = this.container.querySelector(".video-container");
      
      // Append controls after setting innerHTML
      videoContainer.appendChild(controls);
      
      this.video.controls = false; // Disable default controls

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
  }

  createPlayIcon() {
    return this.icons.play || "";
  }

  createPauseIcon() {
    return this.icons.pause || "";
  }

  createVolumeIcon() {
    return this.icons.volume || "";
  }

  createMutedIcon() {
    return this.icons.mute || "";
  }

  createFullscreenIcon() {
    return this.icons.fullscreen || "";
  }

  createQualityIcon() {
    return this.icons.quality || "";
  }

  createCheckIcon() {
    return this.icons.check || "";
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
    qualityButton.innerHTML = this.createQualityIcon() + "<span>Auto</span>";

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

    // Update play button icon and control visibility
    video.addEventListener("play", () => {
      playButton.innerHTML = this.createPauseIcon();
      this.isPlaying = true;
      // Hide controls after a delay when video starts playing
      setTimeout(() => {
        if (this.isPlaying && !this.container.matches(":hover")) {
          this.container.classList.add("controls-hidden");
        }
      }, 2000);
    });

    video.addEventListener("pause", () => {
      playButton.innerHTML = this.createPlayIcon();
      this.isPlaying = false;
      this.container.classList.remove("controls-hidden");
    });

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
    const controls = container.querySelector(".video-controls");
    controls.addEventListener("mouseenter", () => {
      this.container.classList.remove("controls-hidden");
    });

    // Show controls on mouse move
    let mouseMovementTimer;
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
        timeDisplay.textContent = `${this.formatTime(
          video.currentTime
        )} / ${this.formatTime(video.duration)}`;
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
      const pos = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width)
      );
      const seekTime = pos * video.duration;

      // Update progress bar immediately for smooth visual feedback
      progress.style.width = `${pos * 100}%`;
      timeDisplay.textContent = `${this.formatTime(
        seekTime
      )} / ${this.formatTime(video.duration)}`;

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
      const isPlayerFocused =
        e.target === document.body || container.contains(e.target);
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

    // Loading states
    video.addEventListener("loadstart", () => {
      this.setLoadingState("initial", true);
    });

    video.addEventListener("waiting", () => {
      this.setLoadingState("buffering", true);
    });

    video.addEventListener("playing", () => {
      this.setLoadingState("buffering", false);
      this.setLoadingState("initial", false);
    });

    video.addEventListener("canplay", () => {
      this.setLoadingState("initial", false);
      this.setLoadingState("buffering", false);
    });

    video.addEventListener("seeking", () => {
      this.setLoadingState("seeking", true);
      container.classList.add("is-seeking");
    });

    video.addEventListener("seeked", () => {
      this.setLoadingState("seeking", false);
      container.classList.remove("is-seeking");
      isSeeking = false;
    });

    video.addEventListener("stalled", () => {
      if (!this.video.paused) {
        this.setLoadingState("buffering", true);
      }
    });

    // Error handling
    video.addEventListener("error", () => {
      this.setLoadingState("error", true);
      console.error("Video error:", video.error);
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
    volumeButton.innerHTML = this.video.muted
      ? this.createMutedIcon()
      : this.createVolumeIcon();
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    this.video.volume = this.volume;
    this.container.querySelector(".volume-level").style.width = `${
      this.volume * 100
    }%`;
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
      // Custom fragment loading strategy
      fragLoadingPolicy: {
        default: {
          maxRetry: 3,
          retryDelay: 500,
          maxRetryDelay: 2000,
          backoff: "exponential",
        },
      },
      // Optimize buffer management
      backBufferLength: 30, // Only keep 30 seconds of back buffer
      enableSoftwareAES: true,
    });

    // Attach media
    hls.attachMedia(this.video);

    // Handle HLS events for optimized loading
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
      this.updateQualityLevels(hls);
      console.log(
        "Manifest loaded, found " + hls.levels.length + " quality level(s)"
      );
    });

    // Loading states for fragments
    let fragLoadingTimeout;

    hls.on(window.Hls.Events.FRAG_LOADING, (event, data) => {
      // Clear any existing timeout
      if (fragLoadingTimeout) {
        clearTimeout(fragLoadingTimeout);
      }

      // Only show loading state if fragment takes more than 150ms to load
      fragLoadingTimeout = setTimeout(() => {
        this.setLoadingState("fragment", true);
      }, 150);

      console.log("Loading fragment at position:", data.frag.start);
    });

    hls.on(window.Hls.Events.FRAG_LOADED, (event, data) => {
      // Clear the timeout if fragment loads quickly
      if (fragLoadingTimeout) {
        clearTimeout(fragLoadingTimeout);
      }

      this.setLoadingState("fragment", false);
      console.log("Loaded fragment at position:", data.frag.start);
    });

    // Error handling
    hls.on(window.Hls.Events.ERROR, (event, data) => {
      this.setLoadingState("hlsError", true);
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
      } else {
        // Non-fatal error, remove loading state after a delay
        setTimeout(() => {
          this.setLoadingState("hlsError", false);
        }, 2000);
      }
    });

    // Load source
    hls.loadSource(this.url);
    this.hls = hls;

    // Store reference to hls instance
    this._setupAdvancedSeek(hls);
  }

  _setupAdvancedSeek(hls) {
    let lastSeekTarget = 0;
    let seekTimer = null;
    let seekLoadingTimeout = null;

    const seekToPosition = (targetTime) => {
      if (this.video.readyState === 0) return;

      // Show loading state with delay to prevent flickering
      if (seekLoadingTimeout) {
        clearTimeout(seekLoadingTimeout);
      }

      seekLoadingTimeout = setTimeout(() => {
        this.setLoadingState("seeking", true);
      }, 150);

      // Clear existing fragments that are no longer needed
      hls.trigger(window.Hls.Events.BUFFER_FLUSHING, {
        startOffset: 0,
        endOffset: targetTime - 1,
      });

      // Find the closest fragment to the target time
      const { fragments } = hls.levels[hls.currentLevel];
      if (!fragments) {
        if (seekLoadingTimeout) {
          clearTimeout(seekLoadingTimeout);
        }
        this.setLoadingState("seeking", false);
        return;
      }

      let targetFragment = null;
      for (let i = 0; i < fragments.length; i++) {
        if (
          fragments[i].start <= targetTime &&
          fragments[i].end >= targetTime
        ) {
          targetFragment = fragments[i];
          break;
        }
      }

      if (targetFragment) {
        // Load the target fragment and a few subsequent fragments
        hls.trigger(window.Hls.Events.BUFFER_RESET);

        const fragLoadedCallback = (event, data) => {
          if (data.frag.start >= targetTime - 0.1) {
            hls.off(window.Hls.Events.FRAG_LOADED, fragLoadedCallback);
            this.video.currentTime = targetTime;
          }
        };

        const seekingCallback = () => {
          this.video.removeEventListener("seeking", seekingCallback);
          this.video.addEventListener("canplay", canPlayCallback, {
            once: true,
          });
        };

        const canPlayCallback = () => {
          // Clear loading states
          if (seekLoadingTimeout) {
            clearTimeout(seekLoadingTimeout);
          }
          this.setLoadingState("seeking", false);
          this.setLoadingState("fragment", false);

          // Remove the event listener
          this.video.removeEventListener("canplay", canPlayCallback);
        };

        this.video.addEventListener("seeking", seekingCallback, { once: true });
        hls.on(window.Hls.Events.FRAG_LOADED, fragLoadedCallback);

        // Start loading from the target fragment
        hls.loadFragment(targetFragment);
      } else {
        // No fragment found, clear loading state
        if (seekLoadingTimeout) {
          clearTimeout(seekLoadingTimeout);
        }
        this.setLoadingState("seeking", false);
      }
    };

    // Update seek handling in event listeners
    const handleSeek = (e) => {
      const rect = this.container
        .querySelector(".progress-bar")
        .getBoundingClientRect();
      const pos = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width)
      );
      const seekTime = pos * this.video.duration;

      // Update UI immediately
      const progress = this.container.querySelector(".progress");
      progress.style.width = `${pos * 100}%`;
      this.container.querySelector(
        ".time-display"
      ).textContent = `${this.formatTime(seekTime)} / ${this.formatTime(
        this.video.duration
      )}`;

      // Debounce the actual seek operation
      clearTimeout(seekTimer);
      lastSeekTarget = seekTime;

      seekTimer = setTimeout(() => {
        if (Math.abs(this.video.currentTime - lastSeekTarget) > 0.5) {
          seekToPosition(lastSeekTarget);
        }
      }, 50);
    };

    // Update existing event listeners
    const progressBar = this.container.querySelector(".progress-bar");
    let isMouseDown = false;

    progressBar.addEventListener("mousedown", (e) => {
      isMouseDown = true;
      this.container.classList.add("is-seeking");
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
        this.container.classList.remove("is-seeking");
      }
    });
  }

  updateQualityLevels(hls) {
    const qualityMenu = this.container.querySelector(".quality-menu");
    const levels = hls.levels;
    const currentLevel = hls.currentLevel;

    // Clear existing menu items
    qualityMenu.innerHTML = "";

    // Add Auto quality option
    const autoItem = document.createElement("div");
    autoItem.className =
      "quality-menu-item" + (currentLevel === -1 ? " active" : "");
    autoItem.innerHTML = this.createCheckIcon() + "<span>Auto</span>";
    autoItem.addEventListener("click", () => this.setQuality(hls, -1));
    qualityMenu.appendChild(autoItem);

    // Add available qualities
    levels.forEach((level, index) => {
      const quality = this.formatQuality(level.height);
      const item = document.createElement("div");
      item.className =
        "quality-menu-item" + (currentLevel === index ? " active" : "");
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
    this.container
      .querySelector(".quality-container")
      .classList.remove("active");
  }

  updateActiveQuality(hls, levelIndex) {
    const items = this.container.querySelectorAll(".quality-menu-item");
    items.forEach((item, index) => {
      item.classList.toggle(
        "active",
        index === 0 ? levelIndex === -1 : index - 1 === levelIndex
      );
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
    this.video.play().catch((e) => {
      console.error("Error playing segment:", e);
      // Try to auto-recover by moving to next segment
      this.currentSegmentIndex++;
      this.loadNextSegment();
    });
  }

  seek(seconds) {
    const newTime = this.video.currentTime + seconds;
    this.video.currentTime = Math.max(
      0,
      Math.min(newTime, this.video.duration)
    );
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
