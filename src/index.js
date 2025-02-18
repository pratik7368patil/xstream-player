import { Controls } from "./controls/Controls.js";
import { IconManager } from "./icons/IconManager.js";
import { LoadingManager } from "./player/LoadingManager.js";
import { HLSManager } from "./player/HLSManager.js";
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
    
    // Initialize managers
    this.iconManager = new IconManager();
    this.init();
  }

  async init() {
    try {
      // Load icons first
      const icons = await this.iconManager.loadIcons();

      // Create player container and insert HTML structure
      const playerWrapper = document.createElement("div");
      playerWrapper.className = "xstream-player-wrapper";
      
      this.container = document.createElement("div");
      this.container.className = "xstream-player";
      
      const playerTemplate = `
        <div class="video-container">
          <div class="loading-spinner">${icons.spinner || ""}</div>
          <video></video>
        </div>
      `;
      
      this.container.innerHTML = playerTemplate;

      // Get reference to video element and video container
      this.video = this.container.querySelector("video");
      const videoContainer = this.container.querySelector(".video-container");
      
      // Initialize managers
      this.loadingManager = new LoadingManager(this.container, this.video);
      this.controls = new Controls(this.container, this.video, icons);
      
      // Append controls
      videoContainer.appendChild(this.controls.element);
      
      this.video.controls = false; // Disable default controls

      // Add container to DOM
      playerWrapper.appendChild(this.container);
      const appDiv = document.getElementById("app");
      appDiv.innerHTML = "";
      appDiv.appendChild(playerWrapper);

      // Setup event listeners
      this.setupEventListeners();
      
      // Initialize HLS if supported
      if (window.Hls.isSupported()) {
        this.hlsManager = new HLSManager(this.video, this.loadingManager);
        
        // Setup quality change handler
        this.controls.onQualityChange = (levelIndex) => {
          this.hlsManager.setQuality(levelIndex);
        };
        
        // Setup quality levels update handler
        this.hlsManager.onQualityLevelsUpdated = (qualityData) => {
          this.controls.updateQualityLevels(qualityData);
        };
        
        this.hlsManager.init(this.url);
      } else {
        this.initWithCustomM3U8();
      }
    } catch (error) {
      console.error("Error initializing player:", error);
    }
  }

  setupEventListeners() {
    // Setup loading events
    this.loadingManager.setupLoadingEvents();
    
    // Setup controls visibility
    this.controls.setupControlsVisibility();
    
    // Video events
    this.video.addEventListener("timeupdate", () => {
      if (!this.container.classList.contains("is-seeking")) {
        this.controls.updateProgress(this.video.currentTime, this.video.duration);
      }
    });

    this.video.addEventListener("progress", () => {
      if (this.video.buffered.length > 0) {
        const bufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
        this.controls.updateBuffered(bufferedEnd, this.video.duration);
      }
    });

    // Play/Pause events
    const playButton = this.container.querySelector(".play-pause");
    playButton.addEventListener("click", () => this.togglePlay());
    this.video.addEventListener("click", () => this.togglePlay());

    // Volume events
    const volumeButton = this.container.querySelector(".volume");
    const volumeSlider = this.container.querySelector(".volume-slider");
    
    volumeButton.addEventListener("click", () => this.toggleMute());
    volumeSlider.addEventListener("click", (e) => {
      const rect = volumeSlider.getBoundingClientRect();
      const volume = (e.clientX - rect.left) / rect.width;
      this.setVolume(volume);
    });

    // Fullscreen events
    const fullscreenButton = this.container.querySelector(".fullscreen");
    fullscreenButton.addEventListener("click", () => this.toggleFullscreen());

    // Progress bar events
    const progressBar = this.container.querySelector(".progress-bar");
    let isMouseDown = false;
    let seekDebounceTimeout;

    progressBar.addEventListener("mousedown", (e) => {
      isMouseDown = true;
      this.container.classList.add("is-seeking");
      this.handleSeek(e);
    });

    document.addEventListener("mousemove", (e) => {
      if (isMouseDown) {
        this.handleSeek(e);
      }
    });

    document.addEventListener("mouseup", () => {
      if (isMouseDown) {
        isMouseDown = false;
        this.container.classList.remove("is-seeking");
      }
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => this.handleKeyboardShortcuts(e));
  }

  handleSeek(e) {
    const progressBar = this.container.querySelector(".progress-bar");
    const rect = progressBar.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTime = pos * this.video.duration;

    this.controls.updateProgress(seekTime, this.video.duration);
    this.video.currentTime = seekTime;
  }

  handleKeyboardShortcuts(e) {
    const isPlayerFocused = e.target === document.body || this.container.contains(e.target);
    if (!isPlayerFocused) return;

    switch (e.key.toLowerCase()) {
      case " ":
      case "k":
        e.preventDefault();
        this.togglePlay();
        break;
      case "m":
        e.preventDefault();
        this.toggleMute();
        break;
      case "f":
        e.preventDefault();
        this.toggleFullscreen();
        break;
      case "arrowleft":
        e.preventDefault();
        this.seek(-5);
        break;
      case "arrowright":
        e.preventDefault();
        this.seek(5);
        break;
      case "arrowup":
        e.preventDefault();
        this.adjustVolume(0.1);
        break;
      case "arrowdown":
        e.preventDefault();
        this.adjustVolume(-0.1);
        break;
    }
  }

  togglePlay() {
    if (this.video.paused) {
      this.video.play();
    } else {
      this.video.pause();
    }
    this.isPlaying = !this.video.paused;
    this.controls.updatePlayState(this.isPlaying);
  }

  toggleMute() {
    this.video.muted = !this.video.muted;
    const volumeButton = this.container.querySelector(".volume");
    volumeButton.innerHTML = this.video.muted
      ? this.iconManager.getIcon("mute")
      : this.iconManager.getIcon("volume");
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

  seek(seconds) {
    const newTime = this.video.currentTime + seconds;
    this.video.currentTime = Math.max(0, Math.min(newTime, this.video.duration));
  }

  adjustVolume(delta) {
    this.setVolume(this.volume + delta);
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

  destroy() {
    if (this.hlsManager) {
      this.hlsManager.destroy();
    }
    // Clean up any other resources
  }
}

// Initialize the player with a test HLS stream
new XStreamPlayer("https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8");
