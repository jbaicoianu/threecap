"use strict";
/**
 * THREEcap - EffectComposer pass for capturing and encoding a Three.js app's render output
 * Supports jpg, png, gif, and mp4 output
 * Video encoding capabilities provided by FFmpeg, cross-compiled to JavaScript using Emscripten
 */

function THREEcap(args) {
  this.settings = {
    width: 320,
    height: 240,
    fps: 25,
    time: 5,
    srcformat: 'raw',
    format: 'mp4',
    quality: 'ultrafast',
    useWorker: true,
    inWorker: false,
    scriptbase: '',
    canvas: false,
    renderpass: false
  };

  // Update settings with passed-in values
  this.settings = this.getSettings(args);

  console.log('new THREEcap instance', this.settings);
}

THREEcap.prototype.getSettings = function(args) {
  var keys = Object.keys(this.settings),
      settings = {},
      args = args || {};

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    settings[key] = this.getSetting(key, args);
  }
  
  return settings; 
}
THREEcap.prototype.getSetting = function(name, args) {
  if (typeof args[name] != 'undefined') {
    return args[name];
  }
  return this.settings[name];
}
THREEcap.prototype.record = function(settings) {
  var recordsettings = this.getSettings(settings);

console.log('RECORD CALLED: ' + recordsettings.width + 'x' + recordsettings.height + '@' + recordsettings.fps + ' for ' + recordsettings.time + 's', recordsettings);

  var video = new THREEcapVideo(recordsettings);
  return new Promise(function(resolve, reject) {
    video.on('finished', function(d) { resolve(video); });
    video.record(recordsettings);
/*
.then(function(f) {
      console.log('done!', f);
    });
*/
  });
}



