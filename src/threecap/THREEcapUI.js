"use strict";
/**
 * THREEcapUI - simple video capture UI
 */
function THREEcapUI(capture) {
  this.capture = capture;
  this.settings = {
    resolution: '352x240',
    framerate: 25,
    time: 5,
    format: 'mp4',
    filename: this.getTimestampedFilename('threecap'),
  };

  this.panel = this.createPanel();
}

THREEcapUI.prototype.createPanel = function() {
  var panel = document.createElement('div');
  panel.id = 'recordpanel';

  var h2 = document.createElement('h2');
  h2.innerHTML = 'THREEcap Settings';
  panel.appendChild(h2);

  var resolutions = {
        'canvas': 'canvas', 
        '240p': '352x240', 
        '360p': '480x360', 
        '480p': '858x480', 
        '720p': '1280x720', 
        '1080p': '1920x1080', 
      },
      framerates = {
        '1 fps': 1,
        '2 fps': 2,   
        '5 fps': 5, 
        '10 fps': 10, 
        '15 fps': 15, 
        '25 fps': 25, 
        '30 fps': 30, 
        '45 fps': 45, 
        '60 fps': 60
      },
      times = {
        '5s': 5,
        '10s': 10, 
        '15s': 10,
        '30s': 30, 
        '45s': 45, 
        '1m': 60,
        '1m30s': 90,
        '2m': 120, 
        '3m': 180, 
        '4m': 240, 
        '5m': 300
      },
      formats = {'mp4': 'mp4', 'gif': 'gif', 'webm': 'webm'};

  var select_resolution = this.createDropdown('Resolution', resolutions, this.settings.resolution);
  var select_framerate = this.createDropdown('Framerate', framerates, this.settings.framerate);
  var select_time = this.createDropdown('Time', times, this.settings.time);
  var select_format = this.createDropdown('Format', formats, this.settings.format);

  var input_filename = this.createInput('Filename', this.settings.filename);

  select_resolution.addEventListener('change', this.updateRecordSetting.bind(this, 'resolution'));
  select_framerate.addEventListener('change', this.updateRecordSetting.bind(this, 'framerate'));
  select_time.addEventListener('change', this.updateRecordSetting.bind(this, 'time'));
  select_format.addEventListener('change', this.updateRecordSetting.bind(this, 'format'));
  input_filename.addEventListener('change', this.updateRecordSetting.bind(this, 'filename'));

  panel.appendChild(select_resolution);
  panel.appendChild(select_framerate);
  panel.appendChild(select_time);
  panel.appendChild(select_format);
  panel.appendChild(input_filename);

  var button = document.createElement('button');
  button.addEventListener('click', this.handleButtonClick.bind(this));
  button.innerHTML = 'Record';
  panel.appendChild(button);

  document.body.appendChild(panel);
  return panel;
}

THREEcapUI.prototype.createDropdown = function(labeltext, options, selected) {
  var container = document.createElement('div');

  var label = document.createElement('label');
  var select = document.createElement('select');

  label.innerHTML = labeltext;
  label.for = select;
  container.appendChild(label);

  var optionnames = Object.keys(options);
  
  optionnames.forEach(function(o) {
    var option = document.createElement('option');
    option.value = options[o];
    option.innerHTML = o;
    if (selected && selected == options[o]) {
      option.selected = true;
    }
    select.appendChild(option);
  });
  container.appendChild(select);

  return container;
}
THREEcapUI.prototype.createInput = function(labeltext, value) {
  var container = document.createElement('div');

  var label = document.createElement('label');
  var input = document.createElement('input');

  label.innerHTML = labeltext;
  label.for = input;
  container.appendChild(label);

  input.value = value;
  container.appendChild(input);

  return container;
}

THREEcapUI.prototype.updateRecordSetting = function(setting, ev) {
  this.settings[setting] = ev.target.value;
}
THREEcapUI.prototype.handleButtonClick = function(ev) {
  console.log('bling', this.settings);
  var button = ev.target;
  button.innerHTML = 'Recording...';
  button.className = 'state_recording';
  var res = this.settings.resolution.split('x'),
      fps = parseInt(this.settings.framerate),
      time = parseInt(this.settings.time),
      format = this.settings.format,
      fname = this.settings.filename;

  if (this.settings.resolution == 'canvas') {
    res = [renderer.domElement.width, renderer.domElement.height];
  }

  this.capture.record({
      width: res[0], 
      height: res[1],
      fps: fps,
      format: format,
      time: time
    }).then(function(video) { 
      button.innerHTML = 'Record';
      button.className = '';
      this.settings['filename'] = this.getTimestampedFilename('threecap');
      this.saveFile(fname, video.file);
    }.bind(this));
  setTimeout(function() {
    button.innerHTML = 'Encoding...';
  }, time * 1000);
}

THREEcapUI.prototype.getTimestampedFilename = function(prefix) {
  var d = new Date();
  var ts = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + '_' + d.getHours() + '-' + d.getMinutes() + '-' + d.getSeconds();
  return prefix + '_' + ts;
}

THREEcapUI.prototype.saveFile = function(fname, data) {
  var a = document.createElement('A');
  a.innerHTML = fname;
  recordpanel.appendChild(a);
  var url = window.URL.createObjectURL(data);

  a.href = url;
  a.download = fname;
  a.click();
console.log('click click!', a);
  //window.URL.revokeObjectURL(url);
  //document.body.removeChild(a);
}

