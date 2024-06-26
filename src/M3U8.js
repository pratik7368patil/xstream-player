(function moduleExporter(name, closure) {
  "use strict";

  var entity = GLOBAL["WebModule"]["exports"](name, closure);

  if (typeof module !== "undefined") {
    module["exports"] = entity;
  }
  return entity;
})("M3U8", function moduleClosure(global, WebModule, VERIFY /*, VERBOSE */) {
  "use strict";

  // --- data struct / technical terms -----------------------
  /*

# Master playlist

- MasterPlaylistObject: { url, type, version, streams }
    - url:              MasterPlaylistURLString
    - type:             String - "MASTER"
    - version:          UINT8 - "#EXT-X-VERSION:<number>"
    - streams:          MasterStreamObjectArray
- MasterStreamObjectArray: [MasterStreamObject, ...]
- MasterStreamObject: { url, info, codecs, bandwidth, resolution, video, audio }
    - url:              URLString
    - info:             EXTStreamInfoString,
    - codecs:           String
    - bandwidth:        UINT32
    - resolution:       String - "432x768"
    - video:            Object: { codec, profile, profileID, level }
        - codec:        String - "AVC", ""
        - profile:      String - "Base", "Main", "High"
        - profileID:    UINT16 - 66, 77, 100
        - level:        String - "1.3" ... "3.0" ... "5.1", ""
    - audio:            Object: { codec, profile, objectType }
        - codec:        String - "AAC", "MP3", ""
        - profile:      String - "AAC-LC", "HE-AAC", "HE-AAC v2", "MP3", ""
        - objectType:   AudioObjectType - 2(AAC-LC), 5(HE-AAC), 29(HE-AAC v2), 34(MP3) 0

# Media playlist

- MediaPlaylistObject: { url, type, version, allowCache, mediaSequence, mediaSegments, targetDuration, totalDurations }
    - url:              MediaPlaylistURLString
    - type:             MediaPlaylistTypeString - "VOD" or "LIVE" or "NRTLIVE"
    - version:          UINT8 - "#EXT-X-VERSION:<number = 3>"
    - allowCache:       Boolean - "#EXT-X-ALLOW-CACHE:<YES OR NO = NO>"
    - mediaSequence:    UINT32 - "#EXT-X-MEDIA-SEQUENCE:<number = 0>"
    - mediaSegments:    MediaSegmentObjectArray
    - targetDuration:   UINT32 - "#EXT-X-TARGETDURATION:<number>" (msec value)
    - totalDurations:   UINT32 - sum of the segment durations (VOD only)
- MediaSegmentObjectArray: [MediaSegmentObject, ...]
- MediaSegmentObject: { tsID, tsURL, tsDuration, tsRange, tsTitle }
    - tsID:             UINT32
    - tsURL:            URLString
    - tsDuration:       UINT32 - #EXTINF:<duration>
    - tsRange:          Object - { startTime: UINT32, endTime: UINT32 }
    - tsTitle:          String - #EXTINF:<duration>,[<title>]

# Spec

- DRAFT https://tools.ietf.org/html/draft-pantos-http-live-streaming-20

- HLS CODECS
    - https://developer.apple.com/library/ios/documentation/NetworkingInternet/Conceptual/StreamingMediaGuide/FrequentlyAskedQuestions/FrequentlyAskedQuestions.html

- `#EXT-TARGETDURATION:<number>` は最大セグメント時間を示しており、各セグメントのduration(`#EXTINF:<durtaion>`) は最大セグメント時間を超えてはならない(MUST)
    - サーバ上の Media playlist は `#EXT-TARGETDURATION` の0.5〜1.5倍の時間の間はサーバ側で存在が補償されている必要がある
    - このことから playlist の再取得間隔は `#EXT-TARGETDURATION` を指標とすることが可能である
- サーバーがプレゼンテーション全体を削除したい場合は、再生リストファイルがもはや利用できないことをクライアントに明示すべきである(例えば 404 or 410応答)
- `#EXT-X-MEDIA-SEQUENCE:<number>` はLive playlist において常にインクリメントされていく必要がある
- tsRange.startTime は累積的な再生開始位置
- tsRange.endTime は tsRange.startTime + tsDuration から得られる累積的な再生終了位置
- NRTLIVE は near-real-time live の略, #EXT-TARGETDURATION が2以下なら NRTLIVE になる


 */

  // --- dependency modules ----------------------------------
  var URI = WebModule["URI"];
  var Task = WebModule["Task"];
  var FileLoader = WebModule["FileLoader"];
  var AACProfile = WebModule["AACProfile"];
  var H264Profile = WebModule["H264Profile"];
  // --- import / local extract functions --------------------
  // --- define / local variables ----------------------------
  // --- class / interfaces ----------------------------------
  var M3U8 = {
    load: M3U8_load, // M3U8.load(url:PlaylistURLString, readyCallback:Function, errorCallback:Function = null, options:Object = null):void
    trim: M3U8_trim, // M3U8.trim(playlist:MediaPlaylistObject, options:Object = null):MediaPlaylistObject
    parse: M3U8_parse, // M3U8.parse(m3u8:M3U8FormatString, url:PlaylistURLString = ""):MasterPlaylistObject|MediaPlaylistObject|null
    build: M3U8_build, // M3U8.build(playlist:MasterPlaylistObject|MediaPlaylistObject):M3U8FormatString
    defaultFilter: M3U8_defaultFilter, // M3U8.defaultFilter(masterStreams:MasterStreamObjectArray, videoCanPlay:RegExp = /Base/, audioCanPlay:RegExp = /AAC/):UINT8 - stream-index or 255
    baselineFilter: M3U8_baselineFilter, // M3U8.baselineFilter(masterStreams:MasterStreamObjectArray):UINT8 - stream-index or 255
    collectPlaylist: M3U8_collectPlaylist, // M3U8.collectPlaylist(url:PlaylistURLString, readyCallback:Function, errorCallback:Function = null, options:Object = null):void
    loadMediaPlaylist: M3U8_loadMediaPlaylist, // M3U8.loadMediaPlaylist(url:PlaylistURLString, readyCallback:Function, errorCallback:Function = null, streamFilterCallback:Function = M3U8.baselineFilter, options:Object = null):void
    repository: "https://github.com/uupaa/M3U8.js",
  };

  // --- implements ------------------------------------------
  function M3U8_load(
    url, // @arg URLString - MasterPlaylist or MediaPlaylist
    readyCallback, // @arg Function - readyCallback(m3u8:M3U8FormatString, url:URLString):void
    errorCallback, // @arg Function = null - errorCallback(error:Error, url:URLString, code:HTTPStatusCodeUINT16):void
    options
  ) {
    // @arg Object = null - { timeout:UINT32 }
    //{@dev
    if (VERIFY) {
      $valid($type(url, "URLString"), M3U8_load, "url");
      $valid($type(readyCallback, "Function"), M3U8_load, "readyCallback");
      $valid($type(errorCallback, "Function|omit"), M3U8_load, "errorCallback");
      $valid($type(options, "Object|omit"), M3U8_load, "options");
      if (options) {
        $valid($keys(options, "timeout"), M3U8_load, "options");
      }
    }
    //}@dev

    FileLoader["loadString"](url, readyCallback, errorCallback, options);
  }

  function M3U8_collectPlaylist(
    url, // @arg URLString - MasterPlaylist or MediaPlaylist
    readyCallback, // @arg Function - readyCallback(mediaPlaylists:MediaPlaylistArray, masterPlaylists:MasterPlaylistArray):void
    errorCallback, // @arg Function = null - errorCallback(error:Error, url:URLString, code:HTTPStatusCodeUINT16):void
    options
  ) {
    // @arg Object = null - { timeout:UINT32 }
    //{@dev
    if (VERIFY) {
      $valid($type(url, "URLString"), M3U8_collectPlaylist, "url");
      $valid(
        $type(readyCallback, "Function"),
        M3U8_collectPlaylist,
        "readyCallback"
      );
      $valid(
        $type(errorCallback, "Function|omit"),
        M3U8_collectPlaylist,
        "errorCallback"
      );
      $valid($type(options, "Object|omit"), M3U8_collectPlaylist, "options");
      if (options) {
        $valid($keys(options, "timeout"), M3U8_collectPlaylist, "options");
      }
    }
    //}@dev

    errorCallback =
      errorCallback ||
      function (error, url, code) {
        console.error(error.message, url, code);
      };

    var mediaPlaylists = []; // [MediaPlaylist, ...]
    var masterPlaylists = []; // [MediaPlaylist, ...]
    var task = new Task("M3U8_collectPlaylist::1", 1, function (error, buffer) {
      if (error) {
        errorCallback(error, url, 400);
      } else {
        readyCallback(mediaPlaylists, masterPlaylists);
      }
    });
    var donefn = task["donefn"];

    M3U8["load"](
      url,
      function (m3u8, m3u8URL) {
        var playlist = M3U8["parse"](m3u8, m3u8URL); // MasterPlaylistObject|MediaPlaylistObject

        switch (playlist["type"]) {
          case "MASTER":
            _parseMasterPlaylist(playlist);
            break;
          case "NRTLIVE":
          case "LIVE":
          case "VOD":
            mediaPlaylists.push(playlist);
            donefn();
        }
      },
      donefn,
      options
    );

    function _parseMasterPlaylist(masterPlaylist) {
      masterPlaylists.push(masterPlaylist);
      var length = masterPlaylist["streams"].length;
      if (length) {
        var task2 = new Task("M3U8_collectPlaylist::2", length, task);
        var donefn2 = task2["donefn"];

        masterPlaylist["streams"].forEach(function (stream, index) {
          M3U8["load"](
            stream["url"],
            function (m3u8, m3u8URL) {
              mediaPlaylists.push(M3U8["parse"](m3u8, m3u8URL)); // MediaPlaylist
              donefn2();
            },
            donefn2,
            options
          );
        });
      } else {
        donefn(new Error("Broken MasterPlaylist"));
      }
    }
  }

  function M3U8_loadMediaPlaylist(
    url, // @arg URLString - MasterPlaylist or MediaPlaylist
    readyCallback, // @arg Function - readyCallback(m3u8:M3U8FormatString, url:URLString, mediaPlaylist:MediaPlaylistObject):void
    errorCallback, // @arg Function = null - errorCallback(error:Error, url:URLString, code:HTTPStatusCodeUINT16):void
    streamFilterCallback, // @arg Function = M3U8.baselineFilter - streamFilterCallback(streams:MasterStreamObjectArray):UINT8
    options
  ) {
    // @arg Object = null - { timeout:UINT32 }
    //{@dev
    if (VERIFY) {
      $valid($type(url, "URLString"), M3U8_loadMediaPlaylist, "url");
      $valid(
        $type(readyCallback, "Function"),
        M3U8_loadMediaPlaylist,
        "readyCallback"
      );
      $valid(
        $type(errorCallback, "Function|omit"),
        M3U8_loadMediaPlaylist,
        "errorCallback"
      );
      $valid(
        $type(streamFilterCallback, "Function|omit"),
        M3U8_loadMediaPlaylist,
        "streamFilterCallback"
      );
      $valid($type(options, "Object|omit"), M3U8_loadMediaPlaylist, "options");
      if (options) {
        $valid($keys(options, "timeout"), M3U8_loadMediaPlaylist, "options");
      }
    }
    //}@dev

    errorCallback =
      errorCallback ||
      function (error, url, code) {
        console.error(error.message, url, code);
      };
    streamFilterCallback = streamFilterCallback || M3U8_baselineFilter;

    M3U8_load(
      url,
      function (m3u8, m3u8URL) {
        var playlist = M3U8_parse(m3u8, m3u8URL); // MasterPlaylistObject|MediaPlaylistObject

        switch (playlist["type"]) {
          case "MASTER":
            _parseMasterPlaylist(
              playlist["streams"],
              streamFilterCallback(playlist["streams"]),
              m3u8URL
            );
            break;
          case "NRTLIVE":
          case "LIVE":
          case "VOD":
            readyCallback(m3u8, m3u8URL, playlist);
        }
      },
      errorCallback,
      options
    );

    function _parseMasterPlaylist(streams, streamIndex, m3u8URL) {
      if (
        streams.length &&
        streams[streamIndex] &&
        streams[streamIndex]["url"]
      ) {
        M3U8_load(
          streams[streamIndex]["url"],
          function (m3u8, m3u8URL) {
            readyCallback(m3u8, m3u8URL, M3U8_parse(m3u8, m3u8URL));
          },
          errorCallback,
          options
        );
      } else {
        var error = new Error(
          "Sorry, There is no playable stream: " + _toString(streams)
        );
        error["detail"] = { url: m3u8URL, code: 404 };
        errorCallback(error, m3u8URL, 404);
      }
    }
  }

  function _toString(streams) {
    // @arg MasterStreamObjectArray
    var result = [];

    for (var i = 0, iz = streams.length; i < iz; ++i) {
      var stream = streams[i];

      result.push({
        video: {
          codec: stream["video"]["codec"],
          profile: stream["video"]["profile"],
          profileID: stream["video"]["profileID"],
          level: stream["video"]["level"],
        },
        audio: {
          codec: stream["audio"]["codec"],
          profile: stream["audio"]["profile"],
        },
      });
    }
    return JSON.stringify(result);
  }

  function M3U8_trim(
    playlist, // @arg MediaPlaylistObject
    options
  ) {
    // @arg Object = null - { startTime, maxLength }
    // @options.startTime UINT32 = 0
    // @options.maxLength UINT8 = 0
    // @ret MediaPlaylistObject
    options = options || {};
    return _trimMediaSegments(
      playlist,
      options["startTime"] || 0,
      options["maxLength"] || 0
    );
  }

  function M3U8_parse(
    m3u8, // @arg M3U8FormatString - M3U8 format string
    url
  ) {
    // @arg PlaylistURLString = ""
    // @ret MasterPlaylistObject|MediaPlaylistObject|null
    //{@dev
    if (VERIFY) {
      $valid($type(m3u8, "String"), M3U8_parse, "m3u8");
      $valid($type(url, "URLString|omit"), M3U8_parse, "url");
    }
    //}@dev

    url = url || "";

    var isMasterPlaylist = m3u8.indexOf("#EXT-X-STREAM-INF") >= 0;
    var lines = m3u8
      .trim()
      .replace(/(\r\n|\r|\n)+/g, "\n")
      .split("\n"); // line break normalize

    if (lines[0].trim() === "#EXTM3U") {
      return isMasterPlaylist
        ? _parseMasterPlaylist(lines, url) // { url, type, version, streams }
        : _parseMediaPlaylist(lines, url); // { url, type, version, mediaSegments, ... }
    }
    return null; // invalid playlist
  }

  function _parseMasterPlaylist(
    lines, // @arg LineStringArray - ["#EXTM3U", "#EXT-X-VERSION:3", ...]
    url
  ) {
    // @arg MasterPlaylistURLString
    // @ret MasterPlaylistObject
    var masterPlaylistObject = {
      url: url, // MasterPlaylistURL
      type: "MASTER", // MasterPlaylist type. "MASTER"
      version: 0, // #EXT-X-VERSION:<number>
      streams: [], // MasterStreamObjectArray: [{ url, info, codecs, bandwidth, resolution, video, audio }, ...]
    };
    var itemInfo = null;

    for (var i = 0, iz = lines.length; i < iz; ++i) {
      var line = lines[i].trim();

      if (line) {
        if (/^#EXT/.test(line)) {
          // The Tag-line (^#EXT...)
          var record = line.split(":"); // "key:value" -> [key, value]
          var key = record[0];
          var value = record[1];

          switch (key) {
            case "#EXT-X-VERSION":
              masterPlaylistObject["version"] = parseFloat(value);
              break;
            case "#EXT-X-STREAM-INF":
              itemInfo = _parseMasterStreamInfo(value);
          }
        } else if (/^#/.test(line)) {
          // The Comment-line (^#...)
          // skip
        } else if (itemInfo) {
          var codecs = _parseCodec(itemInfo["CODECS"] || "");

          masterPlaylistObject["streams"].push({
            url: _toAbsoluteURL(line, url),
            info: itemInfo["info"].trim(),
            codecs: itemInfo["CODECS"] || "",
            bandwidth: parseInt(itemInfo["BANDWIDTH"] || "") || 0,
            resolution: itemInfo["RESOLUTION"] || "",
            video: {
              codec: codecs.video.codec,
              profile: codecs.video.profile,
              profileID: codecs.video.profileID,
              level: codecs.video.level,
            },
            audio: {
              codec: codecs.audio.codec,
              profile: codecs.audio.profile,
              objectType: codecs.audio.objectType,
            },
          });
          itemInfo = null; // reset
        }
      }
    }
    return masterPlaylistObject;
  }

  function _parseMediaPlaylist(
    lines, // @arg LineStringArray - ["#EXTM3U", "#EXT-X-VERSION:3", ...]
    url
  ) {
    // @arg MediaPlaylistURLString
    // @ret MediaPlaylistObject
    var mediaPlaylistObject = {
      url: url, // MediaPlaylistURL
      type: "LIVE", // MediaPlaylist type. "VOD" or "LIVE" or "NRTLIVE"
      version: 0, // #EXT-X-VERSION:<number>
      combined: false, // #EXT-X-COMBINED:<YES OR NO>
      allowCache: false, // #EXT-X-ALLOW-CACHE:<YES OR NO>
      mediaSequence: 0, // #EXT-X-MEDIA-SEQUENCE:<number>
      mediaSegments: [], // MediaSegmentObjectArray [{ tsID, tsURL, tsDuration, tsRange, tsTitle }, ...]
      targetDuration: 0, // #EXT-X-TARGETDURATION:<number> (msec value)
      totalDurations: 0, // sum of the segment durations (VOD only) UINT32 (msec value)
    };
    var tsTitle = "";
    var tsDuration = 0; // msec
    var totalDurations = 0; // msec

    for (var i = 0, iz = lines.length; i < iz; ++i) {
      var line = lines[i].trim();
      if (line) {
        if (/^#EXT/.test(line)) {
          // The Tag-line (^#EXT...)
          var record = line.split(":"); // "key:value" -> [key, value]
          var key = record[0];
          var value = record[1];

          switch (key) {
            case "#EXT-X-VERSION":
              mediaPlaylistObject["version"] = parseFloat(value);
              break;
            case "#EXT-X-ENDLIST":
              mediaPlaylistObject["type"] = "VOD";
              break;
            case "#EXT-X-COMBINED":
              mediaPlaylistObject["combined"] = value === "YES";
              break;
            case "#EXT-X-ALLOW-CACHE":
              mediaPlaylistObject["allowCache"] = value === "YES";
              break;
            case "#EXT-X-TARGETDURATION":
              mediaPlaylistObject["targetDuration"] =
                (parseFloat(value) * 1000) | 0;
              break; // sec * 1000 -> msec
            case "#EXT-X-MEDIA-SEQUENCE":
              mediaPlaylistObject["mediaSequence"] = parseInt(value);
              break;
            case "#EXT-X-DISCONTINUITY":
              break; // TODO:
            case "#EXTINF":
              tsDuration = (parseFloat(value) * 1000) | 0;
              tsTitle = value.split(",").slice(1).join(","); // "duration,title..."
          }
        } else if (/^#/.test(line)) {
          // The Comment-line (^#...)
          // skip
        } else if (tsDuration) {
          mediaPlaylistObject["mediaSegments"].push({
            tsID:
              mediaPlaylistObject["mediaSequence"] +
              mediaPlaylistObject["mediaSegments"].length,
            tsURL: _toAbsoluteURL(line, url),
            tsDuration: tsDuration || 0,
            tsTitle: tsTitle || "",
            tsRange: {
              startTime: totalDurations,
              endTime: totalDurations + tsDuration,
            },
          });
          totalDurations += tsDuration;
          tsDuration = 0; // reset
          tsTitle = ""; // reset
        }
      }
    }
    if (mediaPlaylistObject["type"] === "VOD") {
      mediaPlaylistObject["totalDurations"] = totalDurations;
    }
    if (
      mediaPlaylistObject["type"] === "LIVE" &&
      mediaPlaylistObject["targetDuration"] <= 2000
    ) {
      mediaPlaylistObject["type"] = "NRTLIVE";
    }
    return mediaPlaylistObject;
  }

  function _parseMasterStreamInfo(source) {
    // @arg String - 'BANDWIDTH=710852,CODECS="avc1.66.30,mp4a.40.2",RESOLUTION=432x768'
    // @ret Object - { BANDWIDTH: "710852", CODECS: "avc1.66.30,mp4a.40.2", RESOLUTION: "432x768", info: "BANDWIDTH=710852..." }
    // @desc parse "key=value,..." -> { key: value, ... }
    var result = { info: source };
    var inQuote = false; // in "..."
    var inKey = true; // in key=value
    var key = "";
    var value = "";

    for (var i = 0, iz = source.length; i < iz; ++i) {
      var tokenEnd = i === iz - 1 ? true : false;
      var c = source[i];

      if (inQuote) {
        switch (c) {
          case '"':
            inQuote = false;
            break;
          default:
            if (inKey) {
              key += c;
            } else {
              value += c;
            }
        }
      } else {
        switch (c) {
          case '"':
            inQuote = true;
            break;
          case "=":
            if (inKey) {
              inKey = false;
            } else {
              value += c;
            }
            break;
          case ",":
            if (inKey) {
              key += c;
            } else {
              tokenEnd = true;
            }
            break;
          default:
            if (inKey) {
              key += c;
            } else {
              value += c;
            }
        }
      }
      if (tokenEnd) {
        result[key] = value;
        inKey = true;
        key = "";
        value = "";
      }
    }
    return result;
  }

  function M3U8_build(playlist) {
    // @ret MasterPlaylistObject|MediaPlaylistObject
    // @ret M3U8FormatString
    //{@dev
    if (VERIFY) {
      $valid($type(playlist, "Object"), M3U8_build, "playlist");
      if (playlist.type === "MASTER") {
        $valid(
          $type(playlist.version, "UINT8"),
          M3U8_build,
          "playlist.version"
        );
        $valid(
          $type(playlist.streams, "MasterStreamObjectArray"),
          M3U8_build,
          "playlist.streams"
        );
        $valid(
          $type(playlist.streams[0].url, "URLString"),
          M3U8_build,
          "playlist.streams.url"
        );
        $valid(
          $type(playlist.streams[0].codecs, "String"),
          M3U8_build,
          "playlist.streams.codecs"
        );
        $valid(
          $type(playlist.streams[0].bandwidth, "UINT32"),
          M3U8_build,
          "playlist.streams.bandwidth"
        );
        $valid(
          $type(playlist.streams[0].resolution, "String"),
          M3U8_build,
          "playlist.streams.resolution"
        );
      } else if (
        playlist.type === "VOD" ||
        playlist.type === "LIVE" ||
        playlist.type === "NRTLIVE"
      ) {
        $valid(
          $type(playlist.version, "UINT8"),
          M3U8_build,
          "playlist.version"
        );
        $valid(
          $type(playlist.mediaSegments, "MediaSegmentObjectArray"),
          M3U8_build,
          "playlist.mediaSegments"
        );
        $valid(
          $type(playlist.mediaSegments[0].tsURL, "URLString"),
          M3U8_build,
          "playlist.mediaSegments.tsURL"
        );
        $valid(
          $type(playlist.mediaSegments[0].tsDuration, "UINT32"),
          M3U8_build,
          "playlist.mediaSegments.tsDuration"
        );
      } else {
        $valid(false, M3U8_build, "Unknown Type: " + playlist.type);
      }
    }
    //}@dev

    var lines = ["#EXTM3U"];
    var isMasterPlaylist = playlist["type"] === "MASTER";

    if (playlist["version"]) {
      lines.push("#EXT-X-VERSION:" + playlist["version"]);
    }
    if (!isMasterPlaylist) {
      lines.push(
        "#EXT-X-ALLOW-CACHE:" + (playlist["allowCache"] ? "YES" : "NO")
      );
    }
    if (playlist["targetDuration"]) {
      lines.push(
        "#EXT-X-TARGETDURATION:" +
          (playlist["targetDuration"] / 1000).toFixed(0)
      );
    }
    if (playlist["mediaSequence"]) {
      lines.push("#EXT-X-MEDIA-SEQUENCE:" + playlist["mediaSequence"]);
    }

    var list = playlist["streams"] || playlist["mediaSegments"];

    for (var i = 0, iz = list.length; i < iz; ++i) {
      var p = list[i];
      if (isMasterPlaylist) {
        var buffer = [];
        if (p["bandwidth"]) {
          buffer.push("BANDWIDTH=" + p["bandwidth"]);
        }
        if (p["codecs"]) {
          buffer.push("CODECS=" + _quote(p["codecs"]));
        }
        if (p["resolution"]) {
          buffer.push("RESOLUTION=" + p["resolution"]);
        }
        lines.push("#EXT-X-STREAM-INF:" + buffer.join(","));
        lines.push(p["url"]);
      } else {
        lines.push(
          "#EXTINF:" +
            (p["tsDuration"] / 1000).toFixed(3) +
            "," +
            (p["tsTitle"] || "")
        );
        lines.push(p["tsURL"]);
      }
    }
    if (playlist["type"] === "VOD") {
      lines.push("#EXT-X-ENDLIST");
    }
    return lines.join("\n");
  }

  function _quote(str) {
    return '"' + str + '"';
  }

  function _parseCodec(str) {
    // @arg CodecString - eg: "avc1.4D401E, mp4a.40.2"
    // @ret CodecObject - { video: { codec, profile, profileID, level }, audio: { codec, profile, objectType } }
    var video = {
      codec: "", // "AVC"
      profile: "", // "Base", "Main", "High"
      profileID: 0, // 66, 77, 100
      level: "", // "3.0", "4.1"
    };
    var audio = {
      codec: "", // "AAC", "MP3"
      profile: "", // "AAC-LC", "HE-AAC", "HE-AAC v2", "MP3", ""
      objectType: 0, // 2, 5, 29, 34, ...
    };

    var codecArray = str.split(",");

    for (var i = 0, iz = codecArray.length; i < iz; ++i) {
      var codecs = codecArray[i].trim(); // "avc1.42c01e"

      if (/^avc1/.test(codecs)) {
        video.codec = "AVC";
        video.profile = H264Profile["getProfile"](codecs); // "Base", "Main", "High", ""
        video.profileID = H264Profile["getProfileID"](codecs); // 66, 77, 100, 0
        video.level = H264Profile["getLevel"](codecs); // "3.0", "4.1"
      } else if (/^mp4a/.test(codecs)) {
        audio.codec = "AAC";
        audio.profile = AACProfile["getProfile"](codecs); // "AAC-LC", "HE-AAC", "HE-AAC v2", "MP3", ""
        audio.objectType = AACProfile["getAudioObjectType"](codecs); // 2, 5, 29, 34

        if (audio.profile === "MP3") {
          audio.codec = "MP3";
        }
      }
    }
    return { video: video, audio: audio };
  }

  function _toAbsoluteURL(url, baseURL) {
    if (!baseURL || URI["isAbsolute"](url)) {
      return url;
    }
    return URI["resolve"](URI["getBaseURL"](baseURL) + url);
  }

  function _trimMediaSegments(
    playlist, // @arg MediaPlaylistObject - { url, type, version, allowCache, mediaSequence, mediaSegments, targetDuration, totalDurations }
    liveStartTime, // @arg UINT32 = 0
    liveFragmentMaxLength
  ) {
    // @arg UINT8 = 0 - 0 is no limit
    var mediaSegments = playlist["mediaSegments"];
    var mediaSegment = null; // MediaSegmentObject - { tsID, tsURL, tsDuration, tsRange, tsTitle }
    var tsRange = null; // Object - { startTime: UINT32, endTime: UINT32 }
    var startTime = 0; // UINT32
    var endTime = 0; // UINT32

    // skip media segments
    var i = 0,
      iz = mediaSegments.length;
    for (; i < iz; ++i) {
      mediaSegment = mediaSegments[i]; // MediaSegmentObject - { tsID, tsURL, tsDuration, tsRange, tsTitle }
      tsRange = mediaSegment["tsRange"]; // Object - { startTime: UINT32, endTime: UINT32 }
      startTime = tsRange["startTime"]; // UINT32
      endTime = tsRange["endTime"]; // UINT32
      if (startTime <= liveStartTime && liveStartTime <= endTime) {
        // startTime <= liveStartTime <= endTime -> in range
        break;
      }
    }
    var newPlaylist = JSON.parse(JSON.stringify(playlist));
    var remain =
      liveFragmentMaxLength === 0
        ? iz + 1 // 0 -> no limit
        : liveFragmentMaxLength;

    newPlaylist["mediaSegments"].length = 0; // clear media segments

    for (; i < iz; ++i) {
      newPlaylist["mediaSegments"].push(mediaSegments[i]);
      if (--remain <= 0) {
        break;
      }
    }
    if (newPlaylist["mediaSegments"].length) {
      newPlaylist["mediaSequence"] = newPlaylist["mediaSegments"][0]["tsID"]; // update mediaSequence number
    }
    return newPlaylist;
  }

  function M3U8_defaultFilter(
    masterStreams, // @arg MasterStreamObjectArray - [MasterStreamObject, ...]
    videoCanPlay, // @options.videoCanPlay RegExp = /Base/ - video can play profile.
    audioCanPlay
  ) {
    // @options.audioCanPlay RegExp = /AAC/  - audio can play profile.
    // @ret UINT8 - stream-index or 255
    for (var i = 0, iz = masterStreams.length; i < iz; ++i) {
      var stream = masterStreams[i];

      if (
        videoCanPlay.test(stream["video"]["profile"]) &&
        audioCanPlay.test(stream["audio"]["profile"])
      ) {
        return i; // H.264 Baseline profile, AAC-LC -> NICE
      }
    }
    return 255;
  }

  function M3U8_baselineFilter(masterStreams) {
    // @arg MasterStreamObjectArray - [MasterStreamObject, ...]
    // @ret UINT8 - stream-index or 255
    // @desc selecting the appropriate HLS stream.
    var videoCanPlay = /Base/;
    var audioCanPlay = /AAC/;

    return M3U8_defaultFilter(masterStreams, videoCanPlay, audioCanPlay);
  }

  return M3U8; // return entity
});
