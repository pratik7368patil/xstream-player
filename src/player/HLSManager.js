export class HLSManager {
  constructor(video, loadingManager) {
    this.video = video;
    this.loadingManager = loadingManager;
    this.hls = null;
    this.onQualityLevelsUpdated = null;
  }

  init(url) {
    if (!window.Hls.isSupported()) {
      throw new Error("HLS is not supported in this browser");
    }

    // Initialize HLS
    this.hls = new window.Hls({
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      // Optimize network settings
      maxLoadingDelay: 4,
      manifestLoadingMaxRetry: 4,
      manifestLoadingRetryDelay: 500,
      manifestLoadingMaxRetryTimeout: 64000,
      levelLoadingTimeOut: 10000,
      fragLoadingTimeOut: 20000,
      // Optimize recovery behavior
      enableWorker: true,
      startLevel: -1,
      // Optimize error handling
      debug: false,
      // Retry options
      fragLoadingMaxRetry: 6,
      levelLoadingMaxRetry: 4,
      // Recovery options
      recovery: {
        maxRetry: 3,
        retryDelay: 500,
        maxRetryDelay: 2000,
        backoff: "exponential",
      },
      // Optimize buffer management
      backBufferLength: 30,
    });

    this.setupHLSEvents();
    this.hls.loadSource(url);
    this.hls.attachMedia(this.video);
  }

  setupHLSEvents() {
    let fragLoadingTimeout;

    // Handle HLS events for optimized loading
    this.hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
      console.log(
        "Manifest loaded, found " + this.hls.levels.length + " quality level(s)"
      );
      if (this.onQualityLevelsUpdated) {
        this.onQualityLevelsUpdated(this.getQualityLevels());
      }
    });

    // Handle level switching
    this.hls.on(window.Hls.Events.LEVEL_SWITCHED, (event, data) => {
      if (this.onQualityLevelsUpdated) {
        this.onQualityLevelsUpdated(this.getQualityLevels());
      }
    });

    // Loading states for fragments
    this.hls.on(window.Hls.Events.FRAG_LOADING, (event, data) => {
      // Clear any existing timeout
      if (fragLoadingTimeout) {
        clearTimeout(fragLoadingTimeout);
      }

      // Only show loading state if fragment takes more than 150ms to load
      fragLoadingTimeout = setTimeout(() => {
        this.loadingManager.setLoadingState("fragment", true);
      }, 150);

      console.log("Loading fragment at position:", data.frag.start);
    });

    this.hls.on(window.Hls.Events.FRAG_LOADED, (event, data) => {
      if (fragLoadingTimeout) {
        clearTimeout(fragLoadingTimeout);
      }

      this.loadingManager.setLoadingState("fragment", false);
      console.log("Loaded fragment at position:", data.frag.start);
    });

    // Error handling
    this.hls.on(window.Hls.Events.ERROR, (event, data) => {
      this.loadingManager.setLoadingState("hlsError", true);
      console.error("HLS error:", data);
      if (data.fatal) {
        switch (data.type) {
          case window.Hls.ErrorTypes.NETWORK_ERROR:
            console.log("Fatal network error encountered, trying to recover...");
            this.hls.startLoad();
            break;
          case window.Hls.ErrorTypes.MEDIA_ERROR:
            console.log("Fatal media error encountered, trying to recover...");
            this.hls.recoverMediaError();
            break;
          default:
            console.log("Fatal error, cannot recover");
            this.hls.destroy();
            break;
        }
      } else {
        // Non-fatal error, remove loading state after a delay
        setTimeout(() => {
          this.loadingManager.setLoadingState("hlsError", false);
        }, 2000);
      }
    });
  }

  getQualityLevels() {
    if (!this.hls) return [];

    const levels = this.hls.levels.map((level, index) => ({
      index,
      height: level.height,
      width: level.width,
      bitrate: level.bitrate,
      name: level.height + 'p'
    }));

    return {
      levels,
      currentLevel: this.hls.currentLevel,
      autoMode: this.hls.currentLevel === -1
    };
  }

  setQuality(levelIndex) {
    if (!this.hls) return;
    this.hls.currentLevel = levelIndex;
  }

  destroy() {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
  }
}
