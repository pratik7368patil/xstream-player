class XStreamPlayer {
  constructor(url) {
    if (!url) {
      throw new Error("URL is required");
    }
    this.url = url;
    this.init();
  }

  init() {
    try {
      // Create video element
      const video = document.createElement("video");
      video.controls = true;
      video.style.width = "100%";
      video.style.maxWidth = "800px";

      // Add video to DOM
      const appDiv = document.getElementById("app");
      appDiv.innerHTML = ""; // Clear the "Hello" text
      appDiv.appendChild(video);

      // Check if HLS is supported in the browser
      if (window.Hls.isSupported()) {
        // Create Hls instance
        const hls = new window.Hls({
          debug: true, // Enable debug logs
          enableWorker: true,
        });

        // Bind hls to video element
        hls.loadSource(this.url);
        hls.attachMedia(video);

        // Add event listeners
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          console.log("Manifest loaded, beginning playback");
          //video.play().catch(e => console.error("Error playing video:", e));
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
                break;
            }
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // For Safari on iOS/macOS, which has built-in HLS support
        video.src = this.url;
        video.addEventListener("loadedmetadata", () => {
          video.play().catch((e) => console.error("Error playing video:", e));
        });
      } else {
        console.error("HLS is not supported in this browser");
      }
    } catch (error) {
      console.error("Error initializing player:", error);
    }
  }
}

// Initialize the player with a test HLS stream
new XStreamPlayer("https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8");
