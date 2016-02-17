"use strict";
/**
 * THREEcapVideo - describes a capture session
 */
function THREEcapVideo(settings) {
  this.events = {};
  this.frames = [];

  var settings = settings || {};
  this.width = settings.width;
  this.height = settings.height;
  this.fps = settings.fps;
  this.time = settings.time;
  this.srcformat = settings.format;
  this.format = settings.format;
  this.useWorker = settings.useWorker;
  this.inWorker = settings.inWorker;
  this.scriptbase = settings.scriptbase;
  this.canvas = settings.canvas;
  this.renderpass = settings.renderpass;
  this.quality = settings.quality;

  if (this.useWorker) {
    this.worker = new Worker(this.scriptbase + 'threecap-worker.js');
    this.worker.addEventListener('message', this.handleWorkerResponse.bind(this));
  }
}


THREEcapVideo.prototype.getScaledSize = function(size, max, multiple) {
  var scaledsize = [this.width, this.height];
  var scale = Math.min(max[0] / size[0], max[1] / size[1]);
  if (multiple === undefined) multiple = 2;

  scaledsize[0] = Math.floor(size[0] * scale / multiple) * multiple;
  scaledsize[1] = Math.floor(size[1] * scale / multiple) * multiple;

  return scaledsize;
}

THREEcapVideo.prototype.getFrame = function() {
  var frame = this.framepool.getFrame();
  return frame;
};
THREEcapVideo.prototype.addFrame = function(frame, usepool) {
  //var frame = this.getFrameFromData(framedata);
  //console.log('addframe', frame, frame.buffer.byteLength); 
  if (frame) {
    if (this.useWorker && !this.inWorker) {
      var msg = {
        type: 'add_frame',
        frame: frame,
        usepool: usepool
      };
      var transferrables = (frame instanceof THREEcapFrame ? [msg.frame.buffer] : undefined);
      this.worker.postMessage(msg, transferrables);
    } else {
      //console.log('add frame', this.frames.length, frame.width + 'x' + frame.height);
      if (usepool !== false) {
        var compressed = this.getCompressedFrame(frame);
        this.frames.push(compressed);
        this.releaseFrame(frame);
      } else {
        var compressedframe = this.getFrame();
        var bindata = atob(frame);
        compressedframe.buffer = compressedframe.buffer.slice(0, bindata.length);
        var framedata = compressedframe.data;
        
        for (var i = 0; i < bindata.length; i++) {
          framedata[i] = bindata.charCodeAt(i);
        }
        this.frames.push(compressedframe);
      }
    }
  }
};
THREEcapVideo.prototype.addFrameBase64 = function(framestr) {
  if (framestr) {
    if (this.useWorker && !this.inWorker) {
      var msg = {
        type: 'add_frame_base64',
        framestr: framestr
      };
      this.worker.postMessage(msg);
    } else {
      //console.log('add base64 frame', this.frames.length, framestr.length, this.width, this.height);
      //var compressedframe = this.getFrame();
      var compressedframe = new THREEcapFrame(this.width, this.height, 3);
      var bindata = atob(framestr);
      compressedframe.buffer = compressedframe.buffer.slice(0, bindata.length);
      var framedata = compressedframe.data;
      
      for (var i = 0; i < bindata.length; i++) {
        framedata[i] = bindata.charCodeAt(i);
      }
      this.frames.push(compressedframe);
    }
  }
};

THREEcapVideo.prototype.addFrameFromTHREE = function(renderpass) {
  var frame = this.getFrame(),
      renderer = renderpass.renderer,
      target = renderpass.recordtarget;

  renderpass.updateCaptureData(this.width, this.height);
  if (target) {
    renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, frame.data);
  } else {
    // FIXME - doesn't work.  we probably need to use addFrameFromCanvas here
    var gl = renderer.getContext();
    gl.readPixels( 0, 0, renderer.width, renderer.height, gl.RGBA, gl.UNSIGNED_BYTE, frame.data );
  }
  return this.addFrame(frame, true);
};

THREEcapVideo.prototype.addFrameFromCanvas = function(canvas) {
  // TODO - toDataURL is slow, but we can probably use webgl and pass the canvas in as a texture

  this.srcformat = 'png';
  // var header = "data:image/png;base64,";
  var imgdata = canvas.toDataURL('image/png').substr(22);
  return this.addFrameBase64(imgdata, false);
};

