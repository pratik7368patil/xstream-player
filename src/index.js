import M3U8 from "./M3U8.js";

async function getVideoData(url) {
  const res = await fetch(url);
  return await res.text();
}

class XStreamPlayer {
  constructor(url) {
    if (!url) return null;
    this.m3u8Master = "";
    this.fetchMasterData(url);
    this.parseM3u8Master();
  }

  async fetchMasterData(url) {
    this.m3u8Master = await getVideoData(url);
    console.log(this.m3u8Master);
  }

  parseM3u8Master() {
    const parsedData = M3U8.parse(this.m3u8Master);
    console.log(parsedData);
  }
}

new XStreamPlayer(
  "http://playertest.longtailvideo.com/adaptive/wowzaid3/playlist.m3u8"
);
