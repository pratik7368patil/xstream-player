export class LoadingManager {
  constructor(container, video) {
    this.container = container;
    this.video = video;
    this.loadingStates = new Set();
    this.loadingTimeout = null;
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

  setupLoadingEvents() {
    this.video.addEventListener("loadstart", () => {
      this.setLoadingState("initial", true);
    });

    this.video.addEventListener("waiting", () => {
      this.setLoadingState("buffering", true);
    });

    this.video.addEventListener("playing", () => {
      this.setLoadingState("buffering", false);
      this.setLoadingState("initial", false);
    });

    this.video.addEventListener("canplay", () => {
      this.setLoadingState("initial", false);
      this.setLoadingState("buffering", false);
    });

    this.video.addEventListener("seeking", () => {
      this.setLoadingState("seeking", true);
      this.container.classList.add("is-seeking");
    });

    this.video.addEventListener("seeked", () => {
      this.setLoadingState("seeking", false);
      this.container.classList.remove("is-seeking");
    });

    this.video.addEventListener("stalled", () => {
      if (!this.video.paused) {
        this.setLoadingState("buffering", true);
      }
    });

    this.video.addEventListener("error", () => {
      this.setLoadingState("error", true);
      console.error("Video error:", this.video.error);
    });
  }
}