THREEcapVideo.prototype.getFrameFromData = function(framedata) {
  var frame = framedata;
  if (framedata instanceof CanvasRenderingContext2D) {
    var ctx = framedata;
    frame = new THREEcapFrame(ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height));
  } else if (framedata instanceof ImageData) {
    // The user already allocated memory, just use that
    frame = new THREEcapFrame(frame);
  }
  return frame;
};

THREEcapVideo.prototype.releaseFrame = function(frame) {
  if (this.inWorker) {
    var msg = {
      type: 'release_frame',
      frame: frame
    };
    postMessage(msg, [msg.frame.buffer]);
  } else {
    this.framepool.freeFrame(frame);
  }
};
THREEcapVideo.prototype.getCompressedFrame = function(frame) {
  // convert from RGBA to RGB, and then compress with LZMA
  var newframe = this.compressedpool.getFrame();
  var olddata = frame.data;
  var newdata = newframe.data;

  for (var i = 0; i < frame.width * frame.height; i++) {
    newdata[i * 3] = olddata[i * 4];
    newdata[i * 3 + 1] = olddata[i * 4 + 1];
    newdata[i * 3 + 2] = olddata[i * 4 + 2];
  }
  //var compressed = LZMA.compress(newdata);
  return newframe;
};
THREEcapVideo.prototype.handleWorkerRequest = function(ev) {
  var msg = ev.data;
  switch (msg.type) {
    case 'add_frame':
      this.addFrame(new THREEcapFrame(msg.frame.width, msg.frame.height, msg.frame.depth, msg.frame.buffer), msg.usepool);
      break;
    case 'add_frame_base64':
      this.addFrameBase64(msg.framestr);
      break;
    case 'record':
      this.record(msg);
      break;
    case 'info':
      this.info(msg);
      break;
    case 'resize':
      this.setSize(msg.width, msg.height);
      break;
  }
};
THREEcapVideo.prototype.handleWorkerResponse = function(ev) {
  var msg = ev.data;
  switch (msg.type) {
    case 'record_results':
      this.file = msg.data;
      if (this.events.finished) {
        this.events.finished(msg.data);
      }
      this.framepool.cleanup();
      //this.compressedpool.cleanup();
      break;
    case 'release_frame':
      var frame = new THREEcapFrame(msg.frame);
      this.releaseFrame(frame);
      break;
  }
};
THREEcapVideo.prototype.device_input_open = function(stream) { 
  //console.log('INPUT DEVICE OPENED', stream); 
};
THREEcapVideo.prototype.device_input_close = function(stream) { 
  //console.log('INPUT DEVICE CLOSED', stream, this.outputpos); 
  this.processResults([ { data: this.outputbuffer.subarray(0, this.outputpos) } ]);
};
THREEcapVideo.prototype.device_input_read = (function() {
    var currframe = 0,
            framedata = null,
            curroffset = 0,
            bufsize = 1024 * 1024*1024;
    return function(stream, buffer, offset, length, position) { 
        //console.log('DEVICE IS READING', stream, buffer, offset, length, position); 

        //console.log('reading frame ' + currframe + ' of ' + this.expectedframes + ' expected (' + this.frames.length + ' queued)', length);
        if (currframe < this.expectedframes) {
            if (currframe < this.frames.length) {
              this.started = true;
              if (!framedata) {
                  //framedata = LZMA.decompress(this.frames[currframe].data);
                  framedata = this.frames[currframe].data;
              }
              

              var maxlength = Math.min(framedata.length - curroffset, bufsize, length);
              var written = 0;
              for (var i = 0; i < maxlength; i ++) {
                  buffer[offset + i] = framedata[curroffset];
                  curroffset++;
                  written++;
              }
              //console.log('stdin: frame ' + currframe + ', offset ' + curroffset, maxlength, framedata.byteLength, written);
              //curroffset += maxlength;
              if (curroffset == framedata.byteLength) {
                  //console.log('finished frame:', currframe);
                  //delete this.frames[currframe].data;
                  this.compressedpool.freeFrame(this.frames[currframe]);
                  this.frames[currframe] = false;
                  currframe++;
                  curroffset = 0;
                  framedata = false;
              }
              return written;
            } else {
                throw new this.FS.ErrnoError(11); // EAGAIN
            }
        } else if (this.started) {
            console.log('final frame reached!', currframe, this.frames.length, curroffset);
            return 0;
        }
    };
})();

