"use strict";

// M3U8 Parser class for handling HLS playlists
class M3U8 {
  static load(url, readyCallback, errorCallback, options = {}) {
    fetch(url)
      .then((response) => response.text())
      .then((text) => {
        const m3u8 = M3U8.parse(text, url);
        readyCallback(m3u8, url);
      })
      .catch((error) => {
        if (errorCallback) {
          errorCallback(error, url);
        }
      });
  }

  static parse(m3u8Text, url) {
    if (!m3u8Text) {
      throw new Error("Empty M3U8 content");
    }

    const lines = m3u8Text.split(/\r?\n/);
    if (lines[0].trim() !== "#EXTM3U") {
      throw new Error("Invalid M3U8 format: Missing #EXTM3U header");
    }

    // Determine if this is a master playlist or media playlist
    const isMasterPlaylist = lines.some((line) =>
      line.startsWith("#EXT-X-STREAM-INF")
    );

    return isMasterPlaylist
      ? this._parseMasterPlaylist(lines, url)
      : this._parseMediaPlaylist(lines, url);
  }

  static _parseMasterPlaylist(lines, url) {
    const playlist = {
      url,
      type: "MASTER",
      version: 3,
      streams: [],
    };

    let currentStreamInfo = null;

    lines.forEach((line) => {
      line = line.trim();

      if (line.startsWith("#EXT-X-VERSION:")) {
        playlist.version = parseInt(line.split(":")[1]);
      } else if (line.startsWith("#EXT-X-STREAM-INF:")) {
        currentStreamInfo = this._parseMasterStreamInfo(line);
      } else if (line && !line.startsWith("#") && currentStreamInfo) {
        currentStreamInfo.url = this._toAbsoluteURL(line, url);
        playlist.streams.push(currentStreamInfo);
        currentStreamInfo = null;
      }
    });

    return playlist;
  }

  static _parseMediaPlaylist(lines, url) {
    const playlist = {
      url,
      type: "MEDIA",
      version: 3,
      targetDuration: 0,
      mediaSequence: 0,
      segments: [],
      endList: false,
    };

    let currentSegment = null;

    lines.forEach((line) => {
      line = line.trim();

      if (line.startsWith("#EXT-X-VERSION:")) {
        playlist.version = parseInt(line.split(":")[1]);
      } else if (line.startsWith("#EXT-X-TARGETDURATION:")) {
        playlist.targetDuration = parseFloat(line.split(":")[1]);
      } else if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
        playlist.mediaSequence = parseInt(line.split(":")[1]);
      } else if (line.startsWith("#EXTINF:")) {
        const duration = parseFloat(line.split(":")[1].split(",")[0]);
        currentSegment = { duration };
      } else if (line.startsWith("#EXT-X-ENDLIST")) {
        playlist.endList = true;
      } else if (line && !line.startsWith("#") && currentSegment) {
        currentSegment.url = this._toAbsoluteURL(line, url);
        playlist.segments.push(currentSegment);
        currentSegment = null;
      }
    });

    return playlist;
  }

  static _parseMasterStreamInfo(infoLine) {
    const info = {};
    const attributes = infoLine.substring(18).split(",");

    attributes.forEach((attr) => {
      const [key, value] = attr.split("=");
      if (key === "BANDWIDTH") {
        info.bandwidth = parseInt(value);
      } else if (key === "RESOLUTION") {
        info.resolution = value.replace(/"/g, "");
      } else if (key === "CODECS") {
        info.codecs = value.replace(/"/g, "");
      }
    });

    return info;
  }

  static _toAbsoluteURL(url, baseURL) {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    const base = new URL(baseURL);
    return new URL(url, base).toString();
  }
}

export default M3U8;
