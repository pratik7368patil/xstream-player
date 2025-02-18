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

    // Initialize HLS with Firefox-friendly configuration
    this.hls = new window.Hls({
      // Reduce initial buffer size for faster startup
      maxBufferSize: 30 * 1000 * 1000, // 30MB
      maxBufferLength: 15,
      maxMaxBufferLength: 30,
      
      // Optimize for Firefox
      enableSoftwareAES: true, // Use software AES decryption
      enableWorker: true,
      
      // More aggressive error recovery
      manifestLoadingMaxRetry: 6,
      manifestLoadingRetryDelay: 500,
      manifestLoadingMaxRetryTimeout: 30000,
      
      // Fragment loading settings
      fragLoadingMaxRetry: 6,
      fragLoadingRetryDelay: 500,
      fragLoadingMaxRetryTimeout: 30000,
      
      // Start with lower quality for better initial playback
      startLevel: 0,
      abrEwmaDefaultEstimate: 500000, // 500kbps
      
      // More conservative ABR
      abrBandWidthFactor: 0.8,
      abrBandWidthUpFactor: 0.7,
      
      // Disable experimental features
      lowLatencyMode: false,
      
      debug: false
    });

    this.setupHLSEvents();
    
    // Attempt to load source with error handling
    try {
      this.hls.loadSource(url);
      this.hls.attachMedia(this.video);
    } catch (error) {
      console.error("Error loading HLS stream:", error);
      this.handleFallback(url);
    }
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
      
      // Start playback
      this.video.play().catch(error => {
        console.warn("Auto-play failed:", error);
      });
    });

    // Handle level switching
    this.hls.on(window.Hls.Events.LEVEL_SWITCHED, (event, data) => {
      if (this.onQualityLevelsUpdated) {
        this.onQualityLevelsUpdated(this.getQualityLevels());
      }
    });

    // Loading states for fragments
    this.hls.on(window.Hls.Events.FRAG_LOADING, (event, data) => {
      if (fragLoadingTimeout) {
        clearTimeout(fragLoadingTimeout);
      }

      fragLoadingTimeout = setTimeout(() => {
        this.loadingManager.setLoadingState("fragment", true);
      }, 150);
    });

    this.hls.on(window.Hls.Events.FRAG_LOADED, (event, data) => {
      if (fragLoadingTimeout) {
        clearTimeout(fragLoadingTimeout);
      }
      this.loadingManager.setLoadingState("fragment", false);
    });

    // Enhanced error handling
    this.hls.on(window.Hls.Events.ERROR, (event, data) => {
      this.loadingManager.setLoadingState("hlsError", true);
      console.warn("HLS error:", data);
      
      if (data.fatal) {
        switch (data.type) {
          case window.Hls.ErrorTypes.NETWORK_ERROR:
            console.log("Network error, attempting recovery...");
            this.hls.startLoad();
            break;
            
          case window.Hls.ErrorTypes.MEDIA_ERROR:
            console.log("Media error, attempting recovery...");
            this.handleMediaError();
            break;
            
          default:
            console.log("Fatal error, switching to fallback...");
            this.handleFallback(this.hls.url);
            break;
        }
      } else {
        // Non-fatal error handling
        setTimeout(() => {
          this.loadingManager.setLoadingState("hlsError", false);
        }, 2000);
      }
    });
  }

  handleMediaError() {
    let recoverDecodingErrorDate = null;
    let recoverSwapAudioCodecDate = null;
    
    if(!recoverDecodingErrorDate || (Date.now() - recoverDecodingErrorDate) > 3000) {
      recoverDecodingErrorDate = Date.now();
      console.log("Trying to recover from media error...");
      this.hls.recoverMediaError();
    } else if(!recoverSwapAudioCodecDate || (Date.now() - recoverSwapAudioCodecDate) > 3000) {
      recoverSwapAudioCodecDate = Date.now();
      console.log("Trying to swap audio codec and recover...");
      this.hls.swapAudioCodec();
      this.hls.recoverMediaError();
    } else {
      console.log("Cannot recover from media error");
      this.handleFallback(this.hls.url);
    }
  }

  handleFallback(url) {
    console.log("Switching to native video playback...");
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    
    // Try native HLS playback
    this.video.src = url;
    this.video.addEventListener('error', (e) => {
      console.error("Native playback failed:", e);
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