THREEcapVideo.prototype.device_output_open = function(stream) { 
    //console.log('OUTPUT DEVICE OPENED', stream); 
    if (!this.outputbuffer) {
        this.blocksize = 1024 * 1024 * 10; // 10mb
        this.blockcount = 1;
        this.outputbuffer = new Uint8Array(this.blocksize);

        this.outputpos = 0;
    }
};
THREEcapVideo.prototype.device_output_close = function(stream) { 
    //console.log('OUTPUT DEVICE CLOSED', stream); 
};
THREEcapVideo.prototype.device_output_llseek = function(stream, offset, whence) { 
    //console.log('seek!', offset, whence);
    var position = offset;     // SEEK_SET

    if (whence == 1) {            // SEEK_CUR
        position += stream.position;
    } else if (whence == 2) { // SEEK_END
        position = this.outputsize - offset;
    }

    if (position < 0) {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
    }
    this.outputpos = position;
    return position; 
};
THREEcapVideo.prototype.device_output_read = function(stream, buffer, offset, length, position) { 
    //console.log('OUTPUT READ????', offset, length);
};
THREEcapVideo.prototype.device_output_write = function(stream, buffer, offset, length, position) { 
    //console.log('output write: ' + length + ' bytes, ' + position + ' position, ' + offset + ' offset')
    var outputpos = (typeof position == 'number' ? position : this.outputpos);

    if (outputpos + length > this.blocksize * this.blockcount) {
      this.blockcount++;
      var newout = new Uint8Array(this.blocksize * this.blockcount);
      newout.set(this.outputbuffer);
      this.outputbuffer = newout;
      console.log('resized output buffer to ' + newout.length + ' bytes');
    }

    for (var i = 0; i < length; i++) {
        this.outputbuffer[outputpos + i] = buffer[offset + i];
    }
    this.outputsize = Math.max(this.outputsize, outputpos + length);
    this.outputpos += length;
    return length;
};
THREEcapVideo.prototype.setSize = function(width, height) {
    //console.log('SETSIZE: ' + width + 'x' + height + ' (' + (this.inWorker ? 'worker' : 'main') + ')');
    this.width = width;
    this.height = height;
    if (!this.inWorker) {
      this.framepool = new THREEcapFramePool(this.width, this.height, 4);
    }
    if (this.inWorker || !this.useWorker) {
      this.compressedpool = new THREEcapFramePool(this.width, this.height, 3);
    }

    if (this.useWorker && !this.inWorker) {
        this.worker.postMessage({type: 'resize', width: width, height: height});
    }
}

THREEcapVideo.prototype.record = function(settings) {
  if (!settings) settings = {};
  var quality = settings.quality || this.quality,
      fps = settings.fps || this.fps,
      width = settings.width || this.width,
      height = settings.height || this.height,
      time = settings.time || this.time,
      srcformat = settings.srcformat || this.srcformat,
      format = settings.format || this.format,
      canvas = settings.canvas || this.canvas,
      renderpass = settings.renderpass || this.renderpass;

  // FIXME - scaledsize needs to take source resolution as the first parameter
  var scaledsize = this.getScaledSize([width, height], [width, height]);

  width = this.width = scaledsize[0];
  height = this.height = scaledsize[1];
  this.srcformat = srcformat;
  this.format = format;
  this.canvas = canvas;

  console.log('RECORD CALLED', settings, width, height, fps, quality, time);
  this.expectedframes = fps * time;

  if (!this.inWorker) {
    this.scheduleFrames(width, height, fps, time);
  }
  
  this.setSize(width, height);

  if (this.useWorker) {
//setTimeout(function() {
    this.worker.postMessage({type: 'record', quality: quality, fps: fps, width: width, height: height, time: time, srcformat: srcformat, format: format});
//}.bind(this), time * 1000);
  } else {
    var program = {
      stdin: function() { }.bind(this),
      initDevice: function(FS, ERRNO_CODES) {
        this.FS = FS;
        var dev_input = FS.makedev(99, 88);
        var dev_output = FS.makedev(99, 89);
        FS.registerDevice(dev_input, {
          open: this.device_input_open.bind(this),
          close: this.device_input_close.bind(this),
          read: this.device_input_read.bind(this),
        });
        FS.registerDevice(dev_output, {
          open: this.device_output_open.bind(this),
          close: this.device_output_close.bind(this),
          read: this.device_output_read.bind(this),
          write: this.device_output_write.bind(this),
          llseek: this.device_output_llseek.bind(this),
        });
        FS.mkdev('/input.raw', dev_input);
        FS.mkdev('/output/output.' + format, dev_output);
      }.bind(this),
      memoryInitializerPrefixURL: this.scriptbase 
    };

    var args = [
      '-framerate', fps.toString(),
      '-s', width + 'x' + height,
    ];
    if (srcformat == 'raw') {
      args = args.concat([
        '-vcodec', 'rawvideo',
        '-f', 'rawvideo',
        '-pix_fmt', 'rgb24'
      ]);
    } else if (srcformat == 'png') {
      args = args.concat([
        '-f', 'image2pipe',
        '-vcodec', 'png',
        '-pix_fmt', 'rgb32'
      ]);
    }
    args = args.concat([
      '-i', '/input.raw',
    ]);

    if (format == 'mp4') {
      args = args.concat([
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        //'-movflags', '+faststart',
        '-preset', quality,
      ]);
    } else if (format == 'gif') {
      args = args.concat([
        '-c:v', 'gif',
      ]);
    } else if (format == 'raw') {
      args = args.concat([
        '-vcodec', 'rawvideo',
        '-pix_fmt', 'rgb24',
      ]);
      format = 'mov';
    }
    args.push('-y');
    args.push('output.' + format);

    program.arguments = args;

    console.log('RUN FFMPEG', args);
    try {
      ffmpeg_run(program);
    } catch (e) {
    }

  }
};

THREEcapVideo.prototype.scheduleFrames = function(width, height, fps, time) {
  var delay = 1000 / fps;
  var numframes = time * fps;
  var framepromises = [];
  for (var i = 0; i < numframes; i++) {
    var promise = this.scheduleFrame(width, height, i, delay * i);
    framepromises.push(promise);
  }
  return framepromises;
};

THREEcapVideo.prototype.scheduleFrame = function(width, height, frame, delay) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() { 
      //if (this.updateCaptureData(width, height)) {
        if (this.renderpass instanceof THREEcapRenderPass) {
          var imgdata = this.addFrameFromTHREE(this.renderpass);
        } else if (this.canvas) {
          var imgdata = this.addFrameFromCanvas(this.canvas);
        }
        resolve({frame: frame, image: imgdata});
      //}
    }.bind(this), delay);
  }.bind(this));
};

THREEcapVideo.prototype.processResults = function(results) {
  if (results && results.length > 0) {
    var mimetypes = {
      'mp4': 'video/mp4',
      'gif': 'image/gif',
      'mpg': 'video/mpeg',
    };
    //var blob = new Blob([results[0].data], { type: 'video/mp4' });
    var blob = new Blob([results[0].data], { type: mimetypes[this.format] });
    if (this.inWorker) {
      var msg = {type: 'record_results', data: blob};
      postMessage(msg);
      //this.framepool.cleanup();
      this.compressedpool.cleanup();
    } else {
      this.file = blob;
      if (this.events.finished) {
        this.events.finished(blob);
      }
      this.framepool.cleanup();
      this.compressedpool.cleanup();
    }
  }
};
THREEcapVideo.prototype.info = function() {
    if (this.useWorker && !this.inWorker) {
        this.worker.postMessage({type: 'info'});
    } else {
        var args = {
            stdin: function() { }.bind(this),
            arguments: [
                '-codecs'
            ],
            memoryInitializerPrefixURL: this.scriptbase 
        };

        ffmpeg_run(args);
    }
}

THREEcapVideo.prototype.on = function(event, callback) {
  this.events[event] = callback;
};

THREEcapVideo.prototype.saveFile = function(fileName) {
    var a = document.createElement("a");
    document.body.appendChild(a);
    a.style.display = "none";

    var url = window.URL.createObjectURL(this.file);
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
  }
